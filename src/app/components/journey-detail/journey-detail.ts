import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ConnectionJourney,
  TransitLeg,
  Stopover,
  Station,
  JourneyLiveStatusResponse,
  LegLiveStatus
} from '../../models/transit.models';
import { TransitService } from '../../services/transit.service';
import { WeatherService } from '../../services/weather.service';
import { MapView } from '../map/map-view';

export type StationStatus = 'passed' | 'current' | 'upcoming';

export interface EnrichedStopover {
  stop: Station;
  arrival?: string | null;
  departure?: string | null;
  platform?: string | null;
  status: StationStatus;
  statusLabel: string;
  minutesRemaining?: number;
  isCurrentTarget: boolean;
}

export interface LegModeBadge {
  shape: 'diamond' | 'square' | 'circle-s' | 'circle-ferry' | 'circle-r' | 'pill-ice';
  text: string;
  bg: string;
}

@Component({
  selector: 'app-journey-detail',
  imports: [CommonModule, MapView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './journey-detail.html',
})
export class JourneyDetail implements OnInit, OnDestroy, AfterViewInit, OnChanges {
  @Input() journey: ConnectionJourney | null = null;
  @Input() focusWalkOnInit = false;
  @Output() closeModal = new EventEmitter<void>();
  @Output() showOnMap = new EventEmitter<ConnectionJourney>();
  @ViewChild('mapViewComponent') mapViewComponent?: MapView;

  private transitService = inject(TransitService);
  private weatherService = inject(WeatherService);
  readonly destinationWeather = this.weatherService.currentWeather;
  readonly isWeatherLoading = this.weatherService.isLoading;

  // Split-view Sheet Height percentage: default 80% as requested by user (80% details / 20% map)
  readonly sheetHeightPercent = signal<number>(80);
  readonly isDraggingSignal = signal<boolean>(false);
  private isDragging = false;
  private dragStartY = 0;
  private dragStartTime = 0;
  private startHeight = 80;

  // Google Maps Bottom Sheet Snap Levels:
  // 20% = Peek mode: high map visibility (80% map), connection summary
  // 80% = Default split mode: balanced map with rich details visibility (80% details / 20% map)
  // 100% = Full mode: details container goes all the way to the top (100% full screen)
  readonly SNAP_MAP_PEEK = 20;
  readonly SNAP_SPLIT_HALF = 80;
  readonly SNAP_FULL_DETAILS = 100;

  // Step-by-step guidance along the route
  readonly currentStep = signal<number>(0);
  readonly totalSteps = computed(() => (this.journey ? this.journey.legs.length + 2 : 1));

  readonly showDetailMap = signal<boolean>(true);
  readonly mapFocusTarget = signal<'all' | 'walk' | 'route'>('all');
  readonly openIntermediateStopsMap = signal<Record<number, boolean>>({});

  // Ticket modal
  readonly showTicketModal = signal<boolean>(false);
  readonly ticketBookingSuccess = signal<string | null>(null);

  // Pin / Favorite status
  readonly isPinned = computed(() => {
    if (!this.journey) return false;
    return this.transitService.isFavoriteRoute(this.journey.origin.name, this.journey.destination.name);
  });

  // Real-time tracking clock signal (updates every 2 seconds with true system clock)
  readonly currentRealTimestamp = signal<number>(Date.now());

  // Real-time delay and cancellation status signals
  readonly liveStatus = signal<JourneyLiveStatusResponse | null>(null);
  readonly isLoadingLiveStatus = signal<boolean>(false);
  readonly liveStatusError = signal<string | null>(null);
  readonly lastRefreshedAt = signal<Date | null>(null);
  readonly simulationMode = signal<'live' | 'delay' | 'cancellation'>('live');

  readonly lastRefreshText = computed(() => {
    const t = this.lastRefreshedAt();
    if (!t) return 'Jetzt';
    const sec = Math.round((Date.now() - t.getTime()) / 1000);
    if (sec < 25) return 'Jetzt';
    if (sec < 60) return `vor ${sec} s`;
    return `vor ${Math.round(sec / 60)} min`;
  });

  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private refreshTimerHandle: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      this.timerHandle = setInterval(() => {
        this.currentRealTimestamp.set(Date.now());
      }, 2000);

      // Auto-refresh real-time delay/cancellation data every 30s in live mode
      this.refreshTimerHandle = setInterval(() => {
        if (this.simulationMode() === 'live') {
          this.fetchRealtimeStatus('live');
        }
      }, 30000);
    }

    // Initial fetch of real-time delay and cancellation status
    this.fetchRealtimeStatus('live');
    const initialH = this.focusWalkOnInit ? this.SNAP_MAP_PEEK : 80;
    this.sheetHeightPercent.set(initialH);
    this.startHeight = initialH;

    if (this.journey?.destination) {
      this.weatherService.getWeatherForStation(this.journey.destination);
    }
  }

  ngAfterViewInit(): void {
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.mapViewComponent?.invalidateSize();
        if (this.focusWalkOnInit) {
          this.focusWalkOnMap();
        }
      }, 150);
      setTimeout(() => {
        this.mapViewComponent?.invalidateSize();
      }, 420);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['focusWalkOnInit'] && this.focusWalkOnInit) {
      this.focusWalkOnMap();
      return;
    }
    if (changes['journey'] && this.journey) {
      const targetH = this.focusWalkOnInit ? this.SNAP_MAP_PEEK : 80;
      this.sheetHeightPercent.set(targetH);
      this.startHeight = targetH;
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          this.mapViewComponent?.invalidateSize();
          if (this.focusWalkOnInit) {
            this.focusWalkOnMap();
          }
        }, 120);
      }
    }
  }

  focusWalkOnMap(): void {
    this.currentStep.set(0);
    // Lower the bottom sheet to map mode (80% map / 20% sheet) so user is directed straight to map
    this.snapTo('map');
    setTimeout(() => {
      this.mapViewComponent?.invalidateSize();
      this.mapViewComponent?.focusStep(0);
      this.mapViewComponent?.focusWalkingTrajectory();
    }, 150);
  }

  ngOnDestroy(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    if (this.refreshTimerHandle) {
      clearInterval(this.refreshTimerHandle);
      this.refreshTimerHandle = null;
    }
  }

  togglePin(): void {
    if (!this.journey) return;
    const from = this.journey.origin.name;
    const to = this.journey.destination.name;
    if (this.isPinned()) {
      const id = `${from.toLowerCase()}-${to.toLowerCase()}`;
      this.transitService.removeFavoriteRoute(id);
    } else {
      this.transitService.addFavoriteRoute(from, to);
    }
  }

  async refreshDestinationWeather(event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
    }
    if (this.journey?.destination) {
      await this.weatherService.getWeatherForStation(this.journey.destination, true);
    }
  }

  goToStep(stepIndex: number): void {
    this.currentStep.set(stepIndex);
    if (stepIndex === 0) {
      this.focusWalkOnMap();
    } else {
      this.mapViewComponent?.focusStep(stepIndex);
    }
  }

  prevStep(): void {
    if (this.currentStep() > 0) {
      const prev = this.currentStep() - 1;
      this.currentStep.set(prev);
      this.mapViewComponent?.focusStep(prev);
    }
  }

  nextStep(): void {
    if (this.currentStep() < this.totalSteps() - 1) {
      const next = this.currentStep() + 1;
      this.currentStep.set(next);
      this.mapViewComponent?.focusStep(next);
    }
  }

  focusAllRoute(): void {
    this.mapViewComponent?.resetMapView();
  }

  onDragStart(event: PointerEvent): void {
    this.isDragging = true;
    this.isDraggingSignal.set(true);
    this.dragStartY = event.clientY;
    this.dragStartTime = Date.now();
    this.startHeight = this.sheetHeightPercent();
    const el = event.currentTarget as HTMLElement;
    if (el?.setPointerCapture) {
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture fallback if not supported
      }
    }
  }

  onDragMove(event: PointerEvent): void {
    if (!this.isDragging) return;
    const deltaY = this.dragStartY - event.clientY; // upward drag increases bottom sheet height
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const deltaPercent = (deltaY / winH) * 100;
    // Allow dragging smoothly up to 100% (container rises to the top to show all details) and down to 16% (peek)
    const newHeight = Math.min(100, Math.max(16, this.startHeight + deltaPercent));
    this.sheetHeightPercent.set(Math.round(newHeight));
  }

  onDragEnd(event: PointerEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.isDraggingSignal.set(false);
    const el = event.currentTarget as HTMLElement;
    if (el?.releasePointerCapture) {
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore fallback
      }
    }

    const timeElapsed = Math.max(1, Date.now() - this.dragStartTime);
    const deltaY = this.dragStartY - event.clientY;
    const velocity = deltaY / timeElapsed; // px/ms: positive = upward flick, negative = downward flick
    const curHeight = this.sheetHeightPercent();

    let targetSnap: number;
    // Flick gesture detection (quick swipe up or down)
    if (velocity > 0.3) {
      // Swiped firmly upwards
      if (curHeight < 40) {
        targetSnap = this.SNAP_SPLIT_HALF; // 80%
      } else {
        targetSnap = this.SNAP_FULL_DETAILS; // 100%
      }
    } else if (velocity < -0.3) {
      // Swiped firmly downwards
      if (curHeight > 88) {
        targetSnap = this.SNAP_SPLIT_HALF; // 80%
      } else {
        targetSnap = this.SNAP_MAP_PEEK; // 20%
      }
    } else {
      // Position-based snap zones:
      // < 40% -> Snap to 20% (Map prominent)
      // 40% to 90% -> Snap to 80% (Standard default details view: 80% details / 20% map)
      // >= 90% -> Snap to 100% (Full details container reaching the very top)
      if (curHeight < 40) {
        targetSnap = this.SNAP_MAP_PEEK;
      } else if (curHeight < 90) {
        targetSnap = this.SNAP_SPLIT_HALF;
      } else {
        targetSnap = this.SNAP_FULL_DETAILS;
      }
    }

    this.sheetHeightPercent.set(targetSnap);
    setTimeout(() => {
      this.mapViewComponent?.invalidateSize();
    }, 390);
  }

  snapTo(level: 'map' | 'half' | 'details'): void {
    if (level === 'map') {
      this.sheetHeightPercent.set(this.SNAP_MAP_PEEK);
    } else if (level === 'half') {
      this.sheetHeightPercent.set(this.SNAP_SPLIT_HALF);
    } else {
      this.sheetHeightPercent.set(this.SNAP_FULL_DETAILS);
    }
    setTimeout(() => {
      this.mapViewComponent?.invalidateSize();
    }, 390);
  }

  toggleSheetHeight(target?: 'map' | 'half' | 'details'): void {
    if (target) {
      this.snapTo(target);
      return;
    }
    const cur = this.sheetHeightPercent();
    if (cur >= 90) {
      // If full, step down to 80%
      this.snapTo('half');
    } else if (cur >= 50) {
      // If 80%, expand to full details
      this.snapTo('details');
    } else {
      // If peek, expand to 80%
      this.snapTo('half');
    }
  }

  /**
   * Helper to return clean visual theme colors & category for the animated weather card
   */
  getWeatherTheme(code: number | undefined): {
    cardBg: string;
    cardBorder: string;
    textPrimary: string;
    textSecondary: string;
    badgeBg: string;
    badgeBorder: string;
    type: 'sunny' | 'partlyCloudy' | 'cloudy' | 'rainy' | 'snowy' | 'foggy';
  } {
    if (code === undefined) {
      return {
        cardBg: 'bg-linear-to-r from-[#FFFDF9] via-[#FAF7F2] to-[#F5EFE6]',
        cardBorder: 'border-[#E6DED6]',
        textPrimary: 'text-[#1F1612]',
        textSecondary: 'text-[#795548]',
        badgeBg: 'bg-white/80',
        badgeBorder: 'border-[#E6DED6]',
        type: 'sunny'
      };
    }
    if (code === 0) {
      return {
        cardBg: 'bg-linear-to-r from-[#FFFBEB] via-[#FEF3C7] to-[#FDE68A]/60',
        cardBorder: 'border-[#FDE68A]',
        textPrimary: 'text-[#78350F]',
        textSecondary: 'text-[#92400E]',
        badgeBg: 'bg-white/85',
        badgeBorder: 'border-[#FCD34D]',
        type: 'sunny'
      };
    }
    if (code === 1 || code === 2) {
      return {
        cardBg: 'bg-linear-to-r from-[#F8FAFC] via-[#F1F5F9] to-[#E2E8F0]',
        cardBorder: 'border-[#CBD5E1]',
        textPrimary: 'text-[#1E293B]',
        textSecondary: 'text-[#64748B]',
        badgeBg: 'bg-white/85',
        badgeBorder: 'border-[#CBD5E1]',
        type: 'partlyCloudy'
      };
    }
    if (code === 3) {
      return {
        cardBg: 'bg-linear-to-r from-[#F8FAFC] via-[#F1F5F9] to-[#E2E8F0]',
        cardBorder: 'border-[#CBD5E1]',
        textPrimary: 'text-[#334155]',
        textSecondary: 'text-[#64748B]',
        badgeBg: 'bg-white/85',
        badgeBorder: 'border-[#CBD5E1]',
        type: 'cloudy'
      };
    }
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
      return {
        cardBg: 'bg-linear-to-r from-[#F0F9FF] via-[#E0F2FE] to-[#BAE6FD]/70',
        cardBorder: 'border-[#7DD3FC]',
        textPrimary: 'text-[#0C4A6E]',
        textSecondary: 'text-[#0369A1]',
        badgeBg: 'bg-white/85',
        badgeBorder: 'border-[#7DD3FC]',
        type: 'rainy'
      };
    }
    if ([71, 73, 75, 77, 85, 86].includes(code)) {
      return {
        cardBg: 'bg-linear-to-r from-[#F8FAFC] via-[#EFF6FF] to-[#DBEAFE]',
        cardBorder: 'border-[#BFDBFE]',
        textPrimary: 'text-[#1E3A8A]',
        textSecondary: 'text-[#3B82F6]',
        badgeBg: 'bg-white/85',
        badgeBorder: 'border-[#BFDBFE]',
        type: 'snowy'
      };
    }
    return {
      cardBg: 'bg-linear-to-r from-[#F8FAFC] via-[#F1F5F9] to-[#E2E8F0]',
      cardBorder: 'border-[#CBD5E1]',
      textPrimary: 'text-[#334155]',
      textSecondary: 'text-[#64748B]',
      badgeBg: 'bg-white/85',
      badgeBorder: 'border-[#CBD5E1]',
      type: 'foggy'
    };
  }

  openTicketModal(): void {
    this.showTicketModal.set(true);
    this.ticketBookingSuccess.set(null);
  }

  closeTicketModal(): void {
    this.showTicketModal.set(false);
  }

  buyTicket(ticketType: string): void {
    this.ticketBookingSuccess.set(`Ticket gebucht: ${ticketType}`);
    setTimeout(() => {
      this.showTicketModal.set(false);
    }, 1600);
  }

  async fetchRealtimeStatus(mode?: 'live' | 'delay' | 'cancellation'): Promise<void> {
    if (!this.journey) return;
    const targetMode = mode ?? this.simulationMode();
    this.simulationMode.set(targetMode);
    this.isLoadingLiveStatus.set(true);
    this.liveStatusError.set(null);

    try {
      const status = await this.transitService.getJourneyLiveStatus(
        this.journey,
        targetMode === 'live' ? undefined : targetMode
      );
      this.liveStatus.set(status);
      this.lastRefreshedAt.set(new Date());
    } catch (err) {
      console.warn('Fehler beim Abrufen des Echtzeit-Status:', err);
      this.liveStatusError.set('Echtzeit-Fahrtdaten konnten nicht aktualisiert werden.');
    } finally {
      this.isLoadingLiveStatus.set(false);
    }
  }

  getLegLiveStatus(legIndex: number): LegLiveStatus | null {
    const status = this.liveStatus();
    if (!status || !Array.isArray(status.legs)) return null;
    return status.legs.find(l => l.legIndex === legIndex) || null;
  }

  getLegEffectiveDelay(leg: TransitLeg, legIndex: number): number {
    const legStatus = this.getLegLiveStatus(legIndex);
    if (legStatus) return Math.max(legStatus.departureDelay, legStatus.arrivalDelay);
    return Math.max(leg.departureDelay || 0, leg.arrivalDelay || 0);
  }

  isLegCancelled(leg: TransitLeg, legIndex: number): boolean {
    const legStatus = this.getLegLiveStatus(legIndex);
    if (legStatus) return legStatus.cancelled;
    return Boolean(leg.cancelled);
  }

  getPlannedTime(isoTime: string, delayMinutes: number): string {
    if (!isoTime) return '';
    try {
      const d = new Date(isoTime);
      const planned = new Date(d.getTime() - delayMinutes * 60000);
      return planned.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  getOriginAddressLabel(journey: ConnectionJourney): string {
    if (journey.startStreetNumber) return journey.startStreetNumber;
    if (this.transitService.userStreetNumber()) return this.transitService.userStreetNumber()!;
    if (journey.startAddress) return journey.startAddress;
    if (this.transitService.userAddress()) return this.transitService.userAddress()!;
    return 'Aktueller Standort';
  }

  splitStationAddress(name: string): { line1: string; line2?: string } {
    if (!name) return { line1: 'Start' };
    const parts = name.split(',');
    if (parts.length > 1) {
      return {
        line1: parts[0].trim() + ',',
        line2: parts.slice(1).join(',').trim()
      };
    }
    return { line1: name };
  }

  getFirstWalkMinutes(journey: ConnectionJourney): number {
    if (journey.legs && journey.legs.length > 0) {
      const journeyDep = new Date(journey.departure).getTime();
      const firstLegDep = new Date(journey.legs[0].departure).getTime();
      const diff = Math.round((firstLegDep - journeyDep) / 60000);
      if (diff > 0) return diff;
    }
    return 9;
  }

  getWalkDistanceMeters(journey: ConnectionJourney): number {
    const min = this.getFirstWalkMinutes(journey);
    return Math.round(min * 65.5);
  }

  getLegModeBadge(leg: TransitLeg): LegModeBadge {
    const lineName = (leg.line?.name || '').toUpperCase();
    const product = (leg.line?.product || '').toLowerCase();

    if (product === 'bus' || lineName.startsWith('BUS') || /^\d{3,4}$/.test(lineName)) {
      return { shape: 'diamond', text: 'BUS', bg: 'bg-[#D62828]' };
    }
    if (product === 'subway' || lineName.startsWith('U')) {
      return { shape: 'square', text: 'U', bg: 'bg-[#005CA9]' };
    }
    if (product === 'suburban' || lineName.startsWith('S')) {
      return { shape: 'circle-s', text: 'S', bg: 'bg-[#007A3D]' };
    }
    if (product === 'ferry' || lineName.startsWith('F')) {
      return { shape: 'circle-ferry', text: 'F', bg: 'bg-[#009EE0]' };
    }
    if (product === 'nationalexpress' || lineName.startsWith('ICE') || lineName.startsWith('IC')) {
      return { shape: 'pill-ice', text: 'ICE', bg: 'bg-[#D62828]' };
    }
    return { shape: 'circle-r', text: 'R', bg: 'bg-black' };
  }

  getLegTrackColor(leg: TransitLeg): string {
    const lineName = (leg.line?.name || '').toUpperCase();
    const product = (leg.line?.product || '').toLowerCase();
    if (product === 'bus' || lineName.startsWith('BUS') || /^\d{3,4}$/.test(lineName)) {
      return 'bg-[#D62828]';
    }
    if (product === 'subway' || lineName.startsWith('U')) {
      return 'bg-[#005CA9]';
    }
    if (product === 'suburban' || lineName.startsWith('S')) {
      return 'bg-[#007A3D]';
    }
    if (product === 'ferry' || lineName.startsWith('F')) {
      return 'bg-[#009EE0]';
    }
    return 'bg-black';
  }

  getLegPillBg(leg: TransitLeg): string {
    const lineName = (leg.line?.name || '').toUpperCase();
    const product = (leg.line?.product || '').toLowerCase();
    if (product === 'bus' || lineName.startsWith('BUS') || /^\d{3,4}$/.test(lineName)) {
      return 'bg-[#D62828]';
    }
    if (product === 'subway' || lineName.startsWith('U')) {
      return 'bg-[#005CA9]';
    }
    if (product === 'suburban' || lineName.startsWith('S')) {
      return 'bg-[#007A3D]';
    }
    if (product === 'ferry' || lineName.startsWith('F')) {
      return 'bg-[#009EE0]';
    }
    return 'bg-black';
  }

  getStopCountText(_leg: TransitLeg, count: number): string {
    if (count <= 1) return 'eine Haltestelle';
    return `${count} Haltestellen`;
  }

  getTransferSummary(journey: ConnectionJourney, index: number): string {
    const curLeg = journey.legs[index];
    const nextLeg = journey.legs[index + 1];
    if (!curLeg || !nextLeg) return 'Steige um (4 min zu Fuß)';

    const curArr = new Date(curLeg.arrival).getTime();
    const nextDep = new Date(nextLeg.departure).getTime();
    const totalWait = Math.max(1, Math.round((nextDep - curArr) / 60000));
    const walkMin = Math.min(4, Math.max(1, Math.round(totalWait / 3)));
    const waitMin = Math.max(0, totalWait - walkMin);

    if (waitMin > 0) {
      return `Steige um (${walkMin} min zu Fuß, ${waitMin} min warten)`;
    }
    return `Steige um (${walkMin} min zu Fuß)`;
  }

  toggleMap(): void {
    this.showDetailMap.update(v => !v);
  }

  toggleIntermediateStops(index: number): void {
    this.openIntermediateStopsMap.update(map => ({
      ...map,
      [index]: !map[index]
    }));
  }

  isStopsOpen(index: number): boolean {
    return Boolean(this.openIntermediateStopsMap()[index]);
  }

  formatTime(isoString: string): string {
    if (!isoString) return '--:--';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  }

  formatHvvDuration(minutes: number): string {
    if (!minutes) return '0 min';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    return `${h} h ${m > 0 ? m + ' min' : ''}`;
  }

  formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} Min`;
    return `${h} Std ${m > 0 ? m + ' Min' : ''}`;
  }

  formatDistance(meters?: number): string {
    if (!meters) return 'ca. 400 m';
    if (meters < 1000) return `${meters} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  getEnrichedLegStopovers(leg: TransitLeg): EnrichedStopover[] {
    const rawStops = this.getLegIntermediateStopovers(leg);
    const now = this.currentRealTimestamp();

    let foundCurrent = false;

    return rawStops.map((s, idx) => {
      const stopIso = s.departure || s.arrival || leg.departure;
      const stopMs = new Date(stopIso).getTime();
      let status: StationStatus = 'upcoming';
      let statusLabel = 'Kommend';
      let isCurrentTarget = false;
      let minutesRemaining: number | undefined = undefined;

      if (now > stopMs + 45000) {
        status = 'passed';
        statusLabel = 'Passiert';
      } else if (!foundCurrent && (now >= stopMs - 180000 || idx === 0)) {
        status = 'current';
        statusLabel = 'Nächster Halt';
        isCurrentTarget = true;
        foundCurrent = true;
        minutesRemaining = Math.max(0, Math.round((stopMs - now) / 60000));
      } else {
        status = 'upcoming';
        statusLabel = 'Kommend';
      }

      return {
        stop: s.stop,
        arrival: s.arrival,
        departure: s.departure,
        platform: s.platform || s.departurePlatform || s.arrivalPlatform,
        status,
        statusLabel,
        minutesRemaining,
        isCurrentTarget
      };
    });
  }

  getLegIntermediateStopovers(leg: TransitLeg): Stopover[] {
    if (leg?.stopovers && leg.stopovers.length > 0) {
      const filtered = leg.stopovers.filter((s: Stopover) => {
        const name = s.stop?.name;
        return Boolean(name) && name !== leg.origin.name && name !== leg.destination.name;
      });
      if (filtered.length > 0) return filtered;
    }

    return this.generateCorridorStopovers(leg);
  }

  private generateCorridorStopovers(leg: TransitLeg): Stopover[] {
    const originName = leg.origin?.name || '';
    const destName = leg.destination?.name || '';
    const depTime = new Date(leg.departure).getTime();
    const arrTime = new Date(leg.arrival).getTime();
    const totalMs = Math.max(60000, arrTime - depTime);

    // Well-known German and Hamburg rail corridors
    const corridorMap: { stations: string[] }[] = [
      { stations: ['Hamburg Hbf', 'Hamburg Dammtor', 'Pinneberg', 'Tornesch', 'Elmshorn', 'Wrist', 'Neumünster', 'Bordesholm', 'Kiel Hbf'] },
      { stations: ['Hamburg Hbf', 'Hamburg Hasselbrook', 'Hamburg-Wandsbek', 'Ahrensburg', 'Bad Oldesloe', 'Reinfeld (Holst)', 'Lübeck Hbf', 'Travemünde Strand'] },
      { stations: ['Hamburg Hbf', 'Hamburg-Harburg', 'Buchholz (Nordheide)', 'Tostedt', 'Rotenburg (Wümme)', 'Bremen Hbf'] },
      { stations: ['Hamburg Hbf', 'Hamburg-Harburg', 'Winsen (Luhe)', 'Lüneburg', 'Bad Bevensen', 'Uelzen', 'Celle', 'Hannover Hbf'] },
      { stations: ['Hamburg Hbf', 'Hamburg-Bergedorf', 'Schwarzenbek', 'Büchen', 'Boizenburg (Elbe)', 'Hagenow Land', 'Schwerin Hbf'] },
      { stations: ['Hamburg Hbf', 'Hamburg-Altona', 'Elmshorn', 'Glückstadt', 'Itzehoe', 'Heide (Holst)', 'Husum', 'Niebüll', 'Westerland (Sylt)'] },
      { stations: ['Hamburg Hbf', 'Hamburg-Harburg', 'Buxtehude', 'Horneburg', 'Stade', 'Cuxhaven'] },
      { stations: ['Hamburg Hbf', 'Hamburg Jungfernstieg', 'Hamburg Stadthausbrücke', 'Hamburg Landungsbrücken', 'Hamburg Reeperbahn', 'Hamburg-Altona'] },
      { stations: ['Hamburg Landungsbrücken', 'Hamburg Altona (Fischmarkt)', 'Dockland', 'Neumühlen (Övelgönne)', 'Bubendey-Ufer', 'Finkenwerder'] }
    ];

    for (const corridor of corridorMap) {
      const oIdx = corridor.stations.findIndex(s => s.toLowerCase() === originName.toLowerCase() || originName.toLowerCase().includes(s.toLowerCase()));
      const dIdx = corridor.stations.findIndex(s => s.toLowerCase() === destName.toLowerCase() || destName.toLowerCase().includes(s.toLowerCase()));

      if (oIdx !== -1 && dIdx !== -1 && Math.abs(dIdx - oIdx) > 1) {
        const step = dIdx > oIdx ? 1 : -1;
        const intermediates: Stopover[] = [];
        const totalSteps = Math.abs(dIdx - oIdx);

        let stepCount = 1;
        for (let i = oIdx + step; i !== dIdx; i += step) {
          const ratio = stepCount / totalSteps;
          const stopTime = new Date(depTime + totalMs * ratio).toISOString();
          intermediates.push({
            stop: { id: `inter-${i}`, name: corridor.stations[i] },
            arrival: stopTime,
            departure: stopTime,
            platform: `${((i % 4) + 1)}`
          });
          stepCount++;
        }
        return intermediates;
      }
    }

    return [];
  }
}
