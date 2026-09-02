import {
  Component,
  EventEmitter,
  Output,
  signal,
  computed,
  ChangeDetectionStrategy,
  inject,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegionalGetaway, Station } from '../../models/transit.models';
import { TransitService } from '../../services/transit.service';

@Component({
  selector: 'app-hamburg-hub-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="space-y-8">
      
      <!-- Hub Header Banner (hvv switch dark forest & coffee gradient) -->
      <div class="bg-gradient-to-r from-[#1B4332] via-[#2D6A4F] to-[#3E2723] text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div class="relative z-10 max-w-2xl space-y-3">
          <div class="inline-flex items-center gap-2 px-3.5 py-1 bg-white/15 text-[#D8F3DC] border border-white/20 rounded-full text-xs font-bold">
            <span class="mat-icon text-sm">anchor</span>
            <span>Knotenpunkt Hamburg Hauptbahnhof</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Deutschland ab Hamburg entdecken
          </h1>
          <p class="text-xs sm:text-sm text-[#D8F3DC]/90 leading-relaxed font-medium">
            Nutze dein Deutschlandticket optimal: Von Hamburg aus erreichst du Nord- und Ostsee, historische Hansestädte, Naturparks und Nachbarländer bequem und ohne Aufpreis im Regionalverkehr.
          </p>
        </div>

        <div class="absolute -right-8 -bottom-8 opacity-10 text-white select-none pointer-events-none">
          <span class="mat-icon text-[180px]">train</span>
        </div>
      </div>

      <!-- SECTION 1: "Nächste Abenteuer ab Hamburg" -->
      <div class="space-y-4" role="region" aria-label="Nächste Abenteuer ab Hamburg">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full bg-[#2D6A4F]" aria-hidden="true"></span>
              <h2 class="text-lg font-black text-[#1F1612]">Nächste Abenteuer ab Hamburg</h2>
            </div>
            <p class="text-xs text-[#795548]">Wohin kannst du jetzt mit deinem Deutschlandticket spontan aufbrechen?</p>
          </div>

          <!-- Timing Pills (hvv switch switchers) -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0" role="tablist" aria-label="Abfahrtszeitfilter">
            <button
              type="button"
              id="filter-time-jetzt"
              (click)="timeFilter.set('jetzt')"
              [class.bg-[#1B4332]]="timeFilter() === 'jetzt'"
              [class.text-white]="timeFilter() === 'jetzt'"
              [class.bg-[#EFEBE6]]="timeFilter() !== 'jetzt'"
              [class.text-[#4E342E]]="timeFilter() !== 'jetzt'"
              class="px-3.5 py-1.5 rounded-full text-xs font-bold border border-[#E6DED6] shadow-2xs transition-all cursor-pointer"
              role="tab"
              [attr.aria-selected]="timeFilter() === 'jetzt'"
              aria-label="Sofort abfahren"
            >
              Jetzt
            </button>
            <button
              type="button"
              id="filter-time-1h"
              (click)="timeFilter.set('1h')"
              [class.bg-[#1B4332]]="timeFilter() === '1h'"
              [class.text-white]="timeFilter() === '1h'"
              [class.bg-[#EFEBE6]]="timeFilter() !== '1h'"
              [class.text-[#4E342E]]="timeFilter() !== '1h'"
              class="px-3.5 py-1.5 rounded-full text-xs font-bold border border-[#E6DED6] shadow-2xs transition-all cursor-pointer"
              role="tab"
              [attr.aria-selected]="timeFilter() === '1h'"
              aria-label="In 1 Stunde abfahren"
            >
              In 1 Stunde
            </button>
            <button
              type="button"
              id="filter-time-nachmittag"
              (click)="timeFilter.set('nachmittag')"
              [class.bg-[#1B4332]]="timeFilter() === 'nachmittag'"
              [class.text-white]="timeFilter() === 'nachmittag'"
              [class.bg-[#EFEBE6]]="timeFilter() !== 'nachmittag'"
              [class.text-[#4E342E]]="timeFilter() !== 'nachmittag'"
              class="px-3.5 py-1.5 rounded-full text-xs font-bold border border-[#E6DED6] shadow-2xs transition-all cursor-pointer"
              role="tab"
              [attr.aria-selected]="timeFilter() === 'nachmittag'"
              aria-label="Heute Nachmittag abfahren"
            >
              Heute Nachmittag
            </button>
            <button
              type="button"
              id="filter-time-morgen"
              (click)="timeFilter.set('morgen')"
              [class.bg-[#1B4332]]="timeFilter() === 'morgen'"
              [class.text-white]="timeFilter() === 'morgen'"
              [class.bg-[#EFEBE6]]="timeFilter() !== 'morgen'"
              [class.text-[#4E342E]]="timeFilter() !== 'morgen'"
              class="px-3.5 py-1.5 rounded-full text-xs font-bold border border-[#E6DED6] shadow-2xs transition-all cursor-pointer"
              role="tab"
              [attr.aria-selected]="timeFilter() === 'morgen'"
              aria-label="Morgen abfahren"
            >
              Morgen
            </button>
          </div>
        </div>

        <!-- Adventure Cards Grid (hvv switch Card layout) -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          @for (dest of adventureCards(); track dest.id) {
            <div class="bg-white rounded-3xl p-5 sm:p-6 border border-[#E6DED6] shadow-xs hover:shadow-md hover:border-[#2D6A4F] transition-all flex flex-col justify-between space-y-4">
              
              <div>
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-black uppercase tracking-wider text-[#1B4332] bg-[#D8F3DC] px-2.5 py-0.5 rounded-full border border-[#B7E4C7]">
                    {{ dest.bundesland }}
                  </span>
                  <span class="text-xs font-bold text-[#8D6E63]">
                    {{ dest.category }}
                  </span>
                </div>

                <h3 class="text-lg font-black text-[#1F1612] mt-2">
                  {{ dest.name }}
                </h3>
                <p class="text-xs text-[#5D4037] mt-1 line-clamp-2 leading-relaxed">
                  {{ dest.description }}
                </p>

                <!-- Highlight Badge -->
                <div class="mt-3 text-xs bg-[#FAF7F2] p-3 rounded-2xl text-[#3E2723] flex items-center gap-2 border border-[#EDE5DC] font-semibold">
                  <span class="mat-icon text-[#D4A373] text-sm" aria-hidden="true">stars</span>
                  <span>{{ dest.highlight }}</span>
                </div>
              </div>

              <!-- Transit Specs -->
              <div class="space-y-3 pt-2 border-t border-[#EDE5DC]">
                <div class="grid grid-cols-3 gap-2 text-center text-xs">
                  <div class="bg-[#FAF7F2] p-2 rounded-2xl border border-[#E6DED6]">
                    <div class="text-[10px] text-[#8D6E63] uppercase font-bold">Fahrzeit</div>
                    <div class="font-black text-[#1F1612] mt-0.5">{{ dest.durationFormatted }}</div>
                  </div>
                  <div class="bg-[#FAF7F2] p-2 rounded-2xl border border-[#E6DED6]">
                    <div class="text-[10px] text-[#8D6E63] uppercase font-bold">Umstiege</div>
                    <div class="font-black text-[#1F1612] mt-0.5">{{ dest.transfers === 0 ? 'Direkt' : dest.transfers + ' Umstieg' }}</div>
                  </div>
                  <div class="bg-[#D8F3DC] p-2 rounded-2xl text-[#1B4332] border border-[#B7E4C7]">
                    <div class="text-[10px] uppercase font-bold text-[#2D6A4F]">Ticket</div>
                    <div class="font-black mt-0.5">✓ D-Ticket</div>
                  </div>
                </div>

                <div class="flex items-center justify-between gap-2">
                  <!-- Train Lines -->
                  <div class="flex items-center gap-1 flex-wrap">
                    @for (line of dest.lines; track line) {
                      <span
                        class="px-2.5 py-0.5 text-white rounded-lg text-[11px] font-black shadow-2xs"
                        [class.bg-[#C8372D]]="line.startsWith('RE')"
                        [class.bg-[#2D6A4F]]="line.startsWith('RB')"
                        [class.bg-[#1E5E63]]="line.startsWith('S')"
                        [class.bg-[#4E342E]]="!line.startsWith('RE') && !line.startsWith('RB') && !line.startsWith('S')"
                      >
                        {{ line }}
                      </span>
                    }
                  </div>

                  <!-- Plan Route Button -->
                  <button
                    type="button"
                    id="btn-plan-hub-{{ dest.id }}"
                    (click)="planTrip(dest)"
                    class="px-4 py-2 bg-[#1B4332] hover:bg-[#132A1E] text-white rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                    [attr.aria-label]="'Route nach ' + dest.name + ' im Planer suchen'"
                  >
                    <span class="mat-icon text-sm" aria-hidden="true">arrow_forward</span>
                    <span>Route</span>
                  </button>
                </div>
              </div>

            </div>
          }
        </div>
      </div>

      <!-- SECTION 2: Regional Destinations Grouped by Bundesländer -->
      <div class="space-y-4 pt-4 border-t border-[#EDE5DC]" role="region" aria-label="Ziele nach Bundesländern">
        <div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#5D4037]" aria-hidden="true"></span>
            <h2 class="text-lg font-black text-[#1F1612]">Ziele nach Bundesländern sortiert</h2>
          </div>
          <p class="text-xs text-[#795548]">Entdecke, wie weit du mit dem Deutschlandticket in jedes Bundesland kommst</p>
        </div>

        <!-- Bundesländer Switcher Pills -->
        <div class="flex items-center gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Bundesländer Ausflugsziele">
          @for (state of bundeslaender; track state.name) {
            <button
              type="button"
              (click)="selectedState.set(state.name)"
              [class.bg-[#1B4332]]="selectedState() === state.name"
              [class.text-white]="selectedState() === state.name"
              [class.bg-[#FAF7F2]]="selectedState() !== state.name"
              [class.text-[#4E342E]]="selectedState() !== state.name"
              class="px-4 py-2 rounded-full text-xs font-bold border border-[#E6DED6] shadow-2xs transition-all shrink-0 cursor-pointer flex items-center gap-2"
              role="tab"
              [attr.aria-selected]="selectedState() === state.name"
              [attr.aria-label]="state.name + ' (' + getDestinationsCount(state.name) + ' Ziele)'"
            >
              <span>{{ state.name }}</span>
              <span
                class="text-[10px] px-2 py-0.5 rounded-full font-extrabold"
                [class.bg-[#2D6A4F]]="selectedState() === state.name"
                [class.text-white]="selectedState() === state.name"
                [class.bg-[#EFEBE6]]="selectedState() !== state.name"
                [class.text-[#5D4037]]="selectedState() !== state.name"
              >
                {{ getDestinationsCount(state.name) }}
              </span>
            </button>
          }
        </div>

        <!-- State Destinations List -->
        <div class="bg-white rounded-3xl border border-[#E6DED6] shadow-xs p-6 divide-y divide-[#EDE5DC] space-y-4" role="list" aria-label="Ausflugsziele des Bundeslandes">
          @for (dest of filteredDestinations(); track dest.id) {
            <div class="pt-4 first:pt-0 flex flex-col md:flex-row md:items-center justify-between gap-4" role="listitem">
              <div class="space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="text-base font-black text-[#1F1612]">{{ dest.name }}</h4>
                  <span class="text-xs px-2.5 py-0.5 rounded-full bg-[#FAF7F2] text-[#5D4037] font-bold border border-[#E6DED6]">
                    {{ dest.category }}
                  </span>
                  <span class="text-xs text-[#1B4332] font-black bg-[#D8F3DC] px-2.5 py-0.5 rounded-full border border-[#B7E4C7]">
                    ✓ Deutschlandticket
                  </span>
                </div>
                <p class="text-xs text-[#5D4037] max-w-xl">{{ dest.description }}</p>
                <div class="text-xs text-[#795548] flex items-center gap-3 pt-1 flex-wrap font-medium">
                  <span class="flex items-center gap-1">
                    <span class="mat-icon text-xs text-[#8D6E63]" aria-hidden="true">schedule</span>
                    <strong class="text-[#1F1612]">{{ dest.durationFormatted }}</strong>
                  </span>
                  <span>•</span>
                  <span>{{ dest.transfers === 0 ? 'Direktverbindung' : dest.transfers + ' Umstieg' }}</span>
                  <span>•</span>
                  <span class="text-[#1B4332] font-bold">{{ dest.lines.join(', ') }}</span>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  id="btn-plan-state-{{ dest.id }}"
                  (click)="planTrip(dest)"
                  class="px-5 py-2.5 bg-[#1B4332] hover:bg-[#132A1E] text-white rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  [attr.aria-label]="'Verbindung nach ' + dest.name + ' suchen'"
                >
                  <span class="mat-icon text-sm" aria-hidden="true">train</span>
                  <span>Verbindungen suchen</span>
                </button>
              </div>
            </div>
          }
        </div>
      </div>

    </div>
  `
})
export class HamburgHubView implements OnInit {
  @Output() navigateToPlanner = new EventEmitter<{ from: Station; to: Station }>();

  private transitService = inject(TransitService);

  readonly allDestinations = signal<RegionalGetaway[]>([]);
  readonly selectedState = signal<string>('Schleswig-Holstein');
  readonly timeFilter = signal<'jetzt' | '1h' | 'nachmittag' | 'morgen'>('jetzt');

  readonly bundeslaender = [
    { name: 'Schleswig-Holstein' },
    { name: 'Niedersachsen' },
    { name: 'Mecklenburg-Vorpommern' },
    { name: 'Bremen' },
    { name: 'Nordrhein-Westfalen' },
    { name: 'Berlin & Brandenburg' }
  ];

  readonly adventureCards = computed(() => {
    const list = this.allDestinations();
    // Shuffle slightly based on time filter
    if (this.timeFilter() === 'jetzt') {
      return list.filter(d => d.durationMin <= 90).slice(0, 6);
    }
    if (this.timeFilter() === '1h') {
      return list.filter(d => d.durationMin <= 120).slice(0, 6);
    }
    return list.slice(0, 6);
  });

  readonly filteredDestinations = computed(() => {
    const state = this.selectedState();
    return this.allDestinations().filter(d =>
      state.includes('&')
        ? (d.bundesland.includes('Berlin') || d.bundesland.includes('Brandenburg'))
        : d.bundesland === state
    );
  });

  async ngOnInit() {
    const data = await this.transitService.getRegionalDestinations();
    this.allDestinations.set(data);
  }

  getDestinationsCount(stateName: string): number {
    return this.allDestinations().filter(d =>
      stateName.includes('&')
        ? (d.bundesland.includes('Berlin') || d.bundesland.includes('Brandenburg'))
        : d.bundesland === stateName
    ).length;
  }

  planTrip(dest: RegionalGetaway) {
    this.navigateToPlanner.emit({
      from: {
        id: '8002549',
        name: 'Hamburg Hbf',
        location: { latitude: 53.552736, longitude: 10.006909 }
      },
      to: {
        id: dest.stationId,
        name: dest.stationName,
        location: { latitude: dest.latitude, longitude: dest.longitude }
      }
    });
  }
}
