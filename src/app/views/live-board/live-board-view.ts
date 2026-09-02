import {
  Component,
  EventEmitter,
  Output,
  signal,
  ChangeDetectionStrategy,
  inject,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Station, DepartureItem } from '../../models/transit.models';
import { TransitService } from '../../services/transit.service';
import { StationInput } from '../../components/station-input/station-input';

@Component({
  selector: 'app-live-board-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, StationInput],
  template: `
    <div class="space-y-6">
      
      <!-- Search & Station Selector Header (hvv switch Card) -->
      <div class="bg-white rounded-3xl p-5 sm:p-7 shadow-xs border border-[#E6DED6]" role="search" aria-label="Abfahrtstafel Suche">
        <div class="flex items-center justify-between mb-5">
          <div class="flex items-center gap-3">
            <span class="w-9 h-9 rounded-2xl bg-[#D8F3DC] text-[#1B4332] flex items-center justify-center font-bold" aria-hidden="true">
              <span class="mat-icon text-lg">departure_board</span>
            </span>
            <div>
              <h2 class="text-base sm:text-lg font-black text-[#1F1612] tracking-tight">Was fährt hier?</h2>
              <p class="text-xs text-[#795548]">Live-Abfahrtstafel für Regionalzüge und S-Bahnen</p>
            </div>
          </div>

          @if (currentStation()) {
            <button
              type="button"
              id="btn-fav-station"
              (click)="toggleFavoriteStation()"
              class="px-3.5 py-1.5 rounded-full border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all border-[#E6DED6]"
              [class.bg-[#D4A373]/30]="isFavoriteStation()"
              [class.text-[#1F1612]]="isFavoriteStation()"
              [class.bg-[#FAF7F2]]="!isFavoriteStation()"
              [class.text-[#795548]]="!isFavoriteStation()"
              [attr.aria-label]="isFavoriteStation() ? 'Bahnhof aus Favoriten entfernen' : 'Bahnhof als Favorit merken'"
            >
              <span class="mat-icon text-sm" [class.text-[#D4A373]]="isFavoriteStation()" aria-hidden="true">
                {{ isFavoriteStation() ? 'star' : 'star_border' }}
              </span>
              <span>{{ isFavoriteStation() ? 'Bahnhof gemerkt' : 'Bahnhof merken' }}</span>
            </button>
          }
        </div>

        <div class="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-3 items-end">
          <app-station-input
            label="Stadt, Bahnhof oder Haltestelle"
            placeholder="z.B. Lüneburg, Hamburg Hbf, Lübeck Hbf, Kiel Hbf..."
            iconName="place"
            inputId="input-live-station"
            [initialStation]="currentStation()"
            (stationChange)="onStationSelected($event)"
          ></app-station-input>

          <button
            type="button"
            id="btn-refresh-departures"
            (click)="loadDepartures()"
            [disabled]="isLoading() || !currentStation()"
            class="px-6 py-3 bg-[#1B4332] hover:bg-[#132A1E] disabled:bg-[#EFEBE6] disabled:text-[#A1887F] text-white rounded-full text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs"
            aria-label="Abfahrten live aktualisieren"
          >
            <span class="mat-icon text-base" [class.animate-spin]="isLoading()" aria-hidden="true">sync</span>
            <span>Aktualisieren</span>
          </button>
        </div>

        <!-- Quick Station Chips (hvv switch pills) -->
        <div class="flex items-center gap-2 flex-wrap pt-3 mt-4 border-t border-[#EDE5DC]" role="group" aria-label="Häufig gesuchte Bahnhöfe">
          <span class="text-xs text-[#8D6E63] font-bold mr-1">Beispiele:</span>
          @for (st of quickStations; track st.id) {
            <button
              type="button"
              (click)="setStation(st)"
              class="px-3 py-1 rounded-full bg-[#FAF7F2] hover:bg-[#D8F3DC] hover:text-[#1B4332] text-[#4E342E] text-xs font-semibold border border-[#E6DED6] transition-all cursor-pointer shadow-2xs"
              [attr.aria-label]="'Bahnhof ' + st.name + ' auswählen'"
            >
              {{ st.name }}
            </button>
          }
        </div>
      </div>

      <!-- Departures Table / Cards -->
      <div class="space-y-3" role="region" aria-label="Abfahrtstabelle">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-black text-[#1F1612]">
              Verbindungen ab {{ currentStation()?.name || 'Bahnhof' }}
            </h3>
            @if (departures().length > 0) {
              <span class="text-xs bg-[#D8F3DC] text-[#1B4332] border border-[#B7E4C7] px-2.5 py-0.5 rounded-full font-bold">
                {{ departures().length }} Züge
              </span>
            }
          </div>
          <span class="text-xs text-[#795548] font-semibold">Nur Deutschlandticket-Nahverkehr</span>
        </div>

        @if (isLoading()) {
          <div class="bg-white rounded-3xl p-12 border border-[#E6DED6] text-center space-y-3 shadow-xs" role="status" aria-live="polite">
            <span class="mat-icon text-3xl text-[#2D6A4F] animate-spin" aria-hidden="true">sync</span>
            <p class="text-sm font-bold text-[#4E342E]">Nächste Abfahrten werden live geladen...</p>
          </div>
        } @else if (departures().length > 0) {
          <div class="bg-white rounded-3xl border border-[#E6DED6] overflow-hidden shadow-xs divide-y divide-[#EDE5DC]" role="list" aria-label="Abfahrtsliste">
            @for (dep of departures(); track dep.id) {
              <div class="p-4 sm:p-5.5 hover:bg-[#FAF7F2] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4" role="listitem">
                
                <!-- Train & Destination Info -->
                <div class="flex items-start sm:items-center gap-4">
                  <!-- Train Line Badge (hvv switch line badge) -->
                  <span
                    class="px-3 py-1.5 rounded-xl text-xs font-black shadow-2xs text-white shrink-0 min-w-[64px] text-center"
                    [class.bg-[#C8372D]]="dep.line.startsWith('RE')"
                    [class.bg-[#2D6A4F]]="dep.line.startsWith('RB')"
                    [class.bg-[#1E5E63]]="dep.line.startsWith('S')"
                    [class.bg-[#4E342E]]="!dep.line.startsWith('RE') && !dep.line.startsWith('RB') && !dep.line.startsWith('S')"
                  >
                    {{ dep.line }}
                  </span>

                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-base font-black text-[#1F1612]">
                        {{ dep.direction }}
                      </span>
                      <span class="text-xs text-[#1B4332] bg-[#D8F3DC] px-2 py-0.5 rounded-full font-bold border border-[#B7E4C7]">
                        ✓ D-Ticket
                      </span>
                    </div>

                    <div class="text-xs text-[#795548] mt-1 flex items-center gap-2 flex-wrap font-medium">
                      @if (dep.operator) {
                        <span>{{ dep.operator }}</span>
                        <span>•</span>
                      }
                      <span>{{ dep.line.startsWith('S') ? 'S-Bahn' : 'Regionalzug' }}</span>
                      @if (dep.platform) {
                        <span class="bg-[#EFEBE6] text-[#2E1F18] px-2 py-0.5 rounded-md font-bold">Gleis {{ dep.platform }}</span>
                      }
                    </div>
                  </div>
                </div>

                <!-- Departure Timing & Status -->
                <div class="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 border-[#EDE5DC]">
                  <div class="text-left sm:text-right">
                    <div class="text-xl font-black font-mono text-[#1F1612] flex items-center gap-2 sm:justify-end">
                      <span>{{ formatTime(dep.when) }}</span>
                      @if (dep.delay > 0) {
                        <span class="text-xs font-bold text-[#3E2723] bg-[#D4A373]/30 px-2 py-0.5 rounded-full border border-[#D4A373]/40">
                          +{{ dep.delay }} Min.
                        </span>
                      }
                    </div>
                    <div class="text-xs text-[#8D6E63] font-bold">
                      {{ getCountdown(dep.when) }}
                    </div>
                  </div>

                  <!-- Action: Plan Journey to this Destination -->
                  <button
                    type="button"
                    (click)="planToDestination(dep)"
                    class="px-4 py-2 bg-[#D8F3DC] hover:bg-[#B7E4C7] text-[#1B4332] border border-[#B7E4C7] rounded-full text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                    title="Route dorthin planen"
                    [attr.aria-label]="'Route mit ' + dep.line + ' nach ' + dep.direction + ' planen'"
                  >
                    <span class="mat-icon text-sm" aria-hidden="true">navigation</span>
                    <span>Mitfahren</span>
                  </button>
                </div>

              </div>
            }
          </div>
        } @else {
          <!-- Empty Departures State -->
          <div class="bg-white rounded-3xl p-10 border border-[#E6DED6] text-center space-y-3 shadow-xs" role="alert">
            <span class="mat-icon text-3xl text-[#8D6E63]" aria-hidden="true">train</span>
            <h4 class="text-sm font-bold text-[#3E2723]">Keine aktuellen Regionalabfahrten gefunden</h4>
            <p class="text-xs text-[#795548] max-w-sm mx-auto">
              Für diese Station liegen derzeit keine anstehenden Regionalzüge im System vor. Bitte überprüfe den Stationsnamen.
            </p>
          </div>
        }
      </div>

    </div>
  `
})
export class LiveBoardView implements OnInit {
  @Output() navigateToPlanner = new EventEmitter<{ from: Station; to: Station }>();

