import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
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
    <div class="relative w-full h-full min-h-[220px] rounded-2xl overflow-hidden shadow-inner border border-[#E6DED6]">
      <!-- Leaflet map container -->
      <div #mapContainer class="w-full h-full min-h-[220px] z-0" role="region" aria-label="Interaktive Streckenkarte"></div>

      <!-- Walking Route Focus Overlay Banner (When focused on walking) -->
      @if (isWalkingFocused() && hasWalkingData()) {
        <div class="absolute top-2 left-2 right-12 bg-white/95 backdrop-blur-md rounded-xl p-2.5 shadow-md border border-[#B7E4C7] z-[400] flex items-center justify-between gap-2 animate-in fade-in duration-150" role="status">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-7 h-7 rounded-full bg-[#1A73E8] text-white flex items-center justify-center shrink-0 shadow-xs" aria-hidden="true">
              <span class="mat-icon text-sm">near_me</span>
            </div>
            <div class="min-w-0">
              <div class="text-xs font-black text-[#1B4332] truncate">
                Fußweg zum Startbahnhof
              </div>
              <div class="text-[11px] text-[#2D6A4F] font-bold truncate">
                ca. {{ activeJourney?.walkToStartMinutes || 5 }} Min. • {{ formatDistance(activeJourney?.walkToStartDistanceMeters) }}
              </div>
            </div>
          </div>

          <button
            type="button"
            id="btn-show-full-route-from-walk"
            (click)="showFullRoute()"
            class="px-2 py-1 bg-[#FAF7F2] hover:bg-[#EDE5DC] text-[#4E342E] border border-[#D7CCC8] rounded-lg text-[10px] font-black shrink-0 cursor-pointer shadow-2xs transition-colors flex items-center gap-1"
            title="Ganze Zugstrecke anzeigen"
            aria-label="Ganze Zugstrecke auf der Karte anzeigen"
          >
            <span class="mat-icon text-xs" aria-hidden="true">train</span>
            <span>Zugstrecke</span>
          </button>
        </div>
      }

      <!-- Map Legend & Controls Overlay -->
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
        }
      </div>

      <!-- Quick Action Controls (Top Right) -->
      <div class="absolute top-2 right-2 flex flex-col gap-1.5 z-[400]" role="toolbar" aria-label="Kartensteuerung">
        @if (hasWalkingData()) {
          <button
            type="button"
            id="btn-focus-walk-map"
            (click)="toggleWalkFocus()"
            class="px-2.5 py-1.5 rounded-xl shadow-md border text-[11px] font-black transition-all cursor-pointer flex items-center gap-1"
            [class.bg-[#1B4332]]="isWalkingFocused()"
            [class.text-white]="isWalkingFocused()"
            [class.border-[#132A1E]]="isWalkingFocused()"
            [class.bg-white]="!isWalkingFocused()"
            [class.text-[#1B4332]]="!isWalkingFocused()"
            [class.border-[#B7E4C7]]="!isWalkingFocused()"
            title="Fußweg vom Standort zum Bahnhof vergrößern"
            [attr.aria-pressed]="isWalkingFocused()"
            aria-label="Fußweg zum Bahnhof auf der Karte fokussieren"
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
          title="Gesamte Route anzeigen"
          aria-label="Gesamte Routenübersicht auf der Karte zentrieren"
        >
          <span class="mat-icon text-xs" aria-hidden="true">filter_center_focus</span>
          <span>Übersicht</span>
        </button>
      </div>

    </div>
  `
})
export class MapView implements OnInit, OnChanges, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;
  @Input() activeJourney: ConnectionJourney | null = null;
  @Input() selectedStation: Station | null = null;
  @Input() focusTarget: 'all' | 'walk' | 'route' = 'all';

  readonly isWalkingFocused = signal<boolean>(false);

  private transitService = inject(TransitService);
  private platformId = inject(PLATFORM_ID);
  private map: import('leaflet').Map | null = null;
  private markersLayer: import('leaflet').LayerGroup | null = null;
  private routeLayer: import('leaflet').LayerGroup | null = null;
  private isBrowser = false;
  private currentHeading: number | null = null;

  private orientationHandler = (e: DeviceOrientationEvent) => {
    let heading: number | null = null;
    if ('webkitCompassHeading' in e && typeof (e as { webkitCompassHeading?: number }).webkitCompassHeading === 'number') {
      heading = (e as { webkitCompassHeading: number }).webkitCompassHeading;
    } else if (e.alpha !== null) {
      heading = (360 - e.alpha) % 360;
    }
    if (heading !== null && (!this.currentHeading || Math.abs(this.currentHeading - heading) > 1.5)) {
      this.currentHeading = heading;
      const cone = document.getElementById('gmaps-heading-cone');
      if (cone) {
        cone.style.transform = `rotate(${Math.round(heading)}deg)`;
      }
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
      this.activeJourney.isFromCurrentLocation &&
      this.transitService.userLocation()
    );
  }

  ngOnInit() {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      if (typeof window !== 'undefined') {
        window.addEventListener('deviceorientation', this.orientationHandler, { passive: true });
      }
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
      window.removeEventListener('deviceorientation', this.orientationHandler);
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

      this.renderRouteAndMarkers();

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

        // Vehicle icon for origin marker
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

        // Add stopovers
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

        // Split polyline into passed vs upcoming segments
        if (legCoords.length >= 2) {
          const rawPassedCoords: [number, number][] = [];
          const rawUpcomingCoords: [number, number][] = [];

          for (let cIdx = 0; cIdx < legCoords.length - 1; cIdx++) {
            const p1 = legCoords[cIdx];
            const p2 = legCoords[cIdx + 1];

            if (now >= p2.timeMs) {
              // Entire segment passed
              rawPassedCoords.push([p1.lat, p1.lon], [p2.lat, p2.lon]);
            } else if (now <= p1.timeMs) {
              // Entire segment upcoming
              rawUpcomingCoords.push([p1.lat, p1.lon], [p2.lat, p2.lon]);
            } else {
              // Vehicle is currently between p1 and p2!
              const ratio = Math.max(0, Math.min(1, (now - p1.timeMs) / (p2.timeMs - p1.timeMs)));
              const midLat = p1.lat + (p2.lat - p1.lat) * ratio;
              const midLon = p1.lon + (p2.lon - p1.lon) * ratio;

              rawPassedCoords.push([p1.lat, p1.lon], [midLat, midLon]);
              rawUpcomingCoords.push([midLat, midLon], [p2.lat, p2.lon]);

              // Draw Live Vehicle Marker
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

        // Origin station marker
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

        // Destination marker for last leg
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

      // Add user location and walking path to start station strictly when starting from current location
      const userLoc = this.transitService.userLocation();
      const hasWalkingTrajectory = Boolean(journey.isFromCurrentLocation && userLoc && journey.legs[0]?.origin?.location);

      if (hasWalkingTrajectory && userLoc && journey.legs[0]?.origin?.location) {
        const startLoc = journey.legs[0].origin.location;
        bounds.push([userLoc.latitude, userLoc.longitude]);
        walkBounds.push([userLoc.latitude, userLoc.longitude]);
        walkBounds.push([startLoc.latitude, startLoc.longitude]);

        const bearingAngle = calculateBearing(
          userLoc.latitude,
          userLoc.longitude,
          startLoc.latitude,
          startLoc.longitude
        );
        const activeHeading = this.currentHeading !== null ? this.currentHeading : bearingAngle;

        // Traditional Google Maps user location indicator (Blue dot + Directional Cone Beam + Pulsing Halo)
        const userIconHtml = `
          <div class="relative w-16 h-16 flex items-center justify-center pointer-events-auto cursor-pointer" id="gmaps-user-marker">
            <!-- Directional Flashlight Beam / Cone (Google Maps Style) -->
            <div id="gmaps-heading-cone" class="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-200" style="transform: rotate(${Math.round(activeHeading)}deg);">
              <svg class="w-16 h-16 overflow-visible" viewBox="0 0 64 64" fill="none">
                <defs>
                  <radialGradient id="gmaps-beam-gradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                    <stop offset="0%" stop-color="#1A73E8" stop-opacity="0.55" />
                    <stop offset="65%" stop-color="#4285F4" stop-opacity="0.2" />
                    <stop offset="100%" stop-color="#4285F4" stop-opacity="0" />
                  </radialGradient>
                </defs>
                <!-- Directional cone pointing UP (0deg = heading) with origin at center (32, 32) -->
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

        const userMarker = L.marker([userLoc.latitude, userLoc.longitude], { icon: userIcon });
        const streetLabel = this.transitService.userStreetNumber() || journey.startStreetNumber || 'Dein Standort (GPS)';
        const fullAddr = this.transitService.userAddress() || journey.startAddress || '';

        userMarker.bindPopup(`
          <div class="p-1.5 min-w-[190px]">
            <div class="font-black text-[#1A73E8] text-xs flex items-center gap-1.5">
              <span class="mat-icon text-sm">my_location</span>
              <span>${streetLabel}</span>
            </div>
            ${fullAddr && fullAddr !== streetLabel ? `<div class="text-[10px] text-[#795548] truncate mt-0.5">📍 ${fullAddr}</div>` : ''}
            <div class="text-[11px] text-[#2D6A4F] font-bold mt-1">
              🚶 ca. ${journey.walkToStartMinutes || 5} Min. Fußweg (${this.formatDistance(journey.walkToStartDistanceMeters)})
            </div>
            <div class="text-[10px] text-[#795548] mt-0.5">
              Richtung: ${journey.legs[0].origin.name} (Gleis ${journey.legs[0].departurePlatform || '1'})
            </div>
          </div>
        `);
        userMarker.on('click', () => {
          this.focusWalkingTrajectory();
        });
        this.markersLayer.addLayer(userMarker);

        // Dashed walking polyline (high visibility)
        const walkPolyline = L.polyline(
          [
            [userLoc.latitude, userLoc.longitude],
            [startLoc.latitude, startLoc.longitude]
          ],
          {
            color: '#1B4332',
            weight: 5,
            opacity: 0.95,
            dashArray: '6, 8',
            lineJoin: 'round'
          }
        );
        walkPolyline.bindPopup(`
          <div class="p-1 text-xs">
            <div class="font-black text-[#1B4332]">🚶 Fußweg zur Haltestelle</div>
            <div class="text-[10px] text-[#5D4037]">Ab: ${streetLabel}</div>
            <div class="text-[11px] text-[#2D6A4F] font-bold mt-0.5">ca. ${journey.walkToStartMinutes || 5} Min. (${this.formatDistance(journey.walkToStartDistanceMeters)})</div>
          </div>
        `);
        walkPolyline.on('click', () => {
          this.focusWalkingTrajectory();
        });
        this.routeLayer.addLayer(walkPolyline);
      }

      // Zoom behavior: High magnification for walking trajectory so user can inspect streets and zoom out freely
      if (this.isWalkingFocused() && walkBounds.length >= 2) {
        this.map.fitBounds(walkBounds, { padding: [40, 40], maxZoom: 17, animate: true });
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

