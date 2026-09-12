export type DticketCategory = 'all' | 'regional' | 'suburban' | 'subway' | 'ferry' | 'border';

export interface DticketStationNode {
  name: string;
  lat: number;
  lng: number;
  isHub?: boolean;
}

export interface DticketLineInfo {
  id: string;
  code: string;
  name: string;
  category: 'regional' | 'suburban' | 'subway' | 'ferry' | 'border';
  categoryLabel: string;
  operator: string;
  color: string;
  textColor?: string;
  dashArray?: string;
  weight?: number;
  frequency: string;
  originName: string;
  destinationName: string;
  validityNote: string;
  description: string;
  path: [number, number][];
  stations: DticketStationNode[];
  isBorderExcursion?: boolean;
}

export interface DticketNetworkFilter {
  category: DticketCategory;
  showRailwayInfra: boolean;
  highlightedLineId: string | null;
}
