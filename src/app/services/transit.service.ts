import { Injectable, signal } from '@angular/core';
import {
  Station,
  ConnectionJourney,
  DepartureItem,
  RegionalGetaway,
  StationAccessibility,
  JourneyLiveStatusResponse
} from '../models/transit.models';
import { ALL_GERMAN_STATIONS, calculateDistanceKm } from '../data/stations-data';
import {
  searchStations as searchStationsDirect,
  searchConnections as searchConnectionsDirect,
  getStationDepartures as getStationDeparturesDirect,
  getJourneyLiveRealtimeStatus as getJourneyLiveRealtimeStatusDirect
} from '../../server/transit-adapter';
import {
  REGIONAL_DESTINATIONS_FROM_HAMBURG,
  BUNDESLAENDER_METADATA
} from '../../server/german-regions-data';

export interface FavoriteRoute {
  id: string;
  fromName: string;
  toName: string;
  addedAt: string;
}

export interface FavoriteStation {
  id: string;
  name: string;
}

export interface WalkMetrics {
  minutes: number;
  distanceMeters: number;
  distanceText: string;
}

export interface GeolocationDetailedResult {
  success: boolean;
  isRealGps: boolean;
  coords: { latitude: number; longitude: number };
  errorCode?: number; // 1: denied, 2: position unavailable (GPS off), 3: timeout, -1: unsupported
  errorMessage?: string;
  userStreetNumber?: string;
  userAddress?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TransitService {
  // Navigation tabs:
  // 'planner' ("Wohin möchtest du?"), 'live-board' ("Was fährt hier?"), 'hamburg-hub' ("Von Hamburg aus"), 'surprise' ("Überrasche mich"), 'favorites' ("Meine Favoriten"), 'accessibility' ("Barrierefreiheit")
  readonly activeTab = signal<'planner' | 'live-board' | 'hamburg-hub' | 'surprise' | 'favorites' | 'accessibility'>('planner');

  // Active journey for detailed timeline and map inspection
  readonly selectedJourney = signal<ConnectionJourney | null>(null);

  // Tracks whether connection search results are currently active in the planner view
  readonly hasPlannerResults = signal<boolean>(false);

  // Active line for route exploration
  readonly selectedDeparture = signal<DepartureItem | null>(null);

  // Favorites in local storage
  readonly favoriteRoutes = signal<FavoriteRoute[]>(this.loadFavoriteRoutes());
  readonly favoriteStations = signal<FavoriteStation[]>(this.loadFavoriteStations());
  readonly recentStations = signal<Station[]>(this.loadRecentStations());

  private readonly LOCATION_STORAGE_KEY = 'de_regional_saved_user_location_v2';

  private loadSavedUserLocation(): { latitude: number; longitude: number; streetNumber: string; fullAddress: string; isRealGps: boolean } | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.LOCATION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed.latitude === 'number' &&
          typeof parsed.longitude === 'number' &&
          parsed.isRealGps &&
          !parsed.fullAddress?.includes('Mönckebergstraße') &&
          !parsed.streetNumber?.includes('Mönckebergstraße')
        ) {
          return parsed;
        } else {
          // Clean up stale or legacy fake location cache
          localStorage.removeItem(this.LOCATION_STORAGE_KEY);
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  persistUserLocation(data: { latitude: number; longitude: number; streetNumber?: string; fullAddress?: string; isRealGps?: boolean }): void {
    if (typeof localStorage === 'undefined') return;
    try {
      if (data.fullAddress?.includes('Mönckebergstraße') || data.streetNumber?.includes('Mönckebergstraße')) {
        return;
      }
      const currentStreet = data.streetNumber || this.userStreetNumber();
      const currentAddr = data.fullAddress || this.userAddress();
      const isReal = data.isRealGps !== undefined ? data.isRealGps : this.isRealGpsAcquired();
      if (!isReal) return;
      const payload = {
        latitude: data.latitude,
        longitude: data.longitude,
        streetNumber: currentStreet || `Standort (${data.latitude.toFixed(4)}°, ${data.longitude.toFixed(4)}°)`,
        fullAddress: currentAddr || `GPS (${data.latitude.toFixed(4)}°, ${data.longitude.toFixed(4)}°)`,
        isRealGps: isReal,
        timestamp: Date.now()
      };
      localStorage.setItem(this.LOCATION_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('Fehler beim Speichern des Standorts:', err);
    }
  }

  // Pre-load saved location for instant zero-latency startup
  private readonly savedLocationCache = this.loadSavedUserLocation();

  // User physical geolocation (from device GPS or saved cache)
  readonly userLocation = signal<{ latitude: number; longitude: number } | null>(
    this.savedLocationCache
      ? { latitude: this.savedLocationCache.latitude, longitude: this.savedLocationCache.longitude }
      : { latitude: 53.552736, longitude: 10.006909 }
  );
  readonly userAddress = signal<string | null>(
    this.savedLocationCache?.fullAddress || null
  );
  readonly userStreetNumber = signal<string | null>(
    this.savedLocationCache?.streetNumber || null
  );
  readonly isLocating = signal<boolean>(false);
  readonly isTrackingActive = signal<boolean>(false);
  readonly isRealGpsAcquired = signal<boolean>(this.savedLocationCache?.isRealGps || false);
  readonly locationStatus = signal<'initial' | 'locating' | 'granted' | 'denied' | 'fallback'>(
    this.savedLocationCache?.isRealGps ? 'granted' : 'initial'
  );

  private watchId: number | null = null;

  // Cached station query results
  private stationCache = new Map<string, Station[]>();

  constructor() {
    // Seed default favorite routes if empty
    if (this.favoriteRoutes().length === 0) {
      this.addFavoriteRoute('Hamburg Hbf', 'Lübeck Hbf');
      this.addFavoriteRoute('Hamburg Hbf', 'Kiel Hbf');
      this.addFavoriteRoute('Hamburg Hbf', 'Bremen Hbf');
    }

    // Immediately trigger location request on startup in browser environment
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.geolocation) {
      // If we don't have real GPS yet, request non-intrusively immediately
      this.requestGeolocation(false);
      this.startActiveTracking();
    }
  }

  async fetchReverseGeocode(lat: number, lon: number): Promise<{ streetNumber: string; fullAddress: string }> {
    try {
      const response = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}&_t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        if (data && (data.streetNumber || data.fullAddress || data.road || data.city)) {
          const nearest = this.findNearestStationToCoordinates(lat, lon);
          const streetNum = data.streetNumber || data.road || (nearest ? nearest.name : 'Aktueller Standort');
          const fullAddr = data.fullAddress || (data.city ? `${streetNum}, ${data.city}` : streetNum);
          this.userStreetNumber.set(streetNum);
          this.userAddress.set(fullAddr);
          this.persistUserLocation({
            latitude: lat,
            longitude: lon,
            streetNumber: streetNum,
            fullAddress: fullAddr,
            isRealGps: this.isRealGpsAcquired()
          });
          return {
            streetNumber: streetNum,
            fullAddress: fullAddr
          };
        }
      }
    } catch (err) {
      console.warn('Fehler beim Reverse-Geocoding über Server:', err);
    }

