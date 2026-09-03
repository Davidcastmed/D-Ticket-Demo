import { Injectable, signal } from '@angular/core';
import {
  Station,
  ConnectionJourney,
  DepartureItem,
  RegionalGetaway
} from '../models/transit.models';
import { ALL_GERMAN_STATIONS, calculateDistanceKm } from '../data/stations-data';
import {
  searchStations as searchStationsDirect,
  searchConnections as searchConnectionsDirect,
  getStationDepartures as getStationDeparturesDirect
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

@Injectable({
  providedIn: 'root'
})
export class TransitService {
  // Navigation tabs in German:
  // 'planner' ("Wohin möchtest du?"), 'live-board' ("Was fährt hier?"), 'hamburg-hub' ("Von Hamburg aus"), 'surprise' ("Überrasche mich"), 'favorites' ("Meine Favoriten")
  readonly activeTab = signal<'planner' | 'live-board' | 'hamburg-hub' | 'surprise' | 'favorites'>('planner');

  // Active journey for detailed timeline and map inspection
  readonly selectedJourney = signal<ConnectionJourney | null>(null);

  // Active line for route exploration
  readonly selectedDeparture = signal<DepartureItem | null>(null);

  // Favorites in local storage
  readonly favoriteRoutes = signal<FavoriteRoute[]>(this.loadFavoriteRoutes());
  readonly favoriteStations = signal<FavoriteStation[]>(this.loadFavoriteStations());
  readonly recentStations = signal<Station[]>(this.loadRecentStations());

  // User physical geolocation (from device GPS)
  readonly userLocation = signal<{ latitude: number; longitude: number } | null>(null);
  readonly userAddress = signal<string | null>(null);
  readonly userStreetNumber = signal<string | null>(null);
  readonly isLocating = signal<boolean>(false);
  readonly isTrackingActive = signal<boolean>(false);

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

    // Default fallback address initially so it's always ready immediately
    this.userStreetNumber.set('Mönckebergstraße 7');
    this.userAddress.set('Mönckebergstraße 7, 20095 Hamburg');
    this.userLocation.set({ latitude: 53.551086, longitude: 9.993682 });

    // Attempt geolocation non-intrusively
    this.requestGeolocation(false);
  }

  async fetchReverseGeocode(lat: number, lon: number): Promise<{ streetNumber: string; fullAddress: string }> {
    try {
      const response = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`);
      if (response.ok) {
        const data = await response.json();
        if (data && (data.streetNumber || data.fullAddress)) {
          const streetNum = data.streetNumber || 'Mönckebergstraße 7';
          const fullAddr = data.fullAddress || `${streetNum}, Hamburg`;
          this.userStreetNumber.set(streetNum);
          this.userAddress.set(fullAddr);
          return {
            streetNumber: streetNum,
            fullAddress: fullAddr
          };
        }
      }
    } catch (err) {
      console.warn('Fehler beim Reverse-Geocoding:', err);
    }
    const fallback = { streetNumber: 'Mönckebergstraße 7', fullAddress: 'Mönckebergstraße 7, 20095 Hamburg' };
    this.userStreetNumber.set(fallback.streetNumber);
    this.userAddress.set(fallback.fullAddress);
    return fallback;
  }

  requestGeolocation(force = false): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve) => {
      const fallbackLoc = { latitude: 53.551086, longitude: 9.993682 };

      if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
        this.userLocation.set(fallbackLoc);
        resolve(fallbackLoc);
        return;
      }
      const existing = this.userLocation();
      if (existing && !force) {
        resolve(existing);
        return;
      }

      this.isLocating.set(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const loc = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          };
          this.userLocation.set(loc);
          this.isLocating.set(false);
          await this.fetchReverseGeocode(loc.latitude, loc.longitude);
          resolve(loc);
        },
        async (err) => {
          console.warn('Geolocation denied/timeout, using fallback:', err);
          this.isLocating.set(false);
          this.userLocation.set(fallbackLoc);
          if (!this.userAddress()) {
            this.userStreetNumber.set('Mönckebergstraße 7');
            this.userAddress.set('Mönckebergstraße 7, 20095 Hamburg');
          }
          resolve(fallbackLoc);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
      );
    });
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
    if (!station || !station.name) return;
    const current = this.recentStations().filter(s => s.name.toLowerCase() !== station.name.toLowerCase());
    // Prepend to front and keep top 10
    const updated = [
      { id: station.id, name: station.name, location: station.location },
      ...current
    ].slice(0, 10);
    this.saveRecentStations(updated);
  }
}
