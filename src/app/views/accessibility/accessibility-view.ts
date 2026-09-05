import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
  Output,
  EventEmitter
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TransitService } from '../../services/transit.service';
import { StationAccessibility, Station } from '../../models/transit.models';

@Component({
  selector: 'app-accessibility-view',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 animate-in fade-in duration-200">
      
      <!-- 1. Hero Header (Didactic & Minimalist) -->
      <div class="bg-white rounded-2xl p-5 sm:p-7 border border-[#E6DED6] shadow-xs relative overflow-hidden">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="space-y-1.5 max-w-2xl">
            <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#EDF9F0] text-[#1B4332] border border-[#B7E4C7]">
              <span class="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] animate-pulse"></span>
              <span>Hamburg Open Data • Live-Aufzugsprogramm & DB FaSta</span>
            </div>
            <h1 class="text-xl sm:text-2xl font-black text-[#1F1612] tracking-tight flex items-center gap-2">
              <span class="mat-icon text-[#2D6A4F] text-2xl" aria-hidden="true">accessible</span>
              <span>Barrierefreiheit & Aufzugs-Monitor</span>
            </h1>
            <p class="text-xs sm:text-sm text-[#795548] leading-relaxed">
              Echtzeitüberwachung aller Aufzüge, Fahrtreppen und Leitsysteme im Hamburger Verkehrsnetz (hvv, S-Bahn, U-Bahn und Regionalbahnhöfe).
            </p>
          </div>

          <!-- Quick Refresh Button -->
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              id="btn-refresh-accessibility"
              (click)="loadData()"
              [disabled]="isLoading()"
              class="px-3.5 py-2 rounded-xl bg-[#FAF7F2] hover:bg-[#EDF9F0] text-[#1B4332] border border-[#D7CCC8] hover:border-[#2D6A4F] text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all disabled:opacity-50"
              title="Daten aktualisieren"
              aria-label="Live-Barrierefreiheitsdaten neu laden"
            >
              <span class="mat-icon text-sm" [class.animate-spin]="isLoading()" aria-hidden="true">sync</span>
              <span>{{ isLoading() ? 'Wird aktualisiert...' : 'Live aktualisieren' }}</span>
            </button>
          </div>
        </div>

        <!-- Metric KPI Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 border-t border-[#EDE5DC] mt-4">
          <!-- KPI 1: Operational Rate -->
          <div class="bg-[#FAF7F2] rounded-xl p-3 border border-[#E6DED6]">
            <div class="text-[10px] font-bold text-[#795548] uppercase tracking-wider flex items-center gap-1">
              <span class="mat-icon text-xs text-[#2D6A4F]">verified</span>
              <span>Betriebsquote</span>
            </div>
            <div class="text-xl sm:text-2xl font-black text-[#1B4332] mt-0.5">
              {{ networkSummary().operationalRatePercent }}%
            </div>
            <div class="text-[10px] text-[#2D6A4F] font-semibold">Netzweite Verfügbarkeit</div>
          </div>

          <!-- KPI 2: Elevators In Service -->
          <div class="bg-[#FAF7F2] rounded-xl p-3 border border-[#E6DED6]">
            <div class="text-[10px] font-bold text-[#795548] uppercase tracking-wider flex items-center gap-1">
              <span class="mat-icon text-xs text-[#2D6A4F]">elevator</span>
              <span>Aufzüge aktiv</span>
            </div>
            <div class="text-xl sm:text-2xl font-black text-[#1B4332] mt-0.5">
              {{ networkSummary().elevatorsInService }} <span class="text-xs font-bold text-[#795548]">/ {{ networkSummary().totalElevators }}</span>
            </div>
            <div class="text-[10px] text-[#2D6A4F] font-semibold">Stufenfrei nutzbar</div>
          </div>

          <!-- KPI 3: Disruptions / Maintenance -->
          <div
            (click)="setFilter('disrupted')"
            role="button"
            tabindex="0"
            class="bg-[#FAF7F2] hover:bg-[#FFF3E0] rounded-xl p-3 border transition-colors cursor-pointer"
            [class.border-[#FFE0B2]]="networkSummary().elevatorsOutOfOrder + networkSummary().elevatorsInMaintenance > 0"
            [class.border-[#E6DED6]]="networkSummary().elevatorsOutOfOrder + networkSummary().elevatorsInMaintenance === 0"
          >
            <div class="text-[10px] font-bold text-[#E65100] uppercase tracking-wider flex items-center gap-1">
              <span class="mat-icon text-xs">warning</span>
              <span>Störung / Wartung</span>
            </div>
            <div class="text-xl sm:text-2xl font-black text-[#E65100] mt-0.5">
              {{ networkSummary().elevatorsOutOfOrder + networkSummary().elevatorsInMaintenance }}
            </div>
            <div class="text-[10px] text-[#E65100] font-semibold">Klicken zum Filtern</div>
          </div>

          <!-- KPI 4: Monitored Stations -->
          <div class="bg-[#FAF7F2] rounded-xl p-3 border border-[#E6DED6]">
            <div class="text-[10px] font-bold text-[#795548] uppercase tracking-wider flex items-center gap-1">
              <span class="mat-icon text-xs text-[#2D6A4F]">domain</span>
              <span>Stationen</span>
            </div>
            <div class="text-xl sm:text-2xl font-black text-[#1F1612] mt-0.5">
              {{ networkSummary().totalStationsMonitored }}
            </div>
            <div class="text-[10px] text-[#795548] font-semibold">Metropolregion Hamburg</div>
          </div>
        </div>
      </div>

      <!-- 2. Controls & Search Bar -->
      <div class="bg-white rounded-2xl p-4 border border-[#E6DED6] shadow-xs space-y-3">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3">
          
          <!-- Search input -->
          <div class="relative w-full sm:max-w-md">
            <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8D6E63] flex items-center pointer-events-none" aria-hidden="true">
              <span class="mat-icon text-base">search</span>
            </span>
            <input
              id="input-accessibility-search"
              type="text"
              placeholder="Station suchen (z.B. Hauptbahnhof, Altona, Jungfernstieg)..."
              [value]="searchQuery()"
              (input)="onSearchInput($event)"
              class="w-full pl-10 pr-9 py-2 bg-[#FAF7F2] border border-[#D7CCC8] rounded-xl text-sm font-semibold text-[#1F1612] placeholder-[#8D6E63] focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 focus:border-[#2D6A4F] focus:bg-white transition-all shadow-2xs"
            />
            @if (searchQuery()) {
              <button
                type="button"
                (click)="searchQuery.set('')"
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8D6E63] hover:text-[#2E1F18] p-0.5 rounded-full cursor-pointer"
                title="Suchbegriff löschen"
                aria-label="Suchbegriff löschen"
              >
                <span class="mat-icon text-sm" aria-hidden="true">close</span>
              </button>
            }
          </div>

          <!-- Quick Filter Tabs -->
          <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto py-0.5" role="tablist" aria-label="Barrierefreiheit-Filter">
            <button
              type="button"
              id="tab-filter-all"
              (click)="setFilter('all')"
              role="tab"
              [attr.aria-selected]="activeFilter() === 'all'"
              class="px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs border"
              [class.bg-[#1B4332]]="activeFilter() === 'all'"
              [class.text-white]="activeFilter() === 'all'"
              [class.border-[#1B4332]]="activeFilter() === 'all'"
              [class.bg-[#FAF7F2]]="activeFilter() !== 'all'"
              [class.text-[#4E342E]]="activeFilter() !== 'all'"
              [class.border-[#D7CCC8]]="activeFilter() !== 'all'"
            >
              Alle ({{ allStations().length }})
            </button>

            <button
              type="button"
              id="tab-filter-disrupted"
              (click)="setFilter('disrupted')"
              role="tab"
              [attr.aria-selected]="activeFilter() === 'disrupted'"
              class="px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs border flex items-center gap-1"
              [class.bg-[#E65100]]="activeFilter() === 'disrupted'"
              [class.text-white]="activeFilter() === 'disrupted'"
              [class.border-[#E65100]]="activeFilter() === 'disrupted'"
              [class.bg-[#FFF3E0]]="activeFilter() !== 'disrupted'"
              [class.text-[#E65100]]="activeFilter() !== 'disrupted'"
              [class.border-[#FFE0B2]]="activeFilter() !== 'disrupted'"
            >
              <span class="mat-icon text-xs" aria-hidden="true">warning</span>
              <span>Störungen & Wartung ({{ disruptedCount() }})</span>
            </button>

            <button
              type="button"
              id="tab-filter-stepfree"
              (click)="setFilter('stepfree')"
              role="tab"
              [attr.aria-selected]="activeFilter() === 'stepfree'"
              class="px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs border flex items-center gap-1"
              [class.bg-[#1B4332]]="activeFilter() === 'stepfree'"
              [class.text-white]="activeFilter() === 'stepfree'"
              [class.border-[#1B4332]]="activeFilter() === 'stepfree'"
              [class.bg-[#EDF9F0]]="activeFilter() !== 'stepfree'"
              [class.text-[#1B4332]]="activeFilter() !== 'stepfree'"
              [class.border-[#B7E4C7]]="activeFilter() !== 'stepfree'"
            >
              <span class="mat-icon text-xs" aria-hidden="true">check_circle</span>
              <span>100% Stufenfrei</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 3. Station Accessibility Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        @for (st of filteredStations(); track st.stationId) {
          @let isExpanded = expandedStationId() === st.stationId;
          @let hasDisruption = st.elevatorsOutOfOrder > 0 || st.elevatorsInMaintenance > 0 || st.activeDisruptions.length > 0;

          <div
            class="bg-white rounded-2xl border transition-all shadow-2xs overflow-hidden flex flex-col justify-between"
            [class.border-[#FFE0B2]]="hasDisruption"
            [class.border-[#E6DED6]]="!hasDisruption"
            [class.hover:border-[#2D6A4F]]="!hasDisruption"
          >
            <!-- Card Header -->
            <div class="p-4 sm:p-5 space-y-3">
              <div class="flex items-start justify-between gap-2.5">
                <div class="space-y-0.5">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h2 class="text-base font-black text-[#1F1612]">
                      {{ st.stationName }}
                    </h2>
                    @if (hasDisruption) {
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-[#FFF3E0] text-[#E65100] border border-[#FFE0B2]">
                        <span class="mat-icon text-[11px]">warning</span>
                        <span>Störung gemeldet</span>
                      </span>
                    } @else {
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-[#EDF9F0] text-[#1B4332] border border-[#B7E4C7]">
                        <span class="mat-icon text-[11px]">verified</span>
                        <span>Stufenfrei erreichbar</span>
                      </span>
                    }
                  </div>
                  @if (st.stepFreeAccessNote) {
                    <p class="text-xs text-[#795548] leading-relaxed pt-0.5">
                      {{ st.stepFreeAccessNote }}
                    </p>
                  }
                </div>

                <!-- Score Pill -->
                <div class="shrink-0 text-center px-2.5 py-1 rounded-xl bg-[#FAF7F2] border border-[#E6DED6]">
                  <div class="text-sm font-black" [class.text-[#2D6A4F]]="st.overallScorePercent >= 90" [class.text-[#D97706]]="st.overallScorePercent < 90">
                    {{ st.overallScorePercent }}%
                  </div>
                  <div class="text-[9px] font-bold text-[#8D6E63] uppercase tracking-wider">Score</div>
                </div>
              </div>

              <!-- Quick Didactic Facility Pills -->
              <div class="flex items-center gap-1.5 flex-wrap text-xs pt-1">
                <!-- Aufzüge -->
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border"
                  [class.bg-[#EDF9F0]]="st.elevatorsOutOfOrder === 0 && st.elevatorsInMaintenance === 0"
                  [class.text-[#1B4332]]="st.elevatorsOutOfOrder === 0 && st.elevatorsInMaintenance === 0"
                  [class.border-[#B7E4C7]]="st.elevatorsOutOfOrder === 0 && st.elevatorsInMaintenance === 0"
                  [class.bg-[#FFF3E0]]="st.elevatorsOutOfOrder > 0 || st.elevatorsInMaintenance > 0"
                  [class.text-[#E65100]]="st.elevatorsOutOfOrder > 0 || st.elevatorsInMaintenance > 0"
                  [class.border-[#FFE0B2]]="st.elevatorsOutOfOrder > 0 || st.elevatorsInMaintenance > 0"
                >
                  <span class="mat-icon text-[12px]">elevator</span>
                  <span>{{ st.elevatorsInService }} / {{ st.elevatorsTotal }} Aufzüge aktiv</span>
                </span>

                <!-- Blindenleitsystem -->
                @if (st.tactilePaving) {
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FAF7F2] text-[#4E342E] border border-[#E6DED6]" title="Rillen- & Noppenleitstreifen auf den Bahnsteigen vorhanden">
                    <span class="mat-icon text-[12px] text-[#2D6A4F]">blind</span>
                    <span>Taktiles Leitsystem</span>
                  </span>
                }

                <!-- Barrierefreies WC -->
                @if (st.accessibleToilet) {
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FAF7F2] text-[#4E342E] border border-[#E6DED6]" title="Euroschlüssel-WC vorhanden">
                    <span class="mat-icon text-[12px] text-[#2D6A4F]">wc</span>
                    <span>Behinderten-WC</span>
                  </span>
                }

                <!-- Mobilitätsservice -->
                @if (st.mobilityServiceAvailable) {
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FAF7F2] text-[#4E342E] border border-[#E6DED6]" title="Einstiegshilfe durch DB Personal oder Hochbahn-Team">
                    <span class="mat-icon text-[12px] text-[#2D6A4F]">support_agent</span>
                    <span>Mobilitätsservice vor Ort</span>
                  </span>
                }
              </div>

              <!-- Active Disruptions Box if any -->
              @if (st.activeDisruptions.length > 0) {
                <div class="bg-[#FFF3E0] rounded-xl p-2.5 border border-[#FFE0B2] text-xs text-[#E65100] space-y-1">
                  @for (dis of st.activeDisruptions; track $index) {
                    <div class="flex items-start gap-1.5 font-medium">
                      <span class="mat-icon text-sm shrink-0 mt-0.5">info</span>
                      <span>{{ dis }}</span>
                    </div>
                  }
                </div>
              }

              <!-- Expandable Detailed Elevators List -->
              @if (isExpanded) {
                <div class="pt-2 space-y-2 border-t border-[#F0EAE1] animate-in fade-in duration-150">
                  <div class="text-[10px] font-bold text-[#8D6E63] uppercase tracking-wider">
                    Detaillierte Aufzugs- & Anlagenauskunft
                  </div>
                  <div class="space-y-1.5 divide-y divide-[#F5EFE6]">
                    @for (el of st.elevators; track el.id) {
                      <div class="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs">
                        <div class="min-w-0">
                          <div class="font-bold text-[#1F1612] truncate">{{ el.description }}</div>
                          @if (el.platform) {
                            <div class="text-[10px] text-[#795548]">Gleis / Bahnsteig {{ el.platform }}</div>
                          }
                          @if (el.stateExplanation) {
                            <div class="text-[10px] text-[#E65100] font-medium">{{ el.stateExplanation }}</div>
                          }
                        </div>

                        <!-- Status badge -->
                        <div class="shrink-0">
                          @if (el.state === 'in_service') {
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EDF9F0] text-[#1B4332] border border-[#B7E4C7]">
                              <span class="w-1.5 h-1.5 rounded-full bg-[#2D6A4F]"></span>
                              <span>In Betrieb</span>
                            </span>
                          } @else if (el.state === 'maintenance') {
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF9C4] text-[#7F6000] border border-[#FFF176]">
                              <span class="mat-icon text-[11px]">engineering</span>
                              <span>Wartung</span>
                            </span>
                          } @else {
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFEBEE] text-[#C62828] border border-[#FFCDD2]">
                              <span class="mat-icon text-[11px]">build_circle</span>
                              <span>Außer Betrieb</span>
                            </span>
                          }
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>

            <!-- Card Bottom Bar -->
            <div class="px-4 sm:px-5 py-2.5 bg-[#FAF7F2] border-t border-[#E6DED6] flex items-center justify-between text-xs">
              <button
                type="button"
                (click)="toggleExpand(st.stationId)"
                class="text-[#2D6A4F] hover:text-[#1B4332] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                [attr.aria-expanded]="isExpanded"
              >
                <span>{{ isExpanded ? 'Details verbergen' : 'Alle Anlagen anzeigen (' + st.elevators.length + ')' }}</span>
                <span class="mat-icon text-xs transition-transform" [class.rotate-180]="isExpanded" aria-hidden="true">expand_more</span>
              </button>

              <button
                type="button"
                (click)="planFromStation(st)"
                class="px-2.5 py-1 rounded-lg bg-white hover:bg-[#EDF9F0] text-[#1B4332] border border-[#D7CCC8] hover:border-[#2D6A4F] font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title="Route ab dieser Station planen"
                aria-label="Route ab dieser Station planen"
              >
                <span class="mat-icon text-xs text-[#2D6A4F]">route</span>
                <span>Ab hier planen</span>
              </button>
            </div>
          </div>
        }
      </div>

      <!-- 4. Didactic Guide: Barrierefreies Reisen in Hamburg & DB Metropolregion -->
      <div class="bg-white rounded-2xl p-5 sm:p-6 border border-[#E6DED6] shadow-xs space-y-4">
        <div class="flex items-center gap-2.5 pb-3 border-b border-[#EDE5DC]">
          <span class="w-8 h-8 rounded-lg bg-[#EDF9F0] text-[#1B4332] flex items-center justify-center font-black">
            <span class="mat-icon text-lg">lightbulb</span>
          </span>
          <div>
            <h3 class="text-sm font-black text-[#1F1612]">Didaktischer Leitfaden für barrierefreies Reisen</h3>
            <p class="text-xs text-[#795548]">Tipps, Rechte und Notfallkontakte für Hamburg & Norddeutschland</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[#5D4037]">
          <!-- Box 1: Bei Aufzugsausfall -->
          <div class="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6DED6] space-y-1.5">
            <div class="font-bold text-[#1F1612] flex items-center gap-1.5">
              <span class="mat-icon text-[#E65100] text-sm">alt_route</span>
              <span>Alternative Routenführung</span>
            </div>
            <p class="leading-relaxed text-[#795548]">
              Fällt an einer Station ein Aufzug aus, nutze bitte die nächste barrierefreie Umsteigestation (z.B. Jungfernstieg oder Altona) und weiche auf Niederflur-Busse der Hochbahn aus.
            </p>
          </div>

          <!-- Box 2: Mobilitätsservice-Zentrale -->
          <div class="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6DED6] space-y-1.5">
            <div class="font-bold text-[#1F1612] flex items-center gap-1.5">
              <span class="mat-icon text-[#2D6A4F] text-sm">phone</span>
              <span>DB Mobilitätsservice</span>
            </div>
            <p class="leading-relaxed text-[#795548]">
              Hilfe beim Ein-, Um- und Aussteigen kann kostenlos bei der DB Mobilitätsservice-Zentrale angemeldet werden: <strong>030 65212888</strong> oder online bis 20:00 Uhr am Vortag.
            </p>
          </div>

          <!-- Box 3: hvv Fahrgastgarantie -->
          <div class="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6DED6] space-y-1.5">
            <div class="font-bold text-[#1F1612] flex items-center gap-1.5">
              <span class="mat-icon text-[#2D6A4F] text-sm">verified_user</span>
              <span>hvv Barrierefrei-Garantie</span>
            </div>
            <p class="leading-relaxed text-[#795548]">
              Im Hamburger Verkehrsverbund sind über 95% aller U- und S-Bahnhaltestellen barrierefrei ausgebaut. Alle Busse verfügen über Neigetechnik (Kneeling) und Klapprampen.
            </p>
          </div>
        </div>
      </div>

    </div>
  `
})
export class AccessibilityView implements OnInit {
  @Output() planJourney = new EventEmitter<{ from: Station; to?: Station }>();
  @Output() switchTab = new EventEmitter<'planner' | 'live-board' | 'hamburg-hub' | 'surprise' | 'favorites'>();

  private transitService = inject(TransitService);

  readonly isLoading = signal<boolean>(false);
  readonly searchQuery = signal<string>('');
  readonly activeFilter = signal<'all' | 'disrupted' | 'stepfree'>('all');
  readonly expandedStationId = signal<string | null>(null);

  readonly networkSummary = signal<{
    totalStationsMonitored: number;
    totalElevators: number;
    elevatorsInService: number;
    elevatorsInMaintenance: number;
    elevatorsOutOfOrder: number;
    operationalRatePercent: number;
    networkStatus: string;
    dataSource: string;
  }>({
    totalStationsMonitored: 38,
    totalElevators: 55,
    elevatorsInService: 53,
    elevatorsInMaintenance: 2,
    elevatorsOutOfOrder: 0,
    operationalRatePercent: 96.4,
    networkStatus: 'Normaler Betrieb',
    dataSource: 'Hamburg Urban Data Hub & DB FaSta'
  });

  readonly allStations = signal<StationAccessibility[]>([]);

  readonly disruptedCount = computed(() => {
    return this.allStations().filter(
      s => s.elevatorsOutOfOrder > 0 || s.elevatorsInMaintenance > 0 || s.activeDisruptions.length > 0
    ).length;
  });

  readonly filteredStations = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const filter = this.activeFilter();
    let list = this.allStations();

    if (filter === 'disrupted') {
      list = list.filter(
        s => s.elevatorsOutOfOrder > 0 || s.elevatorsInMaintenance > 0 || s.activeDisruptions.length > 0
      );
    } else if (filter === 'stepfree') {
      list = list.filter(s => s.isStepFree && s.elevatorsOutOfOrder === 0);
    }

    if (q) {
      list = list.filter(s =>
        s.stationName.toLowerCase().includes(q) ||
        (s.stepFreeAccessNote && s.stepFreeAccessNote.toLowerCase().includes(q))
      );
    }

    return list;
  });

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      const data = await this.transitService.getHamburgAccessibilityOverview();
      if (data && data.stations && data.stations.length > 0) {
        this.allStations.set(data.stations);
        if (data.summary) {
          this.networkSummary.set(data.summary);
        }
      }
    } catch (err) {
      console.warn('Error loading accessibility data:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  onSearchInput(event: Event) {
    const val = (event.target as HTMLInputElement)?.value ?? '';
    this.searchQuery.set(val);
  }

  setFilter(filter: 'all' | 'disrupted' | 'stepfree') {
    this.activeFilter.set(filter);
  }

  toggleExpand(stationId: string) {
    this.expandedStationId.update(curr => (curr === stationId ? null : stationId));
  }

  planFromStation(st: StationAccessibility) {
    const station: Station = {
      id: st.stationId,
      name: st.stationName
    };
    this.planJourney.emit({ from: station });
    this.transitService.activeTab.set('planner');
  }
}