    // Direct browser fetch as client-side fallback if server fails
    try {
      const qgisUrl = `https://nominatim.qgis.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1`;
      const qRes = await fetch(qgisUrl, { signal: AbortSignal.timeout(3500) });
      if (qRes.ok) {
        const qData = await qRes.json();
        const addr = qData.address || {};
        const road =
          addr.road ||
          addr.pedestrian ||
          addr.footway ||
          addr.path ||
          addr.street ||
          addr.residential ||
          addr.square ||
          addr.plaza ||
          addr.suburb ||
          addr.amenity ||
          qData.name ||
          '';
        const houseNumber = addr.house_number || addr.housenumber || '';
        const city = addr.city || addr.town || addr.village || addr.municipality || addr.state || '';
        const postcode = addr.postcode || '';

        if (road || city) {
          const streetNum = road
            ? (houseNumber ? `${road} ${houseNumber}` : road)
            : (city ? `Zentrum ${city}` : 'Aktueller Standort');
          const fullAddr = [streetNum, postcode && city ? `${postcode} ${city}` : (postcode || city)]
            .filter(Boolean)
            .join(', ');

          this.userStreetNumber.set(streetNum);
          this.userAddress.set(fullAddr);
          this.persistUserLocation({
            latitude: lat,
            longitude: lon,
            streetNumber: streetNum,
            fullAddress: fullAddr,
            isRealGps: this.isRealGpsAcquired()
          });
          return { streetNumber: streetNum, fullAddress: fullAddr };
        }
      }
    } catch {
      // Browser fallback failed
    }

