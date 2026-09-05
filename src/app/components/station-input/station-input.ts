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
          <span
            class="absolute left-3.5 flex items-center pointer-events-none z-10 transition-colors"
            [class.text-[#2D6A4F]]="selectedStation()?.isCurrentLocation"
            [class.text-[#795548]]="!selectedStation()?.isCurrentLocation"
            aria-hidden="true"
          >
            <span class="mat-icon text-base">{{ selectedStation()?.isCurrentLocation ? 'my_location' : iconName }}</span>
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
          [class.border-[#2D6A4F]]="isCursorActive"
          [class.ring-2]="isCursorActive"
          [class.ring-[#2D6A4F]/25]="isCursorActive"
          [class.bg-white]="isCursorActive"
          class="w-full pr-20 py-3 bg-[#FAF7F2] border border-[#D7CCC8] rounded-xl text-[#2E1F18] placeholder-[#8D6E63] text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 focus:border-[#2D6A4F] focus:bg-white transition-all shadow-xs"
        />

        <div class="absolute right-2 flex items-center gap-1 z-10">
          @if (isSearching()) {
            <span class="mat-icon animate-spin text-sm text-[#2D6A4F] mr-0.5" title="Stationen werden gesucht..." aria-hidden="true">sync</span>
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

      @if (selectedStation()?.isCurrentLocation) {
        <div class="mt-1 flex items-center justify-between text-[11px] px-1 text-[#2D6A4F]">
          <span class="flex items-center gap-1 truncate font-medium">
            <span class="mat-icon text-xs">navigation</span>
            <span class="truncate">{{ transitService.userAddress() || 'GPS aktiv • Fußweg zum nächsten Bahnhof' }}</span>
          </span>
          @if (transitService.isLocating()) {
            <span class="shrink-0 text-[10px] text-[#2D6A4F] animate-pulse">GPS ermittelt...</span>
          }
        </div>
      }

      <!-- Autocomplete Suggestions Dropdown: Only shown when at least 2 characters are typed -->
      @if (isOpen() && searchQuery().trim().length >= 2) {
        <div
          [id]="inputId + '-suggestions'"
          role="listbox"
          [attr.aria-label]="'Vorschläge für ' + (label || 'Bahnhof')"
          class="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-[#D7CCC8] rounded-2xl shadow-xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-[#EFEBE9] animate-in fade-in zoom-in-95 duration-100"
        >
          <!-- Matching Suggestions List (No Aktueller Standort inside suggestions) -->
          @if (displayedSuggestions().length > 0) {
            <div class="py-1">
              <div class="px-3 py-1 text-[9px] font-bold text-[#8D6E63] uppercase tracking-wider flex items-center justify-between border-b border-[#F5EFE6]">
                <span>
                  {{ displayedSuggestions().length }} Treffer für „{{ searchQuery().trim() }}“
                </span>
                <span class="text-[9px] text-[#A1887F] font-normal lowercase">Nah- & Fernverkehr</span>
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
              <div class="text-[11px] text-[#A1887F]">Suche nach Bahnhöfen in ganz Deutschland (z. B. Horst, Elmshorn, Kiel, Westerland).</div>
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
  @Input() isCursorActive = false;

  @Input() set initialStation(station: Station | null) {
    if (station) {
      this.selectedStation.set(station);
      this.searchQuery.set(station.name);
      this.queryChange.emit(station.name);
    } else {
      this.selectedStation.set(null);
      this.searchQuery.set('');
      this.queryChange.emit('');
    }
  }

  @Output() stationChange = new EventEmitter<Station | null>();
  @Output() inputFocus = new EventEmitter<void>();
  @Output() queryChange = new EventEmitter<string>();

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

    // Do not show suggestions until at least 2 characters are entered (optimization & minimalism)
    if (q.length < 2) {
      return [];
    }

    // When searching: match against ALL_GERMAN_STATIONS + API suggestions
    const localFiltered = ALL_GERMAN_STATIONS.filter(s => {
      if (s.isCurrentLocation || s.id === 'current-location' || s.name.toLowerCase().includes('standort') || s.name.toLowerCase().includes('location')) {
        return false;
      }
      const sName = s.name.toLowerCase();
      const sClean = sName.replace(/[()-]/g, ' ');
      return sName.includes(q) || sClean.includes(q) || (s.region && s.region.toLowerCase().includes(q));
    });

    const localEnriched = localFiltered.map(s => enrichStation(s));
    const apiEnriched = this.apiSuggestions()
      .filter(s => !s.isCurrentLocation && s.id !== 'current-location' && !s.name.toLowerCase().includes('standort') && !s.name.toLowerCase().includes('location'))
      .map(s => enrichStation(s));

    // Combine avoiding duplicates
    const mergedMap = new Map<string, EnrichedStationItem>();

    for (const item of [...localEnriched, ...apiEnriched]) {
      if (
        item.isCurrentLocation ||
        item.id === 'current-location' ||
        item.name.toLowerCase().includes('standort') ||
        item.name.toLowerCase().includes('location')
      ) {
        continue;
      }
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
    this.queryChange.emit(val);
    this.selectedStation.set(null);
    this.stationChange.emit(null);
    this.highlightedIndex.set(-1);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (val.trim().length >= 2) {
      this.isOpen.set(true);
      this.isSearching.set(true);
      this.debounceTimer = setTimeout(async () => {
        try {
          const results = await this.transitService.searchStations(val);
          // Never include current location or standort in station suggestions
          const cleanResults = results.filter(
            s => !s.isCurrentLocation && s.id !== 'current-location' && !s.name.toLowerCase().includes('standort') && !s.name.toLowerCase().includes('location')
          );
          this.apiSuggestions.set(cleanResults);
        } catch {
          this.apiSuggestions.set([]);
        } finally {
          this.isSearching.set(false);
        }
      }, 120);
    } else {
      this.isOpen.set(false);
      this.apiSuggestions.set([]);
      this.isSearching.set(false);
    }
  }

  onInputFocus() {
    this.inputFocus.emit();
    this.highlightedIndex.set(-1);
    // User mandate: No suggestions appear upon simply placing the cursor into either field.
    // Suggestions are only triggered when the user types the second character (length >= 2).
    this.isOpen.set(false);
  }

  onKeyDown(event: KeyboardEvent) {
    const q = this.searchQuery().trim();
    if (q.length < 2) {
      return;
    }

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

  selectCurrentLocation(event?: Event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.isOpen.set(false);
    this.highlightedIndex.set(-1);

    // Start active tracking
    this.transitService.startActiveTracking();

    const displayLabel = 'Aktueller Standort';
    this.searchQuery.set(displayLabel);
    this.queryChange.emit(displayLabel);

    const initialLoc = this.transitService.userLocation();
    const currentLocStation: Station = {
      id: 'current-location',
      name: displayLabel,
      address: this.transitService.userAddress() || undefined,
      streetNumber: this.transitService.userStreetNumber() || undefined,
      isCurrentLocation: true,
      location: initialLoc || undefined
    };

    this.selectedStation.set(currentLocStation);
    this.stationChange.emit(currentLocStation);

    // Actively query device GPS coordinates with force=true
    this.transitService.requestGeolocation(true).then(async (loc) => {
      if (loc) {
        const geo = await this.transitService.fetchReverseGeocode(loc.latitude, loc.longitude);
        const updatedStation: Station = {
          id: 'current-location',
          name: displayLabel,
          address: geo.fullAddress || this.transitService.userAddress() || undefined,
          streetNumber: geo.streetNumber || this.transitService.userStreetNumber() || undefined,
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
    this.queryChange.emit(enriched.name);
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
    this.queryChange.emit('');
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