  private transitService = inject(TransitService);

  readonly currentStation = signal<Station | null>({
    id: '8003762',
    name: 'Lüneburg',
    location: { latitude: 53.250554, longitude: 10.419163 }
  });

  readonly departures = signal<DepartureItem[]>([]);
  readonly isLoading = signal<boolean>(false);

  readonly quickStations = [
    { id: '8003762', name: 'Lüneburg', lat: 53.2505, lon: 10.4191 },
    { id: '8002549', name: 'Hamburg Hbf', lat: 53.5527, lon: 10.0069 },
    { id: '8000237', name: 'Lübeck Hbf', lat: 53.8672, lon: 10.6698 },
    { id: '8003368', name: 'Kiel Hbf', lat: 54.3149, lon: 10.1320 },
    { id: '8000050', name: 'Bremen Hbf', lat: 53.0834, lon: 8.8138 },
    { id: '8000339', name: 'Schwerin Hbf', lat: 53.6343, lon: 11.4075 }
  ];

  ngOnInit() {
    this.loadDepartures();
  }

  onStationSelected(station: Station | null) {
    if (station) {
      this.currentStation.set(station);
      this.loadDepartures();
    }
  }

  setStation(st: { id: string; name: string; lat: number; lon: number }) {
    this.currentStation.set({
      id: st.id,
      name: st.name,
      location: { latitude: st.lat, longitude: st.lon }
    });
    this.loadDepartures();
  }