    const nearest = this.findNearestStationToCoordinates(lat, lon);
    const fallback = {
      streetNumber: nearest ? nearest.name : 'Aktueller Standort',
      fullAddress: nearest ? `${nearest.name}${nearest.address ? ', ' + nearest.address : ''}` : 'Aktueller Standort'
    };
    this.userStreetNumber.set(fallback.streetNumber);
    this.userAddress.set(fallback.fullAddress);
    return fallback;
  }

  requestDetailedGeolocation(force = false): Promise<GeolocationDetailedResult> {
    return new Promise((resolve) => {
      // Default fallback coordinates: Hamburg Hauptbahnhof (central hub)
      const fallbackLoc = { latitude: 53.552736, longitude: 10.006909 };
      const currentCoords = this.userLocation() || fallbackLoc;

      if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
        this.locationStatus.set('fallback');
        resolve({
          success: false,
          isRealGps: false,
          coords: currentCoords,
          errorCode: -1,
          errorMessage: 'Dein Browser unterstützt keine automatische Standortermittlung (Geolocation).',
          userStreetNumber: this.userStreetNumber() || undefined,
          userAddress: this.userAddress() || undefined
        });
        return;
      }

      if (!force && this.isRealGpsAcquired() && this.userLocation()) {
        resolve({
          success: true,
          isRealGps: true,
          coords: this.userLocation()!,
          userStreetNumber: this.userStreetNumber() || undefined,
          userAddress: this.userAddress() || undefined
        });
        return;
      }

      if (force) {
        // Clear cached address so fresh device GPS is guaranteed to be retrieved and shown
        this.userStreetNumber.set(null);
        this.userAddress.set(null);
      }

      this.isLocating.set(true);
      this.locationStatus.set('locating');

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const loc = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          };
          this.userLocation.set(loc);
          this.isRealGpsAcquired.set(true);
          this.locationStatus.set('granted');
          this.isLocating.set(false);

          let revGeocode;
          try {
            revGeocode = await this.fetchReverseGeocode(loc.latitude, loc.longitude);
          } catch {
            // Geocode failed silently
          }

          const resolvedStreet = revGeocode?.streetNumber || this.userStreetNumber() || `Standort (${loc.latitude.toFixed(4)}°, ${loc.longitude.toFixed(4)}°)`;
          const resolvedAddress = revGeocode?.fullAddress || this.userAddress() || resolvedStreet;

          this.userStreetNumber.set(resolvedStreet);
          this.userAddress.set(resolvedAddress);

          this.persistUserLocation({
            latitude: loc.latitude,
            longitude: loc.longitude,
            streetNumber: resolvedStreet,
            fullAddress: resolvedAddress,
            isRealGps: true
          });

          resolve({
            success: true,
            isRealGps: true,
            coords: loc,
            userStreetNumber: resolvedStreet,
            userAddress: resolvedAddress
          });
        },
        async (err) => {
          console.warn('Geolocation denied or timed out:', err);
          this.isLocating.set(false);
          this.locationStatus.set(err.code === 1 ? 'denied' : 'fallback');
          this.isRealGpsAcquired.set(false);

          let errorMsg = 'Standort konnte nicht ermittelt werden.';
          if (err.code === 1) {
            errorMsg = 'Standortberechtigung wurde im Browser blockiert. Bitte erlaube den Standortzugriff in deinen Browsereinstellungen.';
          } else if (err.code === 2) {
            errorMsg = 'Standortdienst (GPS) ist auf deinem Gerät ausgeschaltet oder nicht verfügbar. Bitte aktiviere GPS / Standortdienste.';
          } else if (err.code === 3) {
            errorMsg = 'Zeitüberschreitung beim Empfang des GPS-Signals. Bitte prüfe deine Verbindung und versuche es erneut.';
          }

          resolve({
            success: false,
            isRealGps: false,
            coords: this.userLocation() || fallbackLoc,
            errorCode: err.code,
            errorMessage: errorMsg,
            userStreetNumber: this.userStreetNumber() || undefined,
            userAddress: this.userAddress() || undefined
          });
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  }

  async requestGeolocation(force = false): Promise<{ latitude: number; longitude: number }> {
    const res = await this.requestDetailedGeolocation(force);
    return res.coords;
  }

  /**
   * Starts real-time active tracking of physical movement towards the station
   */
  startActiveTracking(): void {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }
    if (this.watchId !== null) return;

    this.isTrackingActive.set(true);
    try {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const loc = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          };
          this.userLocation.set(loc);
          this.isRealGpsAcquired.set(true);
          this.persistUserLocation({
            latitude: loc.latitude,
            longitude: loc.longitude,
            isRealGps: true
          });
          if (!this.userStreetNumber()) {
            this.fetchReverseGeocode(loc.latitude, loc.longitude);
          }
        },
        (err) => {
          console.warn('Aktive Standortverfolgung pausiert:', err);
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
      );
    } catch {
      this.isTrackingActive.set(false);
    }
  }

  /**
   * Stops real-time active GPS tracking
   */
  stopActiveTracking(): void {
    if (this.watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isTrackingActive.set(false);
  }

  /**
   * Calculates geodesic walking distance & estimated duration between two coordinates
   */
  calculateWalkMetrics(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): WalkMetrics {
    if (!lat1 || !lon1 || !lat2 || !lon2) {
      return { minutes: 5, distanceMeters: 350, distanceText: 'ca. 350 m' };
    }

    const R = 6371e3; // metres
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceMeters = Math.round(R * c);

    // Walking speed ~ 4.8 km/h (80 m/min) + 2 min buffer
    const minutes = Math.max(2, Math.round(distanceMeters / 80) + 2);
    const distanceText =
      distanceMeters < 1000
        ? `${distanceMeters} m`
        : `${(distanceMeters / 1000).toFixed(1)} km`;

    return { minutes, distanceMeters, distanceText };
  }

  /**
   * Finds the nearest train or bus station to the user's physical GPS coordinates
   */
  findNearestStationToCoordinates(lat: number, lon: number): Station {
    let nearest: Station = ALL_GERMAN_STATIONS[0];
    let minDistance = Number.MAX_VALUE;

    for (const station of ALL_GERMAN_STATIONS) {
      if (station.location) {
        const d = calculateDistanceKm(lat, lon, station.location.latitude, station.location.longitude);
        if (d < minDistance) {
          minDistance = d;
          nearest = station;
        }
      }
    }
    return nearest;
  }

  private enhanceJourneys(
    journeys: ConnectionJourney[],
    params: {
      isFromCurrentLocation?: boolean;
      currentLocationCoords?: { latitude: number; longitude: number };
    }
  ): ConnectionJourney[] {
    return journeys.map((j: ConnectionJourney) => {
      const userCoords = params.currentLocationCoords || this.userLocation();
      const startLoc = j.origin?.location || j.legs[0]?.origin?.location;

      if (params.isFromCurrentLocation) {
        let walk = { minutes: 5, distanceMeters: 400, distanceText: 'ca. 400 m' };
        if (userCoords && startLoc) {
          walk = this.calculateWalkMetrics(
            userCoords.latitude,
            userCoords.longitude,
            startLoc.latitude,
            startLoc.longitude
          );
        }
        return {
          ...j,
          isFromCurrentLocation: true,
          startAddress: this.userAddress() || undefined,
          startStreetNumber: this.userStreetNumber() || undefined,
          walkToStartMinutes: walk.minutes,
          walkToStartDistanceMeters: walk.distanceMeters
        };
      } else {
        return {
          ...j,
          isFromCurrentLocation: false,
          walkToStartMinutes: undefined,
          walkToStartDistanceMeters: undefined
        };
      }
    });
  }

  async searchStations(query: string): Promise<Station[]> {
    const q = query.trim();
    if (!q) return [];
    
    const loc = this.userLocation();
    const cacheKey = `${q.toLowerCase()}_${loc ? Math.round(loc.latitude * 100) : 'none'}_${loc ? Math.round(loc.longitude * 100) : 'none'}`;

    if (this.stationCache.has(cacheKey)) {
      return this.stationCache.get(cacheKey)!;
    }

    // 1. Try server endpoint first (timeout fast in case on static Vercel)
    try {
      const params = new URLSearchParams({ query: q });
      if (loc) {
        params.set('lat', String(loc.latitude));
        params.set('lon', String(loc.longitude));
      }
      const res = await fetch(`/api/stations?${params.toString()}`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data: Station[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this.stationCache.set(cacheKey, data);
          return data;
        }
      }
    } catch {
      // Backend unavailable or timed out, gracefully continue to direct engine
    }

    // 2. Direct local engine fallback (works 100% on Vercel without serverless)
    try {
      const direct = await searchStationsDirect(q, loc?.latitude, loc?.longitude);
      if (direct.length > 0) {
        this.stationCache.set(cacheKey, direct);
        return direct;
      }
    } catch (err) {
      console.warn('Fehler bei der direkten Stationsabfrage:', err);
    }

    return [];
  }

  async findConnections(params: {
    from: string;
    to: string;
    departureTime?: string;
    dTicketOnly: boolean;
    includeFernverkehr: boolean;
    isFromCurrentLocation?: boolean;
    currentLocationCoords?: { latitude: number; longitude: number };
  }): Promise<{ journeys: ConnectionJourney[]; error?: string }> {
    const queryParams = new URLSearchParams({
      from: params.from,
      to: params.to,
      dTicketOnly: String(params.dTicketOnly),
      includeFernverkehr: String(params.includeFernverkehr)
    });
    if (params.departureTime) {
      queryParams.set('departure', params.departureTime);
    }

    // 1. Try server API (/api/connections) with a 3.5s timeout
    try {
      const res = await fetch(`/api/connections?${queryParams.toString()}`, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.journeys) && data.journeys.length > 0) {
          return { journeys: this.enhanceJourneys(data.journeys, params) };
        }
      }
    } catch {
      // Fall through to seamless direct engine
    }

    // 2. Seamless direct engine fallback (handles Vercel static deployments, 503s, offline)
    try {
      const directJourneys = await searchConnectionsDirect({
        from: params.from,
        to: params.to,
        departure: params.departureTime,
        dTicketOnly: params.dTicketOnly,
        includeFernverkehr: params.includeFernverkehr
      });

      if (directJourneys && directJourneys.length > 0) {
        return { journeys: this.enhanceJourneys(directJourneys, params) };
      }
    } catch (err) {
      console.warn('Direkte Verbindungssuche fehlgeschlagen:', err);
    }

    return {
      journeys: [],
      error: 'Für diese Strecke wurde keine passende Verbindung gefunden.'
    };
  }

  async getStationDepartures(station: string): Promise<{ station: Station; departures: DepartureItem[]; error?: string }> {
    // 1. Try server
    try {
      const res = await fetch(`/api/departures?station=${encodeURIComponent(station)}`, { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const data = await res.json();
        if (data && data.station) {
          return { station: data.station, departures: data.departures || [] };
        }
      }
    } catch {
      // Fall through
    }

    // 2. Direct local engine
    try {
      const direct = await getStationDeparturesDirect(station);
      return { station: direct.station, departures: direct.departures || [] };
    } catch {
      return {
        station: { id: '0', name: station },
        departures: [],
        error: 'Die Abfahrten konnten nicht geladen werden.'
      };
    }
  }

  /**
   * Fetch real-time delay or cancellation status indicators for a regional train connection
   */
  async getJourneyLiveStatus(
    journey: ConnectionJourney,
    simulateMode?: 'on_time' | 'delay' | 'cancellation'
  ): Promise<JourneyLiveStatusResponse> {
    const payload = {
      journeyId: journey.id,
      legs: journey.legs,
      transferDetails: journey.transferDetails,
      simulateMode
    };

    // 1. Try server API with 3.5s timeout
    try {
      const res = await fetch('/api/journey/live-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.legs)) {
          return data as JourneyLiveStatusResponse;
        }
      }
    } catch {
      // Fall through to seamless direct adapter
    }

    // 2. Seamless direct adapter engine
    try {
      return await getJourneyLiveRealtimeStatusDirect(payload);
    } catch (err) {
      console.warn('Direkte Live-Status-Berechnung fehlgeschlagen:', err);
      return {
        journeyId: journey.id,
        lastUpdated: new Date().toISOString(),
        overallStatus: journey.cancelled ? 'cancelled' : (journey.hasDelay ? 'delayed' : 'on_time'),
        overallStatusLabel: journey.cancelled ? 'Zugausfall' : (journey.hasDelay ? `+${journey.maxDelay} Min.` : 'Pünktlich'),
        maxDelay: journey.maxDelay || 0,
        isCancelled: journey.cancelled || false,
        legs: journey.legs.map((l, idx) => ({
          legIndex: idx,
          lineName: l.line?.name || 'Bahn',
          isWalking: l.walking,
          departureDelay: l.departureDelay || 0,
          arrivalDelay: l.arrivalDelay || 0,
          cancelled: l.cancelled || false,
          actualDeparture: l.departure,
          plannedDeparture: l.plannedDeparture,
          actualArrival: l.arrival,
          plannedArrival: l.plannedArrival,
          platform: l.departurePlatform || null,
          plannedPlatform: l.departurePlatform || null,
          platformChanged: false,
          statusType: l.cancelled ? 'cancelled' : ((l.departureDelay || 0) > 0 ? 'delayed' : 'on_time'),
          statusText: l.cancelled ? 'Fahrt fällt aus' : ((l.departureDelay || 0) > 0 ? `+${l.departureDelay} Min.` : 'Pünktlich'),
          remarks: (l.remarks || []).map(r => r.text || '').filter(Boolean),
          operator: l.line?.operator?.name
        })),
        summaryMessage: journey.cancelled
          ? 'Achtung: Mindestens ein Zug fällt aus.'
          : (journey.hasDelay ? `Verspätung von +${journey.maxDelay} Min. gemeldet.` : 'Alle Züge planmäßig pünktlich.'),
        dataSource: 'DB HAFAS Telemetrie'
      };
    }
  }

  async getRegionalDestinations(bundesland?: string): Promise<RegionalGetaway[]> {
    try {
      const url = bundesland
        ? `/api/destinations/from-hamburg?bundesland=${encodeURIComponent(bundesland)}`
        : '/api/destinations/from-hamburg';
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {
      // Fall through
    }

    let items = REGIONAL_DESTINATIONS_FROM_HAMBURG;
    if (bundesland) {
      items = items.filter(d => d.bundesland.toLowerCase() === bundesland.toLowerCase());
    }
    return items as RegionalGetaway[];
  }

  async getSurpriseDestinations(maxMinutes: number, category?: string): Promise<RegionalGetaway[]> {
    try {
      const queryParams = new URLSearchParams({ maxMinutes: String(maxMinutes) });
      if (category) queryParams.set('category', category);
      const res = await fetch(`/api/surprise?${queryParams.toString()}`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {
      // Fall through
    }

    let candidates = REGIONAL_DESTINATIONS_FROM_HAMBURG.filter(d => d.durationMin <= maxMinutes);
    if (category && category !== 'all' && category !== 'beliebig') {
      candidates = candidates.filter(d => d.category.toLowerCase().includes(category.toLowerCase()));
    }
    if (candidates.length === 0) {
      candidates = REGIONAL_DESTINATIONS_FROM_HAMBURG;
    }
    const shuffled = [...candidates].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 4) as RegionalGetaway[];
  }

  getBundeslaender() {
    return BUNDESLAENDER_METADATA;
  }

  // Favorite Routes management
  private loadFavoriteRoutes(): FavoriteRoute[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem('de_regional_fav_routes');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveFavoriteRoutes(routes: FavoriteRoute[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('de_regional_fav_routes', JSON.stringify(routes));
      this.favoriteRoutes.set(routes);
    } catch (e) {
      console.warn(e);
    }
  }

  addFavoriteRoute(fromName: string, toName: string): void {
    const current = this.favoriteRoutes();
    const id = `${fromName.toLowerCase()}-${toName.toLowerCase()}`;
    if (!current.some(r => r.id === id)) {
      const updated = [
        ...current,
        { id, fromName, toName, addedAt: new Date().toISOString() }
      ];
      this.saveFavoriteRoutes(updated);
    }
  }

  removeFavoriteRoute(id: string): void {
    const updated = this.favoriteRoutes().filter(r => r.id !== id);
    this.saveFavoriteRoutes(updated);
  }

  isFavoriteRoute(fromName: string, toName: string): boolean {
    const id = `${fromName.toLowerCase()}-${toName.toLowerCase()}`;
    return this.favoriteRoutes().some(r => r.id === id);
  }

  // Favorite Stations management
  private loadFavoriteStations(): FavoriteStation[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem('de_regional_fav_stations');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveFavoriteStations(stations: FavoriteStation[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('de_regional_fav_stations', JSON.stringify(stations));
      this.favoriteStations.set(stations);
    } catch (e) {
      console.warn(e);
    }
  }

  addFavoriteStation(station: Station): void {
    const current = this.favoriteStations();
    if (!current.some(s => s.name === station.name)) {
      const updated = [...current, { id: station.id, name: station.name }];
      this.saveFavoriteStations(updated);
    }
  }

  removeFavoriteStation(name: string): void {
    const updated = this.favoriteStations().filter(s => s.name !== name);
    this.saveFavoriteStations(updated);
  }

  // Recent & Recurrent Stations management
  private loadRecentStations(): Station[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem('de_regional_recent_stations');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    // Default 2 popular hubs if none in storage
    return [
      { id: '8002549', name: 'Hamburg Hbf' },
      { id: '8000237', name: 'Lübeck Hbf' }
    ];
  }

  private saveRecentStations(stations: Station[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('de_regional_recent_stations', JSON.stringify(stations));
      this.recentStations.set(stations);
    } catch (e) {
      console.warn(e);
    }
  }

  recordRecentStation(station: Station): void {
    if (
      !station ||
      !station.name ||
      station.isCurrentLocation ||
      station.id === 'current-location' ||
      station.name.toLowerCase().includes('standort') ||
      station.name.toLowerCase().includes('location')
    ) {
      return;
    }
    const current = this.recentStations().filter(s => s.name.toLowerCase() !== station.name.toLowerCase());
    // Prepend to front and keep top 10
    const updated = [
      { id: station.id, name: station.name, location: station.location },
      ...current
    ].slice(0, 10);
    this.saveRecentStations(updated);
  }

  /**
   * Fetches real-time elevator & accessibility details for a specific station
   */
  async getStationAccessibility(stationName: string): Promise<StationAccessibility | null> {
    const s = stationName.trim();
    if (!s) return null;
    try {
      const res = await fetch(`/api/accessibility/station?station=${encodeURIComponent(s)}`, {
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        return (await res.json()) as StationAccessibility;
      }
    } catch {
      // Offline / fallback
    }
    return null;
  }

  /**
   * Fetches live Hamburg-wide elevator status overview (Hochbahn / Urban Data Hub)
   */
  async getHamburgAccessibilityOverview(): Promise<{
    summary: {
      totalStationsMonitored: number;
      totalElevators: number;
      elevatorsInService: number;
      elevatorsInMaintenance: number;
      elevatorsOutOfOrder: number;
      operationalRatePercent: number;
      networkStatus: string;
      dataSource: string;
    };
    stations: StationAccessibility[];
  } | null> {
    try {
      const res = await fetch('/api/accessibility/hamburg', { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Offline / fallback
    }
    return null;
  }
}
