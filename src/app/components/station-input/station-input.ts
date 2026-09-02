import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
  computed,
  ChangeDetectionStrategy,
  inject,
  ElementRef,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { Station } from '../../models/transit.models';
import { TransitService } from '../../services/transit.service';
import { ALL_GERMAN_STATIONS, StationData, calculateDistanceKm } from '../../data/stations-data';

const QUICK_CHIPS: Station[] = [
  { id: '8002549', name: 'Hamburg Hbf' },
  { id: '8000095', name: 'Elmshorn' },
  { id: '8003004', name: 'Horst (Holstein)' },
  { id: '8001402', name: 'Dauenhof' },
  { id: '8000237', name: 'Lübeck Hbf' },
  { id: '8003368', name: 'Kiel Hbf' },
  { id: '8000050', name: 'Bremen Hbf' },
  { id: '8000209', name: 'Konstanz' },
  { id: '8010404', name: 'Berlin Hbf' },
  { id: '8000261', name: 'München Hbf' }
];

export interface EnrichedStationItem extends Station {
  distanceKm?: number;
  isNearby?: boolean;
  isFar?: boolean;
  bundesland?: string;
  region?: string;
  isMajorHub?: boolean;
}

@Component({
  selector: 'app-station-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="relative w-full">
      @if (showLabel && label) {
        <label [for]="inputId" class="text-xs font-bold uppercase tracking-wider text-[#5D4037] mb-1.5 flex items-center justify-between">
          <span class="flex items-center gap-1.5">
            <span class="mat-icon text-base text-[#795548]">{{ iconName }}</span>
            <span>{{ label }}</span>
          </span>
          @if (selectedStation()) {
            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
              [class.bg-[#EDF9F0]]="!selectedStation()?.isCurrentLocation"
              [class.border-[#B7E4C7]]="!selectedStation()?.isCurrentLocation"
              [class.text-[#2D6A4F]]="!selectedStation()?.isCurrentLocation"
              [class.bg-[#E8F5E9]]="selectedStation()?.isCurrentLocation"
              [class.border-[#81C784]]="selectedStation()?.isCurrentLocation"
              [class.text-[#1B5E20]]="selectedStation()?.isCurrentLocation"
              [class.border]="true"
            >
              <span class="mat-icon text-xs">{{ selectedStation()?.isCurrentLocation ? 'my_location' : 'check_circle' }}</span>
              <span>{{ selectedStation()?.isCurrentLocation ? 'GPS aktiv' : 'ausgewählt' }}</span>
            </span>
          }
        </label>
      }

      <div class="relative flex items-center">
        @if (iconName && !showLabel) {
          <span class="absolute left-3.5 text-[#795548] flex items-center pointer-events-none z-10" aria-hidden="true">
            <span class="mat-icon text-base">{{ iconName }}</span>
          </span>
        }
        <input
          [id]="inputId"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          [attr.aria-expanded]="isOpen()"
          [attr.aria-controls]="inputId + '-suggestions'"
          [attr.aria-label]="label || placeholder"
          [placeholder]="placeholder"
          [value]="searchQuery()"
          (input)="onInputChange($event)"
          (focus)="onInputFocus()"
          (keydown)="onKeyDown($event)"
          autocomplete="off"
          [class.pl-10]="iconName && !showLabel"
          [class.pl-3.5]="!iconName || showLabel"
          class="w-full pr-16 py-3 bg-[#FAF7F2] border border-[#D7CCC8] rounded-xl text-[#2E1F18] placeholder-[#8D6E63] text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 focus:border-[#2D6A4F] focus:bg-white transition-all shadow-xs"
        />

        <div class="absolute right-2 flex items-center gap-1 z-10">
          @if (isSearching() || transitService.isLocating()) {
            <span class="mat-icon animate-spin text-sm text-[#2D6A4F] mr-1" aria-hidden="true">sync</span>
          }

          @if (searchQuery()) {
            <button
              type="button"
              (click)="clearStation()"
              class="text-[#8D6E63] hover:text-[#3E2723] p-1 rounded-full cursor-pointer hover:bg-[#EFEBE9] transition-colors"
              title="Eingabe löschen"
              [attr.aria-label]="'Eingabe für ' + (label || 'Bahnhof') + ' löschen'"
            >
              <span class="mat-icon text-sm" aria-hidden="true">close</span>
            </button>
          }
        </div>
      </div>

      <!-- Autocomplete Suggestions Dropdown -->
      @if (isOpen()) {
        <div
          [id]="inputId + '-suggestions'"
          role="listbox"
          [attr.aria-label]="'Vorschläge für ' + (label || 'Bahnhof')"
          class="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-[#D7CCC8] rounded-2xl shadow-xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-[#EFEBE9] animate-in fade-in zoom-in-95 duration-100"
        >
          <!-- Option: Aktueller Standort (GPS) with street and number -->
          @if (allowCurrentLocation && (!searchQuery().trim() || isLocationQuery(searchQuery()))) {
            <div class="p-1.5 bg-[#EDF9F0] border-b border-[#B7E4C7]">
              <button
                type="button"
                id="btn-select-gps-location"
                (click)="selectCurrentLocation()"
                role="option"
                aria-selected="false"
                class="w-full text-left px-3 py-2 rounded-xl bg-white hover:bg-[#E2F5E7] border border-[#B7E4C7] flex items-center justify-between text-xs text-[#1B4332] transition-colors cursor-pointer shadow-2xs group"
                aria-label="Aktueller Standort über GPS auswählen"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-7 h-7 rounded-lg bg-[#2D6A4F] text-white flex items-center justify-center shrink-0" aria-hidden="true">
                    <span class="mat-icon text-sm">my_location</span>
                  </div>
                  <div class="truncate">
                    <div class="font-black text-[#1B4332] text-xs flex items-center gap-1.5">
                      <span>Aktueller Standort (GPS)</span>
                      @if (transitService.userStreetNumber()) {
                        <span class="px-1.5 py-0.2 bg-[#2D6A4F] text-white rounded text-[9px] font-bold">
                          {{ transitService.userStreetNumber() }}
                        </span>
                      } @else {
                        <span class="px-1.5 py-0.2 bg-[#2D6A4F] text-white rounded text-[9px] font-bold uppercase tracking-wider">
                          Live-Fußweg
                        </span>
                      }
                    </div>
                    <div class="text-[10px] text-[#2D6A4F] font-medium truncate">
                      @if (transitService.userAddress()) {
                        📍 {{ transitService.userAddress() }} • Fußweg zur Haltestelle
                      } @else if (transitService.userLocation()) {
                        GPS aktiv • Automatische Berechnung ab Haltestelle in der Nähe
                      } @else {
                        GPS aktivieren & ab deiner aktuellen Straße starten
                      }
                    </div>
                  </div>
                </div>
                <span class="mat-icon text-sm text-[#2D6A4F] group-hover:translate-x-0.5 transition-transform" aria-hidden="true">arrow_forward</span>
              </button>
            </div>
          }

          <!-- Location Proximity Bar & Quick Chips (Single Compact Swipeable Row) -->
          <div class="px-2.5 py-1.5 bg-[#FAF7F2] border-b border-[#E6DED6] flex items-center justify-between gap-2 text-[10px] text-[#795548]" role="toolbar" aria-label="Schnellwahl-Bahnhöfe">
            <div class="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
              <span class="mat-icon text-xs text-[#2D6A4F] shrink-0" title="Schnellwahl & Favoriten" aria-hidden="true">bolt</span>
              
              <!-- Horizontal swipeable chips -->
              <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-nowrap py-0.5 touch-pan-x min-w-0 flex-1">
                @for (chip of quickChips(); track chip.id) {
                  <button
                    type="button"
                    (click)="selectStation(chip)"
                    class="px-2.5 py-0.5 rounded text-[10px] font-bold bg-white hover:bg-[#EDF9F0] hover:text-[#1B4332] hover:border-[#2D6A4F] text-[#4E342E] border border-[#D7CCC8] whitespace-nowrap transition-all cursor-pointer shadow-2xs shrink-0"
                    [class.border-[#2D6A4F]]="selectedStation()?.id === chip.id"
                    [class.bg-[#EDF9F0]]="selectedStation()?.id === chip.id"
                    [class.text-[#1B4332]]="selectedStation()?.id === chip.id"
                    [title]="chip.name"
                    [attr.aria-label]="'Station ' + chip.name + ' auswählen'"
                  >
                    {{ chip.name }}
                  </button>
                }
              </div>
            </div>

            <div class="shrink-0 flex items-center pl-1 border-l border-[#E6DED6]">
              @if (transitService.userLocation()) {
                <span class="text-[9px] text-[#2D6A4F] font-bold flex items-center gap-0.5 bg-[#EDF9F0] px-1.5 py-0.5 rounded border border-[#B7E4C7]" aria-label="GPS-Standort aktiv">
                  <span class="mat-icon text-[11px]" aria-hidden="true">my_location</span>
                  <span class="hidden sm:inline">GPS</span>
                </span>
              } @else {
                <button
                  type="button"
                  (click)="activateGeolocation($event)"
                  class="text-[9px] text-[#2D6A4F] font-bold hover:underline flex items-center gap-0.5 cursor-pointer bg-white px-1.5 py-0.5 rounded border border-[#D7CCC8]"
                  title="GPS aktivieren für Stationen in der Nähe"
                  aria-label="GPS-Standortermittlung aktivieren"
                >
                  <span class="mat-icon text-[11px]" aria-hidden="true">near_me</span>
                  <span>Standort</span>
                </button>
              }
            </div>
          </div>

          <!-- Matching Suggestions List -->
          @if (displayedSuggestions().length > 0) {
            <div class="py-1">
              <div class="px-3 py-1 text-[9px] font-bold text-[#8D6E63] uppercase tracking-wider flex items-center justify-between border-b border-[#F5EFE6]">
                <span>
                  {{ searchQuery().trim().length > 0 ? displayedSuggestions().length + ' Treffer' : (transitService.userLocation() ? '📍 Stationen in deiner Nähe' : 'Wichtige Bahnhöfe') }}
                </span>
                @if (searchQuery().trim().length > 0) {
                  <span class="text-[9px] text-[#A1887F] font-normal lowercase">Nah- & Fernverkehr</span>
                }
              </div>
              @for (station of displayedSuggestions(); track station.id + '-' + $index; let idx = $index) {
                <button
                  type="button"
                  (click)="selectStation(station)"
                  (mouseenter)="highlightedIndex.set(idx)"
                  role="option"
                  [attr.aria-selected]="highlightedIndex() === idx"
                  class="w-full text-left px-3.5 py-2 hover:bg-[#EDF9F0] focus:bg-[#D8F3DC] flex items-center justify-between text-sm text-[#2E1F18] transition-colors cursor-pointer"
                  [class.bg-[#EDF9F0]]="highlightedIndex() === idx"
                  [attr.aria-label]="station.name + (station.distanceKm ? ' in ' + station.distanceKm + ' Kilometern Entfernung' : '')"
                >
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span
                      class="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0"
                      [class.bg-[#EDF9F0]]="station.isNearby"
                      [class.border-[#B7E4C7]]="station.isNearby"
                      [class.text-[#2D6A4F]]="station.isNearby"
                      [class.bg-[#FAF7F2]]="!station.isNearby"
                      [class.border-[#E6DED6]]="!station.isNearby"
                      [class.text-[#795548]]="!station.isNearby"
                      aria-hidden="true"
                    >
                      <span class="mat-icon text-sm">{{ station.isNearby ? 'near_me' : 'train' }}</span>
                    </span>
                    <div class="min-w-0 truncate">
                      <div class="font-bold text-[#2E1F18] text-xs truncate flex items-center gap-1.5">
                        <span>{{ station.name }}</span>
                        @if (station.isNearby && station.distanceKm !== undefined) {
                          <span class="px-1.5 py-0.2 rounded-full bg-[#EDF9F0] text-[#1B4332] text-[9px] font-black border border-[#B7E4C7]">
                            📍 {{ station.distanceKm }} km
                          </span>
                        }
                      </div>
                      <div class="text-[10px] text-[#8D6E63] font-medium flex items-center gap-1 truncate">
                        <span>{{ getStationSubtitle(station) }}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div class="flex items-center gap-1.5 shrink-0 ml-2">
                    @if (station.isFar && station.distanceKm) {
                      <span class="px-1.5 py-0.5 rounded bg-[#FFF3E0] text-[#E65100] text-[9px] font-bold border border-[#FFE0B2]">
                        {{ station.distanceKm }} km Fern
                      </span>
                    } @else if (station.isMajorHub) {
                      <span class="px-1.5 py-0.5 rounded bg-[#EDF9F0] text-[#1B4332] text-[9px] font-black border border-[#B7E4C7]">
                        HUB
                      </span>
                    }
                    <span class="mat-icon text-xs text-[#BCAAA4]" aria-hidden="true">chevron_right</span>
                  </div>
                </button>
              }
            </div>
          } @else if (!isSearching()) {
            <div class="p-4 text-center text-xs text-[#8D6E63] space-y-1" role="status">
              <span class="mat-icon text-base text-[#BCAAA4]" aria-hidden="true">search_off</span>
              <div>Keine Haltestelle für „{{ searchQuery() }}“ gefunden.</div>
              <div class="text-[11px] text-[#A1887F]">Du kannst nach jedem Bahnhof in ganz Deutschland suchen (z. B. Horst, Dauenhof, Konstanz, Westerland).</div>
            </div>
          }
        </div>
      }
    </div>
  `
})
export class StationInput {
  @Input() label = 'Bahnhof';
  @Input() showLabel = true;
  @Input() placeholder = 'Stadt oder Bahnhof suchen...';
  @Input() iconName = 'place';
  @Input() inputId = 'station-input';
  @Input() allowCurrentLocation = true;

  @Input() set initialStation(station: Station | null) {
    if (station) {
      this.selectedStation.set(station);
      this.searchQuery.set(station.name);
    } else {
      this.selectedStation.set(null);
      this.searchQuery.set('');
    }
  }

  @Output() stationChange = new EventEmitter<Station | null>();

  readonly selectedStation = signal<Station | null>(null);
  readonly searchQuery = signal<string>('');
  readonly apiSuggestions = signal<Station[]>([]);
  readonly isSearching = signal<boolean>(false);
  readonly isOpen = signal<boolean>(false);
  readonly highlightedIndex = signal<number>(-1);

  readonly transitService = inject(TransitService);
  private elementRef = inject(ElementRef);
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Single-row horizontal swipe quick chips (up to 7 items) based on recent searches, favorites, and popular stations
  readonly quickChips = computed<Station[]>(() => {
    const recent = this.transitService.recentStations();
    const favs = this.transitService.favoriteStations();
    
    const combined: Station[] = [];
    const seen = new Set<string>();

    for (const s of recent) {
      if (s && s.name && !seen.has(s.name.toLowerCase())) {
        seen.add(s.name.toLowerCase());
        combined.push(s);
      }
    }

    for (const f of favs) {
      if (f && f.name && !seen.has(f.name.toLowerCase())) {
        seen.add(f.name.toLowerCase());
        combined.push({ id: f.id, name: f.name });
      }
    }

    // Fallbacks if fewer than 7
    for (const def of QUICK_CHIPS) {
      if (!seen.has(def.name.toLowerCase())) {
        seen.add(def.name.toLowerCase());
        combined.push(def);
      }
      if (combined.length >= 7) break;
    }

    return combined.slice(0, 7);
  });

  // Computed suggestions merging local fast matches + server DB HAFAS matches + distance scoring
  readonly displayedSuggestions = computed<EnrichedStationItem[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const userLoc = this.transitService.userLocation();

    const enrichStation = (s: Station | StationData): EnrichedStationItem => {
      const known = ALL_GERMAN_STATIONS.find(k => k.id === s.id || k.name.toLowerCase() === s.name.toLowerCase());
      const loc = s.location || known?.location;
      let distKm: number | undefined = undefined;
      if (userLoc && loc) {
        distKm = calculateDistanceKm(userLoc.latitude, userLoc.longitude, loc.latitude, loc.longitude);
      }
      return {
        id: s.id,
        name: s.name,
        location: loc,
        products: s.products || known?.products,
        weight: s.weight || known?.weight || 50,
        bundesland: known?.bundesland,
        region: known?.region,
        isMajorHub: known?.isMajorHub,
        distanceKm: distKm,
        isNearby: distKm !== undefined && distKm < 35,
        isFar: distKm !== undefined && distKm > 220
      };
    };

    // If query is empty, show nearby stations + popular hubs
    if (!q) {
      const enrichedAll = ALL_GERMAN_STATIONS.map(s => enrichStation(s));
      if (userLoc) {
        // Sort by physical proximity when user GPS is active
        return enrichedAll
          .sort((a, b) => {
            const distA = a.distanceKm ?? 9999;
            const distB = b.distanceKm ?? 9999;
            return distA - distB;
          })
          .slice(0, 14);
      }
      return enrichedAll.slice(0, 14);
    }

    // When searching: match against ALL_GERMAN_STATIONS + API suggestions
    const localFiltered = ALL_GERMAN_STATIONS.filter(s => {
      const sName = s.name.toLowerCase();
      const sClean = sName.replace(/[()-]/g, ' ');
      return sName.includes(q) || sClean.includes(q) || (s.region && s.region.toLowerCase().includes(q));
    });

    const localEnriched = localFiltered.map(s => enrichStation(s));
    const apiEnriched = this.apiSuggestions().map(s => enrichStation(s));

    // Combine avoiding duplicates
    const mergedMap = new Map<string, EnrichedStationItem>();

    for (const item of [...localEnriched, ...apiEnriched]) {
      const normKey = item.name.toLowerCase().replace(/\s+/g, ' ').replace(/[()-]/g, '');
      if (!mergedMap.has(normKey)) {
        mergedMap.set(normKey, item);
      }
    }

    // Intelligent multi-factor sorting:
    // 1. Exact match
    // 2. Starts with query
    // 3. Proximity bonus if location is known
    // 4. Hub status
    return Array.from(mergedMap.values())
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();

        // Exact match check
        const aExact = aName === q;
        const bExact = bName === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        // Prefix match check
        const aStarts = aName.startsWith(q);
        const bStarts = bName.startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        // Word start match check (e.g. "Horst" in "Horst (Holstein)" or "Konstanz" in "Konstanz-Petershausen")
        const aWordStart = aName.includes(` ${q}`) || aName.includes(`(${q}`);
        const bWordStart = bName.includes(` ${q}`) || bName.includes(`(${q}`);
        if (aWordStart && !bWordStart) return -1;
        if (!aWordStart && bWordStart) return 1;

        // Proximity factor (closer stations rank higher if within same match grade)
        if (userLoc && a.distanceKm !== undefined && b.distanceKm !== undefined) {
          // If one is very close (< 40km) and other is far (> 100km), prefer close
          if (a.distanceKm < 40 && b.distanceKm >= 40) return -1;
          if (b.distanceKm < 40 && a.distanceKm >= 40) return 1;
        }

        // Major hub priority
        if (a.isMajorHub && !b.isMajorHub) return -1;
        if (!a.isMajorHub && b.isMajorHub) return 1;

        return (b.weight || 50) - (a.weight || 50);
      })
      .slice(0, 14);
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
      this.highlightedIndex.set(-1);
    }
  }

  activateGeolocation(event: Event) {
    event.stopPropagation();
    this.transitService.requestGeolocation(true);
  }

  onInputChange(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.searchQuery.set(val);
    this.selectedStation.set(null);
    this.stationChange.emit(null);
    this.isOpen.set(true);
    this.highlightedIndex.set(-1);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (val.trim().length >= 2) {
      this.isSearching.set(true);
      this.debounceTimer = setTimeout(async () => {
        try {
          const results = await this.transitService.searchStations(val);
          this.apiSuggestions.set(results);
        } catch {
          this.apiSuggestions.set([]);
        } finally {
          this.isSearching.set(false);
        }
      }, 120);
    } else {
      this.apiSuggestions.set([]);
      this.isSearching.set(false);
    }
  }

  onInputFocus() {
    this.isOpen.set(true);
    this.highlightedIndex.set(-1);
    
    const val = this.searchQuery().trim();
    if (val.length >= 2 && this.apiSuggestions().length === 0) {
      this.isSearching.set(true);
      this.transitService.searchStations(val).then(res => {
        this.apiSuggestions.set(res);
        this.isSearching.set(false);
      }).catch(() => {
        this.isSearching.set(false);
      });
    }
  }

  onKeyDown(event: KeyboardEvent) {
    const list = this.displayedSuggestions();
    if (!this.isOpen() || list.length === 0) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        this.isOpen.set(true);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIdx = (this.highlightedIndex() + 1) % list.length;
      this.highlightedIndex.set(nextIdx);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIdx = this.highlightedIndex() <= 0 ? list.length - 1 : this.highlightedIndex() - 1;
      this.highlightedIndex.set(prevIdx);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const curr = this.highlightedIndex();
      if (curr >= 0 && curr < list.length) {
        this.selectStation(list[curr]);
      } else if (list.length > 0) {
        this.selectStation(list[0]);
      }
    } else if (event.key === 'Escape') {
      this.isOpen.set(false);
      this.highlightedIndex.set(-1);
    }
  }

  isLocationQuery(query: string): boolean {
    const q = query.trim().toLowerCase();
    return (
      q === '' ||
      'aktueller standort'.includes(q) ||
      'mein standort'.includes(q) ||
      'gps'.includes(q) ||
      'position'.includes(q) ||
      'hier'.includes(q) ||
      'in der nähe'.includes(q)
    );
  }

  selectCurrentLocation() {
    this.isOpen.set(false);
    this.highlightedIndex.set(-1);

    // Start active tracking
    this.transitService.startActiveTracking();

    // Get current address or fallback address immediately
    const streetNumber = this.transitService.userStreetNumber();
    const fullAddr = this.transitService.userAddress();
    const addressToDisplay = fullAddr || streetNumber || 'Mönckebergstraße 7, 20095 Hamburg';

    // The user requested: ONLY show the address in the text box, do NOT write "Aktueller Standort"
    this.searchQuery.set(addressToDisplay);

    const initialLoc = this.transitService.userLocation() || { latitude: 53.551086, longitude: 9.993682 };
    const currentLocStation: Station = {
      id: 'current-location',
      name: addressToDisplay,
      address: addressToDisplay,
      streetNumber: streetNumber || addressToDisplay,
      isCurrentLocation: true,
      location: initialLoc
    };

    this.selectedStation.set(currentLocStation);
    this.stationChange.emit(currentLocStation);

    // Refine location and reverse geocoding in the background
    this.transitService.requestGeolocation(true).then(async (loc) => {
      if (loc) {
        const geo = await this.transitService.fetchReverseGeocode(loc.latitude, loc.longitude);
        const resolvedAddress = geo.fullAddress || geo.streetNumber || addressToDisplay;
        this.searchQuery.set(resolvedAddress);

        const updatedStation: Station = {
          id: 'current-location',
          name: resolvedAddress,
          address: resolvedAddress,
          streetNumber: geo.streetNumber || resolvedAddress,
          isCurrentLocation: true,
          location: loc
        };
        this.selectedStation.set(updatedStation);
        this.stationChange.emit(updatedStation);
      }
    });
  }

  selectStation(station: Station) {
    const isCur = !!(station.isCurrentLocation || station.id === 'current-location');
    const enriched: Station = {
      ...station,
      isCurrentLocation: isCur
    };
    if (isCur) {
      this.transitService.startActiveTracking();
    } else {
      this.transitService.stopActiveTracking();
    }
    this.selectedStation.set(enriched);
    this.searchQuery.set(enriched.name);
    this.isOpen.set(false);
    this.highlightedIndex.set(-1);
    if (!isCur) {
      this.transitService.recordRecentStation(enriched);
    }
    this.stationChange.emit(enriched);
  }

  clearStation() {
    this.selectedStation.set(null);
    this.searchQuery.set('');
    this.apiSuggestions.set([]);
    this.isOpen.set(false);
    this.highlightedIndex.set(-1);
    this.stationChange.emit(null);
  }

  setStationDirectly(station: Station) {
    this.selectStation(station);
  }

  getStationSubtitle(station: EnrichedStationItem): string {
    const parts: string[] = [];

    if (station.distanceKm !== undefined) {
      if (station.distanceKm < 30) {
        parts.push(`📍 ${station.distanceKm} km entfernt`);
      } else {
        parts.push(`📍 ca. ${station.distanceKm} km`);
      }
    }

    if (station.region) {
      parts.push(station.region);
    } else if (station.bundesland) {
      parts.push(station.bundesland);
    } else {
      const name = station.name.toLowerCase();
      if (name.includes('hamburg')) parts.push('Hamburg • HVV / DB');
      else if (name.includes('horst') || name.includes('dauenhof') || name.includes('wrist') || name.includes('elmshorn') || name.includes('pinneberg')) parts.push('Schleswig-Holstein • RB 61 / RE 70');
      else if (name.includes('konstanz') || name.includes('singen') || name.includes('radolfzell')) parts.push('Bodensee / Baden-Württemberg • bwegt / Seehas');
      else if (name.includes('kiel') || name.includes('lübeck') || name.includes('flensburg') || name.includes('sylt')) parts.push('Schleswig-Holstein • NAH.SH');
      else if (name.includes('bremen') || name.includes('hannover') || name.includes('lüneburg')) parts.push('Niedersachsen / Bremen');
      else if (name.includes('münchen') || name.includes('nürnberg') || name.includes('augsburg')) parts.push('Bayern • Bahnland Bayern');
      else parts.push('Deutschlandweit • Regionalnetz');
    }

    return parts.join(' • ');
  }
}
