export interface StationLocation {
  type?: string;
  latitude: number;
  longitude: number;
}

export interface Station {
  id: string;
  name: string;
  location?: StationLocation;
  isCurrentLocation?: boolean;
  address?: string;
  streetNumber?: string;
  distanceKm?: number;
  products?: {
    nationalExpress?: boolean;
    national?: boolean;
    regionalExp?: boolean;
    regional?: boolean;
    suburban?: boolean;
    bus?: boolean;
    ferry?: boolean;
    subway?: boolean;
    tram?: boolean;
  };
  weight?: number;
}

export interface TransitLine {
  id?: string;
  name: string;
  mode: string;
  product: 'regionalExp' | 'regional' | 'suburban' | 'nationalExpress' | 'national' | 'bus' | 'ferry' | 'tram' | 'unknown' | string;
  productName?: string;
  operator?: {
    id?: string;
    name: string;
  };
  fahrtNr?: string;
  adminCode?: string;
}

export interface Stopover {
  stop: Station;
  arrival?: string | null;
  departure?: string | null;
  plannedArrival?: string | null;
  plannedDeparture?: string | null;
  arrivalDelay?: number | null;
  departureDelay?: number | null;
  arrivalPlatform?: string | null;
  departurePlatform?: string | null;
  platform?: string | null;
  cancelled?: boolean;
}

export interface TransitRemark {
  type?: string;
  code?: string;
  text?: string;
  summary?: string;
}

export interface TransitLeg {
  origin: Station;
  destination: Station;
  departure: string;
  plannedDeparture: string;
  departureDelay?: number;
  departurePlatform?: string | null;
  arrival: string;
  plannedArrival: string;
  arrivalDelay?: number;
  arrivalPlatform?: string | null;
  line?: TransitLine;
  direction?: string;
  isDeutschlandticketValid: boolean;
  cancelled?: boolean;
  walking?: boolean;
  distance?: number;
  durationMinutes?: number;
  stopovers?: Stopover[];
  polyline?: [number, number][];
  remarks?: TransitRemark[];
}

export interface ConnectionJourney {
  id: string;
  origin: Station;
  destination: Station;
  departure: string;
  plannedDeparture: string;
  arrival: string;
  plannedArrival: string;
  durationMinutes: number;
  durationFormatted: string;
  transfers: number;
  legs: TransitLeg[];
  isDeutschlandticketValid: boolean;
  isFromCurrentLocation?: boolean;
  startAddress?: string;
  startStreetNumber?: string;
  walkToStartMinutes?: number;
  walkToStartDistanceMeters?: number;
  rankType?: 'fastest' | 'fewest-transfers' | 'comfortable';
  rankBadgeLabel?: string;
  hasDelay: boolean;
  maxDelay: number;
  cancelled: boolean;
  distanceKm?: number;
  isLongDistance?: boolean;
  longDistanceWarning?: string;
  transferDetails: {
    stationName: string;
    bufferMinutes: number;
  }[];
  accessibility?: RouteAccessibilitySummary;
}

export type ElevatorOperationalState = 'in_service' | 'maintenance' | 'out_of_order' | 'unknown';

export interface ElevatorFacility {
  id: string;
  stationId?: string;
  stationName: string;
  description: string;
  platform?: string;
  state: ElevatorOperationalState;
  stateExplanation?: string;
  lastUpdated?: string;
}

export interface StationAccessibility {
  stationId: string;
  stationName: string;
  isStepFree: boolean;
  overallScorePercent: number;
  tactilePaving: boolean;
  accessibleToilet: boolean;
  stepFreeAccessNote?: string;
  mobilityServiceAvailable: boolean;
  elevators: ElevatorFacility[];
  elevatorsTotal: number;
  elevatorsInService: number;
  elevatorsInMaintenance: number;
  elevatorsOutOfOrder: number;
  activeDisruptions: string[];
}

export interface RouteAccessibilitySummary {
  isFullyStepFree: boolean;
  scorePercent: number;
  badgeLabel: string;
  statusType: 'success' | 'warning' | 'neutral';
  stationNotes: {
    stationName: string;
    isStepFree: boolean;
    hasDisruption: boolean;
    note: string;
  }[];
}

export interface DepartureItem {
  id: string;
  line: string;
  product: string;
  direction: string;
  destination: Station;
  when: string;
  plannedWhen: string;
  delay: number;
  platform?: string | null;
  operator?: string;
  cancelled?: boolean;
  isDeutschlandticketValid: boolean;
  stopovers?: Stopover[];
}

export interface RegionalGetaway {
  id: string;
  name: string;
  stationName: string;
  stationId: string;
  bundesland: string;
  description: string;
  highlight: string;
  durationMin: number;
  durationFormatted: string;
  transfers: number;
  lines: string[];
  category: 'Küste & Meer' | 'Historische Altstädte' | 'Natur & Wandern' | 'Großstadt & Kultur' | 'Seen & Schlösser';
  popularFor: string;
  latitude: number;
  longitude: number;
}

export interface SearchQuery {
  fromStation: Station | null;
  toStation: Station | null;
  date: string;
  time: string;
  dTicketOnly: boolean;
  includeFernverkehr: boolean;
  sortBy: 'fastest' | 'fewest-transfers' | 'departure' | 'arrival';
}
