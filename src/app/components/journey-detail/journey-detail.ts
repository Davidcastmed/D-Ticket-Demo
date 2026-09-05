import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConnectionJourney, TransitLeg, Stopover, Station } from '../../models/transit.models';
import { TransitService } from '../../services/transit.service';
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

@Component({
  selector: 'app-journey-detail',
  imports: [CommonModule, MapView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (journey) {
      @let startPlatform = journey.legs[0]?.departurePlatform || '1';
      @let summary = getJourneyLiveSummary(journey);

      <!-- Fullscreen Container (Didactic, Minimalist & Spacious) -->
      <div
        class="fixed inset-0 z-50 bg-[#FAF7F2] overflow-y-auto flex flex-col text-[#1F1612] animate-in fade-in duration-150"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'Fahrtdetails von ' + journey.origin.name + ' nach ' + journey.destination.name"
      >
        
        <!-- 1. STICKY TOP APP BAR (Only Zurück and Close buttons) -->
        <header class="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E6DED6] px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-xs" role="toolbar" aria-label="Detailansicht Navigation">
          
          <!-- Back button -->
          <button
            type="button"
            id="btn-back-from-detail"
            (click)="closeModal.emit()"
            class="inline-flex items-center gap-2 px-3.5 sm:px-4 py-1.5 bg-[#1B4332] hover:bg-[#132A1E] text-white rounded-full font-black text-xs sm:text-sm shadow-xs transition-all cursor-pointer active:scale-95 group shrink-0"
            title="Zurück zur Verbindungsauswahl"
            aria-label="Zurück zur Verbindungsauswahl"
          >
            <span class="mat-icon text-base sm:text-lg group-hover:-translate-x-0.5 transition-transform" aria-hidden="true">arrow_back</span>
            <span>Zurück</span>
          </button>

          <!-- Real-Time Tracker Indicator -->
          <div class="flex items-center gap-2" role="status" aria-live="polite">
            <div class="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black shadow-2xs border"
              [class.bg-[#EDF9F0]]="summary.phase === 'in_progress'"
              [class.text-[#1B4332]]="summary.phase === 'in_progress'"
              [class.border-[#B7E4C7]]="summary.phase === 'in_progress'"
              [class.bg-[#FAF7F2]]="summary.phase !== 'in_progress'"
              [class.text-[#5D4037]]="summary.phase !== 'in_progress'"
              [class.border-[#E6DED6]]="summary.phase !== 'in_progress'"
            >
              @if (summary.phase === 'in_progress') {
                <span class="relative flex h-2 w-2" aria-hidden="true">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#52B788] opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-[#2D6A4F]"></span>
                </span>
                <span>LIVE ECHTZEIT-TRACKING</span>
              } @else if (summary.phase === 'completed') {
                <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">check_circle</span>
                <span>FAHRT BEENDET</span>
              } @else {
                <span class="mat-icon text-xs text-[#D97706]" aria-hidden="true">schedule</span>
                <span>GEPLANT (START IN {{ summary.minutesUntilStart }} MIN.)</span>
              }
            </div>
          </div>

          <!-- Close icon button -->
          <button
            type="button"
            id="btn-close-detail"
            (click)="closeModal.emit()"
            class="w-8 h-8 rounded-full text-[#5D4037] hover:text-[#1F1612] bg-[#FAF7F2] hover:bg-[#EFEBE6] flex items-center justify-center cursor-pointer transition-colors border border-[#E6DED6] shrink-0"
            title="Schließen"
            aria-label="Fahrtdetail-Ansicht schließen"
          >
            <span class="mat-icon text-base" aria-hidden="true">close</span>
          </button>

        </header>

        <!-- 2. FULLSCREEN MAIN CONTENT (2-Column Grid on Desktop) -->
        <main class="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6">
          <div class="grid grid-cols-1 gap-4 sm:gap-6" [class.lg:grid-cols-12]="showDetailMap()" [class.lg:grid-cols-1]="!showDetailMap()">
            
            <!-- LEFT COLUMN: DIDACTIC ITINERARY & CONNECTION DETAILS -->
            <div class="space-y-3 sm:space-y-4" [class.lg:col-span-7]="showDetailMap()" [class.max-w-3xl]="!showDetailMap()" [class.mx-auto]="!showDetailMap()">
              
              <!-- REAL-TIME LIVE STATUS BANNER (Dynamic Live Position Highlight) -->
              <div class="bg-white rounded-2xl p-3.5 sm:p-4 border border-[#E6DED6] shadow-xs space-y-3" role="region" aria-label="Echtzeit-Fahrtstatus">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                  <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full bg-[#1B4332] text-white flex items-center justify-center shadow-xs" aria-hidden="true">
                      <span class="mat-icon text-base">my_location</span>
                    </div>
                    <div>
                      <div class="text-[10px] font-black uppercase tracking-wider text-[#2D6A4F]">
                        Fahrtstatus in Echtzeit
                      </div>
                      <div class="text-xs sm:text-sm font-black text-[#1F1612]">
                        {{ summary.headline }}
                      </div>
                    </div>
                  </div>

                  <!-- Passed vs Remaining Stations Badge -->
                  <div class="flex items-center gap-2">
                    <span class="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#FAF7F2] border border-[#EDE5DC] text-[#4E342E]">
                      <strong class="text-[#2D6A4F]">{{ summary.passedStopsCount }}</strong> von {{ summary.totalStopsCount }} Stationen passiert
                    </span>
                  </div>
                </div>

                <!-- Live Progress Timeline Bar -->
                <div class="space-y-1">
                  <div class="w-full bg-[#EDE5DC] h-2 rounded-full overflow-hidden" role="progressbar" [attr.aria-valuenow]="summary.progressPercent" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="summary.progressPercent + ' Prozent der Strecke absolviert'">
                    <div
                      class="bg-[#2D6A4F] h-full rounded-full transition-all duration-300"
                      [style.width.%]="summary.progressPercent"
                    ></div>
                  </div>
                  <div class="flex items-center justify-between text-[10px] text-[#795548] font-bold pt-0.5">
                    <span>Start: {{ journey.origin.name }}</span>
                    <span class="text-[#2D6A4F] font-black">{{ summary.progressPercent }}% der Strecke</span>
                    <span>Ziel: {{ journey.destination.name }}</span>
                  </div>
                </div>
              </div>

              <!-- CLEAN & COMPACT SINGLE-LINE JOURNEY SUMMARY -->
              <div class="bg-white rounded-xl px-2.5 sm:px-3 py-1.5 border border-[#E6DED6] shadow-xs flex items-center justify-between gap-1.5 sm:gap-2 text-xs overflow-x-auto select-none no-scrollbar" role="region" aria-label="Routenübersicht">
                <div class="flex items-center gap-1 sm:gap-1.5 shrink-0 flex-nowrap">
                  
                  <!-- Walking badge -->
                  @if (journey.isFromCurrentLocation) {
                    <button
                      type="button"
                      id="btn-summary-walk-badge"
                      (click)="onFocusWalkOnMap()"
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#EDF9F0] hover:bg-[#D8F3DC] text-[#1B4332] font-black text-[11px] shrink-0 border border-[#B7E4C7] transition-all cursor-pointer shadow-2xs hover:scale-105"
                      title="Fußweg auf der Karte anzeigen"
                      aria-label="Fußweg auf der Karte anzeigen"
                    >
                      <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">directions_walk</span>
                      <span>{{ journey.walkToStartMinutes || 5 }}'</span>
                    </button>
                    <span class="text-[#8D6E63] text-[10px] font-bold shrink-0" aria-hidden="true">›</span>
                  }

                  <!-- Train / Transit Legs and Transfers -->
                  @for (leg of journey.legs; track $index; let i = $index) {
                    <div
                      class="px-1.5 py-0.5 rounded-md text-[11px] font-black flex items-center gap-1 shadow-2xs border shrink-0 whitespace-nowrap"
                      [class]="getLegBadgeClass(leg)"
                    >
                      <span class="mat-icon text-xs" aria-hidden="true">{{ getLegVehicleIcon(leg) }}</span>
                      <span>{{ leg.line?.name || 'Bahn' }}</span>
                      @if (leg.departurePlatform) {
                        <span class="text-[9px] font-normal opacity-90">Gl. {{ leg.departurePlatform }}</span>
                      }
                    </div>

                    @if (i < journey.legs.length - 1) {
                      <span class="text-[#8D6E63] text-[10px] font-bold shrink-0" aria-hidden="true">›</span>
                      <div
                        class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#FFF3CD] text-[#856404] font-black text-[10px] shrink-0 border border-[#FFE082]"
                        title="Umsteigezeit"
                        [attr.aria-label]="'Umsteigezeit ' + (journey.transferDetails[i]?.bufferMinutes || 8) + ' Minuten'"
                      >
                        <span class="mat-icon text-[11px]" aria-hidden="true">sync_alt</span>
                        <span>{{ journey.transferDetails[i]?.bufferMinutes || 8 }}'</span>
                      </div>
                      <span class="text-[#8D6E63] text-[10px] font-bold shrink-0" aria-hidden="true">›</span>
                    }
                  }

                  <span class="text-[#8D6E63] text-[10px] font-bold shrink-0" aria-hidden="true">›</span>

                  <!-- Final Destination -->
                  <div class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#FAF7F2] text-[#1F1612] font-black shrink-0 text-[11px] border border-[#E6DED6]">
                    <span class="mat-icon text-xs text-[#9A2218]" aria-hidden="true">place</span>
                    <span class="truncate max-w-[110px] sm:max-w-[170px]">{{ journey.destination.name }}</span>
                    <span class="text-[9px] text-[#795548] font-normal">({{ formatTime(journey.arrival) }})</span>
                  </div>

                </div>

                <!-- Total Duration Badge -->
                <span class="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#2D6A4F] bg-[#EDF9F0] px-1.5 py-0.5 rounded-md border border-[#B7E4C7] shrink-0 whitespace-nowrap">
                  <span class="mat-icon text-[11px]" aria-hidden="true">schedule</span>
                  <span>{{ journey.durationFormatted }}</span>
                </span>
              </div>

              <!-- DIDACTIC LIVE ACCESSIBILITY & ELEVATOR MONITOR ON ROUTE -->
              @if (journey.accessibility) {
                @let acc = journey.accessibility;
                <div class="bg-white rounded-2xl p-3.5 sm:p-5 border border-[#E6DED6] shadow-xs space-y-3" role="region" aria-label="Barrierefreiheit auf dieser Route">
                  <div class="flex items-center justify-between pb-2.5 border-b border-[#EDE5DC] flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                      <span class="w-7 h-7 rounded-lg bg-[#EDF9F0] text-[#1B4332] flex items-center justify-center font-bold">
                        <span class="mat-icon text-base">accessible</span>
                      </span>
                      <div>
                        <h2 class="text-xs sm:text-sm font-black text-[#1F1612]">
                          Barrierefreiheit & Aufzugs-Status auf dieser Route
                        </h2>
                        <div class="text-[10px] text-[#795548] font-semibold">
                          Live-Daten der Bahnhöfe & Umstiegsstationen (Hamburg Open Data / DB FaSta)
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      @if (acc.statusType === 'warning') {
                        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-[#FFF3E0] text-[#E65100] border border-[#FFE0B2]">
                          <span class="mat-icon text-sm">warning</span>
                          <span>{{ acc.badgeLabel }}</span>
                        </span>
                      } @else {
                        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-[#EDF9F0] text-[#1B4332] border border-[#B7E4C7]">
                          <span class="mat-icon text-sm text-[#2D6A4F]">verified</span>
                          <span>{{ acc.badgeLabel }}</span>
                        </span>
                      }
                    </div>
                  </div>

                  <!-- Stations list with step-free breakdown -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    @for (note of acc.stationNotes; track note.stationName) {
                      <div
                        class="p-2.5 rounded-xl border text-xs space-y-1"
                        [class.bg-[#FFF8E1]]="note.hasDisruption"
                        [class.border-[#FFE082]]="note.hasDisruption"
                        [class.bg-[#FAF7F2]]="!note.hasDisruption"
                        [class.border-[#E6DED6]]="!note.hasDisruption"
                      >
                        <div class="flex items-center justify-between gap-1.5 font-bold">
                          <span class="text-[#1F1612] truncate">{{ note.stationName }}</span>
                          @if (note.hasDisruption) {
                            <span class="inline-flex items-center gap-0.5 text-[10px] text-[#E65100] shrink-0 font-black">
                              <span class="mat-icon text-[11px]">warning</span>
                              <span>Störung</span>
                            </span>
                          } @else if (note.isStepFree) {
                            <span class="inline-flex items-center gap-0.5 text-[10px] text-[#1B4332] shrink-0 font-bold">
                              <span class="mat-icon text-[11px] text-[#2D6A4F]">check_circle</span>
                              <span>Stufenfrei</span>
                            </span>
                          }
                        </div>
                        <div class="text-[11px] text-[#795548] leading-relaxed">
                          {{ note.note }}
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- REISEVERLAUF & INTERMEDIATE STATIONS WITH REAL-TIME COLOR DISTINCTION -->
              <div class="bg-white rounded-2xl p-3.5 sm:p-5 border border-[#E6DED6] shadow-xs space-y-4" role="region" aria-label="Reiseverlauf und Haltestellen">
                
                <div class="flex items-center justify-between pb-2.5 border-b border-[#EDE5DC]">
                  <div class="flex items-center gap-2">
                    <span class="mat-icon text-[#2D6A4F] text-lg sm:text-xl" aria-hidden="true">alt_route</span>
                    <div>
                      <h2 class="text-xs sm:text-sm font-black text-[#1F1612]">
                        Stationen & Zwischenhalte
                      </h2>
                      <div class="text-[10px] text-[#795548] font-semibold">
                        Farbig = Kommende Stationen • Abgeblendet = Bereits passiert
                      </div>
                    </div>
                  </div>

                  <!-- Legend: Passed vs Current vs Upcoming -->
                  <div class="hidden sm:flex items-center gap-2 text-[10px]">
                    <span class="flex items-center gap-1 text-[#8D6E63]">
                      <span class="w-2 h-2 rounded-full bg-[#A1887F] opacity-50"></span>
                      <span>Passiert</span>
                    </span>
                    <span class="flex items-center gap-1 font-black text-[#2D6A4F]">
                      <span class="w-2 h-2 rounded-full bg-[#2D6A4F] animate-ping"></span>
                      <span>Aktuell</span>
                    </span>
                    <span class="flex items-center gap-1 font-bold text-[#1F1612]">
                      <span class="w-2 h-2 rounded-full bg-[#2D6A4F]"></span>
                      <span>Kommend</span>
                    </span>
                  </div>
                </div>

                <!-- STEP-BY-STEP VERTICAL FLOW -->
                <div class="space-y-4 pt-0.5">
                  
                  <!-- STEP 0: WALKING NODE -->
                  @if (journey.isFromCurrentLocation) {
                    <div class="space-y-1">
                      <div class="flex items-center gap-2.5 text-xs">
                        <button
                          type="button"
                          id="btn-walk-location-node"
                          (click)="onFocusWalkOnMap()"
                          class="w-5 h-5 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white flex items-center justify-center shrink-0 shadow-2xs text-[10px] cursor-pointer transition-all hover:scale-110"
                          title="Fußweg auf der Karte vergrößern"
                          aria-label="Fußweg auf der Karte vergrößern"
                        >
                          <span class="mat-icon text-xs" aria-hidden="true">my_location</span>
                        </button>

                        <div class="flex-1 flex items-center justify-between gap-1.5 flex-wrap sm:flex-nowrap bg-[#EDF9F0] px-2.5 py-1 rounded-lg border border-[#B7E4C7]">
                          <div class="flex items-center gap-1.5 min-w-0">
                            <span class="font-bold text-[#1B4332] truncate text-[11px]">
                              🚶 {{ journey.walkToStartMinutes || 5 }} Min. Fußweg ({{ formatDistance(journey.walkToStartDistanceMeters) }}) ab {{ getOriginAddressLabel(journey) }}
                            </span>
                            <span class="text-[10px] text-[#2D6A4F] font-semibold hidden md:inline shrink-0">
                              • Losgehen um {{ getLeaveTimeRecommendation(journey, journey.walkToStartMinutes || 5) }} Uhr
                            </span>
                          </div>

                          <button
                            type="button"
                            id="btn-step-walk-trajectory"
                            (click)="onFocusWalkOnMap()"
                            class="text-[10px] font-black text-[#1B4332] hover:text-[#2D6A4F] bg-white px-1.5 py-0.5 rounded border border-[#B7E4C7] shrink-0 cursor-pointer shadow-2xs flex items-center gap-0.5"
                            title="Auf Karte anzeigen"
                            aria-label="Fußweg auf Karte anzeigen"
                          >
                            <span class="mat-icon text-[11px] text-[#2D6A4F]" aria-hidden="true">map</span>
                            <span>Karte</span>
                          </button>
                        </div>
                      </div>

                      <div class="ml-2.5 pl-4 border-l-2 border-dashed border-[#2D6A4F]/40 py-0.5 text-[10px] text-[#2D6A4F] font-medium flex items-center gap-1">
                        <span class="mat-icon text-[11px]" aria-hidden="true">arrow_downward</span>
                        <span>Ankunft Gleis {{ startPlatform }} ({{ journey.origin.name }})</span>
                      </div>
                    </div>
                  }

                  <!-- TRANSIT LEGS LOOP -->
                  @for (leg of journey.legs; track $index) {
                    @let legIndex = $index;
                    @let isLast = $index === journey.legs.length - 1;
                    @let stops = getEnrichedLegStopovers(leg);
                    @let trainDetailsOpen = isTrainDetailsOpen($index);
                    @let originStatus = getStationStatus(leg.origin.name, leg.departure, leg, 'origin');
                    @let destStatus = getStationStatus(leg.destination.name, leg.arrival, leg, 'destination');

                    <!-- 1. DEPARTURE / BOARDING STATION -->
                    <div
                      class="flex items-start gap-3 transition-all duration-200"
                      [class.opacity-40]="originStatus === 'passed'"
                      [class.grayscale]="originStatus === 'passed'"
                    >
                      <!-- Station Status Icon / Number Node -->
                      <div
                        class="w-7 h-7 rounded-full text-white flex items-center justify-center shrink-0 shadow-2xs text-xs font-black transition-all"
                        [class.bg-[#2D6A4F]]="originStatus !== 'passed'"
                        [class.bg-[#795548]]="originStatus === 'passed'"
                        [class.ring-4]="originStatus === 'current'"
                        [class.ring-[#52B788]/40]="originStatus === 'current'"
                      >
                        @if (originStatus === 'passed') {
                          <span class="mat-icon text-sm" aria-hidden="true">check</span>
                        } @else if (originStatus === 'current') {
                          <span class="mat-icon text-sm animate-pulse" aria-hidden="true">radio_button_checked</span>
                        } @else {
                          {{ $index + 1 }}
                        }
                      </div>

                      <!-- Station Content Card -->
                      <div
                        class="flex-1 p-3 rounded-xl border transition-all"
                        [class.bg-[#FAF7F2]]="originStatus !== 'current'"
                        [class.bg-[#EDF9F0]]="originStatus === 'current'"
                        [class.border-[#EDE5DC]]="originStatus !== 'current'"
                        [class.border-[#2D6A4F]]="originStatus === 'current'"
                        [class.shadow-sm]="originStatus === 'current'"
                      >
                        <div class="flex items-center justify-between gap-2">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-xs sm:text-sm font-black text-[#1F1612]">{{ leg.origin.name }}</span>
                            @if (originStatus === 'passed') {
                              <span class="text-[10px] font-bold text-[#8D6E63] bg-[#EFEBE6] px-1.5 py-0.5 rounded">
                                ✓ Abgefahren
                              </span>
                            } @else if (originStatus === 'current') {
                              <span class="text-[10px] font-black text-[#1B4332] bg-white px-2 py-0.5 rounded-full border border-[#B7E4C7] shadow-2xs animate-pulse flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#2D6A4F]"></span>
                                <span>ABFAHRT HIER</span>
                              </span>
                            }
                          </div>
                          <span class="text-xs sm:text-sm font-black text-[#1F1612]">{{ formatTime(leg.departure) }}</span>
                        </div>

                        <div class="flex items-center justify-between gap-2 text-[11px] text-[#795548] mt-1 flex-wrap">
                          <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded bg-white border border-[#E6DED6] font-bold text-[#1B4332]">
                              Gleis {{ leg.departurePlatform || '1' }}
                            </span>
                            @if (leg.departureDelay && leg.departureDelay > 0) {
                              <span class="font-bold text-[#E65100] bg-[#FFF3E0] px-1.5 py-0.5 rounded border border-[#FFE082]">
                                +{{ leg.departureDelay }} Min. Verspätung
                              </span>
                            } @else {
                              <span class="text-[#2D6A4F] font-bold">Pünktlich</span>
                            }
                          </div>

                          <span class="text-[10px] font-bold text-[#5D4037]">
                            Einstiegsbahnhof
                          </span>
                        </div>
                      </div>
                    </div>

                    <!-- 2. TRANSIT RIDE & INTERMEDIATE STATIONS (Recognized & Distinctly Styled) -->
                    <div class="ml-3.5 pl-6 border-l-2 border-[#2D6A4F]/40 py-2 space-y-3">
                      
                      <!-- Line Badge, Mode and Direction -->
                      <div class="flex items-center justify-between gap-2 flex-wrap bg-white p-2.5 rounded-xl border border-[#E6DED6]">
                        <div class="flex items-center gap-2">
                          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-black text-white shadow-2xs" [class]="getLegBadgeClass(leg)">
                            <span class="mat-icon text-xs" aria-hidden="true">{{ getLegVehicleIcon(leg) }}</span>
                            <span>{{ leg.line?.name || 'Zug' }}</span>
                          </span>
                          <span class="text-xs font-bold text-[#1F1612]">
                            Richtung {{ leg.direction || leg.destination.name }}
                          </span>
                        </div>

                        <span class="text-[11px] font-bold text-[#5D4037] bg-[#FAF7F2] px-2.5 py-0.5 rounded border border-[#E6DED6]">
                          {{ formatDuration(leg.durationMinutes || 0) }} Fahrt
                        </span>
                      </div>

                      <!-- Intermediate Stops Block (Zwischenhalte with Passed vs Current vs Upcoming) -->
                      @if (stops.length > 0) {
                        <div class="bg-[#FAF7F2] p-2.5 sm:p-3 rounded-xl border border-[#EDE5DC] space-y-2">
                          <div class="flex items-center justify-between text-xs font-black text-[#2D6A4F]">
                            <span class="flex items-center gap-1.5">
                              <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">alt_route</span>
                              <span>{{ stops.length }} Zwischenstationen auf dieser Strecke</span>
                            </span>

                            <button
                              type="button"
                              (click)="toggleIntermediateStops(legIndex)"
                              class="text-[11px] text-[#795548] hover:text-[#1F1612] font-bold flex items-center gap-0.5 cursor-pointer bg-white px-2 py-0.5 rounded border border-[#E6DED6]"
                              [attr.aria-expanded]="isStopsOpen(legIndex)"
                              [attr.aria-label]="isStopsOpen(legIndex) ? 'Zwischenhalte einklappen' : 'Zwischenhalte einblenden'"
                            >
                              <span>{{ isStopsOpen(legIndex) ? 'Einklappen' : 'Details anzeigen' }}</span>
                              <span class="mat-icon text-xs transition-transform" [class.rotate-180]="isStopsOpen(legIndex)" aria-hidden="true">expand_more</span>
                            </button>
                          </div>

                          <!-- Explicit list of intermediate stations with real-time distinction -->
                          @if (isStopsOpen(legIndex)) {
                            <div class="space-y-1.5 pt-1.5 animate-in fade-in duration-150">
                              @for (stop of stops; track stop.stop.name) {
                                <div
                                  class="flex items-center justify-between p-2 rounded-lg text-xs transition-all border"
                                  [class.opacity-40]="stop.status === 'passed'"
                                  [class.grayscale]="stop.status === 'passed'"
                                  [class.bg-white]="stop.status === 'upcoming'"
                                  [class.border-[#E6DED6]]="stop.status === 'upcoming' || stop.status === 'passed'"
                                  [class.bg-[#EDF9F0]]="stop.status === 'current'"
                                  [class.border-[#2D6A4F]]="stop.status === 'current'"
                                  [class.shadow-2xs]="stop.status === 'current'"
                                >
                                  <!-- Stop Name and Status Indicator -->
                                  <div class="flex items-center gap-2 min-w-0">
                                    <!-- Node marker -->
                                    <div
                                      class="w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[9px] font-black text-white"
                                      [class.bg-[#795548]]="stop.status === 'passed'"
                                      [class.bg-[#2D6A4F]]="stop.status !== 'passed'"
                                    >
                                      @if (stop.status === 'passed') {
                                        <span class="mat-icon text-[10px]" aria-hidden="true">check</span>
                                      } @else if (stop.status === 'current') {
                                        <span class="w-2 h-2 rounded-full bg-white animate-ping"></span>
                                      } @else {
                                        <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
                                      }
                                    </div>

                                    <div class="min-w-0">
                                      <div class="flex items-center gap-1.5 flex-wrap">
                                        <span
                                          class="font-bold truncate text-xs"
                                          [class.text-[#1F1612]]="stop.status !== 'passed'"
                                          [class.text-[#795548]]="stop.status === 'passed'"
                                        >
                                          {{ stop.stop.name }}
                                        </span>

                                        <!-- Status Badge -->
                                        @if (stop.status === 'passed') {
                                          <span class="text-[9px] font-semibold text-[#8D6E63] bg-[#EFEBE6] px-1.5 py-0.2 rounded">
                                            ✓ Passiert
                                          </span>
                                        } @else if (stop.status === 'current') {
                                          <span class="text-[9px] font-black text-[#1B4332] bg-white px-2 py-0.5 rounded-full border border-[#B7E4C7] shadow-2xs animate-pulse flex items-center gap-1">
                                            <span class="mat-icon text-[10px] text-[#2D6A4F]" aria-hidden="true">train</span>
                                            <span>NÄCHSTER HALT {{ stop.minutesRemaining !== undefined ? '(in ' + stop.minutesRemaining + ' Min.)' : '' }}</span>
                                          </span>
                                        } @else {
                                          <span class="text-[9px] font-bold text-[#2D6A4F] bg-[#EDF9F0] px-1.5 py-0.2 rounded">
                                            Kommend
                                          </span>
                                        }
                                      </div>
                                    </div>
                                  </div>

                                  <!-- Time and Platform -->
                                  <div class="flex items-center gap-2 text-[10px] shrink-0">
                                    @if (stop.arrival || stop.departure) {
                                      <span class="font-black" [class.text-[#1F1612]]="stop.status !== 'passed'" [class.text-[#795548]]="stop.status === 'passed'">
                                        {{ formatTime(stop.departure || stop.arrival || '') }}
                                      </span>
                                    }
                                    @if (stop.platform) {
                                      <span class="px-1.5 py-0.5 rounded bg-[#FAF7F2] border border-[#E6DED6] font-medium text-[#4E342E]">
                                        Gl. {{ stop.platform }}
                                      </span>
                                    }
                                  </div>
                                </div>
                              }
                            </div>
                          }
                        </div>
                      }

                      <!-- Train Features and Amenities -->
                      <div>
                        <button
                          type="button"
                          (click)="toggleTrainDetails(legIndex)"
                          class="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#5D4037] hover:text-[#1F1612] bg-white hover:bg-[#FAF7F2] px-2.5 py-1 rounded-lg border border-[#E6DED6] transition-colors cursor-pointer"
                          [attr.aria-expanded]="trainDetailsOpen"
                          [attr.aria-label]="trainDetailsOpen ? 'Zugdetails schließen' : 'Zugausstattung und Betreiber anzeigen'"
                        >
                          <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">tune</span>
                          <span>{{ trainDetailsOpen ? 'Zugdetails schließen' : 'Zugausstattung & Betreiber' }}</span>
                          <span class="mat-icon text-xs transition-transform" [class.rotate-180]="trainDetailsOpen" aria-hidden="true">expand_more</span>
                        </button>

                        @if (trainDetailsOpen) {
                          <div class="mt-2 p-3 bg-white rounded-xl border border-[#E6DED6] shadow-2xs space-y-2 animate-in fade-in duration-150">
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#5D4037]">
                              <div class="flex items-center gap-1.5">
                                <span class="mat-icon text-xs text-[#8D6E63]" aria-hidden="true">business</span>
                                <span>Betreiber: <strong class="text-[#1F1612]">{{ getLegOperator(leg) }}</strong></span>
                              </div>
                              <div class="flex items-center gap-1.5">
                                <span class="mat-icon text-xs text-[#8D6E63]" aria-hidden="true">train</span>
                                <span>Fahrzeug: <strong class="text-[#1F1612]">{{ getLegVehicleType(leg) }}</strong></span>
                              </div>
                            </div>

                            <div class="pt-1.5 border-t border-[#F5EFE6] grid grid-cols-2 gap-1.5">
                              @for (item of getLegAmenities(); track item.title) {
                                <div class="flex items-center gap-1.5 text-[11px] text-[#4E342E]">
                                  <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">{{ item.icon }}</span>
                                  <span class="font-medium">{{ item.title }}</span>
                                </div>
                              }
                            </div>
                          </div>
                        }
                      </div>

                    </div>

                    <!-- 3. ARRIVAL / INTERCHANGE STATION -->
                    <div
                      class="flex items-start gap-3 transition-all duration-200"
                      [class.opacity-40]="destStatus === 'passed'"
                      [class.grayscale]="destStatus === 'passed'"
                    >
                      <div
                        class="w-7 h-7 rounded-full text-white flex items-center justify-center shrink-0 shadow-2xs text-xs font-black"
                        [class.bg-[#D97706]]="!isLast && destStatus !== 'passed'"
                        [class.bg-[#C8372D]]="isLast && destStatus !== 'passed'"
                        [class.bg-[#795548]]="destStatus === 'passed'"
                        [class.ring-4]="destStatus === 'current'"
                        [class.ring-[#52B788]/40]="destStatus === 'current'"
                      >
                        @if (destStatus === 'passed') {
                          <span class="mat-icon text-sm" aria-hidden="true">check</span>
                        } @else {
                          <span class="mat-icon text-sm" aria-hidden="true">{{ isLast ? 'place' : 'sync_alt' }}</span>
                        }
                      </div>

                      <div
                        class="flex-1 p-3.5 rounded-xl border space-y-1 transition-all"
                        [class.bg-[#FAF7F2]]="destStatus !== 'current'"
                        [class.bg-[#EDF9F0]]="destStatus === 'current'"
                        [class.border-[#EDE5DC]]="destStatus !== 'current'"
                        [class.border-[#2D6A4F]]="destStatus === 'current'"
                        [class.shadow-sm]="destStatus === 'current'"
                      >
                        <div class="flex items-center justify-between gap-2">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-xs sm:text-sm font-black text-[#1F1612]">{{ leg.destination.name }}</span>
                            @if (destStatus === 'passed') {
                              <span class="text-[10px] font-bold text-[#8D6E63] bg-[#EFEBE6] px-1.5 py-0.5 rounded">
                                ✓ Erreicht
                              </span>
                            } @else if (destStatus === 'current') {
                              <span class="text-[10px] font-black text-[#1B4332] bg-white px-2 py-0.5 rounded-full border border-[#B7E4C7] shadow-2xs animate-pulse flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#2D6A4F]"></span>
                                <span>ZIEL IN KÜRZE</span>
                              </span>
                            }
                          </div>
                          <span class="text-xs sm:text-sm font-black text-[#1F1612]">{{ formatTime(leg.arrival) }}</span>
                        </div>

                        <div class="flex items-center justify-between gap-2 text-[11px] text-[#795548] flex-wrap pt-0.5">
                          <span class="px-2 py-0.5 rounded bg-white border border-[#E6DED6] font-bold text-[#1B4332]">
                            Ankunft Gleis {{ leg.arrivalPlatform || '1' }}
                          </span>

                          @if (!isLast && journey.transferDetails[legIndex]) {
                            <span class="inline-flex items-center gap-1 font-black text-[#B45309] bg-[#FFF8E1] px-2.5 py-0.5 rounded-lg border border-[#FFE082]">
                              <span class="mat-icon text-xs" aria-hidden="true">schedule</span>
                              <span>{{ journey.transferDetails[legIndex].bufferMinutes }}' Umstiegszeit zu Gl. {{ journey.legs[legIndex + 1]?.departurePlatform || '2' }}</span>
                            </span>
                          }
                        </div>
                      </div>
                    </div>

                  }

                </div>

              </div>

              <!-- BOTTOM BACK BUTTON -->
              <div class="pt-2 flex items-center justify-center">
                <button
                  type="button"
                  id="btn-bottom-back-action"
                  (click)="closeModal.emit()"
                  class="px-6 py-2.5 bg-[#1B4332] hover:bg-[#132A1E] text-white rounded-full font-black text-xs sm:text-sm shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-95 flex items-center gap-2"
                  aria-label="Zurück zur Verbindungsauswahl"
                >
                  <span class="mat-icon text-base" aria-hidden="true">arrow_back</span>
                  <span>Zurück zur Verbindungsauswahl</span>
                </button>
              </div>

            </div>

            <!-- RIGHT COLUMN: INTERACTIVE MAP & ROUTE TRAJECTORY (Sticky on Desktop) -->
            @if (showDetailMap()) {
              <div class="space-y-3 lg:col-span-5">
                <div class="sticky top-20 space-y-2">
                  <div class="flex items-center justify-between px-1">
                    <div class="flex items-center gap-2">
                      <span class="mat-icon text-[#2D6A4F] text-base">map</span>
                      <span class="text-xs font-black uppercase tracking-wider text-[#4E342E]">
                        Fahrstrecke & Live-Position
                      </span>
                    </div>
                    <span class="text-[11px] text-[#8D6E63] font-semibold">Interaktive Karte</span>
                  </div>

                  <!-- Leaflet Map Box -->
                  <div id="journey-detail-map-container" class="h-[380px] sm:h-[480px] lg:h-[calc(100vh-140px)] w-full rounded-2xl overflow-hidden border border-[#E6DED6] shadow-sm">
                    <app-map-view
                      [activeJourney]="journey"
                      [focusTarget]="mapFocusTarget()"
                    ></app-map-view>
                  </div>
                </div>
              </div>
            }

          </div>
        </main>

      </div>
    }
  `
})
export class JourneyDetail implements OnInit, OnDestroy {
  @Input() journey: ConnectionJourney | null = null;
  @Output() closeModal = new EventEmitter<void>();
  @Output() showOnMap = new EventEmitter<ConnectionJourney>();

  private transitService = inject(TransitService);

  readonly showDetailMap = signal<boolean>(true);
  readonly mapFocusTarget = signal<'all' | 'walk' | 'route'>('all');
  readonly openTrainDetailsMap = signal<Record<number, boolean>>({});
  readonly openIntermediateStopsMap = signal<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true, 4: true });

  // Real-time tracking clock signal (updates every 2 seconds with true system clock)
  readonly currentRealTimestamp = signal<number>(Date.now());

  private timerHandle: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      this.timerHandle = setInterval(() => {
        this.currentRealTimestamp.set(Date.now());
      }, 2000);
    }
  }

  ngOnDestroy(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  getOriginAddressLabel(journey: ConnectionJourney): string {
    if (journey.startStreetNumber) return journey.startStreetNumber;
    if (this.transitService.userStreetNumber()) return this.transitService.userStreetNumber()!;
    if (journey.startAddress) return journey.startAddress;
    if (this.transitService.userAddress()) return this.transitService.userAddress()!;
    return 'Aktueller Standort';
  }

  toggleMap(): void {
    this.showDetailMap.update(v => !v);
  }

  onFocusWalkOnMap(): void {
    this.showDetailMap.set(true);
    this.mapFocusTarget.set('walk');
    if (!this.transitService.userLocation()) {
      this.transitService.requestGeolocation(true);
    }
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        const el = document.getElementById('journey-detail-map-container');
        if (el && window.innerWidth < 1024) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }

  toggleTrainDetails(index: number): void {
    this.openTrainDetailsMap.update(map => ({
      ...map,
      [index]: !map[index]
    }));
  }

  isTrainDetailsOpen(index: number): boolean {
    return Boolean(this.openTrainDetailsMap()[index]);
  }

  toggleIntermediateStops(index: number): void {
    this.openIntermediateStopsMap.update(map => ({
      ...map,
      [index]: !map[index]
    }));
  }

  isStopsOpen(index: number): boolean {
    return this.openIntermediateStopsMap()[index] !== false;
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

  getLegVehicleIcon(leg: TransitLeg): string {
    const name = leg.line?.name || '';
    const mode = (leg.line?.mode || '').toLowerCase();
    const product = (leg.line?.product || '').toLowerCase();
    if (name.startsWith('S') || product === 'suburban') return 'directions_subway';
    if (name.startsWith('U') || product === 'subway') return 'subway';
    if (name.startsWith('Bus') || mode === 'bus' || product === 'bus') return 'directions_bus';
    if (name.startsWith('Fähre') || mode === 'ferry' || product === 'ferry') return 'directions_boat';
    if (name.startsWith('Tram') || name.startsWith('Str') || product === 'tram') return 'tram';
    if (name.startsWith('ICE') || name.startsWith('IC')) return 'speed';
    return 'directions_railway';
  }

  getLegBadgeClass(leg: TransitLeg): string {
    const name = (leg.line?.name || '').toUpperCase();
    const product = (leg.line?.product || '').toLowerCase();
    const mode = (leg.line?.mode || '').toLowerCase();

    if (name.startsWith('RE')) return 'bg-[#C8372D] text-white border-[#A32A22]';
    if (name.startsWith('RB')) return 'bg-[#2D6A4F] text-white border-[#1B4332]';
    if (name.startsWith('ME')) return 'bg-[#1E3A8A] text-white border-[#172554]';
    if (name.startsWith('ERX') || name.startsWith('ENNO')) return 'bg-[#D97706] text-white border-[#B45309]';
    if (name.startsWith('S') || product === 'suburban') return 'bg-[#00854A] text-white border-[#006837]';
    if (name.startsWith('U') || product === 'subway') return 'bg-[#004B87] text-white border-[#003865]';
    if (name.startsWith('FÄHRE') || name.startsWith('HADAG') || mode === 'ferry') return 'bg-[#009EE0] text-white border-[#0080B5]';
    if (name.startsWith('BUS') || product === 'bus' || mode === 'bus') return 'bg-[#800020] text-white border-[#600018]';
    return 'bg-[#3E2723] text-white border-[#4E342E]';
  }

  getLegOperator(leg: TransitLeg): string {
    if (leg.line?.operator?.name) {
      return leg.line.operator.name;
    }
    const lineName = (leg.line?.name || '').toUpperCase();
    const product = (leg.line?.product || '').toLowerCase();
    const mode = (leg.line?.mode || '').toLowerCase();

    if (lineName.startsWith('ME') || lineName.includes('METRONOM')) return 'metronom Eisenbahn GmbH';
    if (lineName.startsWith('ERX') || lineName.includes('ERIXX') || lineName.includes('ENNO')) return 'erixx GmbH';
    if (lineName.startsWith('AKN') || lineName.startsWith('A1') || lineName.startsWith('A2')) return 'AKN Eisenbahn GmbH';
    if (lineName.startsWith('NBE') || lineName.includes('NORDBAHN')) return 'nordbahn Eisenbahngesellschaft';
    if (lineName.startsWith('S') || product === 'suburban') return 'S-Bahn Hamburg GmbH (DB)';
    if (lineName.startsWith('U') || product === 'subway') return 'Hamburger Hochbahn AG (HHA)';
    if (lineName.startsWith('FÄHRE') || lineName.startsWith('HADAG') || mode === 'ferry') return 'HADAG Hafenfähre AG';
    if (lineName.startsWith('RE') || lineName.startsWith('RB')) return 'DB Regio AG (NAH.SH / Nord)';
    return 'Deutsche Bahn AG';
  }

  getLegVehicleType(leg: TransitLeg): string {
    const lineName = (leg.line?.name || '').toUpperCase();
    const product = (leg.line?.product || '').toLowerCase();

    if (lineName.startsWith('RE1')) return 'Hanse-Express (Doppelstock BR 146)';
    if (lineName.startsWith('RE7') || lineName.startsWith('RE70')) return 'Stadler KISS / FLIRT (Doppelstock)';
    if (lineName.startsWith('RE8') || lineName.startsWith('RE80') || lineName.startsWith('RB81')) return 'Alstom Coradia LINT / Doppelstock';
    if (lineName.startsWith('ME')) return 'Bombardier Twindexx (metronom)';
    if (lineName.startsWith('S') || product === 'suburban') return 'Baureihe 490 (S-Bahn Hamburg)';
    if (lineName.startsWith('U') || product === 'subway') return 'DT5 U-Bahn (Hochbahn)';
    return 'Klimatisierter Regionalzug';
  }

  getLegAmenities(): { icon: string; title: string }[] {
    return [
      { icon: 'pedal_bike', title: 'Fahrradmitnahme möglich' },
      { icon: 'ac_unit', title: 'Klimatisiert' },
      { icon: 'wifi', title: 'Kostenloses WLAN' },
      { icon: 'accessible', title: 'Barrierefreier Einstieg' }
    ];
  }

  // Calculate live journey progress and station status
  getStationStatus(
    _stationName: string,
    stationIsoTime: string,
    leg: TransitLeg,
    type: 'origin' | 'stopover' | 'destination'
  ): StationStatus {
    const now = this.currentRealTimestamp();
    const stationMs = new Date(stationIsoTime).getTime();
    const legDepMs = new Date(leg.departure).getTime();
    const legArrMs = new Date(leg.arrival).getTime();

    if (type === 'origin') {
      if (now >= legDepMs) return 'passed';
      if (legDepMs - now <= 180000) return 'current'; // Within 3 min of departure
      return 'upcoming';
    }

    if (type === 'destination') {
      if (now >= legArrMs) return 'passed';
      if (now >= legDepMs && legArrMs - now <= 300000) return 'current'; // Underway approaching destination
      return 'upcoming';
    }

    // Stopover
    if (now > stationMs + 45000) return 'passed';
    if (now >= stationMs - 120000 && now <= stationMs + 45000) return 'current'; // Currently at or approaching this stop
    return 'upcoming';
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

  getJourneyLiveSummary(journey: ConnectionJourney) {
    const now = this.currentRealTimestamp();
    const startMs = new Date(journey.departure).getTime();
    const endMs = new Date(journey.arrival).getTime();

    // Total stations count across all legs
    let totalStops = 0;
    let passedStops = 0;
    let activeVehicleName = journey.legs[0]?.line?.name || 'Zug';
    let nextStationName = journey.destination.name;
    let nextMinutes = 0;

    for (const leg of journey.legs) {
      const stops = this.getLegIntermediateStopovers(leg);
      totalStops += 2 + stops.length; // origin + destination + stops

      const legDep = new Date(leg.departure).getTime();
      const legArr = new Date(leg.arrival).getTime();

      if (now >= legDep) passedStops++;
      for (const s of stops) {
        const sTime = new Date(s.departure || s.arrival || leg.departure).getTime();
        if (now >= sTime) {
          passedStops++;
        } else if (!nextStationName || nextStationName === journey.destination.name) {
          nextStationName = s.stop.name;
          nextMinutes = Math.max(1, Math.round((sTime - now) / 60000));
          activeVehicleName = leg.line?.name || activeVehicleName;
        }
      }
      if (now >= legArr) passedStops++;
    }

    let phase: 'not_started' | 'in_progress' | 'completed' = 'not_started';
    let progressPercent = 0;
    let headline = '';
    const minutesUntilStart = Math.max(0, Math.round((startMs - now) / 60000));

    if (now < startMs) {
      phase = 'not_started';
      progressPercent = 0;
      headline = `Fahrt beginnt um ${this.formatTime(journey.departure)} Uhr (in ${minutesUntilStart} Min.) ab ${journey.origin.name}`;
    } else if (now >= endMs) {
      phase = 'completed';
      progressPercent = 100;
      headline = `Ziel ${journey.destination.name} erreicht (Ankunft ${this.formatTime(journey.arrival)} Uhr)`;
    } else {
      phase = 'in_progress';
      const elapsed = now - startMs;
      const total = endMs - startMs;
      progressPercent = Math.min(99, Math.max(1, Math.round((elapsed / total) * 100)));
      headline = `${activeVehicleName} live unterwegs • Nächster Halt: ${nextStationName} (in ca. ${nextMinutes || 2} Min.)`;
    }

    return {
      phase,
      progressPercent,
      headline,
      minutesUntilStart,
      totalStopsCount: totalStops,
      passedStopsCount: Math.min(totalStops, passedStops)
    };
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

  getLeaveTimeRecommendation(journey: ConnectionJourney, walkMinutes: number): string {
    try {
      const depDate = new Date(journey.departure);
      if (!isNaN(depDate.getTime())) {
        const leaveDate = new Date(depDate.getTime() - (walkMinutes + 3) * 60000);
        return leaveDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      }
    } catch {
      // fallback
    }
    return '10 Min. vor Abfahrt';
  }
}