  async loadDepartures() {
    const st = this.currentStation();
    if (!st) return;

    this.isLoading.set(true);
    const res = await this.transitService.getStationDepartures(st.name);
    this.isLoading.set(false);
    this.departures.set(res.departures);
  }

  formatTime(isoString: string): string {
    if (!isoString) return '--:--';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  }

  getCountdown(isoString: string): string {
    if (!isoString) return '';
    try {
      const dep = new Date(isoString);
      const diffMs = dep.getTime() - Date.now();
      const diffMin = Math.round(diffMs / 60000);
      if (diffMin <= 0) return 'Jetzt';
      if (diffMin === 1) return 'In 1 Min.';
      return `In ${diffMin} Min.`;
    } catch {
      return '';
    }
  }

  planToDestination(dep: DepartureItem) {
    const from = this.currentStation();
    if (from) {
      this.navigateToPlanner.emit({
        from,
        to: dep.destination
      });
    }
  }

  toggleFavoriteStation() {
    const st = this.currentStation();
    if (!st) return;
    if (this.isFavoriteStation()) {
      this.transitService.removeFavoriteStation(st.name);
    } else {
      this.transitService.addFavoriteStation(st);
    }
  }

  isFavoriteStation(): boolean {
    const st = this.currentStation();
    if (!st) return false;
    return this.transitService.favoriteStations().some(s => s.name === st.name);
  }
}
