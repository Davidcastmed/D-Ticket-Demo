import {
  Component,
  EventEmitter,
  Output,
  ChangeDetectionStrategy,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Station } from '../../models/transit.models';
import { TransitService, FavoriteRoute, FavoriteStation } from '../../services/transit.service';

@Component({
  selector: 'app-favorites-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="space-y-6">
      
      <!-- Favorites Header (hvv switch Card) -->
      <div class="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-[#E6DED6] flex flex-col sm:flex-row sm:items-center justify-between gap-4" role="region" aria-label="Favoriten Übersicht">
        <div class="flex items-center gap-3">
          <span class="w-10 h-10 rounded-2xl bg-[#D4A373]/20 text-[#3E2723] flex items-center justify-center font-bold" aria-hidden="true">
            <span class="mat-icon text-xl">star</span>
          </span>
          <div>
            <h2 class="text-base sm:text-lg font-black text-[#1F1612]">Meine Favoriten</h2>
            <p class="text-xs text-[#795548]">Schnellzugriff auf deine gespeicherten Routen und Bahnhöfe</p>
          </div>
        </div>

        <div class="text-xs font-bold text-[#8D6E63] bg-[#FAF7F2] px-3.5 py-1.5 rounded-full border border-[#E6DED6] self-start sm:self-auto">
          {{ transitService.favoriteRoutes().length }} Routen • {{ transitService.favoriteStations().length }} Bahnhöfe
        </div>
      </div>

      <!-- Saved Routes Section -->
      <div class="space-y-3" role="region" aria-label="Gespeicherte Strecken">
        <h3 class="text-sm font-black text-[#1F1612] flex items-center gap-2 px-1">
          <span class="mat-icon text-[#D4A373] text-base" aria-hidden="true">route</span>
          <span>Gespeicherte Strecken</span>
        </h3>

        @if (transitService.favoriteRoutes().length > 0) {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3" role="list" aria-label="Liste gespeicherter Routen">
            @for (route of transitService.favoriteRoutes(); track route.id) {
              <div class="bg-white rounded-3xl p-5 border border-[#E6DED6] shadow-xs hover:border-[#2D6A4F] hover:shadow-md transition-all flex items-center justify-between gap-3" role="listitem">
                <div class="space-y-1">
                  <div class="flex items-center gap-2 font-black text-[#1F1612] text-sm">
                    <span>{{ route.fromName }}</span>
                    <span class="mat-icon text-[#8D6E63] text-xs" aria-hidden="true">arrow_forward</span>
                    <span>{{ route.toName }}</span>
                  </div>
                  <div class="text-xs text-[#1B4332] font-bold">
                    ✓ Deutschlandticket Regionalzug
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    (click)="searchRoute(route)"
                    class="px-4 py-2 bg-[#1B4332] hover:bg-[#132A1E] text-white rounded-full text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                    title="Verbindungen jetzt abrufen"
                    [attr.aria-label]="'Verbindungen von ' + route.fromName + ' nach ' + route.toName + ' suchen'"
                  >
                    <span class="mat-icon text-xs" aria-hidden="true">search</span>
                    <span>Suchen</span>
                  </button>

                  <button
                    type="button"
                    (click)="transitService.removeFavoriteRoute(route.id)"
                    class="p-2 text-[#8D6E63] hover:text-[#C8372D] hover:bg-[#FAF7F2] rounded-full cursor-pointer transition-colors"
                    title="Favorit entfernen"
                    [attr.aria-label]="'Route von ' + route.fromName + ' nach ' + route.toName + ' aus Favoriten löschen'"
                  >
                    <span class="mat-icon text-base" aria-hidden="true">delete_outline</span>
                  </button>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="bg-white rounded-3xl p-8 border border-[#E6DED6] text-center space-y-2 shadow-xs">
            <span class="mat-icon text-2xl text-[#8D6E63]" aria-hidden="true">star_border</span>
            <p class="text-xs text-[#795548] font-medium">Du hast noch keine Strecken gespeichert.</p>
          </div>
        }
      </div>

      <!-- Saved Stations Section -->
      <div class="space-y-3 pt-2" role="region" aria-label="Gespeicherte Bahnhöfe">
        <h3 class="text-sm font-black text-[#1F1612] flex items-center gap-2 px-1">
          <span class="mat-icon text-[#2D6A4F] text-base" aria-hidden="true">train</span>
          <span>Gespeicherte Bahnhöfe</span>
        </h3>

        @if (transitService.favoriteStations().length > 0) {
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3" role="list" aria-label="Liste gespeicherter Bahnhöfe">
            @for (station of transitService.favoriteStations(); track station.id) {
              <div class="bg-white rounded-2xl p-4 border border-[#E6DED6] shadow-xs flex items-center justify-between gap-2" role="listitem">
                <div class="font-bold text-[#1F1612] text-xs">
                  {{ station.name }}
                </div>

                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    (click)="viewStationDepartures(station)"
                    class="px-3 py-1.5 bg-[#D8F3DC] hover:bg-[#B7E4C7] text-[#1B4332] rounded-full text-xs font-bold cursor-pointer transition-colors"
                    title="Live-Abfahrten ansehen"
                    [attr.aria-label]="'Live-Abfahrten für ' + station.name + ' ansehen'"
                  >
                    Abfahrten
                  </button>

                  <button
                    type="button"
                    (click)="transitService.removeFavoriteStation(station.name)"
                    class="p-1.5 text-[#8D6E63] hover:text-[#C8372D] rounded-full cursor-pointer"
                    [attr.aria-label]="'Bahnhof ' + station.name + ' aus Favoriten entfernen'"
                  >
                    <span class="mat-icon text-sm" aria-hidden="true">close</span>
                  </button>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="bg-white rounded-3xl p-8 border border-[#E6DED6] text-center space-y-2 shadow-xs">
            <span class="mat-icon text-2xl text-[#8D6E63]" aria-hidden="true">location_city</span>
            <p class="text-xs text-[#795548] font-medium">Du hast noch keine Bahnhöfe als Favorit markiert.</p>
          </div>
        }
      </div>

    </div>
  `
})
export class FavoritesView {
  @Output() navigateToPlanner = new EventEmitter<{ from: Station; to: Station }>();
  @Output() navigateToLiveBoard = new EventEmitter<Station>();

  readonly transitService = inject(TransitService);

  searchRoute(route: FavoriteRoute) {
    this.navigateToPlanner.emit({
      from: { id: '', name: route.fromName },
      to: { id: '', name: route.toName }
    });
  }

  viewStationDepartures(st: FavoriteStation) {
    this.navigateToLiveBoard.emit({
      id: st.id,
      name: st.name
    });
  }
}
