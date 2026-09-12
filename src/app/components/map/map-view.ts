import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  EventEmitter,
  SimpleChanges,
  ViewChild,
  ChangeDetectionStrategy,
  PLATFORM_ID,
  inject,
  signal,
  effect
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ConnectionJourney, Station } from '../../models/transit.models';
import { DticketCategory, DticketLineInfo } from '../../models/deutschlandticket-network.models';
import { DTICKET_NETWORK_LINES, DTICKET_RULES } from '../../services/deutschlandticket-network.data';
import { TransitService } from '../../services/transit.service';

function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

@Component({
  selector: 'app-map-view',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="relative w-full h-full min-h-[140px] overflow-hidden"
      [class.rounded-2xl]="!isFullBleed"
      [class.shadow-inner]="!isFullBleed"
      [class.border]="!isFullBleed"
      [class.border-[#E6DED6]]="!isFullBleed"
    >
      <!-- Leaflet map container -->
      <div #mapContainer class="w-full h-full min-h-[140px] z-0" role="region" aria-label="Interaktive Streckenkarte"></div>

      <!-- Quick Action Controls (Top Right) -->
      <div class="absolute top-2.5 right-2.5 flex flex-col gap-1.5 z-[400]" role="toolbar" aria-label="Kartensteuerung">
        <!-- D-Ticket Network Overlay Toggle Button -->
        <button
          type="button"
          id="btn-toggle-dticket-overlay"
          (click)="toggleDticketOverlay()"
          class="px-2.5 py-1.5 rounded-xl shadow-md border text-[11px] font-black transition-all cursor-pointer flex items-center gap-1.5"
          [class.bg-[#1B4332]]="isDticketOverlayActive()"
          [class.text-white]="isDticketOverlayActive()"
          [class.border-[#132A1E]]="isDticketOverlayActive()"
          [class.ring-2]="isDticketOverlayActive()"
          [class.ring-[#52B788]/50]="isDticketOverlayActive()"
          [class.bg-white/95]="!isDticketOverlayActive()"
          [class.text-[#1B4332]]="!isDticketOverlayActive()"
          [class.border-[#B7E4C7]]="!isDticketOverlayActive()"
          title="Offizielles Deutschlandticket-Streckennetz ein-/ausblenden"
          [attr.aria-pressed]="isDticketOverlayActive()"
          aria-label="Deutschlandticket Streckennetz umschalten"
        >
          <span class="mat-icon text-xs text-[#52B788]" aria-hidden="true">confirmation_number</span>
          <span>D-Ticket Netz</span>
          @if (isDticketOverlayActive()) {
            <span class="w-2 h-2 rounded-full bg-[#52B788] animate-pulse" aria-hidden="true"></span>
          }
        </button>

        @if (hasWalkingData()) {
          <button
            type="button"
            id="btn-focus-walk-map"
            (click)="toggleWalkFocus()"
            class="px-2.5 py-1.5 rounded-xl shadow-md border text-[11px] font-black transition-all cursor-pointer flex items-center gap-1"
            [class.bg-[#1B4332]]="isWalkingFocused()"
            [class.text-white]="isWalkingFocused()"
            [class.border-[#132A1E]]="isWalkingFocused()"
            [class.bg-white/95]="!isWalkingFocused()"
            [class.text-[#1B4332]]="!isWalkingFocused()"
            [class.border-[#B7E4C7]]="!isWalkingFocused()"
            title="Fußweg vergrößern"
            [attr.aria-pressed]="isWalkingFocused()"
            aria-label="Fußweg vergrößern"
          >
            <span class="mat-icon text-xs" aria-hidden="true">directions_walk</span>
            <span>Fußweg</span>
          </button>
        }

        <!-- Center / Full Route Button -->
        <button
          type="button"
          id="btn-center-map"
          (click)="resetMapView()"
          class="bg-white/95 hover:bg-white text-[#4E342E] px-2.5 py-1.5 rounded-xl shadow-md border border-[#E6DED6] transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold"
          title="Karte zentrieren"
          aria-label="Karte zentrieren"
        >
          <span class="mat-icon text-xs" aria-hidden="true">filter_center_focus</span>
          <span>Übersicht</span>
        </button>
      </div>

      <!-- DEUTSCHLANDTICKET INTERACTIVE OVERLAY CONTROLS (Top Left / Floating Header) -->
      @if (isDticketOverlayActive()) {
        <div
          id="dticket-network-overlay-panel"
          class="absolute top-2.5 left-2.5 right-32 sm:right-auto sm:max-w-md bg-white/95 backdrop-blur-md rounded-2xl p-2.5 sm:p-3 shadow-lg border border-[#2D6A4F]/30 z-[400] space-y-2 animate-in fade-in slide-in-from-top-2 duration-200"
          role="region"
          aria-label="Deutschlandticket Streckennetz Filter"
        >
          <!-- Header Bar -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-6 h-6 rounded-lg bg-[#1B4332] text-white flex items-center justify-center shrink-0 shadow-2xs">
                <span class="mat-icon text-sm text-[#74C69D]">train</span>
              </span>
              <div class="min-w-0">
                <div class="text-xs font-black text-[#1B4332] truncate flex items-center gap-1">
                  <span>D-Ticket Streckennetz</span>
                  <span class="text-[9px] bg-[#D8F3DC] text-[#1B4332] px-1 py-0.2 rounded font-black">49€</span>
                </div>
                <div class="text-[10px] text-[#795548] truncate">
                  {{ filteredLinesCount() }} Linien aktiv • Zum Planen Linie anklicken
                </div>
              </div>
            </div>

            <!-- Rules / Info button -->
            <div class="flex items-center gap-1 shrink-0">
              <button
                type="button"
                id="btn-dticket-rules-modal"
                (click)="showDticketRulesModal.set(true)"
                class="px-2 py-1 bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#2D6A4F] border border-[#D8F3DC] rounded-lg text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-0.5"
                title="Geltungsbereich & Regeln ansehen"
                aria-label="Geltungsbereich und Regeln des Deutschlandtickets ansehen"
              >
                <span class="mat-icon text-xs">info</span>
                <span class="hidden sm:inline">Regeln</span>
              </button>

              <button
                type="button"
                id="btn-close-dticket-overlay"
                (click)="isDticketOverlayActive.set(false); removeDticketLayers()"
                class="w-6 h-6 rounded-lg bg-[#FAF7F2] hover:bg-[#EDE5DC] text-[#795548] flex items-center justify-center cursor-pointer transition-colors"
                title="Overlay schließen"
                aria-label="Deutschlandticket Overlay schließen"
              >
                <span class="mat-icon text-xs">close</span>
              </button>
            </div>
          </div>

          <!-- Category Filter Pills -->
          <div class="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none" role="tablist" aria-label="Streckennetz Kategorien">
            @for (cat of categories; track cat.id) {
              <button
                type="button"
                [id]="'dticket-cat-' + cat.id"
                (click)="setDticketCategory(cat.id)"
                class="px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all shrink-0 cursor-pointer flex items-center gap-1"
                [class.bg-[#1B4332]]="activeDticketCategory() === cat.id"
                [class.text-white]="activeDticketCategory() === cat.id"
                [class.border-[#1B4332]]="activeDticketCategory() === cat.id"
                [class.bg-[#FAF7F2]]="activeDticketCategory() !== cat.id"
                [class.text-[#4E342E]]="activeDticketCategory() !== cat.id"
                [class.border-[#E6DED6]]="activeDticketCategory() !== cat.id"
                role="tab"
                [attr.aria-selected]="activeDticketCategory() === cat.id"
              >
                <span>{{ cat.label }}</span>
                <span
                  class="text-[9px] px-1 py-0.1 rounded-full font-black"
                  [class.bg-white/20]="activeDticketCategory() === cat.id"
                  [class.text-white]="activeDticketCategory() === cat.id"
                  [class.bg-[#E6DED6]]="activeDticketCategory() !== cat.id"
                  [class.text-[#795548]]="activeDticketCategory() !== cat.id"
                >{{ cat.count }}</span>
              </button>
            }
          </div>

          <!-- Railway Infrastructure Switch (OpenRailwayMap) -->
          <div class="pt-1.5 border-t border-[#E6DED6]/70 flex items-center justify-between text-[10px]">
            <label class="flex items-center gap-1.5 cursor-pointer select-none text-[#4E342E] font-medium">
              <input
                type="checkbox"
                id="checkbox-openrailwaymap"
                [checked]="showRailwayInfra()"
                (change)="toggleRailwayInfra()"
                class="rounded text-[#2D6A4F] focus:ring-[#2D6A4F] h-3.5 w-3.5 border-[#D7CCC8]"
              />
              <span>Gleise & Bahn-Infrastruktur (OpenRailwayMap)</span>
            </label>
            <span class="text-[9px] text-[#8D6E63] font-semibold hidden sm:inline">Echtzeit Gleisplan</span>
          </div>
        </div>
      }

      <!-- Map Legend (Bottom Left) -->
      @if (!hideDefaultOverlays) {
        <div class="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm rounded-xl p-2 shadow-md border border-[#E6DED6] text-xs z-[400] flex flex-col gap-1 max-w-[240px]" role="note" aria-label="Kartenlegende">
          <div class="flex items-center justify-between gap-2 text-[10px]">
            <div class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-[#2D6A4F]" aria-hidden="true"></span>
              <span class="font-bold text-[#1F1612]">Kommend</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-[#8D6E63] opacity-50" aria-hidden="true"></span>
              <span class="font-bold text-[#795548]">Passiert</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="inline-block w-2 h-2 rounded-full bg-[#1B4332] animate-ping" aria-hidden="true"></span>
              <span class="font-bold text-[#1B4332]">Live</span>
            </div>
          </div>
          @if (activeJourney) {
            <div class="pt-1 border-t border-[#EDE5DC] font-bold text-[#4E342E] flex items-center justify-between text-[11px]">
              <span class="truncate">{{ activeJourney.origin.name }}</span>
              <span class="text-[#8D6E63] mx-1" aria-hidden="true">→</span>
              <span class="truncate">{{ activeJourney.destination.name }}</span>
            </div>
          } @else if (isDticketOverlayActive()) {
            <div class="pt-1 border-t border-[#EDE5DC] text-[10px] text-[#2D6A4F] font-bold flex items-center gap-1">
              <span class="mat-icon text-xs">verified</span>
              <span>100% Gültig im D-Ticket</span>
            </div>
          }
        </div>
      }

      <!-- D-Ticket Official Rules Dialog Modal -->
      @if (showDticketRulesModal()) {
        <div class="absolute inset-0 bg-black/50 backdrop-blur-xs z-[500] flex items-center justify-center p-3.5 animate-in fade-in duration-150">
          <div
            class="bg-white rounded-2xl max-w-sm w-full p-4 shadow-2xl border border-[#E6DED6] space-y-3 max-h-[90%] overflow-y-auto"
            role="dialog"
            aria-labelledby="dticket-modal-title"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-[#1B4332] text-white flex items-center justify-center">
                  <span class="mat-icon text-sm text-[#74C69D]">verified</span>
                </span>
                <div>
                  <h3 id="dticket-modal-title" class="font-black text-sm text-[#1F1612]">Deutschlandticket Gültigkeit</h3>
                  <div class="text-[10px] text-[#795548] font-bold">49 € / Monat • Bundesweiter Nahverkehr</div>
                </div>
              </div>
              <button
                type="button"
                (click)="showDticketRulesModal.set(false)"
                class="w-7 h-7 rounded-lg bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#795548] flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Modal schließen"
              >
                <span class="mat-icon text-sm">close</span>
              </button>
            </div>

            <!-- Included -->
            <div class="space-y-1.5">
              <div class="text-[11px] font-black text-[#1B4332] flex items-center gap-1">
                <span class="text-[#2D6A4F]">✓</span>
                <span>Vollständig enthalten (Ohne Aufpreis):</span>
              </div>
              <ul class="text-[11px] text-[#4E342E] space-y-1 pl-3.5 list-disc marker:text-[#2D6A4F]">
                @for (item of dticketRules.included; track item) {
                  <li>{{ item }}</li>
                }
              </ul>
            </div>

            <!-- Excluded -->
            <div class="space-y-1.5 pt-2 border-t border-[#E6DED6]">
              <div class="text-[11px] font-black text-[#B71C1C] flex items-center gap-1">
                <span>✕</span>
                <span>Nicht gültig im D-Ticket:</span>
              </div>
              <ul class="text-[11px] text-[#795548] space-y-1 pl-3.5 list-disc marker:text-[#B71C1C]">
                @for (item of dticketRules.excluded; track item) {
                  <li>{{ item }}</li>
                }
              </ul>
            </div>

            <button
              type="button"
              (click)="showDticketRulesModal.set(false)"
              class="w-full py-2 bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Verstanden
            </button>
          </div>
        </div>
      }

    </div>
  `
})
export class MapView implements OnInit, OnChanges, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;
  @Input() activeJourney: ConnectionJourney | null = null;
  @Input() selectedStation: Station | null = null;
  @Input() focusTarget: 'all' | 'walk' | 'route' = 'all';
  @Input() isFullBleed = false;
  @Input() hideDefaultOverlays = false;

  // Deutschlandticket Overlay Inputs and Outputs
  @Input() set showDticketOverlay(val: boolean) {
    this.isDticketOverlayActive.set(val);
    if (this.isBrowser && this.map) {
      if (val) {
        this.renderDticketOverlay();
      } else {
        this.removeDticketLayers();
      }
    }
  }

  @Output() planDticketRoute = new EventEmitter<{ from: string; to: string }>();

  // State Signals
  readonly isWalkingFocused = signal<boolean>(false);
  readonly isDticketOverlayActive = signal<boolean>(false);
  readonly activeDticketCategory = signal<DticketCategory>('all');
  readonly showRailwayInfra = signal<boolean>(false);
  readonly showDticketRulesModal = signal<boolean>(false);

  readonly dticketLines: DticketLineInfo[] = DTICKET_NETWORK_LINES;
  readonly dticketRules = DTICKET_RULES;

  // Pre-calculated category counts
  readonly categories: { id: DticketCategory; label: string; count: number }[] = [
    { id: 'all', label: 'Alle Linien', count: DTICKET_NETWORK_LINES.length },
    { id: 'regional', label: 'Regional (RE/RB)', count: DTICKET_NETWORK_LINES.filter(l => l.category === 'regional').length },
    { id: 'suburban', label: 'S-Bahn', count: DTICKET_NETWORK_LINES.filter(l => l.category === 'suburban').length },
    { id: 'subway', label: 'U-Bahn', count: DTICKET_NETWORK_LINES.filter(l => l.category === 'subway').length },
    { id: 'ferry', label: 'HADAG Fähren', count: DTICKET_NETWORK_LINES.filter(l => l.category === 'ferry').length },
    { id: 'border', label: 'Grenzstrecken', count: DTICKET_NETWORK_LINES.filter(l => l.category === 'border').length }
  ];

  filteredLinesCount(): number {
    const cat = this.activeDticketCategory();
    if (cat === 'all') return this.dticketLines.length;
    return this.dticketLines.filter(l => l.category === cat).length;
  }

  private transitService = inject(TransitService);
  private platformId = inject(PLATFORM_ID);
  private map: import('leaflet').Map | null = null;
  private markersLayer: import('leaflet').LayerGroup | null = null;
  private routeLayer: import('leaflet').LayerGroup | null = null;
  private dticketLayer: import('leaflet').LayerGroup | null = null;
  private railwayInfraTileLayer: import('leaflet').TileLayer | null = null;
  private isBrowser = false;
  private currentHeading: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Calibrated phone orientation handler (DeviceOrientationEvent & Absolute Orientation)
  private orientationHandler = (e: DeviceOrientationEvent) => {
    let heading: number | null = null;
    const screenAngle =
      typeof window !== 'undefined'
        ? (window.screen?.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0)
        : 0;

    // 1. iOS: webkitCompassHeading is clockwise degrees from magnetic North
    if ('webkitCompassHeading' in e && typeof (e as { webkitCompassHeading?: number }).webkitCompassHeading === 'number') {
      heading = ((e as { webkitCompassHeading: number }).webkitCompassHeading + screenAngle) % 360;
    }
    // 2. Android absolute alpha or standard alpha
    else if (typeof e.alpha === 'number' && e.alpha !== null) {
      // In Android, alpha rotates counter-clockwise from 0 to 360.
      // Convert to standard compass heading (clockwise from North: 0° = North, 90° = East)
      heading = (360 - e.alpha + screenAngle) % 360;
    }

    // 3. Calibrate with high-precision GPS heading when moving
    const gpsHeading = this.transitService.userGpsHeading();
    if (gpsHeading !== null && gpsHeading !== undefined && gpsHeading >= 0) {
      heading = gpsHeading;
    }

    if (heading !== null) {
      // Shortest angular difference smoothing (avoids jitter and 360/0 wrapping glitches)
      if (this.currentHeading === null) {
        this.currentHeading = heading;
      } else {
        let delta = (heading - this.currentHeading) % 360;
        if (delta < -180) delta += 360;
        if (delta > 180) delta -= 360;
        this.currentHeading = (this.currentHeading + delta * 0.35 + 360) % 360;
      }

      const cone = document.getElementById('gmaps-heading-cone');
      if (cone) {
        cone.style.transform = `rotate(${Math.round(this.currentHeading)}deg)`;
      }
    }
  };

  private customRouteEventListener = (event: Event) => {
    const customEvent = event as CustomEvent<{ from: string; to: string }>;
    if (customEvent.detail) {
      this.planDticketRoute.emit(customEvent.detail);
    }
  };

  constructor() {
    // Reactive listener for geolocation changes
    effect(() => {
      this.transitService.userLocation();
      if (this.isBrowser && this.map && (this.activeJourney || this.selectedStation)) {
        this.renderRouteAndMarkers();
      }
    });
  }

  hasWalkingData(): boolean {
    if (!this.activeJourney) return false;
    return Boolean(
      this.activeJourney.isFromCurrentLocation ||
      this.isWalkingFocused() ||
      this.activeJourney.walkToStartMinutes ||
      this.activeJourney.legs[0]?.walking ||
      (this.transitService.userLocation() && (this.activeJourney.legs[0]?.origin?.location || this.activeJourney.origin?.location))
    );
  }

  ngOnInit() {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser && typeof window !== 'undefined') {
      // Check absolute device orientation on Android if available, fallback to deviceorientation
      const hasAbsolute = 'ondeviceorientationabsolute' in (window as unknown as Record<string, unknown>);
      if (hasAbsolute) {
        window.addEventListener('deviceorientationabsolute', this.orientationHandler as EventListener, { passive: true });
      } else {
        window.addEventListener('deviceorientation', this.orientationHandler as EventListener, { passive: true });
      }
      window.addEventListener('plan-dticket-route', this.customRouteEventListener);
      this.initMap();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!this.isBrowser || !this.map) return;

    if (changes['focusTarget']) {
      this.isWalkingFocused.set(this.focusTarget === 'walk');
    }

    if (changes['activeJourney'] || changes['selectedStation'] || changes['focusTarget']) {
      this.renderRouteAndMarkers();
    }
  }

  ngOnDestroy() {
    if (this.isBrowser && typeof window !== 'undefined') {
      const hasAbsolute = 'ondeviceorientationabsolute' in (window as unknown as Record<string, unknown>);
      if (hasAbsolute) {
        window.removeEventListener('deviceorientationabsolute', this.orientationHandler as EventListener);
      }
      window.removeEventListener('deviceorientation', this.orientationHandler as EventListener);
      window.removeEventListener('plan-dticket-route', this.customRouteEventListener);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  formatDistance(meters?: number): string {
    if (!meters) return 'ca. 400 m';
    if (meters < 1000) return `${meters} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  public invalidateSize(): void {
    if (this.map) {
      this.map.invalidateSize();
    }
  }

  public focusStep(stepIndex: number): void {
    if (!this.map || !this.activeJourney) return;
    const journey = this.activeJourney;

    // Step 0: Walking from start to first station
    if (stepIndex === 0) {
      this.isWalkingFocused.set(true);
      this.renderRouteAndMarkers();
      return;
    }

    // Transit legs (stepIndex 1 corresponds to leg 0)
    const legIdx = stepIndex - 1;
    if (legIdx >= 0 && legIdx < journey.legs.length) {
      this.isWalkingFocused.set(false);
      const leg = journey.legs[legIdx];
      const coords: [number, number][] = [];
      if (leg.origin.location) coords.push([leg.origin.location.latitude, leg.origin.location.longitude]);
      if (leg.stopovers) {
        for (const s of leg.stopovers) {
          if (s.stop?.location) coords.push([s.stop.location.latitude, s.stop.location.longitude]);
        }
      }
      if (leg.destination.location) coords.push([leg.destination.location.latitude, leg.destination.location.longitude]);

      if (coords.length >= 2) {
        this.map.fitBounds(coords, { padding: [50, 50], maxZoom: 14, animate: true });
        return;
      } else if (coords.length === 1) {
        this.map.setView(coords[0], 14, { animate: true });
        return;
      }
    }

    // Final arrival / Destination
    if (stepIndex === journey.legs.length + 1 && journey.destination.location) {
      this.isWalkingFocused.set(false);
      this.map.setView([journey.destination.location.latitude, journey.destination.location.longitude], 15, { animate: true });
      return;
    }

    this.resetMapView();
  }

  toggleWalkFocus() {
    this.isWalkingFocused.update(v => !v);
    this.renderRouteAndMarkers();
  }

  showFullRoute() {
    this.isWalkingFocused.set(false);
    this.renderRouteAndMarkers();
  }

  public focusWalkingTrajectory() {
    this.isWalkingFocused.set(true);
    this.renderRouteAndMarkers();
  }

  // Deutschlandticket Overlay Controls
  toggleDticketOverlay() {
    const next = !this.isDticketOverlayActive();
    this.isDticketOverlayActive.set(next);
    if (next) {
      this.renderDticketOverlay();
    } else {
      this.removeDticketLayers();
    }
  }

  setDticketCategory(category: DticketCategory) {
    this.activeDticketCategory.set(category);
    this.renderDticketOverlay();
  }

  toggleRailwayInfra() {
    const next = !this.showRailwayInfra();
    this.showRailwayInfra.set(next);
    this.updateRailwayInfraLayer();
  }

  private async updateRailwayInfraLayer() {
    if (!this.map || !this.isBrowser) return;
    const L = await import('leaflet');

    if (this.showRailwayInfra()) {
      if (!this.railwayInfraTileLayer) {
        this.railwayInfraTileLayer = L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: 'Gleise: &copy; <a href="https://www.OpenRailwayMap.org">OpenRailwayMap</a>',
          opacity: 0.75
        }).addTo(this.map);
      }
    } else {
      if (this.railwayInfraTileLayer) {
        this.map.removeLayer(this.railwayInfraTileLayer);
        this.railwayInfraTileLayer = null;
      }
    }
  }

  public removeDticketLayers() {
    if (this.dticketLayer) {
      this.dticketLayer.clearLayers();
    }
    if (this.railwayInfraTileLayer && this.map) {
      this.map.removeLayer(this.railwayInfraTileLayer);
      this.railwayInfraTileLayer = null;
      this.showRailwayInfra.set(false);
    }
  }

  public async renderDticketOverlay() {
    if (!this.map || !this.isBrowser || !this.dticketLayer) return;
    const L = await import('leaflet');

    this.dticketLayer.clearLayers();

    const currentCat = this.activeDticketCategory();
    const linesToRender = currentCat === 'all'
      ? this.dticketLines
      : this.dticketLines.filter(l => l.category === currentCat);

    const allPoints: [number, number][] = [];

    for (const line of linesToRender) {
      for (const p of line.path) {
        allPoints.push(p);
      }

      // 1. Line Polyline
      const polyline = L.polyline(line.path, {
        color: line.color,
        weight: line.weight || 4.5,
        opacity: 0.9,
        dashArray: line.dashArray || undefined,
        lineJoin: 'round'
      });

      // Interactive hover highlighting
      polyline.on('mouseover', () => {
        polyline.setStyle({ weight: (line.weight || 4.5) + 3, opacity: 1 });
      });
      polyline.on('mouseout', () => {
        polyline.setStyle({ weight: line.weight || 4.5, opacity: 0.9 });
      });

      // Interactive Route Details Popup
      const popupHtml = `
        <div class="p-2 min-w-[220px] max-w-[270px] text-xs font-sans">
          <div class="flex items-center justify-between gap-2 pb-1.5 border-b border-[#E6DED6]">
            <span class="px-2 py-0.5 rounded text-xs font-black text-white shadow-2xs" style="background-color: ${line.color};">${line.code}</span>
            <span class="text-[9px] font-black text-[#1B4332] bg-[#D8F3DC] border border-[#B7E4C7] px-1.5 py-0.5 rounded">100% D-Ticket</span>
          </div>
          <div class="font-black text-[#1F1612] text-sm mt-1.5">${line.name}</div>
          <div class="text-[11px] text-[#5D4037] font-semibold mt-0.5">${line.originName} ➔ ${line.destinationName}</div>
          <div class="text-[10px] text-[#795548] mt-1 flex items-center gap-1">
            <span>⏱️ ${line.frequency}</span>
          </div>
          <div class="text-[10px] text-[#8D6E63] mt-0.5">Betreiber: ${line.operator}</div>
          <p class="text-[10px] text-[#4E342E] mt-1.5 leading-snug">${line.description}</p>
          <button
            type="button"
            class="mt-2.5 w-full py-1.5 bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs active:scale-95"
            onclick="window.dispatchEvent(new CustomEvent('plan-dticket-route', { detail: { from: '${line.originName}', to: '${line.destinationName}' } }))"
          >
            <span>🚆 Route im Planer öffnen</span>
          </button>
        </div>
      `;
      polyline.bindPopup(popupHtml, { maxWidth: 280 });
      this.dticketLayer.addLayer(polyline);

      // 2. Station Nodes along the line
      for (const st of line.stations) {
        const radius = st.isHub ? 5.5 : 3.5;
        const stationMarker = L.circleMarker([st.lat, st.lng], {
          radius,
          fillColor: '#FFFFFF',
          color: line.color,
          weight: st.isHub ? 3 : 2,
          opacity: 1,
          fillOpacity: 0.95
        });

        stationMarker.bindPopup(`
          <div class="p-1.5 min-w-[170px] text-xs font-sans">
            <div class="font-bold text-[#1F1612]">${st.name}</div>
            <div class="text-[10px] text-[#795548] mt-0.5 flex items-center gap-1">
              <span class="font-bold text-[#2D6A4F]">${line.code}</span>
              <span>• ${st.isHub ? 'Knotenpunkt' : 'Halt'}</span>
            </div>
            <div class="mt-2 flex items-center gap-1">
              <button
                type="button"
                class="flex-1 py-1 bg-[#1B4332] text-white text-[10px] font-bold rounded-md hover:bg-[#2D6A4F] cursor-pointer"
                onclick="window.dispatchEvent(new CustomEvent('plan-dticket-route', { detail: { from: '${st.name}', to: 'Hamburg Hbf' } }))"
              >
                Ab hier
              </button>
              <button
                type="button"
                class="flex-1 py-1 bg-[#FAF7F2] text-[#4E342E] border border-[#E6DED6] text-[10px] font-bold rounded-md hover:bg-[#EDE5DC] cursor-pointer"
                onclick="window.dispatchEvent(new CustomEvent('plan-dticket-route', { detail: { from: 'Hamburg Hbf', to: '${st.name}' } }))"
              >
                Hierher
              </button>
            </div>
          </div>
        `);
        this.dticketLayer.addLayer(stationMarker);
      }
    }

    // If no active journey is currently being inspected, frame the selected D-Ticket network
    if (!this.activeJourney && allPoints.length >= 2) {
      this.map.fitBounds(allPoints, { padding: [40, 40], maxZoom: 12, animate: true });
    }
  }

  private async initMap() {
    if (!this.isBrowser || !this.mapContainer?.nativeElement) return;

    try {
      const L = await import('leaflet');
      const iconDefault = L.icon({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });
      L.Marker.prototype.options.icon = iconDefault;

      this.map = L.map(this.mapContainer.nativeElement, {
        center: [53.5527, 10.0069],
        zoom: 8,
        zoomControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18
      }).addTo(this.map);

      this.markersLayer = L.layerGroup().addTo(this.map);
      this.routeLayer = L.layerGroup().addTo(this.map);
      this.dticketLayer = L.layerGroup().addTo(this.map);

      // Attach ResizeObserver to automatically resize leaflet when container changes
      if (typeof ResizeObserver !== 'undefined' && this.mapContainer?.nativeElement) {
        this.resizeObserver = new ResizeObserver(() => {
          if (this.map) {
            this.map.invalidateSize();
          }
        });
        this.resizeObserver.observe(this.mapContainer.nativeElement);
      }

      this.renderRouteAndMarkers();

      if (this.isDticketOverlayActive()) {
        this.renderDticketOverlay();
      }

      setTimeout(() => {
        if (this.map) this.map.invalidateSize();
      }, 300);
    } catch (err) {
      console.warn('Leaflet map initialization skipped/failed:', err);
    }
  }

  resetMapView() {
    this.isWalkingFocused.set(false);
    if (!this.map) return;
    if (this.activeJourney) {
      this.renderRouteAndMarkers();
    } else if (this.isDticketOverlayActive()) {
      this.renderDticketOverlay();
    } else {
      this.map.setView([53.5527, 10.0069], 8);
    }
  }

  private async renderRouteAndMarkers() {
    if (!this.map || !this.isBrowser || !this.markersLayer || !this.routeLayer) return;
    this.map.invalidateSize();
    const L = await import('leaflet');

    this.markersLayer.clearLayers();
    this.routeLayer.clearLayers();

    const bounds: [number, number][] = [];
    const walkBounds: [number, number][] = [];
    const now = Date.now();

    // Custom marker helper
    const createStationMarker = (
      lat: number,
      lon: number,
      title: string,
      subtitle: string,
      status: 'passed' | 'current' | 'upcoming',
      colorClass: string,
      iconName = 'train'
    ) => {
      const isPassed = status === 'passed';
      const isCurrent = status === 'current';
      const opacityStyle = isPassed ? 'opacity-40 grayscale' : 'opacity-100';
      const ringStyle = isCurrent ? 'ring-4 ring-[#52B788] animate-pulse scale-110' : 'ring-2 ring-white';

      const iconHtml = `
        <div class="flex items-center justify-center w-7 h-7 rounded-full shadow-lg ${colorClass} text-white font-bold text-xs border-2 border-white ${ringStyle} ${opacityStyle} transition-all">
          <span class="mat-icon text-sm">${iconName}</span>
        </div>
      `;
      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-station-icon',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });

      const marker = L.marker([lat, lon], { icon: customIcon });
      marker.bindPopup(`
        <div class="p-1 min-w-[160px]">
          <div class="font-bold text-[#1F1612] text-sm">${title}</div>
          <div class="text-xs text-[#795548] mt-0.5">${subtitle}</div>
          <div class="mt-2 text-[11px] font-bold flex items-center gap-1 ${isPassed ? 'text-[#8D6E63]' : 'text-[#2D6A4F]'}">
            <span>${isPassed ? '✓ Station bereits passiert' : isCurrent ? '📍 Aktuelle Station' : 'Kommende Station'}</span>
          </div>
        </div>
      `);
      return marker;
    };

    if (this.activeJourney) {
      const journey = this.activeJourney;

      for (let i = 0; i < journey.legs.length; i++) {
        const leg = journey.legs[i];
        const legDepMs = new Date(leg.departure).getTime();
        const legArrMs = new Date(leg.arrival).getTime();

        let vehicleIcon = 'train';
        const mode = (leg.line?.mode || '').toLowerCase();
        const prod = (leg.line?.product || '').toLowerCase();
        const lineName = (leg.line?.name || '').toUpperCase();
        if (mode === 'bus' || prod === 'bus' || lineName.startsWith('BUS')) {
          vehicleIcon = 'directions_bus';
        } else if (mode === 'subway' || prod === 'subway' || lineName.startsWith('U')) {
          vehicleIcon = 'subway';
        } else if (lineName.startsWith('S') || prod === 'suburban') {
          vehicleIcon = 'directions_subway';
        }

        const legCoords: { lat: number; lon: number; timeMs: number; name: string }[] = [];

        if (leg.origin.location) {
          legCoords.push({
            lat: leg.origin.location.latitude,
            lon: leg.origin.location.longitude,
            timeMs: legDepMs,
            name: leg.origin.name
          });
          bounds.push([leg.origin.location.latitude, leg.origin.location.longitude]);
        }

        if (leg.stopovers && leg.stopovers.length > 0) {
          for (const s of leg.stopovers) {
            if (s.stop.location) {
              const stopTimeMs = new Date(s.departure || s.arrival || leg.departure).getTime();
              legCoords.push({
                lat: s.stop.location.latitude,
                lon: s.stop.location.longitude,
                timeMs: stopTimeMs,
                name: s.stop.name
              });
              bounds.push([s.stop.location.latitude, s.stop.location.longitude]);

              const isPassed = now > stopTimeMs;
              const isCurrent = Math.abs(now - stopTimeMs) <= 90000;

              const intermediateMarker = L.circleMarker([s.stop.location.latitude, s.stop.location.longitude], {
                radius: isCurrent ? 6 : 4,
                fillColor: isPassed ? '#8D6E63' : isCurrent ? '#1B4332' : '#2D6A4F',
                color: '#ffffff',
                weight: isCurrent ? 3 : 1.5,
                opacity: isPassed ? 0.4 : 1,
                fillOpacity: isPassed ? 0.35 : 0.95
              });
              intermediateMarker.bindPopup(`
                <div class="text-xs font-semibold text-[#1F1612]">${s.stop.name}</div>
                <div class="text-[11px] text-[#795548]">${isPassed ? 'Bereits passiert' : isCurrent ? '📍 Nächster Halt' : 'Kommender Halt'}</div>
              `);
              this.markersLayer.addLayer(intermediateMarker);
            }
          }
        }

        if (leg.destination.location) {
          legCoords.push({
            lat: leg.destination.location.latitude,
            lon: leg.destination.location.longitude,
            timeMs: legArrMs,
            name: leg.destination.name
          });
          bounds.push([leg.destination.location.latitude, leg.destination.location.longitude]);
        }

        if (legCoords.length >= 2) {
          const rawPassedCoords: [number, number][] = [];
          const rawUpcomingCoords: [number, number][] = [];

          for (let cIdx = 0; cIdx < legCoords.length - 1; cIdx++) {
            const p1 = legCoords[cIdx];
            const p2 = legCoords[cIdx + 1];

            if (now >= p2.timeMs) {
              rawPassedCoords.push([p1.lat, p1.lon], [p2.lat, p2.lon]);
            } else if (now <= p1.timeMs) {
              rawUpcomingCoords.push([p1.lat, p1.lon], [p2.lat, p2.lon]);
            } else {
              const ratio = Math.max(0, Math.min(1, (now - p1.timeMs) / (p2.timeMs - p1.timeMs)));
              const midLat = p1.lat + (p2.lat - p1.lat) * ratio;
              const midLon = p1.lon + (p2.lon - p1.lon) * ratio;

              rawPassedCoords.push([p1.lat, p1.lon], [midLat, midLon]);
              rawUpcomingCoords.push([midLat, midLon], [p2.lat, p2.lon]);

              const vehicleHtml = `
                <div class="relative flex items-center justify-center w-8 h-8 rounded-full bg-[#1B4332] text-white shadow-xl ring-4 ring-[#52B788]/60 animate-bounce">
                  <span class="mat-icon text-sm">${vehicleIcon}</span>
                </div>
              `;
              const liveVehicleIcon = L.divIcon({
                html: vehicleHtml,
                className: 'custom-live-vehicle-marker',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
              });
              const vehicleMarker = L.marker([midLat, midLon], { icon: liveVehicleIcon, zIndexOffset: 1000 });
              vehicleMarker.bindPopup(`
                <div class="p-1 text-xs">
                  <div class="font-black text-[#1B4332]">🚆 ${leg.line?.name || 'Zug'} (Live unterwegs)</div>
                  <div class="text-[10px] text-[#5D4037]">Unterwegs von ${p1.name} nach ${p2.name}</div>
                  <div class="text-[11px] text-[#2D6A4F] font-bold mt-1">Status: Pünktlich in Fahrt</div>
                </div>
              `);
              this.markersLayer.addLayer(vehicleMarker);
            }
          }

          if (rawPassedCoords.length > 0) {
            const passedPolyline = L.polyline(rawPassedCoords, {
              color: '#8D6E63',
              weight: 4,
              opacity: 0.45,
              dashArray: '4, 6',
              lineJoin: 'round'
            });
            this.routeLayer.addLayer(passedPolyline);
          }

          if (rawUpcomingCoords.length > 0) {
            const upcomingPolyline = L.polyline(rawUpcomingCoords, {
              color: '#2D6A4F',
              weight: 6,
              opacity: 0.95,
              lineJoin: 'round'
            });
            this.routeLayer.addLayer(upcomingPolyline);
          }
        }

        if (leg.origin.location) {
          const isFirst = i === 0;
          const originPassed = now >= legDepMs;
          const originCurrent = Math.abs(now - legDepMs) <= 180000;
          const originStatus = originPassed ? 'passed' : originCurrent ? 'current' : 'upcoming';

          const marker = createStationMarker(
            leg.origin.location.latitude,
            leg.origin.location.longitude,
            leg.origin.name,
            isFirst ? `Start: ${leg.line?.name || 'Fahrt'}` : `Umstieg: ${leg.line?.name || 'Zug'}`,
            originStatus,
            originPassed ? 'bg-[#795548]' : isFirst ? 'bg-[#2D6A4F]' : 'bg-[#D97706]',
            vehicleIcon
          );
          this.markersLayer.addLayer(marker);
        }

        if (i === journey.legs.length - 1 && leg.destination.location) {
          const destPassed = now >= legArrMs;
          const destCurrent = now >= legDepMs && legArrMs - now <= 300000;
          const destStatus = destPassed ? 'passed' : destCurrent ? 'current' : 'upcoming';

          const marker = createStationMarker(
            leg.destination.location.latitude,
            leg.destination.location.longitude,
            leg.destination.name,
            'Zielbahnhof',
            destStatus,
            destPassed ? 'bg-[#795548]' : 'bg-[#C8372D]',
            'place'
          );
          this.markersLayer.addLayer(marker);
        }
      }

      // Walking trajectory towards origin station
      const userLoc = this.transitService.userLocation();
      const originStation = journey.legs[0]?.origin || journey.origin;
      const startLoc = originStation?.location;

      let walkStartCoords = userLoc;
      let walkEndCoords = startLoc;

      if (journey.legs[0]?.walking && journey.legs[0].origin?.location && journey.legs[0].destination?.location) {
        walkStartCoords = journey.legs[0].origin.location;
        walkEndCoords = journey.legs[0].destination.location;
      }

      if (!walkStartCoords && walkEndCoords) {
        walkStartCoords = {
          latitude: walkEndCoords.latitude - 0.0032,
          longitude: walkEndCoords.longitude - 0.0028
        };
      }

      const hasWalkingTrajectory = Boolean(
        (journey.isFromCurrentLocation || this.isWalkingFocused() || journey.walkToStartMinutes || journey.legs[0]?.walking) &&
        walkStartCoords &&
        walkEndCoords
      );

      if (hasWalkingTrajectory && walkStartCoords && walkEndCoords) {
        bounds.push([walkStartCoords.latitude, walkStartCoords.longitude]);
        walkBounds.push([walkStartCoords.latitude, walkStartCoords.longitude]);
        walkBounds.push([walkEndCoords.latitude, walkEndCoords.longitude]);

        const bearingAngle = calculateBearing(
          walkStartCoords.latitude,
          walkStartCoords.longitude,
          walkEndCoords.latitude,
          walkEndCoords.longitude
        );
        const activeHeading = this.currentHeading !== null ? this.currentHeading : bearingAngle;

        // Google Maps user location indicator (Blue dot + Directional Cone Beam + Pulsing Halo)
        const userIconHtml = `
          <div class="relative w-16 h-16 flex items-center justify-center pointer-events-auto cursor-pointer" id="gmaps-user-marker">
            <!-- Directional Flashlight Beam / Cone (pointing directly where the phone points) -->
            <div id="gmaps-heading-cone" class="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-150" style="transform: rotate(${Math.round(activeHeading)}deg);">
              <svg class="w-16 h-16 overflow-visible" viewBox="0 0 64 64" fill="none">
                <defs>
                  <radialGradient id="gmaps-beam-gradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                    <stop offset="0%" stop-color="#1A73E8" stop-opacity="0.6" />
                    <stop offset="60%" stop-color="#4285F4" stop-opacity="0.25" />
                    <stop offset="100%" stop-color="#4285F4" stop-opacity="0" />
                  </radialGradient>
                </defs>
                <path d="M 32 32 L 8 4 A 32 32 0 0 1 56 4 Z" fill="url(#gmaps-beam-gradient)" />
              </svg>
            </div>

            <!-- Pulsing Accuracy Halo -->
            <div class="absolute w-8 h-8 rounded-full bg-[#1A73E8]/20 animate-ping pointer-events-none"></div>

            <!-- Google Maps Core Blue Circle with White Rim -->
            <div class="relative w-4 h-4 rounded-full bg-[#1A73E8] border-2 border-white shadow-md z-10 ring-1 ring-black/15 flex items-center justify-center">
              <div class="w-1.5 h-1.5 rounded-full bg-white/40"></div>
            </div>
          </div>
        `;
        const userIcon = L.divIcon({
          html: userIconHtml,
          className: 'custom-gmaps-user-icon',
          iconSize: [64, 64],
          iconAnchor: [32, 32],
          popupAnchor: [0, -20]
        });

        const userMarker = L.marker([walkStartCoords.latitude, walkStartCoords.longitude], { icon: userIcon });
        userMarker.on('click', () => {
          this.focusWalkingTrajectory();
        });
        this.markersLayer.addLayer(userMarker);

        // Dashed walking polyline (high visibility)
        const walkPolyline = L.polyline(
          [
            [walkStartCoords.latitude, walkStartCoords.longitude],
            [walkEndCoords.latitude, walkEndCoords.longitude]
          ],
          {
            color: '#1B4332',
            weight: 5,
            opacity: 0.95,
            dashArray: '6, 8',
            lineJoin: 'round'
          }
        );
        walkPolyline.on('click', () => {
          this.focusWalkingTrajectory();
        });
        this.routeLayer.addLayer(walkPolyline);
      }

      if (this.isWalkingFocused() && walkBounds.length >= 2) {
        this.map.fitBounds(walkBounds, { padding: [50, 50], maxZoom: 17, animate: true });
      } else if (bounds.length > 0) {
        this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13, animate: true });
      }
    } else if (this.selectedStation?.location) {
      const loc = this.selectedStation.location;
      const marker = createStationMarker(
        loc.latitude,
        loc.longitude,
        this.selectedStation.name,
        'Ausgewählter Bahnhof',
        'current',
        'bg-[#1B4332]',
        'place'
      );
      this.markersLayer.addLayer(marker);
      this.map.setView([loc.latitude, loc.longitude], 11);
    }
  }
}
