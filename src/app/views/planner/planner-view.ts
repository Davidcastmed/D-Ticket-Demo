import {
  Component,
  EventEmitter,
  Output,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  AfterViewInit,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Station, ConnectionJourney, TransitLeg, Stopover, RouteAccessibilitySummary } from '../../models/transit.models';
import { TransitService } from '../../services/transit.service';
import { WeatherService } from '../../services/weather.service';
import { ALL_GERMAN_STATIONS } from '../../data/stations-data';
import { StationInput } from '../../components/station-input/station-input';
import { MapView } from '../../components/map/map-view';

export interface NearbyStationDisplay extends Station {
  distKm: number;
  distanceText: string;
  walkMinutes: number;
}

function calculatePreciseDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface CuratedDestination {
  name: string;
  stationName: string;
  stationId: string;
  lat: number;
  lon: number;
  category: 'kueste' | 'natur' | 'kultur';
  categoryLabel: string;
  line: string;
  duration: string;
  description: string;
}

@Component({
  selector: 'app-planner-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, StationInput, MapView],
  template: `
    <div class="space-y-5">
      
      <!-- PRIMARY GRID LAYOUT: Connection Planner & Results (Left) + 'Entdecke Deutschland' Highlights (Right) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        <!-- LEFT COLUMN: Minimalist Connection Planner & Direct Results underneath -->
        <div class="lg:col-span-7 space-y-5">
          <!-- CARD 1: Minimalist Connection Planner (White container as unified background - maximum width & space) -->
          <div id="planner-card" class="relative bg-white rounded-2xl border border-[#E6DED6] shadow-xs overflow-visible z-30">
          
            <!-- Eco Badge: centered horizontally in the middle of the main container and floating right on the top line -->
            <div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 px-3 py-0.5 bg-white rounded-full shadow-xs z-20 select-none pointer-events-none">
              <span class="mat-icon text-[13px] text-[#2D6A4F] leading-none">eco</span>
              <span class="tracking-wider text-[10px] font-black uppercase text-[#2D6A4F] leading-none">-80% CO₂ vs. Pkw</span>
            </div>

            <!-- Form Area spanning full width of the white card -->
            <form [formGroup]="searchForm" (ngSubmit)="onSearchSubmit()" class="w-full">
              
              <!-- Route inputs section directly on the white background (no nested borders/margins) -->
              <div class="p-3 sm:p-4 pb-2.5 relative w-full">
                <div class="flex items-stretch relative">
                  
                  <!-- Left route indicator rail (Google Maps style) -->
                  <div class="w-8 sm:w-9 flex flex-col items-center pt-3 pb-3 shrink-0 select-none pointer-events-none mr-1.5 sm:mr-2">
                    <!-- Origin marker: Green circle -->
                    <div class="w-3.5 h-3.5 rounded-full border-2 border-[#2D6A4F] bg-white shrink-0 shadow-2xs"></div>
                    
                    <!-- Intermediate line + via stop dots if any -->
                    @if (viaStations().length > 0) {
                      @for (via of viaStations(); track via.id) {
                        <div class="w-0.5 flex-1 min-h-[14px] bg-[#D7CCC8] my-1"></div>
                        <div class="w-3 h-3 rounded-full border-2 border-[#D97706] bg-white shrink-0 shadow-2xs" title="Zwischenhalt"></div>
                      }
                    }
                    <div class="w-0.5 flex-1 min-h-[18px] bg-[#D7CCC8] my-1"></div>
                    
                    <!-- Destination marker: Dark pin/square -->
                    <div class="w-3.5 h-3.5 rounded-xs bg-[#1F1612] shrink-0 shadow-2xs flex items-center justify-center">
                      <div class="w-1 h-1 bg-white rounded-full"></div>
                    </div>
                  </div>

                  <!-- Text inputs container reaching cleanly edge-to-edge -->
                  <div class="flex-1 min-w-0 pr-10 sm:pr-12">
                    <!-- Start Station (Flush) -->
                    <div>
                      <app-station-input
                        [variant]="'flush'"
                        [showLabel]="false"
                        label=""
                        placeholder="Von (Startbahnhof oder Haltestelle)"
                        iconName=""
                        inputId="input-from-station"
                        [initialStation]="fromStation()"
                        [allowCurrentLocation]="true"
                        [isCursorActive]="activeInput() === 'from'"
                        matchContainerSelector="#planner-card"
                        (stationChange)="onFromStationChange($event)"
                        (queryChange)="fromStationQuery.set($event)"
                        (inputFocus)="activeInput.set('from')"
                      ></app-station-input>
                    </div>

                    <!-- Subtle hairline divider -->
                    <div class="h-px bg-[#EFEBE6] w-full my-0.5"></div>

                    <!-- Intermediate stations (Via) -->
                    @for (via of viaStations(); track via.id; let idx = $index) {
                      <div class="relative flex items-center">
                        <div class="flex-1 min-w-0">
                          <app-station-input
                            [variant]="'flush'"
                            [showLabel]="false"
                            label=""
                            [placeholder]="'Zwischenhalt ' + (viaStations().length > 1 ? (idx + 1) : '') + ' (Bahnhof oder Ort)'"
                            iconName=""
                            [inputId]="'input-via-' + via.id"
                            [initialStation]="via.station"
                            [allowCurrentLocation]="false"
                            [isCursorActive]="activeInput() === via.id"
                            matchContainerSelector="#planner-card"
                            (stationChange)="onViaStationChange(via.id, $event)"
                            (queryChange)="onViaQueryChange(via.id, $event)"
                            (inputFocus)="activeInput.set(via.id)"
                          ></app-station-input>
                        </div>
                        <button
                          type="button"
                          (click)="removeViaStation(via.id)"
                          class="w-7 h-7 rounded-full flex items-center justify-center text-[#8D6E63] hover:text-[#B91C1C] hover:bg-[#FEE2E2] transition-colors cursor-pointer mr-1 shrink-0"
                          title="Zwischenhalt entfernen"
                          aria-label="Zwischenhalt entfernen"
                        >
                          <span class="mat-icon text-base">close</span>
                        </button>
                      </div>
                      <div class="h-px bg-[#EFEBE6] w-full my-0.5"></div>
                    }

                    <!-- Destination Station (Flush) -->
                    <div>
                      <app-station-input
                        [variant]="'flush'"
                        [showLabel]="false"
                        label=""
                        placeholder="Nach (Zielbahnhof oder Ort)"
                        iconName=""
                        inputId="input-to-station"
                        [initialStation]="toStation()"
                        [allowCurrentLocation]="false"
                        [isCursorActive]="activeInput() === 'to'"
                        matchContainerSelector="#planner-card"
                        (stationChange)="onToStationChange($event)"
                        (queryChange)="toStationQuery.set($event)"
                        (inputFocus)="activeInput.set('to')"
                      ></app-station-input>
                    </div>
                  </div>

                  <!-- Right Column Controls: Swap button and subtle Add Via Station button directly below it -->
                  <div class="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-20">
                    <!-- Swap Stations button -->
                    <button
                      type="button"
                      id="btn-swap-stations"
                      (click)="swapStations()"
                      class="group w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white hover:bg-[#EDF9F0] text-[#2D6A4F] hover:text-[#1B4332] flex items-center justify-center cursor-pointer transition-all duration-200 shadow-2xs hover:shadow-xs border border-[#E0D7D0] hover:border-[#2D6A4F] active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/40"
                      title="Start und Ziel tauschen"
                      aria-label="Start- und Zielbahnhof tauschen"
                    >
                      <span class="mat-icon text-base text-[#2D6A4F] group-hover:text-[#1B4332] transition-transform duration-300 group-hover:rotate-180 group-active:rotate-180 select-none" aria-hidden="true">swap_vert</span>
                    </button>

                    <!-- Add Via Station: subtle icon button directly below swap, no label, no margin -->
                    <button
                      type="button"
                      id="btn-add-via-station"
                      (click)="addViaStation()"
                      class="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[#8D6E63] hover:text-[#2D6A4F] hover:bg-[#EDF9F0] transition-colors cursor-pointer border border-transparent hover:border-[#D7CCC8] active:scale-95 focus:outline-none focus:ring-1 focus:ring-[#2D6A4F]/30"
                    >
                      <span class="mat-icon text-base leading-none" aria-hidden="true">add_circle_outline</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Dein Standort (Seamless section inside the white card) -->
              <div
                class="border-t border-[#EFEBE6] bg-[#FAF7F2]/60 hover:bg-[#EDF9F0] px-3 sm:px-4 py-2 flex items-center justify-between gap-2.5 transition-colors"
                [class.bg-[#EDF9F0]]="standortActionState() === 'success'"
                [class.bg-[#FFFBEB]]="standortActionState() === 'gps-warning'"
              >
                <button
                  type="button"
                  id="btn-standort-to-origin"
                  (click)="applyStandortToOrigin()"
                  class="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group active:scale-[0.99] transition-transform"
                  title="Aktuellen Standort als Startbahnhof (Von) übernehmen"
                  aria-label="Deinen aktuellen Standort als Startbahnhof übernehmen"
                >
                  <div
                    class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors shadow-2xs"
                    [class.bg-[#EDF9F0]]="standortActionState() === 'idle' || standortActionState() === 'locating'"
                    [class.text-[#2D6A4F]]="standortActionState() === 'idle' || standortActionState() === 'locating'"
                    [class.group-hover:bg-[#2D6A4F]]="standortActionState() === 'idle'"
                    [class.group-hover:text-white]="standortActionState() === 'idle'"
                    [class.bg-[#1B4332]]="standortActionState() === 'success'"
                    [class.text-white]="standortActionState() === 'success'"
                    [class.bg-[#FDE68A]]="standortActionState() === 'gps-warning'"
                    [class.text-[#92400E]]="standortActionState() === 'gps-warning'"
                    aria-hidden="true"
                  >
                    @if (standortActionState() === 'locating' || transitService.isLocating()) {
                      <span class="mat-icon text-xs animate-spin">sync</span>
                    } @else if (standortActionState() === 'success') {
                      <span class="mat-icon text-sm">check_circle</span>
                    } @else if (standortActionState() === 'gps-warning') {
                      <span class="mat-icon text-sm">location_disabled</span>
                    } @else {
                      <span class="mat-icon text-sm">my_location</span>
                    }
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="text-xs font-bold text-[#1F1612] group-hover:text-[#1B4332] transition-colors flex items-center gap-1.5 truncate">
                      <span>Dein Standort</span>
                      @if (standortActionState() === 'success') {
                        <span class="inline-flex items-center px-1.5 py-0.2 text-[9px] font-black bg-[#2D6A4F] text-white rounded">Übernommen ✓</span>
                      } @else if (standortActionState() === 'gps-warning') {
                        <span class="inline-flex items-center px-1.5 py-0.2 text-[9px] font-black bg-[#D97706] text-white rounded">GPS prüfen</span>
                      }
                    </div>
                    <div class="text-[11px] truncate text-[#795548] font-light">
                      @if (standortActionState() === 'locating' || transitService.isLocating()) {
                        <span class="text-[#2D6A4F] font-semibold animate-pulse">GPS-Signal wird abgefragt...</span>
                      } @else if (standortActionState() === 'success') {
                        <span class="text-[#1B4332] font-semibold">{{ currentStreetAndNumber() }} • Ziel eingeben</span>
                      } @else if (standortActionState() === 'gps-warning') {
                        <span class="text-[#B45309] font-medium">GPS ausgeschaltet oder blockiert • Tippen zum Aktivieren</span>
                      } @else {
                        <span>{{ currentFullAddress() }}</span>
                      }
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  id="btn-view-standort-map"
                  (click)="openStandortMap()"
                  class="w-7 h-7 rounded-md bg-[#FAF7F2] hover:bg-[#EDF9F0] text-[#795548] hover:text-[#2D6A4F] border border-[#E6DED6] hover:border-[#2D6A4F] flex items-center justify-center cursor-pointer transition-all shrink-0 shadow-2xs"
                  title="Standort auf Karte anzeigen"
                  aria-label="Deinen aktuellen Standort auf der Karte visualisieren"
                >
                  <span class="mat-icon text-sm" aria-hidden="true">map</span>
                </button>
              </div>

              <!-- Inline Feedback-Meldung -->
              @if (standortFeedbackMessage() && standortActionState() !== 'idle') {
                <div
                  class="px-3 sm:px-4 py-1.5 border-t text-xs flex items-center justify-between gap-2 bg-white/95"
                  [class.border-[#2D6A4F]/20]="standortActionState() === 'success' || standortActionState() === 'locating'"
                  [class.border-[#D97706]/30]="standortActionState() === 'gps-warning'"
                >
                  <div class="flex items-center gap-1.5 min-w-0 truncate">
                    @if (standortActionState() === 'locating') {
                      <span class="mat-icon text-xs animate-spin text-[#2D6A4F]">sync</span>
                      <span class="text-[#2D6A4F] text-[11px] font-medium truncate">{{ standortFeedbackMessage() }}</span>
                    } @else if (standortActionState() === 'success') {
                      <span class="mat-icon text-xs text-[#2D6A4F]">done</span>
                      <span class="text-[#1B4332] text-[11px] font-semibold truncate">{{ standortFeedbackMessage() }}</span>
                    } @else if (standortActionState() === 'gps-warning') {
                      <span class="mat-icon text-xs text-[#D97706]">warning</span>
                      <span class="text-[#B45309] text-[11px] font-medium truncate">{{ standortFeedbackMessage() }}</span>
                    }
                  </div>

                  @if (standortActionState() === 'gps-warning') {
                    <button
                      type="button"
                      (click)="openGpsHelpModal()"
                      class="px-2 py-0.5 bg-[#D97706] hover:bg-[#B45309] text-white text-[10px] font-bold rounded shrink-0 cursor-pointer shadow-2xs"
                    >
                      Anleitung
                    </button>
                  }
                </div>
              }

              <!-- Bottom Controls: Filter Bar & Options within the white card -->
              <div class="p-3 sm:p-4 pt-2.5 border-t border-[#EFEBE6] space-y-2.5">
                <!-- Compact Filter Bar: Optionen & Datum/Uhrzeit Button fitting the full width without horizontal scroll -->
                <div class="flex items-center gap-2 w-full">
              <!-- Toggle Button to expand/collapse options: Only reads 'Optionen' -->
              <button
                type="button"
                id="btn-toggle-search-options"
                (click)="showSearchOptions.set(!showSearchOptions())"
                class="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#2D6A4F] text-xs font-bold border border-[#D7CCC8] hover:border-[#1B4332] flex items-center justify-between gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title="Optionen ein- oder ausblenden"
                [attr.aria-expanded]="showSearchOptions()"
                aria-label="Optionen umschalten"
              >
                <div class="flex items-center gap-1.5 min-w-0 truncate">
                  <span class="mat-icon text-sm shrink-0" aria-hidden="true">tune</span>
                  <span class="truncate">Optionen</span>
                </div>
                <span class="mat-icon text-xs text-[#8D6E63] shrink-0" aria-hidden="true">{{ showSearchOptions() ? 'expand_less' : 'expand_more' }}</span>
              </button>

              <!-- Button to open Date & Time options (replaces D-Ticket badge) -->
              <button
                type="button"
                id="btn-open-datetime-options"
                (click)="openDatePickerPopup()"
                class="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#EDF9F0] hover:text-[#1B4332] text-[#4E342E] text-xs font-bold border border-[#D7CCC8] hover:border-[#2D6A4F] flex items-center justify-between gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title="Reisedatum und Uhrzeit ändern"
                aria-label="Optionen für Datum und Uhrzeit öffnen"
                [attr.aria-expanded]="showDatePickerPopup()"
              >
                <div class="flex items-center gap-1.5 min-w-0 truncate">
                  <span class="mat-icon text-sm text-[#2D6A4F] shrink-0" aria-hidden="true">schedule</span>
                  <span class="truncate">{{ formattedSelectedDate() }}, {{ selectedTime() }} Uhr</span>
                </div>
                <span class="mat-icon text-xs text-[#8D6E63] shrink-0" aria-hidden="true">edit</span>
              </button>
            </div>

            <!-- Custom Unified Date & Time Picker Modal (Centered in Middle of Screen, accessible anywhere) -->
            @if (showDatePickerPopup()) {
              <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Reisedatum und Uhrzeit auswählen">
                <!-- Semi-transparent backdrop to focus as main object on screen -->
                <div
                  class="fixed inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-150"
                  (click)="closeDatePickerPopup()"
                  aria-hidden="true"
                ></div>

                <!-- Centered Main Dialog Card -->
                <div
                  class="relative w-full max-w-[340px] sm:max-w-[360px] bg-white border border-[#D7CCC8] rounded-[8px] shadow-2xl p-4 z-10 animate-in fade-in zoom-in-95 duration-150 my-auto"
                >
                  <!-- Dialog Header -->
                  <div class="flex items-center justify-between pb-2 mb-2.5 border-b border-[#EFEBE6]">
                    <span class="text-xs font-bold text-[#1F1612] flex items-center gap-1.5">
                      <span class="mat-icon text-sm text-[#2D6A4F]" aria-hidden="true">calendar_month</span>
                      <span>Reisedatum & Uhrzeit wählen</span>
                    </span>
                    <button
                      type="button"
                      (click)="closeDatePickerPopup()"
                      class="w-6 h-6 flex items-center justify-center rounded-[4px] text-[#8D6E63] hover:text-[#2E1F18] hover:bg-[#FAF7F2] cursor-pointer transition-colors"
                      title="Schließen"
                      aria-label="Kalender-Dialog schließen"
                    >
                      <span class="mat-icon text-sm" aria-hidden="true">close</span>
                    </button>
                  </div>

                  <!-- Month Navigation Header -->
                  <div class="flex items-center justify-between pb-1 mb-2 bg-[#FAF7F2] px-2 py-1 rounded-[4px] border border-[#E6DED6]">
                    <button
                      type="button"
                      (click)="changeCalendarMonth(-1)"
                      class="w-6 h-6 flex items-center justify-center rounded-[4px] text-[#4E342E] hover:bg-white hover:text-[#2D6A4F] cursor-pointer transition-colors"
                      title="Vorheriger Monat"
                      aria-label="Vorheriger Monat"
                    >
                      <span class="mat-icon text-sm" aria-hidden="true">chevron_left</span>
                    </button>
                    <span class="text-xs font-bold text-[#1F1612] capitalize" aria-live="polite">{{ calendarMonthLabel() }}</span>
                    <button
                      type="button"
                      (click)="changeCalendarMonth(1)"
                      class="w-6 h-6 flex items-center justify-center rounded-[4px] text-[#4E342E] hover:bg-white hover:text-[#2D6A4F] cursor-pointer transition-colors"
                      title="Nächster Monat"
                      aria-label="Nächster Monat"
                    >
                      <span class="mat-icon text-sm" aria-hidden="true">chevron_right</span>
                    </button>
                  </div>

                  <!-- Quick Day Presets: Heute, Morgen, Wochenende -->
                  <div class="grid grid-cols-3 gap-1.5 mb-2.5">
                    <button
                      type="button"
                      (click)="setDatePreset('today')"
                      class="px-1 py-1.5 text-[10px] font-bold rounded-[4px] bg-[#FAF7F2] hover:bg-[#EDF9F0] hover:text-[#1B4332] text-[#4E342E] border border-[#E6DED6] text-center cursor-pointer transition-colors"
                      aria-label="Reisedatum auf Heute setzen"
                    >
                      Heute
                    </button>
                    <button
                      type="button"
                      (click)="setDatePreset('tomorrow')"
                      class="px-1 py-1.5 text-[10px] font-bold rounded-[4px] bg-[#FAF7F2] hover:bg-[#EDF9F0] hover:text-[#1B4332] text-[#4E342E] border border-[#E6DED6] text-center cursor-pointer transition-colors"
                      aria-label="Reisedatum auf Morgen setzen"
                    >
                      Morgen
                    </button>
                    <button
                      type="button"
                      (click)="setDatePreset('weekend')"
                      class="px-1 py-1.5 text-[10px] font-bold rounded-[4px] bg-[#FAF7F2] hover:bg-[#EDF9F0] hover:text-[#1B4332] text-[#4E342E] border border-[#E6DED6] text-center cursor-pointer transition-colors"
                      aria-label="Reisedatum auf kommendes Wochenende setzen"
                    >
                      Wochenende
                    </button>
                  </div>

                  <!-- Day Names Header (Mo, Di, Mi, Do, Fr, Sa, So) -->
                  <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-[#8D6E63] uppercase pb-1" aria-hidden="true">
                    <span>Mo</span>
                    <span>Di</span>
                    <span>Mi</span>
                    <span>Do</span>
                    <span>Fr</span>
                    <span>Sa</span>
                    <span>So</span>
                  </div>

                  <!-- Calendar Days Grid -->
                  <div class="grid grid-cols-7 gap-1 text-center text-xs mb-2.5" role="grid" aria-label="Monatsübersicht">
                    @for (day of calendarGrid(); track day.dateStr) {
                      <button
                        type="button"
                        (click)="selectCalendarDate(day.dateStr)"
                        class="h-7 w-full flex items-center justify-center rounded-[4px] text-[11px] font-medium transition-colors cursor-pointer"
                        [class.opacity-30]="!day.isCurrentMonth"
                        [class.bg-[#2D6A4F]]="day.isSelected"
                        [class.text-white]="day.isSelected"
                        [class.font-bold]="day.isSelected || day.isToday"
                        [class.border]="day.isToday && !day.isSelected"
                        [class.border-[#2D6A4F]]="day.isToday && !day.isSelected"
                        [class.text-[#2D6A4F]]="day.isToday && !day.isSelected"
                        [class.hover:bg-[#EDF9F0]]="!day.isSelected"
                        [class.hover:text-[#1B4332]]="!day.isSelected"
                        [class.text-[#2E1F18]]="!day.isSelected && !day.isToday"
                        [attr.aria-label]="day.dayNumber + '. ' + calendarMonthLabel() + (day.isSelected ? ', ausgewählt' : '') + (day.isToday ? ', heute' : '')"
                      >
                        {{ day.dayNumber }}
                      </button>
                    }
                  </div>

                  <!-- Abfahrtszeit anpassen inside modal -->
                  <div class="flex items-center justify-between gap-2 py-2 border-t border-[#EFEBE6]">
                    <label for="modal-input-time" class="text-xs font-bold text-[#1F1612] flex items-center gap-1.5 cursor-pointer">
                      <span class="mat-icon text-sm text-[#2D6A4F]" aria-hidden="true">schedule</span>
                      <span>Abfahrtszeit:</span>
                    </label>
                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        (click)="setTimePreset('now')"
                        class="px-2 py-1 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EDF9F0] text-[#1B4332] border border-[#E6DED6] text-[11px] font-bold cursor-pointer transition-colors shadow-2xs"
                        title="Auf aktuelle Uhrzeit setzen"
                        aria-label="Auf aktuelle Uhrzeit setzen"
                      >
                        Jetzt
                      </button>
                      <input
                        id="modal-input-time"
                        type="time"
                        [value]="selectedTime()"
                        (input)="onTimeInputChange($event)"
                        class="px-2 py-1 bg-[#FAF7F2] border border-[#D7CCC8] rounded-[4px] text-[#1F1612] text-xs font-bold focus:ring-1 focus:ring-[#2D6A4F] focus:border-[#2D6A4F]"
                        aria-label="Abfahrtszeit anpassen"
                      />
                      <span class="text-xs font-semibold text-[#795548]">Uhr</span>
                    </div>
                  </div>

                  <!-- Horizontal Action Buttons: Löschen, Abbrechen, Festlegen -->
                  <div class="flex items-center justify-between gap-2 pt-2.5 border-t border-[#EFEBE6]">
                    <button
                      type="button"
                      (click)="clearDatePicker()"
                      class="flex-1 py-1.5 px-2 text-center bg-[#FAF7F2] hover:bg-[#FBE9E7] text-[#C62828] hover:border-[#EF9A9A] border border-[#E6DED6] text-xs font-semibold rounded-[4px] cursor-pointer transition-colors"
                      title="Zurücksetzen"
                      aria-label="Datum und Uhrzeit zurücksetzen"
                    >
                      Löschen
                    </button>
                    <button
                      type="button"
                      (click)="cancelDatePicker()"
                      class="flex-1 py-1.5 px-2 text-center bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#5D4037] border border-[#E6DED6] text-xs font-semibold rounded-[4px] cursor-pointer transition-colors"
                      title="Abbrechen"
                      aria-label="Auswahl abbrechen"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      (click)="applyDatePicker()"
                      class="flex-1 py-1.5 px-2 text-center bg-[#2D6A4F] hover:bg-[#1B4332] text-white text-xs font-bold rounded-[4px] cursor-pointer transition-colors shadow-2xs"
                      title="Festlegen"
                      aria-label="Ausgewähltes Datum und Uhrzeit festlegen"
                    >
                      Festlegen
                    </button>
                  </div>
                </div>
              </div>
            }

            <!-- Wide Search Button when collapsed (matching the aesthetic of Verbindung suchen) -->
            @if (!showSearchOptions()) {
              <div class="pt-0.5">
                <button
                  type="submit"
                  id="btn-search-compact"
                  [disabled]="isLoading() || !toStation()"
                  class="w-full py-2.5 sm:py-3 bg-[#1B4332] hover:bg-[#132A1E] disabled:bg-[#EFEBE6] disabled:text-[#A1887F] disabled:cursor-not-allowed text-white font-black text-xs tracking-wider rounded-lg shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  aria-label="Verbindungen suchen"
                >
                  @if (isLoading()) {
                    <span class="mat-icon animate-spin text-sm" aria-hidden="true">sync</span>
                    <span>LADEN...</span>
                  } @else {
                    <span class="mat-icon text-sm" aria-hidden="true">search</span>
                    <span>VERBINDUNGEN SUCHEN</span>
                  }
                </button>
              </div>
            }

            <!-- COLLAPSIBLE OPTIONS: From 'Direkt ab' to 'Verbindung suchen' -->
            @if (showSearchOptions()) {
              <div class="space-y-3.5 pt-2 border-t border-[#EDE5DC] animate-in fade-in duration-150">
                
                <!-- Popular Quick Shortcuts with seamless inline wrapping directly from 'Direkt ab' -->
            <div class="w-full flex flex-wrap items-center gap-1.5 pt-0.5" role="region" aria-label="Schnellreiseziele">
              
              <!-- Starting Hub Selector directly inline with Nach -->
              <div class="inline-flex items-center gap-1 shrink-0">
                <span class="text-[11px] text-[#8D6E63] font-bold flex items-center gap-1 shrink-0">
                  <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">near_me</span>
                  <span>Direkt ab</span>
                </span>
                
                <select
                  id="select-starting-hub"
                  [value]="selectedStartingHub()"
                  (change)="onStartingHubChange($any($event.target).value)"
                  class="px-2 py-0.5 bg-white border border-[#D7CCC8] hover:border-[#1B4332] rounded-[4px] text-[#1F1612] text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#2D6A4F] cursor-pointer shadow-2xs shrink-0"
                  aria-label="Startbahnhof für Schnellziele auswählen"
                >
                  @for (hub of startingHubs; track hub.label) {
                    <option [value]="hub.label">{{ hub.label }}</option>
                  }
                </select>
                
                <span class="text-[11px] text-[#8D6E63] font-bold shrink-0">:</span>
                <span class="text-[11px] text-[#8D6E63] font-bold shrink-0 mr-0.5">Nach</span>
              </div>

              <!-- Destination pills with 4px border radius, filling available width smoothly -->
              @for (dest of primaryDestinations(); track dest.name) {
                <button
                  type="button"
                  (click)="setDestination(dest)"
                  [title]="dest.name + ' (' + dest.time + ')'"
                  [attr.aria-label]="'Schnellziel ' + dest.name + ' auswählen, Fahrtzeit ca. ' + dest.time"
                  class="flex-1 min-w-[85px] sm:min-w-[95px] px-2 py-0.5 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EDF9F0] hover:text-[#1B4332] hover:border-[#2D6A4F] text-[#4E342E] text-xs font-semibold border border-[#E6DED6] transition-all cursor-pointer shadow-2xs flex items-center justify-between gap-1 shrink-0"
                  [class.border-[#2D6A4F]]="toStation()?.id === dest.id"
                  [class.bg-[#EDF9F0]]="toStation()?.id === dest.id"
                  [class.text-[#1B4332]]="toStation()?.id === dest.id"
                >
                  <span class="truncate">{{ dest.name }}</span>
                  <span class="text-[10px] text-[#8D6E63] font-normal shrink-0">{{ dest.time }}</span>
                </button>
              }

              <!-- Combo box at the end of the destination wrap with 4px border radius -->
              <div class="flex-1 min-w-[120px] inline-flex items-center shrink-0">
                <select
                  id="select-more-destinations"
                  (change)="onDropdownDestinationChange($any($event.target).value); $any($event.target).value = ''"
                  class="w-full px-2 py-0.5 bg-white hover:bg-[#FAF7F2] border border-[#D7CCC8] hover:border-[#1B4332] rounded-[4px] text-[#2D6A4F] text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#2D6A4F] cursor-pointer shadow-2xs"
                  title="Weitere Ziele ab dieser Stadt auswählen"
                  aria-label="Weitere Reiseziele ab dieser Stadt auswählen"
                >
                  <option value="" disabled selected>+ Weitere Ziele...</option>
                  @for (dest of currentHubDestinations(); track dest.id) {
                    <option [value]="dest.id">{{ dest.name }} ({{ dest.time }})</option>
                  }
                </select>
              </div>
            </div>

            <!-- Date & Time Row strictly in a single horizontal row on all viewports with tune button outside at the end -->
            <div class="flex items-center gap-2 w-full pt-0.5">
              
              <!-- Date Input Container with Calendar Icon & Bespoke Unified Date Popover -->
              <div class="relative flex-1 min-w-0">
                <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#2D6A4F] pointer-events-none flex items-center z-10" aria-hidden="true">
                  <span class="mat-icon text-[14px]">calendar_month</span>
                </span>
                <button
                  type="button"
                  id="btn-date-picker"
                  (click)="toggleDatePickerPopup()"
                  class="w-full pl-7 pr-2.5 py-1.5 bg-[#FAF7F2] hover:bg-white border border-[#D7CCC8] hover:border-[#2D6A4F] rounded-[4px] text-[#2E1F18] text-xs font-semibold focus:ring-1 focus:ring-[#2D6A4F] focus:border-[#2D6A4F] min-w-0 text-left cursor-pointer transition-colors shadow-2xs flex items-center justify-between"
                  title="Reisedatum wählen"
                  aria-label="Reisedatum und Uhrzeit auswählen"
                  [attr.aria-expanded]="showDatePickerPopup()"
                >
                  <span class="truncate">{{ formattedSelectedDate() }}</span>
                </button>
              </div>

              <!-- Time Input with Clock Icon -->
              <div class="relative flex-1 min-w-0">
                <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#795548] pointer-events-none flex items-center" aria-hidden="true">
                  <span class="mat-icon text-xs">schedule</span>
                </span>
                <input
                  id="input-time"
                  type="time"
                  formControlName="time"
                  (input)="onTimeInputChange($event)"
                  title="Abfahrtszeit"
                  aria-label="Abfahrtszeit eingeben"
                  class="w-full pl-7 pr-2.5 py-1.5 bg-[#FAF7F2] border border-[#D7CCC8] rounded-[4px] text-[#2E1F18] text-xs font-semibold focus:ring-1 focus:ring-[#2D6A4F] focus:border-[#2D6A4F] min-w-0"
                />
              </div>
            </div>

            <!-- Filters & Search Button -->
            <div class="pt-2.5 border-t border-[#EDE5DC] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div class="flex items-center gap-3.5 flex-wrap">
                <label class="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    id="chk-d-ticket"
                    type="checkbox"
                    formControlName="dTicketOnly"
                    aria-label="Nur Deutschlandticket Nahverkehrsverbindungen"
                    class="w-3.5 h-3.5 text-[#2D6A4F] rounded focus:ring-[#2D6A4F] border-[#D7CCC8]"
                  />
                  <span class="text-xs font-bold text-[#1B4332] flex items-center gap-1">
                    <span>Nur Deutschlandticket</span>
                    <span class="mat-icon text-[#2D6A4F] text-xs" aria-hidden="true">verified</span>
                  </span>
                </label>

                <label class="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    id="chk-fernverkehr"
                    type="checkbox"
                    formControlName="includeFernverkehr"
                    aria-label="Fernverkehr ICE und IC einbeziehen"
                    class="w-3.5 h-3.5 text-[#5D4037] rounded focus:ring-[#5D4037] border-[#D7CCC8]"
                  />
                  <span class="text-xs text-[#795548] font-semibold">
                    ICE/IC
                  </span>
                </label>
              </div>

              <!-- Search Button -->
              <button
                type="submit"
                id="btn-search-connections"
                [disabled]="isLoading() || !toStation()"
                class="px-5 py-2 bg-[#1B4332] hover:bg-[#132A1E] disabled:bg-[#EFEBE6] disabled:text-[#A1887F] disabled:cursor-not-allowed text-white font-black text-xs tracking-wider rounded-lg shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                aria-label="Verbindungen suchen"
              >
                @if (isLoading()) {
                  <span class="mat-icon animate-spin text-sm" aria-hidden="true">sync</span>
                  <span>LADEN...</span>
                } @else {
                  <span class="mat-icon text-sm" aria-hidden="true">search</span>
                  <span>VERBINDUNGEN SUCHEN</span>
                }
              </button>
            </div>

          </div>
        }

            <!-- Pre-Search Information: In der Nähe: (4 Stationen in 4 Zeilen) & Vorschläge: (4 Stationen in 4 Zeilen) -->
            <!-- Visible directly below Verbindungen suchen until the user clicks search -->
            @if (!hasSearched() && !isLoading()) {
              <div id="container-presearch-suggestions" class="space-y-3.5 pt-3.5 mt-2 border-t border-[#EDE5DC] animate-in fade-in duration-150">
                
                <!-- Target indicator: Shows where clicked station will be inserted (cursor position) -->
                <div class="flex items-center justify-between text-[11px] text-[#795548] px-0.5">
                  <span class="font-medium flex items-center gap-1">
                    <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">ads_click</span>
                    <span>Klick übernimmt Station in:</span>
                  </span>
                  <div class="inline-flex items-center gap-1 bg-[#FAF7F2] p-0.5 rounded-lg border border-[#E6DED6]">
                    <button
                      type="button"
                      id="btn-switch-target-from"
                      (click)="activeInput.set('from')"
                      class="px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                      [class.bg-[#1B4332]]="activeInput() === 'from'"
                      [class.text-white]="activeInput() === 'from'"
                      [class.text-[#795548]]="activeInput() !== 'from'"
                      aria-label="Klick übernimmt in Startbahnhof Von"
                    >
                      <span>Von</span>
                      @if (activeInput() === 'from') {
                        <span class="text-[9px] opacity-80">(Cursor)</span>
                      }
                    </button>
                    <button
                      type="button"
                      id="btn-switch-target-to"
                      (click)="activeInput.set('to')"
                      class="px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                      [class.bg-[#1B4332]]="activeInput() === 'to'"
                      [class.text-white]="activeInput() === 'to'"
                      [class.text-[#795548]]="activeInput() !== 'to'"
                      aria-label="Klick übernimmt in Zielbahnhof Nach"
                    >
                      <span>Nach</span>
                      @if (activeInput() === 'to') {
                        <span class="text-[9px] opacity-80">(Cursor)</span>
                      }
                    </button>
                  </div>
                </div>

                <!-- 1. In der Nähe: 4 Stationen in 4 Reihen -->
                <div id="section-in-der-naehe" class="space-y-1.5">
                  <div class="flex items-center justify-between">
                    <h3 class="text-xs font-bold text-[#1F1612] flex items-center gap-1.5">
                      <span class="mat-icon text-sm text-[#2D6A4F]" aria-hidden="true">near_me</span>
                      <span>In der Nähe:</span>
                    </h3>
                    <span class="text-[10px] text-[#8D6E63] font-medium">4 nahe Stationen</span>
                  </div>

                  <!-- 4 Stationen in 4 Reihen -->
                  <div class="space-y-1.5">
                    @for (st of nearbyStations(); track st.id || st.name; let idx = $index) {
                      <button
                        type="button"
                        [id]="'btn-nearby-station-' + idx"
                        (click)="applySuggestionToActiveInput(st)"
                        class="w-full p-2 sm:p-2.5 rounded-xl bg-white hover:bg-[#EDF9F0] border border-[#E6DED6] hover:border-[#2D6A4F] text-left transition-all group cursor-pointer shadow-2xs flex items-center justify-between gap-2.5"
                        [title]="st.name + ' in ' + (activeInput() === 'from' ? 'Von' : 'Nach') + ' übernehmen'"
                        [attr.aria-label]="'Station In der Nähe: ' + st.name + ', Entfernung ' + st.distanceText"
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="w-6 h-6 rounded-md bg-[#EDF9F0] text-[#2D6A4F] group-hover:bg-[#2D6A4F] group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                            <span class="mat-icon text-sm" aria-hidden="true">place</span>
                          </span>
                          <span class="text-xs font-bold text-[#1F1612] group-hover:text-[#1B4332] truncate">
                            {{ st.name }}
                          </span>
                        </div>
                        <div class="flex items-center gap-2 text-[10px] sm:text-[11px] font-medium text-[#795548] shrink-0">
                          <span class="font-bold text-[#2D6A4F]">{{ st.distanceText }}</span>
                          @if (st.walkMinutes) {
                            <span class="text-[#8D6E63] text-[9.5px] sm:text-[10px] bg-[#FAF7F2] px-1.5 py-0.5 rounded border border-[#E6DED6]">~{{ st.walkMinutes }}m zu Fuß</span>
                          }
                          <span class="mat-icon text-xs text-[#8D6E63] group-hover:text-[#2D6A4F] transition-transform group-hover:translate-x-0.5" aria-hidden="true">chevron_right</span>
                        </div>
                      </button>
                    }
                  </div>
                </div>

                <!-- 2. Vorschläge: 4 Stationen in 4 Reihen -->
                <div id="section-vorschlaege" class="space-y-1.5 pt-1">
                  <div class="flex items-center justify-between">
                    <h3 class="text-xs font-bold text-[#1F1612] flex items-center gap-1.5">
                      <span class="mat-icon text-sm text-[#795548]" aria-hidden="true">history</span>
                      <span>Vorschläge:</span>
                    </h3>
                    <span class="text-[10px] text-[#8D6E63] font-medium">Letzte Suchen & Favoriten</span>
                  </div>

                  <!-- 4 Stationen in 4 Reihen -->
                  <div class="space-y-1.5">
                    @for (st of smartVorschlaege(); track st.id || st.name; let idx = $index) {
                      <button
                        type="button"
                        [id]="'btn-vorschlag-station-' + idx"
                        (click)="applySuggestionToActiveInput(st)"
                        class="w-full p-2 sm:p-2.5 rounded-xl bg-[#FAF7F2] hover:bg-[#EDF9F0] border border-[#E6DED6] hover:border-[#2D6A4F] text-left transition-all group cursor-pointer shadow-2xs flex items-center justify-between gap-2.5"
                        [title]="st.name + ' in ' + (activeInput() === 'from' ? 'Von' : 'Nach') + ' übernehmen'"
                        [attr.aria-label]="'Vorschlag: ' + st.name"
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="w-6 h-6 rounded-md bg-white text-[#795548] group-hover:bg-[#2D6A4F] group-hover:text-white border border-[#E6DED6] group-hover:border-[#2D6A4F] flex items-center justify-center shrink-0 transition-colors">
                            <span class="mat-icon text-sm" aria-hidden="true">train</span>
                          </span>
                          <span class="text-xs font-bold text-[#1F1612] group-hover:text-[#1B4332] truncate">
                            {{ st.name }}
                          </span>
                        </div>
                        <div class="flex items-center gap-2 text-[10px] sm:text-[11px] font-medium text-[#8D6E63] shrink-0">
                          <span class="text-[9.5px] sm:text-[10px] bg-white px-2 py-0.5 rounded-md border border-[#E6DED6] text-[#795548] font-semibold">Schnellauswahl</span>
                          <span class="mat-icon text-xs text-[#8D6E63] group-hover:text-[#2D6A4F] transition-transform group-hover:translate-x-0.5" aria-hidden="true">arrow_forward</span>
                        </div>
                      </button>
                    }
                  </div>
                </div>

              </div>
            }

            </div>

          </form>

        </div>

        <!-- SEARCH RESULTS SECTION: Placed directly below the search parameters in the main column, aligned so top badge touches the bottom edge of the top search card -->
        @if (hasSearched() || isLoading()) {
          <div id="search-results-section" class="space-y-4 scroll-mt-6 animate-in fade-in duration-200 -mt-1.5">
            
            <!-- Loading Skeleton / Status -->
            @if (isLoading()) {
              <div class="bg-white rounded-2xl p-6 border border-[#E6DED6] shadow-xs text-center space-y-3 animate-pulse">
                <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#EDF9F0] text-[#1B4332] mx-auto">
                  <span class="mat-icon text-xl animate-spin">sync</span>
                </div>
                <div>
                  <div class="text-sm font-bold text-[#1F1612]">Routen werden berechnet & optimiert...</div>
                  <div class="text-xs text-[#795548] mt-0.5">Ermittle beste Deutschlandticket-Verbindungen & Echtzeitdaten</div>
                </div>
              </div>
            } @else if (journeys().length > 0) {
              
              <!-- PROMINENT VIEW TOGGLE & MAP EXPAND/COLLAPSE CONTROL BAR (Standard Travel App Pattern) -->
              <div class="bg-white rounded-2xl p-2.5 sm:p-3 border border-[#E6DED6] shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5" role="toolbar" aria-label="Ergebnis-Ansicht umschalten">
                <!-- Left: Mode Switcher (Liste / Karte) -->
                <div class="inline-flex items-center p-1 bg-[#FAF7F2] rounded-xl border border-[#E6DED6] shadow-2xs" role="tablist" aria-label="Ansichtsmodus">
                  <!-- 1. List Mode Button -->
                  <button
                    type="button"
                    id="toggle-results-mode-list"
                    (click)="setResultsViewMode('list')"
                    role="tab"
                    [attr.aria-selected]="resultsViewMode() === 'list'"
                    class="flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]"
                    [class.bg-[#1B4332]]="resultsViewMode() === 'list'"
                    [class.text-white]="resultsViewMode() === 'list'"
                    [class.shadow-xs]="resultsViewMode() === 'list'"
                    [class.text-[#4E342E]]="resultsViewMode() !== 'list'"
                    [class.hover:text-[#1B4332]]="resultsViewMode() !== 'list'"
                    [class.hover:bg-white/50]="resultsViewMode() !== 'list'"
                    aria-label="Listenansicht der Verbindungen anzeigen"
                  >
                    <span class="mat-icon text-base leading-none" aria-hidden="true">format_list_bulleted</span>
                    <span>Liste</span>
                    <span
                      class="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0"
                      [class.bg-white/20]="resultsViewMode() === 'list'"
                      [class.text-white]="resultsViewMode() === 'list'"
                      [class.bg-[#E6DED6]]="resultsViewMode() !== 'list'"
                      [class.text-[#4E342E]]="resultsViewMode() !== 'list'"
                    >
                      {{ sortedJourneys().length }}
                    </span>
                  </button>

                  <!-- 2. Map Mode Button -->
                  <button
                    type="button"
                    id="toggle-results-mode-map"
                    (click)="setResultsViewMode('map')"
                    role="tab"
                    [attr.aria-selected]="resultsViewMode() === 'map'"
                    class="flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]"
                    [class.bg-[#1B4332]]="resultsViewMode() === 'map'"
                    [class.text-white]="resultsViewMode() === 'map'"
                    [class.shadow-xs]="resultsViewMode() === 'map'"
                    [class.text-[#4E342E]]="resultsViewMode() !== 'map'"
                    [class.hover:text-[#1B4332]]="resultsViewMode() !== 'map'"
                    [class.hover:bg-white/50]="resultsViewMode() !== 'map'"
                    aria-label="Kartenfokus-Modus mit Routenverlauf anzeigen"
                  >
                    <span class="mat-icon text-base leading-none" aria-hidden="true">map</span>
                    <span>Karte</span>
                    <span
                      class="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0"
                      [class.bg-white/20]="resultsViewMode() === 'map'"
                      [class.text-white]="resultsViewMode() === 'map'"
                      [class.bg-[#E6DED6]]="resultsViewMode() !== 'map'"
                      [class.text-[#4E342E]]="resultsViewMode() !== 'map'"
                    >
                      Live
                    </span>
                  </button>
                </div>

                <!-- Right: Expand / Collapse Map View & Quick Preview -->
                <div class="flex items-center gap-2 justify-end">
                  @if (resultsViewMode() === 'list' && !isMapExpanded()) {
                    <!-- Quick Map Preview Toggle for List Mode -->
                    <button
                      type="button"
                      id="btn-quick-preview-map"
                      (click)="toggleInlineMapPreview()"
                      class="px-3 py-1.5 rounded-xl border border-[#B7E4C7] bg-[#EDF9F0] hover:bg-[#D8F3DC] text-xs font-black text-[#1B4332] transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap"
                      [title]="showInlineMapPreview() ? 'Karte einklappen' : 'Karten-Vorschau oben einblenden'"
                      [attr.aria-expanded]="showInlineMapPreview()"
                      aria-label="Karten-Vorschau einblenden oder ausblenden"
                    >
                      <span class="mat-icon text-sm text-[#2D6A4F]" aria-hidden="true">{{ showInlineMapPreview() ? 'visibility_off' : 'visibility' }}</span>
                      <span>{{ showInlineMapPreview() ? 'Karte ausblenden' : 'Karte einblenden' }}</span>
                    </button>
                  }

                  <!-- Primary Expand / Collapse Map View Toggle -->
                  <button
                    type="button"
                    id="btn-toggle-expand-map"
                    (click)="toggleMapExpandCollapse()"
                    class="px-3 py-1.5 rounded-xl border border-[#E6DED6] hover:border-[#2D6A4F] bg-[#FAF7F2] hover:bg-white text-xs font-bold text-[#1F1612] transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap"
                    [title]="getMapToggleTooltip()"
                    [attr.aria-expanded]="isMapExpanded()"
                    aria-label="Kartenansicht vergrößern oder verkleinern"
                  >
                    <span class="mat-icon text-sm text-[#2D6A4F]" aria-hidden="true">
                      {{ isMapExpanded() ? 'unfold_less' : 'unfold_more' }}
                    </span>
                    <span>{{ isMapExpanded() ? 'Karte einklappen' : 'Karte vergrößern' }}</span>
                  </button>
                </div>
              </div>

              <!-- ================================================================= -->
              <!-- 1. MAP FOCUS MODE (resultsViewMode === 'map')                     -->
              <!-- ================================================================= -->
              @if (resultsViewMode() === 'map') {
                <div class="space-y-3.5 animate-in fade-in duration-200" role="region" aria-label="Kartenansicht und Routenauswahl">
                  
                  <!-- Selected Route Header Banner above Map -->
                  @if (activeJourneyForMap(); as activeJ) {
                    <div class="bg-white rounded-2xl p-3 sm:p-4 border border-[#B7E4C7] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-[11px] font-black uppercase tracking-wider text-[#1B4332] bg-[#EDF9F0] px-2 py-0.5 rounded-md border border-[#B7E4C7]">
                            Aktive Route auf Karte
                          </span>
                          <span class="text-xs text-[#795548] font-bold truncate">
                            ab {{ activeJ.origin.name }} nach {{ activeJ.destination.name }}
                          </span>
                        </div>
                        <div class="flex items-baseline gap-2 mt-1">
                          <span class="text-xl sm:text-2xl font-black text-[#1F1612] tracking-tight">
                            {{ formatTime(activeJ.departure) }} ➔ {{ formatTime(activeJ.arrival) }}
                          </span>
                          <span class="text-xs sm:text-sm font-bold text-[#2D6A4F]">
                            ({{ formatHvvDuration(activeJ.durationMinutes) }} • {{ activeJ.transfers === 0 ? 'Direkt' : activeJ.transfers + ' Umstieg' + (activeJ.transfers > 1 ? 'e' : '') }})
                          </span>
                        </div>
                      </div>

                      <div class="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                        <button
                          type="button"
                          id="btn-open-detail-from-map-header"
                          (click)="openJourneyDetail(activeJ)"
                          class="px-3.5 py-2 rounded-xl bg-[#1B4332] hover:bg-[#132A1E] text-white text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                          title="Vollständigen Reiseplan und Umstiege öffnen"
                          aria-label="Fahrtdetails und Zwischenhalte anzeigen"
                        >
                          <span class="mat-icon text-sm" aria-hidden="true">format_list_numbered</span>
                          <span>Fahrtdetails</span>
                        </button>
                      </div>
                    </div>
                  }

                  <!-- Prominent Interactive Map -->
                  <div
                    class="w-full rounded-2xl overflow-hidden border border-[#E6DED6] shadow-sm relative transition-all duration-300 bg-[#EFEBE6]"
                    [class.h-[380px]]="!isMapExpanded()"
                    [class.sm:h-[460px]]="!isMapExpanded()"
                    [class.h-[580px]]="isMapExpanded()"
                    [class.sm:h-[660px]]="isMapExpanded()"
                  >
                    <app-map-view
                      #resultsMapView
                      [activeJourney]="activeJourneyForMap()"
                      [selectedStation]="toStation()"
                      [isFullBleed]="true"
                    ></app-map-view>
                  </div>

                  <!-- Horizontal Connection Deck / Carousel: Select connections right from the map -->
                  <div class="bg-white rounded-2xl p-4 border border-[#E6DED6] shadow-xs space-y-3">
                    <div class="flex items-center justify-between gap-2 flex-wrap pb-1">
                      <div class="flex items-center gap-2">
                        <span class="mat-icon text-base text-[#2D6A4F]" aria-hidden="true">touch_app</span>
                        <h3 class="text-sm font-black text-[#1F1612] tracking-tight">
                          Verbindung wählen ({{ sortedJourneys().length }})
                        </h3>
                        <span class="text-[11px] text-[#795548] font-medium hidden sm:inline">
                          Klicke auf eine Fahrt, um den Verlauf auf der Karte anzuzeigen
                        </span>
                      </div>

                      @if (destinationWeather(); as weather) {
                        <div class="inline-flex items-center gap-1.5 text-xs text-[#1F1612] font-semibold bg-[#FAF7F2] px-2.5 py-1 rounded-full border border-[#E6DED6]">
                          <span aria-hidden="true">{{ weather.icon }}</span>
                          <span>{{ weather.temperature }}°C {{ weather.cityName }}</span>
                          <button
                            type="button"
                            (click)="refreshDestinationWeather($event)"
                            [disabled]="isWeatherLoading()"
                            class="w-4 h-4 rounded-full hover:bg-[#E6DED6] active:scale-95 flex items-center justify-center text-[#795548] hover:text-[#1F1612] transition-colors cursor-pointer disabled:opacity-50 ml-0.5"
                            title="Wetter für {{ weather.cityName }} aktualisieren"
                            aria-label="Wetterdaten für {{ weather.cityName }} neu laden"
                          >
                            <span class="mat-icon text-[11px] leading-none" [class.animate-spin]="isWeatherLoading()">refresh</span>
                          </button>
                        </div>
                      }
                    </div>

                    <!-- Scrollable Connection Cards Row -->
                    <div class="flex items-stretch gap-3 overflow-x-auto pb-2 pt-1 snap-x scroll-smooth focus:outline-none" tabindex="0" role="listbox" aria-label="Gefundene Fahrten für die Kartenansicht">
                      @for (journey of sortedJourneys(); track journey.id) {
                        @let isSelected = activeJourneyForMap()?.id === journey.id;
                        <div
                          (click)="selectJourneyForMap(journey, $event)"
                          (keydown.enter)="selectJourneyForMap(journey, $event)"
                          (keydown.space)="selectJourneyForMap(journey, $event)"
                          role="option"
                          [attr.aria-selected]="isSelected"
                          tabindex="0"
                          class="shrink-0 w-64 sm:w-72 p-3.5 rounded-xl border transition-all cursor-pointer snap-start relative outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F] flex flex-col justify-between gap-2.5"
                          [class.border-[#2D6A4F]]="isSelected"
                          [class.bg-[#EDF9F0]]="isSelected"
                          [class.shadow-md]="isSelected"
                          [class.border-[#E6DED6]]="!isSelected"
                          [class.bg-white]="!isSelected"
                          [class.hover:bg-[#FAF7F2]]="!isSelected"
                          [class.hover:border-[#B7E4C7]]="!isSelected"
                          [attr.aria-label]="'Fahrt von ' + formatTime(journey.departure) + ' bis ' + formatTime(journey.arrival) + ' auswählen'"
                        >
                          <div>
                            <!-- Header badge -->
                            <div class="flex items-center justify-between gap-1 mb-1.5">
                              @if (isSelected) {
                                <span class="inline-flex items-center gap-1 text-[10px] font-black text-[#1B4332] bg-white px-2 py-0.5 rounded-full border border-[#B7E4C7]">
                                  <span class="inline-block w-1.5 h-1.5 rounded-full bg-[#2D6A4F] animate-pulse"></span>
                                  Auf Karte aktiv
                                </span>
                              } @else if ($index === 0) {
                                <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EDF9F0] text-[#1B4332]">
                                  Empfehlung
                                </span>
                              } @else {
                                <span class="text-[10px] text-[#795548] font-bold">
                                  Option {{ $index + 1 }}
                                </span>
                              }

                              <span class="text-xs font-black text-[#1F1612]">
                                {{ formatHvvDuration(journey.durationMinutes) }}
                              </span>
                            </div>

                            <!-- Departure ➔ Arrival -->
                            <div class="flex items-baseline gap-1.5">
                              <span class="text-lg sm:text-xl font-black text-[#1F1612] tracking-tight">
                                {{ formatTime(journey.departure) }}
                              </span>
                              <span class="text-sm font-black text-[#1F1612] select-none" aria-hidden="true">➔</span>
                              <span class="text-lg sm:text-xl font-black text-[#1F1612] tracking-tight">
                                {{ formatTime(journey.arrival) }}
                              </span>
                            </div>

                            <!-- Route Badges -->
                            <div class="flex items-center gap-1.5 flex-wrap pt-1.5">
                              @for (seg of getDisplayRouteSegments(journey); track $index) {
                                @if (seg.type === 'walk') {
                                  <button
                                    type="button"
                                    (click)="onWalkIconClick(journey, $event)"
                                    class="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#1F1612] hover:text-[#1B4332] hover:bg-[#FAF7F2] px-1.5 py-0.5 rounded-lg border border-transparent hover:border-[#B7E4C7] transition-all cursor-pointer group active:scale-95"
                                    title="Fußweg zum Startbahnhof auf der Karte anzeigen"
                                    aria-label="Fußweg zum Startbahnhof auf der Karte anzeigen"
                                  >
                                    <span class="mat-icon text-sm text-[#1B4332] group-hover:scale-110 transition-transform" aria-hidden="true">directions_walk</span>
                                    <span>{{ seg.durationMinutes }}m</span>
                                  </button>
                                } @else {
                                  <span
                                    class="inline-flex items-center px-1.5 py-0.5 text-[10px] font-black shadow-2xs uppercase tracking-tight"
                                    [class]="(seg.style?.bg || 'bg-[#1F1612]') + ' ' + (seg.style?.text || 'text-white') + ' ' + (seg.style?.shape || 'rounded')"
                                  >
                                    {{ seg.lineName }}
                                  </span>
                                }
                                @if ($index < getDisplayRouteSegments(journey).length - 1) {
                                  <span class="text-[10px] font-bold text-[#8D6E63] select-none">›</span>
                                }
                              }
                            </div>
                          </div>

                          <!-- Action row -->
                          <div class="pt-2 border-t border-[#EDE5DC] flex items-center justify-between text-xs">
                            <span class="text-[11px] text-[#1B4332] font-bold">100% D-Ticket</span>
                            <button
                              type="button"
                              (click)="openJourneyDetail(journey); $event.stopPropagation()"
                              class="text-[#795548] hover:text-[#1B4332] font-black flex items-center gap-0.5 cursor-pointer text-xs"
                              aria-label="Fahrtdetails öffnen"
                            >
                              <span>Details</span>
                              <span class="mat-icon text-xs">arrow_forward</span>
                            </button>
                          </div>
                        </div>
                      }
                    </div>
                  </div>

                  <!-- Pagination Bar & Switch to List button -->
                  <div class="flex items-center justify-between gap-2 pt-1 flex-wrap">
                    <button
                      type="button"
                      id="btn-earlier-page-map"
                      (click)="shiftTimeBy(-1)"
                      class="px-3 py-1.5 rounded-xl bg-white hover:bg-[#FAF7F2] text-[#4E342E] border border-[#E6DED6] text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                      aria-label="Frühere Verbindungen anzeigen"
                    >
                      <span class="mat-icon text-sm" aria-hidden="true">arrow_back</span>
                      <span>Frühere (-1 Std.)</span>
                    </button>

                    <button
                      type="button"
                      id="btn-switch-to-list-from-bottom"
                      (click)="setResultsViewMode('list')"
                      class="px-3.5 py-1.5 rounded-xl bg-[#FAF7F2] hover:bg-[#EDE5DC] text-[#1F1612] border border-[#D7CCC8] text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                      aria-label="Zurück zur Listenansicht"
                    >
                      <span class="mat-icon text-sm text-[#2D6A4F]" aria-hidden="true">format_list_bulleted</span>
                      <span>Zur Listenansicht</span>
                    </button>

                    <button
                      type="button"
                      id="btn-later-page-map"
                      (click)="shiftTimeBy(1)"
                      class="px-3 py-1.5 rounded-xl bg-white hover:bg-[#FAF7F2] text-[#1B4332] border border-[#B7E4C7] text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                      aria-label="Spätere Verbindungen anzeigen"
                    >
                      <span>Spätere (+1 Std.)</span>
                      <span class="mat-icon text-sm text-[#2D6A4F]" aria-hidden="true">arrow_forward</span>
                    </button>
                  </div>

                </div>
              }

              <!-- ================================================================= -->
              <!-- 2. LIST FOCUS MODE (resultsViewMode === 'list')                    -->
              <!-- ================================================================= -->
              @if (resultsViewMode() === 'list') {
                <div class="space-y-3.5 animate-in fade-in duration-200">
                  
                  <!-- Expandable Inline Map Preview (when toggled or expanded) -->
                  @if (showInlineMapPreview() || isMapExpanded()) {
                    <div class="bg-white rounded-2xl p-3 sm:p-4 border border-[#B7E4C7] shadow-xs space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200" role="region" aria-label="Eingeblendete Kartenansicht">
                      <div class="flex items-center justify-between gap-2 flex-wrap">
                        <div class="flex items-center gap-2">
                          <span class="mat-icon text-base text-[#2D6A4F]" aria-hidden="true">map</span>
                          <span class="text-xs sm:text-sm font-black text-[#1F1612]">
                            Streckenverlauf: {{ activeJourneyForMap()?.origin?.name }} ➔ {{ activeJourneyForMap()?.destination?.name }}
                          </span>
                          @if (activeJourneyForMap(); as activeJ) {
                            <span class="text-[11px] font-bold text-[#2D6A4F] bg-[#EDF9F0] px-2 py-0.5 rounded-md border border-[#B7E4C7]">
                              {{ formatTime(activeJ.departure) }} - {{ formatTime(activeJ.arrival) }}
                            </span>
                          }
                        </div>

                        <div class="flex items-center gap-1.5">
                          <button
                            type="button"
                            (click)="toggleMapExpandCollapse()"
                            class="px-2.5 py-1 bg-[#FAF7F2] hover:bg-[#EDE5DC] text-[#4E342E] rounded-lg text-xs font-bold border border-[#E6DED6] cursor-pointer transition-colors flex items-center gap-1"
                            [title]="isMapExpanded() ? 'Karte verkleinern' : 'Karte vergrößern'"
                            aria-label="Kartenhöhe umschalten"
                          >
                            <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">{{ isMapExpanded() ? 'unfold_less' : 'unfold_more' }}</span>
                            <span>{{ isMapExpanded() ? 'Kompakt' : 'Vergrößern' }}</span>
                          </button>
                          <button
                            type="button"
                            (click)="toggleInlineMapPreview()"
                            class="px-2.5 py-1 bg-white hover:bg-[#FAF7F2] text-[#795548] rounded-lg text-xs font-bold border border-[#E6DED6] cursor-pointer transition-colors flex items-center gap-1"
                            title="Karte schließen"
                            aria-label="Karten-Vorschau schließen"
                          >
                            <span class="mat-icon text-xs" aria-hidden="true">close</span>
                            <span>Schließen</span>
                          </button>
                        </div>
                      </div>

                      <div
                        class="w-full rounded-xl overflow-hidden border border-[#E6DED6] transition-all duration-200"
                        [class.h-56]="!isMapExpanded()"
                        [class.sm:h-64]="!isMapExpanded()"
                        [class.h-96]="isMapExpanded()"
                        [class.sm:h-[420px]]="isMapExpanded()"
                      >
                        <app-map-view
                          #inlineMapView
                          [activeJourney]="activeJourneyForMap()"
                          [selectedStation]="toStation()"
                          [isFullBleed]="true"
                        ></app-map-view>
                      </div>
                    </div>
                  }

                  <!-- Header Bar directly before Verbindungen: Verbindungen & Das Wetter side-by-side -->
                  <div class="flex items-center justify-between gap-3 flex-wrap pt-1 pb-1">
                    <!-- Left: Verbindungen Title -->
                    <div class="flex items-center gap-2.5">
                      <h2 class="text-xl sm:text-2xl font-black text-[#1F1612] tracking-tight flex items-center gap-2">
                        <span>Verbindungen</span>
                        <span class="text-xs sm:text-sm font-bold text-[#2D6A4F] bg-[#EDF9F0] border border-[#B7E4C7] px-2.5 py-0.5 rounded-full shadow-2xs">
                          {{ sortedJourneys().length }}
                        </span>
                      </h2>
                      @if (toStation()?.name) {
                        <span class="hidden md:inline-block text-xs font-semibold text-[#795548] truncate max-w-xs">
                          nach {{ toStation()?.name }}
                        </span>
                      }
                    </div>

                    <!-- Right: Das Wetter am Zielort -->
                    @if (destinationWeather(); as weather) {
                      <div class="flex items-center gap-1.5 shrink-0">
                        <span class="text-xs font-bold text-[#795548] flex items-center gap-1">
                          <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">wb_sunny</span>
                          <span class="hidden sm:inline">Wetter am Zielort:</span>
                          <span class="sm:hidden">Zielort:</span>
                        </span>
                        <div
                          id="minimalist-weather"
                          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#E6DED6] shadow-2xs text-xs font-medium text-[#1F1612]"
                          title="Wetter am Zielort {{ weather.cityName }}: {{ weather.description }}"
                        >
                          <span class="text-base leading-none select-none" aria-hidden="true">{{ weather.icon }}</span>
                          <span class="font-black text-[#1F1612]">{{ weather.temperature }}°C</span>
                          <span class="text-[#795548] font-medium hidden sm:inline">{{ weather.description }}</span>
                          @if (weather.precipitation > 0) {
                            <span class="text-[#0284C7] font-semibold text-[11px] flex items-center gap-0.5" title="Niederschlag">
                              <span class="mat-icon text-xs leading-none" aria-hidden="true">umbrella</span>
                              <span>{{ weather.precipitation }} mm</span>
                            </span>
                          }
                          <span class="text-[11px] text-[#2D6A4F] font-bold bg-[#EDF9F0] px-2 py-0.5 rounded-full border border-[#B7E4C7]">
                            {{ weather.cityName }}
                          </span>
                          <!-- Small refresh button -->
                          <button
                            type="button"
                            id="btn-refresh-planner-weather"
                            (click)="refreshDestinationWeather($event)"
                            [disabled]="isWeatherLoading()"
                            class="w-5 h-5 rounded-full hover:bg-[#FAF7F2] active:scale-95 flex items-center justify-center text-[#795548] hover:text-[#1F1612] transition-colors cursor-pointer disabled:opacity-50"
                            title="Wetter für {{ weather.cityName }} aktualisieren"
                            aria-label="Wetterdaten für {{ weather.cityName }} neu laden"
                          >
                            <span class="mat-icon text-xs leading-none" [class.animate-spin]="isWeatherLoading()">refresh</span>
                          </button>
                        </div>
                      </div>
                    } @else if (isWeatherLoading()) {
                      <div class="flex items-center gap-1.5 shrink-0">
                        <span class="text-xs font-bold text-[#795548] flex items-center gap-1">
                          <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">wb_sunny</span>
                          <span class="hidden sm:inline">Wetter am Zielort:</span>
                          <span class="sm:hidden">Zielort:</span>
                        </span>
                        <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#E6DED6] shadow-2xs text-xs text-[#8D6E63] animate-pulse">
                          <span class="mat-icon text-xs animate-spin text-[#2D6A4F]" aria-hidden="true">sync</span>
                          <span>Wetter lädt…</span>
                        </div>
                      </div>
                    }
                  </div>

                  <!-- Linear Connections List (HVV Switch Style) -->
                  <div class="space-y-3.5" role="feed" aria-label="Gefundene Fahrtverbindungen">
                    @for (journey of sortedJourneys(); track journey.id) {
                      <div
                        (click)="openJourneyDetail(journey)"
                        (keydown.enter)="openJourneyDetail(journey)"
                        (keydown.space)="openJourneyDetail(journey)"
                        role="button"
                        tabindex="0"
                        class="group bg-white hover:bg-[#FAF7F2] rounded-2xl border transition-all duration-150 cursor-pointer shadow-xs hover:shadow-md relative outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F] overflow-hidden"
                        [class.border-[#2D6A4F]]="$index === 0"
                        [class.border-[#E6DED6]]="$index !== 0"
                        [attr.aria-label]="'Fahrt von ' + formatTime(journey.departure) + ' bis ' + formatTime(journey.arrival) + ' Uhr. Detalles anzeigen.'"
                      >
                        <div class="p-4 sm:p-5 space-y-2.5">
                          <!-- 1. Empfehlung Badge -->
                          @if ($index === 0) {
                            <div>
                              <span class="inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold bg-[#EDF9F0] text-[#1B4332]">
                                Unsere Empfehlung
                              </span>
                            </div>
                          }

                          <!-- 2. Header: Salida ➔ Llegada (live) & Duración -->
                          <div class="flex items-baseline justify-between gap-3 flex-wrap">
                            <div class="flex items-baseline gap-2 sm:gap-2.5">
                              <span class="text-2xl sm:text-3xl font-black text-[#1F1612] tracking-tight">
                                {{ formatTime(journey.departure) }}
                              </span>
                              <span class="text-base sm:text-xl font-black text-[#1F1612] select-none" aria-hidden="true">➔</span>
                              <span class="text-2xl sm:text-3xl font-black text-[#1F1612] tracking-tight">
                                {{ formatTime(journey.arrival) }}
                              </span>
                              <span class="mat-icon text-sm sm:text-base text-[#1F1612] leading-none align-middle ml-0.5" title="Echtzeitdaten aktiv" aria-hidden="true">sensors</span>
                            </div>

                            <div class="text-xl sm:text-2xl font-black text-[#1F1612] tracking-tight text-right shrink-0">
                              {{ formatHvvDuration(journey.durationMinutes) }}
                            </div>
                          </div>

                          <!-- 3. Subheader: ab Estación um Hora (live) & Via station badge if present -->
                          @let firstDep = getFirstTransitDeparture(journey);
                          <div class="flex items-center gap-2 flex-wrap">
                            <div class="text-xs sm:text-sm text-[#795548] font-medium flex items-center gap-1">
                              <span>ab {{ firstDep.stationName }} um {{ firstDep.time }}</span>
                              <span class="mat-icon text-xs text-[#795548] leading-none align-middle" aria-hidden="true">sensors</span>
                            </div>
                            @if (journey.viaStationName) {
                              <span class="inline-flex items-center gap-1 text-[10px] font-bold text-[#92400E] bg-[#FEF3C7] border border-[#FDE68A] px-2 py-0.5 rounded-md">
                                <span class="mat-icon text-xs">alt_route</span>
                                <span>über {{ journey.viaStationName }}</span>
                              </span>
                            }
                          </div>

                          <!-- 4. Route Badges: 🚶 28 min ➔ RB71 ➔ S3 ➔ U3 -->
                          <div class="flex items-center gap-2 flex-wrap pt-0.5" aria-label="Fahrtverlauf">
                            @for (seg of getDisplayRouteSegments(journey); track $index) {
                              @if (seg.type === 'walk') {
                                <button
                                  type="button"
                                  (click)="onWalkIconClick(journey, $event)"
                                  class="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-[#1F1612] hover:text-[#1B4332] hover:bg-[#FAF7F2] shrink-0 px-2 py-1 rounded-xl border border-transparent hover:border-[#B7E4C7] hover:shadow-xs transition-all cursor-pointer group active:scale-95"
                                  title="Fußweg zum Startbahnhof auf der Karte anzeigen"
                                  aria-label="Fußweg zum Startbahnhof auf der Karte anzeigen"
                                >
                                  <span class="mat-icon text-base text-[#1B4332] group-hover:scale-110 transition-transform" aria-hidden="true">directions_walk</span>
                                  <span>{{ seg.durationMinutes }} min</span>
                                  <span class="mat-icon text-xs text-[#2D6A4F] opacity-70 group-hover:opacity-100">map</span>
                                </button>
                              } @else {
                                <div
                                  class="inline-flex items-center justify-center px-2 py-0.5 text-xs font-black shadow-2xs shrink-0 relative select-none uppercase tracking-tight"
                                  [class]="(seg.style?.bg || 'bg-[#1F1612]') + ' ' + (seg.style?.text || 'text-white') + ' ' + (seg.style?.shape || 'rounded')"
                                >
                                  <span>{{ seg.lineName }}</span>
                                  @if (seg.hasAlert) {
                                    <span class="absolute -top-1.5 -right-1.5 bg-white text-[#0284C7] rounded-full p-0.5 shadow-2xs leading-none flex items-center justify-center" aria-hidden="true">
                                      <span class="mat-icon text-[10px] leading-none font-black">warning</span>
                                    </span>
                                  }
                                </div>
                              }

                              @if ($index < getDisplayRouteSegments(journey).length - 1) {
                                <span class="text-xs sm:text-sm font-black text-[#1F1612] shrink-0 select-none" aria-hidden="true">➔</span>
                              }
                            }
                          </div>

                          <!-- 5. Ticket Divider & Line with direct 'Auf Karte' action -->
                          <div class="pt-3 border-t border-[#EDE5DC] flex items-center justify-between text-xs font-semibold gap-2 flex-wrap">
                            <div class="flex items-center gap-1.5 text-[#1B4332]">
                              <span class="mat-icon text-sm text-[#2D6A4F]" aria-hidden="true">confirmation_number</span>
                              <span>Tickets ab 0,00 € • 100% D-Ticket gültig</span>
                            </div>
                            <div class="flex items-center gap-2">
                              <button
                                type="button"
                                (click)="showJourneyInMapFocus(journey, $event)"
                                class="px-2.5 py-1 rounded-lg bg-[#FAF7F2] hover:bg-[#EDF9F0] text-[#1B4332] border border-[#D7CCC8] hover:border-[#B7E4C7] text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                title="Diese Verbindung auf der Karte visualisieren"
                                aria-label="Route auf der Karte anzeigen"
                              >
                                <span class="mat-icon text-xs text-[#2D6A4F]">map</span>
                                <span>Auf Karte</span>
                              </button>
                              <div class="flex items-center gap-1 text-[#795548] group-hover:text-[#1B4332] transition-colors font-bold">
                                <span>Detalles</span>
                                <span class="mat-icon text-xs">arrow_forward</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <!-- 6. Bottom Alert Banner (si hay avisos o retrasos) -->
                        @if (hasJourneyAlerts(journey)) {
                          <div class="bg-[#EEF3F8] text-[#1F1612] px-4 py-2.5 border-t border-[#DDE5ED] flex items-center gap-2 text-xs font-semibold">
                            <span class="mat-icon text-sm text-[#0284C7] shrink-0" aria-hidden="true">warning</span>
                            <span class="truncate">{{ getJourneyAlertText(journey) }}</span>
                          </div>
                        }
                      </div>
                    }
                  </div>

                  <!-- Pagination / Browse earlier & later connections -->
                  <div class="flex items-center justify-between gap-2 pt-1 flex-wrap">
                    <button
                      type="button"
                      id="btn-earlier-page"
                      (click)="shiftTimeBy(-1)"
                      class="px-3 py-1.5 rounded-xl bg-white hover:bg-[#FAF7F2] text-[#4E342E] border border-[#E6DED6] text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                      aria-label="Frühere Verbindungen 1 Stunde vorher anzeigen"
                    >
                      <span class="mat-icon text-sm" aria-hidden="true">arrow_back</span>
                      <span>Frühere (-1 Std.)</span>
                    </button>

                    <button
                      type="button"
                      id="btn-later-page"
                      (click)="shiftTimeBy(1)"
                      class="px-3 py-1.5 rounded-xl bg-white hover:bg-[#FAF7F2] text-[#1B4332] border border-[#B7E4C7] text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                      aria-label="Spätere Verbindungen 1 Stunde nachher anzeigen"
                    >
                      <span>Spätere Verbindungen (+1 Std.)</span>
                      <span class="mat-icon text-sm text-[#2D6A4F]" aria-hidden="true">arrow_forward</span>
                    </button>
                  </div>

                </div>
              }
            } @else {
              <!-- Empty State / No Connections Error -->
              <div class="bg-[#F5EFE6] rounded-2xl p-6 border border-[#E6DED6] text-center space-y-3" role="alert">
                <span class="w-10 h-10 rounded-full bg-[#EFEBE6] text-[#795548] flex items-center justify-center mx-auto shadow-xs">
                  <span class="mat-icon text-xl" aria-hidden="true">error_outline</span>
                </span>
                <div>
                  <h3 class="text-sm font-bold text-[#3E2723]">
                    Keine passende Regionalverbindung gefunden
                  </h3>
                  <p class="text-xs text-[#795548] mt-0.5 max-w-md mx-auto">
                    {{ errorMessage() || 'Für diese Strecke wurde im gewählten Zeitfenster keine direkte oder zumutbare Regionalverbindung gefunden.' }}
                  </p>
                </div>

                <!-- Quick Helper Buttons -->
                <div class="flex items-center justify-center gap-2 flex-wrap pt-1">
                  <button
                    type="button"
                    (click)="setTimePreset('plus1h'); onSearchSubmit()"
                    class="px-3 py-1.5 bg-white hover:bg-[#FAF7F2] text-[#4E342E] border border-[#D7CCC8] rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                    aria-label="1 Stunde später suchen"
                  >
                    +1 Std. suchen
                  </button>
                  <button
                    type="button"
                    (click)="setTimePreset('tomorrow'); onSearchSubmit()"
                    class="px-3 py-1.5 bg-white hover:bg-[#FAF7F2] text-[#4E342E] border border-[#D7CCC8] rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                    aria-label="Verbindung für morgen suchen"
                  >
                    Morgen suchen
                  </button>
                  <button
                    type="button"
                    (click)="enableFernverkehrAndSearch()"
                    class="px-3 py-1.5 bg-[#5D4037] hover:bg-[#4E342E] text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                    aria-label="Fernverkehr ICE und IC einbeziehen und suchen"
                  >
                    ICE/IC anzeigen
                  </button>
                  <button
                    type="button"
                    (click)="resetSearch()"
                    class="px-3 py-1.5 bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#4E342E] border border-[#D7CCC8] rounded-lg text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1"
                    aria-label="Suche zurücksetzen"
                  >
                    <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">arrow_back</span>
                    <span>Zurück zur Suche</span>
                  </button>
                </div>
              </div>
            }

          </div>
        }

      </div>

      <!-- RIGHT COLUMN: 'Entdecke Deutschland' Highlights Module (Side Showcase) -->
      <div class="lg:col-span-5 bg-white rounded-2xl p-5 sm:p-6 border border-[#E6DED6] shadow-xs space-y-4" role="complementary" aria-label="Ausflugs-Highlights">
        
        <!-- Header with View All Link -->
        <div class="flex items-center justify-between pb-3 border-b border-[#EDE5DC]">
          <div class="flex items-center gap-2.5">
            <span class="w-9 h-9 rounded-xl bg-[#EFEBE6] text-[#3E2723] flex items-center justify-center font-bold" aria-hidden="true">
              <span class="mat-icon text-lg">explore</span>
            </span>
            <div>
              <h2 class="text-base font-black text-[#1F1612] tracking-tight">Entdecke Deutschland</h2>
              <p class="text-[11px] text-[#795548]">Direkte Ausflugsziele ab Hamburg</p>
            </div>
          </div>

          <button
            type="button"
            id="btn-all-highlights-side"
            (click)="switchTab.emit('hamburg-hub')"
            class="text-xs font-bold text-[#1B4332] hover:underline flex items-center gap-1 cursor-pointer"
            aria-label="Alle Ausflugsziele ansehen"
          >
            <span>Alle</span>
            <span class="mat-icon text-sm" aria-hidden="true">arrow_forward</span>
          </button>
        </div>

        <!-- Curated Mini Grid of Highlights -->
        <div class="space-y-2.5">
          @for (dest of sideHighlights; track dest.stationId) {
            <div class="p-3 rounded-xl bg-[#FAF7F2] hover:bg-[#F2ECE4] border border-[#E6DED6] transition-all flex items-center justify-between gap-3 group">
              <div class="space-y-0.5 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-black text-[#1F1612] truncate">{{ dest.name }}</span>
                  <span class="px-1.5 py-0.5 bg-white border border-[#E6DED6] text-[9px] font-bold text-[#2D6A4F] rounded-full shrink-0">
                    {{ dest.line }}
                  </span>
                </div>
                <p class="text-[11px] text-[#795548] truncate">{{ dest.description }}</p>
              </div>

              <div class="flex flex-col items-end gap-1 shrink-0">
                <span class="text-[10px] font-bold text-[#3E2723] bg-white px-2 py-0.5 rounded-full border border-[#E6DED6]">
                  {{ dest.duration }}
                </span>
                <button
                  type="button"
                  (click)="selectCuratedDestination(dest)"
                  class="px-2.5 py-1 bg-[#1B4332] text-white hover:bg-[#132A1E] rounded-full text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  [attr.aria-label]="'Route nach ' + dest.name + ' berechnen'"
                >
                  <span>Route</span>
                  <span class="mat-icon text-[12px]" aria-hidden="true">arrow_forward</span>
                </button>
              </div>
            </div>
          }
        </div>

        <!-- Bottom Button to Hamburg Hub -->
        <button
          type="button"
          id="btn-hamburg-hub-link"
          (click)="switchTab.emit('hamburg-hub')"
          class="w-full py-2.5 px-3.5 bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#3E2723] border border-[#E6DED6] rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          aria-label="Alle Ausflugsziele nach Bundesländern durchstöbern"
        >
          <span class="mat-icon text-base text-[#2D6A4F]" aria-hidden="true">anchor</span>
          <span>Alle Ausflugsziele nach Bundesländern durchstöbern</span>
        </button>

      </div>

    </div>

      <!-- DEDICATED SECTION: 'Entdecke Deutschland' Travel Discovery Grid -->
      <div class="space-y-6 pt-4" role="region" aria-label="Reise-Inspiration Entdecke Deutschland">
        
        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div class="space-y-1">
            <span class="text-xs font-bold text-[#2D6A4F] uppercase tracking-wider">Inspiration & Ausflüge</span>
            <h2 class="text-2xl sm:text-3xl font-black text-[#1F1612] tracking-tight">
              Entdecke Deutschland
            </h2>
            <p class="text-xs sm:text-sm text-[#795548]">
              Ausgewählte Reiseziele im Regionalverkehr • Ohne ICE/IC-Aufpreis
            </p>
          </div>

          <!-- Category Pills Filter -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0" role="tablist" aria-label="Kategoriefilter für Entdeckungsziele">
            <button
              type="button"
              id="filter-cat-all-btn"
              (click)="discoveryCategory.set('all')"
              [class.bg-[#1B4332]]="discoveryCategory() === 'all'"
              [class.text-white]="discoveryCategory() === 'all'"
              [class.bg-[#EFEBE6]]="discoveryCategory() !== 'all'"
              [class.text-[#4E342E]]="discoveryCategory() !== 'all'"
              class="px-3.5 py-1.5 rounded-full text-xs font-bold border border-[#E6DED6] cursor-pointer transition-all"
              role="tab"
              [attr.aria-selected]="discoveryCategory() === 'all'"
              aria-label="Alle Reiseziele anzeigen"
            >
              Alle
            </button>
            <button
              type="button"
              id="filter-cat-kueste-btn"
              (click)="discoveryCategory.set('kueste')"
              [class.bg-[#1B4332]]="discoveryCategory() === 'kueste'"
              [class.text-white]="discoveryCategory() === 'kueste'"
              [class.bg-[#EFEBE6]]="discoveryCategory() !== 'kueste'"
              [class.text-[#4E342E]]="discoveryCategory() !== 'kueste'"
              class="px-3.5 py-1.5 rounded-full text-xs font-bold border border-[#E6DED6] cursor-pointer transition-all"
              role="tab"
              [attr.aria-selected]="discoveryCategory() === 'kueste'"
              aria-label="Kategorie Küste und Inseln filtern"
            >
              🌊 Küste & Inseln
            </button>
            <button
              type="button"
              id="filter-cat-natur-btn"
              (click)="discoveryCategory.set('natur')"
              [class.bg-[#1B4332]]="discoveryCategory() === 'natur'"
              [class.text-white]="discoveryCategory() === 'natur'"
              [class.bg-[#EFEBE6]]="discoveryCategory() !== 'natur'"
              [class.text-[#4E342E]]="discoveryCategory() !== 'natur'"
              class="px-3.5 py-1.5 rounded-full text-xs font-bold border border-[#E6DED6] cursor-pointer transition-all"
              role="tab"
              [attr.aria-selected]="discoveryCategory() === 'natur'"
              aria-label="Kategorie Natur und Wandern filtern"
            >
              🌲 Natur & Wandern
            </button>
            <button
              type="button"
              id="filter-cat-kultur-btn"
              (click)="discoveryCategory.set('kultur')"
              [class.bg-[#1B4332]]="discoveryCategory() === 'kultur'"
              [class.text-white]="discoveryCategory() === 'kultur'"
              [class.bg-[#EFEBE6]]="discoveryCategory() !== 'kultur'"
              [class.text-[#4E342E]]="discoveryCategory() !== 'kultur'"
              class="px-3.5 py-1.5 rounded-full text-xs font-bold border border-[#E6DED6] cursor-pointer transition-all"
              role="tab"
              [attr.aria-selected]="discoveryCategory() === 'kultur'"
              aria-label="Kategorie Kultur und Städte filtern"
            >
              🏰 Kultur & Städte
            </button>
          </div>
        </div>

        <!-- Discovery Destinations Grid (High-End Editorial Travel Cards) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          @for (dest of filteredDiscoveryDestinations(); track dest.stationId) {
            <div class="bg-white rounded-3xl p-5 border border-[#E6DED6] shadow-xs hover:border-[#2D6A4F] hover:shadow-md transition-all flex flex-col justify-between space-y-4 group">
              
              <div class="space-y-2.5">
                <div class="flex items-center justify-between">
                  <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF7F2] text-[#4E342E] border border-[#E6DED6]">
                    {{ dest.categoryLabel }}
                  </span>
                  <span class="text-xs font-black text-[#1B4332]">
                    {{ dest.duration }}
                  </span>
                </div>

                <div>
                  <h3 class="text-base font-black text-[#1F1612] group-hover:text-[#1B4332] transition-colors">
                    {{ dest.name }}
                  </h3>
                  <div class="text-xs font-bold text-[#8D6E63] mt-0.5">
                    {{ dest.line }}
                  </div>
                </div>

                <p class="text-xs text-[#795548] leading-relaxed">
                  {{ dest.description }}
                </p>
              </div>

              <!-- Action button -->
              <div class="pt-3 border-t border-[#EDE5DC] flex items-center justify-between">
                <span class="text-[10px] font-bold text-[#2D6A4F]">✓ D-Ticket Direktzug</span>
                <button
                  type="button"
                  (click)="selectCuratedDestination(dest)"
                  class="px-3.5 py-1.5 bg-[#1B4332] hover:bg-[#132A1E] text-white rounded-full text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  [attr.aria-label]="'Route nach ' + dest.name + ' suchen'"
                >
                  <span>Route suchen</span>
                  <span class="mat-icon text-xs" aria-hidden="true">arrow_forward</span>
                </button>
              </div>

            </div>
          }
        </div>

      </div>

      <!-- SECONDARY ACTION MODULES GRID -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
        
        <!-- Tile 1: Live Board -->
        <button
          type="button"
          id="tile-nav-live-board"
          (click)="switchTab.emit('live-board')"
          class="bg-white rounded-3xl p-6 border border-[#E6DED6] hover:border-[#2D6A4F] hover:shadow-sm text-left transition-all cursor-pointer group flex flex-col justify-between space-y-4"
          aria-label="Zu Was fährt hier? Live-Abfahrtstafel wechseln"
        >
          <div class="flex items-center justify-between">
            <span class="w-10 h-10 rounded-2xl bg-[#D8F3DC] text-[#1B4332] flex items-center justify-center font-bold" aria-hidden="true">
              <span class="mat-icon text-xl">departure_board</span>
            </span>
            <span class="mat-icon text-[#8D6E63] group-hover:text-[#1B4332] group-hover:translate-x-0.5 transition-all text-sm" aria-hidden="true">arrow_forward</span>
          </div>
          <div>
            <h3 class="text-base font-black text-[#1F1612]">Was fährt hier?</h3>
            <p class="text-xs text-[#795548] mt-1">Live-Abfahrtstafel mit Gleisangaben & Echtzeit für jeden Bahnhof in Deutschland</p>
          </div>
        </button>

        <!-- Tile 2: Hamburg Hub -->
        <button
          type="button"
          id="tile-nav-hamburg-hub"
          (click)="switchTab.emit('hamburg-hub')"
          class="bg-white rounded-3xl p-6 border border-[#E6DED6] hover:border-[#2D6A4F] hover:shadow-sm text-left transition-all cursor-pointer group flex flex-col justify-between space-y-4"
          aria-label="Zu Von Hamburg aus Ausflugszielen wechseln"
        >
          <div class="flex items-center justify-between">
            <span class="w-10 h-10 rounded-2xl bg-[#EFEBE6] text-[#3E2723] flex items-center justify-center font-bold" aria-hidden="true">
              <span class="mat-icon text-xl">anchor</span>
            </span>
            <span class="mat-icon text-[#8D6E63] group-hover:text-[#3E2723] group-hover:translate-x-0.5 transition-all text-sm" aria-hidden="true">arrow_forward</span>
          </div>
          <div>
            <h3 class="text-base font-black text-[#1F1612]">Von Hamburg aus</h3>
            <p class="text-xs text-[#795548] mt-1">Alle Direktverbindungen und Bundesländer im Überblick</p>
          </div>
        </button>

        <!-- Tile 3: Surprise Trip -->
        <button
          type="button"
          id="tile-nav-surprise"
          (click)="switchTab.emit('surprise')"
          class="bg-white rounded-3xl p-6 border border-[#E6DED6] hover:border-[#2D6A4F] hover:shadow-sm text-left transition-all cursor-pointer group flex flex-col justify-between space-y-4"
          aria-label="Zu Überrasche mich Zufallsgenerator wechseln"
        >
          <div class="flex items-center justify-between">
            <span class="w-10 h-10 rounded-2xl bg-[#D4A373]/20 text-[#3E2723] flex items-center justify-center font-bold" aria-hidden="true">
              <span class="mat-icon text-xl">casino</span>
            </span>
            <span class="mat-icon text-[#8D6E63] group-hover:text-[#3E2723] group-hover:translate-x-0.5 transition-all text-sm" aria-hidden="true">arrow_forward</span>
          </div>
          <div>
            <h3 class="text-base font-black text-[#1F1612]">Überrasche mich</h3>
            <p class="text-xs text-[#795548] mt-1">Spontaner Reise-Zufallsgenerator nach Fahrtdauer & Stimmung</p>
          </div>
        </button>

        <!-- Tile 4: Live Accessibility Monitor -->
        <button
          type="button"
          id="tile-nav-accessibility"
          (click)="switchTab.emit('accessibility')"
          class="bg-white rounded-3xl p-6 border border-[#E6DED6] hover:border-[#2D6A4F] hover:shadow-sm text-left transition-all cursor-pointer group flex flex-col justify-between space-y-4"
          aria-label="Zum Live-Barrierefreiheits- und Aufzugsmonitor wechseln"
        >
          <div class="flex items-center justify-between">
            <span class="w-10 h-10 rounded-2xl bg-[#EDF9F0] text-[#1B4332] flex items-center justify-center font-bold" aria-hidden="true">
              <span class="mat-icon text-xl">accessible</span>
            </span>
            <span class="mat-icon text-[#8D6E63] group-hover:text-[#2D6A4F] group-hover:translate-x-0.5 transition-all text-sm" aria-hidden="true">arrow_forward</span>
          </div>
          <div>
            <h3 class="text-base font-black text-[#1F1612]">Barrierefreiheit & Aufzüge</h3>
            <p class="text-xs text-[#795548] mt-1">Live-Status aller Aufzüge & stufenfreien Stationen im Verkehrsnetz</p>
          </div>
        </button>

      </div>

      <!-- Minimalist D-Ticket Information Footer Banner -->
      <div class="bg-white rounded-3xl p-6 border border-[#E6DED6] shadow-2xs">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center sm:text-left divide-y sm:divide-y-0 sm:divide-x divide-[#EDE5DC]">
          <div class="flex items-center gap-3.5 sm:pr-4">
            <span class="mat-icon text-[#2D6A4F] text-2xl shrink-0">verified</span>
            <div>
              <div class="text-xs font-black text-[#1F1612]">100% D-Ticket Nahverkehr</div>
              <div class="text-[11px] text-[#795548]">Alle RE, RB, S-Bahnen, U-Bahnen und Hafenfähren</div>
            </div>
          </div>
          <div class="flex items-center gap-3.5 pt-4 sm:pt-0 sm:px-4">
            <span class="mat-icon text-[#D4A373] text-2xl shrink-0">sensors</span>
            <div>
              <div class="text-xs font-black text-[#1F1612]">Live-Echtzeitdaten</div>
              <div class="text-[11px] text-[#795548]">Direkte Verspätungen und aktuelle Gleisinformationen</div>
            </div>
          </div>
          <div class="flex items-center gap-3.5 pt-4 sm:pt-0 sm:pl-4">
            <span class="mat-icon text-[#2D6A4F] text-2xl shrink-0">eco</span>
            <div>
              <div class="text-xs font-black text-[#1F1612]">Klimafreundlich reisen</div>
              <div class="text-[11px] text-[#795548]">Ganz Deutschland nachhaltig auf der Schiene erleben</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal: Aktueller Standort auf der Karte mit Option zum Zurückkehren -->
      @if (showStandortMap()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Aktueller Standort auf Karte">
          <button
            type="button"
            class="fixed inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-150 w-full h-full border-none cursor-default"
            (click)="closeStandortMap()"
            aria-label="Karte schließen"
          ></button>
          
          <div class="relative w-full max-w-xl bg-white border border-[#D7CCC8] rounded-2xl shadow-2xl p-4 sm:p-5 z-10 animate-in fade-in zoom-in-95 duration-150 space-y-3.5 my-auto">
            <!-- Header mit Option zum Zurückkehren -->
            <div class="flex items-center justify-between pb-2.5 border-b border-[#EFEBE6]">
              <button
                type="button"
                id="btn-back-from-standort-map"
                (click)="closeStandortMap()"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#2E1F18] text-xs font-bold border border-[#D7CCC8] cursor-pointer transition-colors"
                title="Zurück zur Suche"
                aria-label="Zurück zur Verbindungssuche"
              >
                <span class="mat-icon text-sm text-[#2D6A4F]" aria-hidden="true">arrow_back</span>
                <span>Zurück</span>
              </button>

              <div class="text-xs font-black text-[#1F1612] flex items-center gap-1.5">
                <span class="mat-icon text-sm text-[#2D6A4F]">my_location</span>
                <span>Aktueller Standort</span>
              </div>
            </div>

            <!-- Interaktive Karte -->
            <div class="h-64 sm:h-72 w-full rounded-xl overflow-hidden border border-[#E6DED6]">
              <app-map-view
                [selectedStation]="standortMapStation()"
              ></app-map-view>
            </div>

            <!-- Footer: Straße, Hausnummer und Übernahme-Aktion -->
            <div class="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="text-xs font-bold text-[#1F1612] flex items-center gap-1">
                  <span class="mat-icon text-xs text-[#2D6A4F]">place</span>
                  <span>{{ currentStreetAndNumber() }}</span>
                </div>
                <div class="text-[11px] text-[#795548] truncate">{{ transitService.userAddress() || 'Hamburg' }}</div>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  (click)="closeStandortMap()"
                  class="px-3 py-2 bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#4E342E] text-xs font-bold rounded-lg border border-[#D7CCC8] cursor-pointer transition-colors"
                >
                  Zurück
                </button>
                <button
                  type="button"
                  id="btn-confirm-standort-origin"
                  (click)="applyStandortToOrigin(); closeStandortMap()"
                  class="px-4 py-2 bg-[#1B4332] hover:bg-[#132A1E] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors whitespace-nowrap"
                >
                  <span class="mat-icon text-sm">trip_origin</span>
                  <span>In 'Von' übernehmen</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- GPS Aktivierungs- und Hilfe-Modal -->
      @if (showGpsPromptModal()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gps-modal-title"
        >
          <div
            class="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-[#E6DED6] animate-in zoom-in-95 duration-200 space-y-4"
          >
            <!-- Header with Icon -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] flex items-center justify-center shrink-0 shadow-2xs">
                  <span class="mat-icon text-2xl">location_disabled</span>
                </div>
                <div>
                  <h3 id="gps-modal-title" class="text-base font-bold text-[#1F1612]">
                    GPS / Standort aktivieren
                  </h3>
                  <p class="text-xs text-[#795548]">
                    Für die genaue Ermittlung deiner aktuellen Position
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-gps-modal"
                (click)="closeGpsModal()"
                class="w-8 h-8 rounded-lg flex items-center justify-center text-[#8D6E63] hover:text-[#1F1612] hover:bg-[#FAF7F2] cursor-pointer"
                aria-label="Schließen"
              >
                <span class="mat-icon text-lg">close</span>
              </button>
            </div>

            <!-- Description / Instructions -->
            <div class="space-y-2.5 text-xs text-[#5D4037] bg-[#FAF7F2] p-3.5 rounded-xl border border-[#E6DED6]">
              @if (gpsPromptErrorCode() === 1) {
                <p class="font-bold text-[#B45309] flex items-center gap-1.5">
                  <span class="mat-icon text-base">lock</span>
                  <span>Standortzugriff im Browser blockiert</span>
                </p>
                <ol class="list-decimal list-inside space-y-1.5 pl-1 text-[11px] text-[#795548]">
                  <li>Klicke oben links in der Browser-Adressleiste auf das <strong>Schlosssymbol 🔒</strong> oder <strong>Website-Einstellungen</strong>.</li>
                  <li>Setze die Berechtigung für <strong>Standort</strong> auf <strong>Zulassen</strong>.</li>
                  <li>Klicke danach auf den Button <strong>GPS erneut abfragen</strong>.</li>
                </ol>
              } @else if (gpsPromptErrorCode() === 2) {
                <p class="font-bold text-[#B45309] flex items-center gap-1.5">
                  <span class="mat-icon text-base">near_me_disabled</span>
                  <span>Standortdienst (GPS) auf Gerät ausgeschaltet</span>
                </p>
                <ol class="list-decimal list-inside space-y-1.5 pl-1 text-[11px] text-[#795548]">
                  <li>Öffne das Kontrollzentrum / Schnelleinstellungen deines Handys oder PCs.</li>
                  <li>Aktiviere den Schalter <strong>Standort / GPS</strong>.</li>
                  <li>Tippe anschließend auf <strong>GPS erneut abfragen</strong>.</li>
                </ol>
              } @else {
                <p class="font-medium text-[#1F1612]">
                  {{ gpsPromptMessage() || 'Das GPS-Signal konnte nicht ermittelt werden. Bitte prüfe, ob dein Standortdienst aktiv ist.' }}
                </p>
              }
            </div>

            <!-- Action buttons -->
            <div class="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                id="btn-retry-gps"
                (click)="retryGpsActivation()"
                class="flex-1 py-2.5 px-4 bg-[#1B4332] hover:bg-[#132A1E] text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                @if (standortActionState() === 'locating') {
                  <span class="mat-icon text-sm animate-spin">sync</span>
                  <span>GPS wird abgefragt...</span>
                } @else {
                  <span class="mat-icon text-sm">my_location</span>
                  <span>GPS erneut abfragen</span>
                }
              </button>

              <button
                type="button"
                id="btn-use-fallback-location"
                (click)="useFallbackLocationAndContinue()"
                class="py-2.5 px-3.5 bg-white hover:bg-[#FAF7F2] text-[#5D4037] hover:text-[#1F1612] font-semibold text-xs rounded-xl border border-[#D7CCC8] hover:border-[#1B4332] transition-colors cursor-pointer text-center"
              >
                Mit Hamburg fortfahren
              </button>
            </div>
          </div>
        </div>
      }

    </div>
  `
})
export class PlannerView implements OnInit, AfterViewInit {
  @Output() showOnMap = new EventEmitter<ConnectionJourney>();
  @Output() showStationOnMap = new EventEmitter<Station>();
  @Output() viewDetail = new EventEmitter<ConnectionJourney>();
  @Output() viewWalkRoute = new EventEmitter<ConnectionJourney>();
  @Output() switchTab = new EventEmitter<'planner' | 'live-board' | 'hamburg-hub' | 'surprise' | 'favorites' | 'accessibility'>();

  private fb = inject(FormBuilder);
  readonly transitService = inject(TransitService);
  readonly weatherService = inject(WeatherService);

  readonly destinationWeather = this.weatherService.currentWeather;
  readonly isWeatherLoading = this.weatherService.isLoading;

  readonly activeInput = signal<string>('to');
  readonly showStandortMap = signal<boolean>(false);

  // Standort action state and interactive feedback
  readonly standortActionState = signal<'idle' | 'locating' | 'success' | 'gps-warning'>('idle');
  readonly standortFeedbackMessage = signal<string | null>(null);
  readonly showGpsPromptModal = signal<boolean>(false);
  readonly gpsPromptMessage = signal<string>('');
  readonly gpsPromptErrorCode = signal<number | null>(null);

  readonly expandedAccessibilityJourneyId = signal<string | null>(null);

  // Origin always defaults to 'Mein Standort'
  readonly fromStation = signal<Station | null>({
    id: 'current-location',
    name: 'Mein Standort',
    isCurrentLocation: true
  });
  readonly toStation = signal<Station | null>(null);
  readonly fromStationQuery = signal<string>('Mein Standort');
  readonly toStationQuery = signal<string>('');
  readonly viaStations = signal<{ id: string; station: Station | null; query: string }[]>([]);

  readonly areInputsEmpty = computed(() => {
    const noFrom = !this.fromStation() && !this.fromStationQuery().trim();
    const noTo = !this.toStation() && !this.toStationQuery().trim();
    return noFrom && noTo;
  });

  readonly journeys = signal<ConnectionJourney[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly hasSearched = signal<boolean>(false);

  // Travel results view modes & map expansion state
  @ViewChild('resultsMapView') resultsMapView?: MapView;
  @ViewChild('inlineMapView') inlineMapView?: MapView;
  readonly resultsViewMode = signal<'list' | 'map'>('list');
  readonly isMapExpanded = signal<boolean>(false);
  readonly showInlineMapPreview = signal<boolean>(false);
  readonly selectedMapJourney = signal<ConnectionJourney | null>(null);

  readonly activeJourneyForMap = computed(() => {
    const selected = this.selectedMapJourney();
    if (selected) return selected;
    const sorted = this.sortedJourneys();
    return sorted.length > 0 ? sorted[0] : null;
  });

  readonly showSearchOptions = signal<boolean>(false);
  readonly expandedJourneyId = signal<string | null>(null);
  readonly expandedLegKeys = signal<Record<string, boolean>>({});
  readonly expandedAmenitiesKeys = signal<Record<string, boolean>>({});
  readonly expandedWarningKeys = signal<Record<string, boolean>>({});
  readonly copiedJourneyId = signal<string | null>(null);
  readonly errorMessage = signal<string>('');
  readonly sortBy = signal<'fastest' | 'fewest-transfers' | 'departure'>('fastest');
  readonly showSortOptions = signal<boolean>(false);
  readonly showVerbindungenHeader = signal<boolean>(false);
  readonly showWeather = signal<boolean>(false);
  readonly discoveryCategory = signal<'all' | 'kueste' | 'natur' | 'kultur'>('all');
  readonly selectedStartingHub = signal<string>('Hamburg');
  readonly showAllPopularDestinations = signal<boolean>(false);
  readonly showTimePickerPopup = signal<boolean>(false);
  readonly showDatePickerPopup = signal<boolean>(false);
  readonly calendarViewDate = signal<Date>(new Date());
  readonly selectedDate = signal<string>(this.getCurrentDateString());
  readonly selectedTime = signal<string>(this.getCurrentTimeString());

  readonly startingHubs = [
    {
      label: 'Hamburg',
      station: { id: '8002549', name: 'Hamburg Hbf', location: { latitude: 53.552736, longitude: 10.006909 } },
      destinations: [
        { name: 'Lübeck Hbf', id: '8000237', lat: 53.8672, lon: 10.6698, time: '0:43h' },
        { name: 'Kiel Hbf', id: '8003368', lat: 54.3149, lon: 10.1320, time: '1:13h' },
        { name: 'Bremen Hbf', id: '8000050', lat: 53.0834, lon: 8.8138, time: '1:05h' },
        { name: 'Lüneburg', id: '8003762', lat: 53.2505, lon: 10.4191, time: '0:30h' },
        { name: 'Schwerin Hbf', id: '8000339', lat: 53.6343, lon: 11.4075, time: '1:15h' },
        { name: 'Westerland (Sylt)', id: '8006423', lat: 54.9073, lon: 8.3097, time: '3:10h' },
        { name: 'Rostock Hbf', id: '8000309', lat: 54.0782, lon: 12.1311, time: '2:05h' },
        { name: 'Hannover Hbf', id: '8000152', lat: 52.3767, lon: 9.7410, time: '1:20h' }
      ]
    },
    {
      label: 'Berlin',
      station: { id: '8011160', name: 'Berlin Hbf', location: { latitude: 52.525592, longitude: 13.369545 } },
      destinations: [
        { name: 'Potsdam Hbf', id: '8010283', lat: 52.3917, lon: 13.0673, time: '0:25h' },
        { name: 'Frankfurt (Oder)', id: '8010114', lat: 52.3364, lon: 14.5422, time: '1:00h' },
        { name: 'Brandenburg Hbf', id: '8010058', lat: 52.3976, lon: 12.5636, time: '0:45h' },
        { name: 'Cottbus Hbf', id: '8010078', lat: 51.7516, lon: 14.3218, time: '1:15h' },
        { name: 'Rostock Hbf', id: '8000309', lat: 54.0782, lon: 12.1311, time: '2:20h' },
        { name: 'Leipzig Hbf', id: '8010205', lat: 51.3453, lon: 12.3814, time: '1:45h' },
        { name: 'Magdeburg Hbf', id: '8010224', lat: 52.1306, lon: 11.6276, time: '1:35h' },
        { name: 'Stralsund Hbf', id: '8010338', lat: 54.3082, lon: 13.0784, time: '3:00h' }
      ]
    },
    {
      label: 'Bremen',
      station: { id: '8000050', name: 'Bremen Hbf', location: { latitude: 53.0834, longitude: 8.8138 } },
      destinations: [
        { name: 'Hamburg Hbf', id: '8002549', lat: 53.552736, lon: 10.006909, time: '1:05h' },
        { name: 'Bremerhaven Hbf', id: '8000051', lat: 53.5350, lon: 8.5997, time: '0:35h' },
        { name: 'Oldenburg(Oldb)', id: '8000291', lat: 53.1436, lon: 8.2223, time: '0:30h' },
        { name: 'Hannover Hbf', id: '8000152', lat: 52.3767, lon: 9.7410, time: '1:20h' },
        { name: 'Osnabrück Hbf', id: '8000294', lat: 52.2729, lon: 8.0617, time: '1:00h' },
        { name: 'Münster(Westf)', id: '8000263', lat: 51.9566, lon: 7.6358, time: '1:25h' },
        { name: 'Cuxhaven', id: '8000067', lat: 53.8617, lon: 8.7025, time: '1:40h' },
        { name: 'Wilhelmshaven', id: '8000251', lat: 53.5186, lon: 8.1147, time: '1:10h' }
      ]
    },
    {
      label: 'Hannover',
      station: { id: '8000152', name: 'Hannover Hbf', location: { latitude: 52.3767, longitude: 9.7410 } },
      destinations: [
        { name: 'Hamburg Hbf', id: '8002549', lat: 53.552736, lon: 10.006909, time: '1:20h' },
        { name: 'Bremen Hbf', id: '8000050', lat: 53.0834, lon: 8.8138, time: '1:20h' },
        { name: 'Braunschweig Hbf', id: '8000049', lat: 52.2523, lon: 10.5401, time: '0:35h' },
        { name: 'Göttingen', id: '8000128', lat: 51.5368, lon: 9.9264, time: '0:50h' },
        { name: 'Goslar', id: '8000130', lat: 51.9114, lon: 10.4216, time: '1:15h' },
        { name: 'Bielefeld Hbf', id: '8000036', lat: 52.0292, lon: 8.5327, time: '1:05h' },
        { name: 'Wolfsburg Hbf', id: '8000252', lat: 52.4287, lon: 10.7876, time: '0:45h' },
        { name: 'Kassel-Wilhelmshöhe', id: '8003200', lat: 51.3130, lon: 9.4468, time: '1:35h' }
      ]
    },
    {
      label: 'Kiel',
      station: { id: '8003368', name: 'Kiel Hbf', location: { latitude: 54.3149, longitude: 10.1320 } },
      destinations: [
        { name: 'Hamburg Hbf', id: '8002549', lat: 53.552736, lon: 10.006909, time: '1:13h' },
        { name: 'Lübeck Hbf', id: '8000237', lat: 53.8672, lon: 10.6698, time: '1:05h' },
        { name: 'Flensburg', id: '8000103', lat: 54.7744, lon: 9.4367, time: '1:15h' },
        { name: 'Husum', id: '8000183', lat: 54.4764, lon: 9.0558, time: '0:50h' },
        { name: 'Rendsburg', id: '8000312', lat: 54.3013, lon: 9.6644, time: '0:25h' },
        { name: 'Neumünster', id: '8000277', lat: 54.0744, lon: 9.9806, time: '0:20h' },
        { name: 'Eckernförde', id: '8000089', lat: 54.4697, lon: 9.8358, time: '0:30h' },
        { name: 'Schleswig', id: '8000329', lat: 54.5058, lon: 9.5392, time: '0:40h' }
      ]
    },
    {
      label: 'Lübeck',
      station: { id: '8000237', name: 'Lübeck Hbf', location: { latitude: 53.8672, longitude: 10.6698 } },
      destinations: [
        { name: 'Hamburg Hbf', id: '8002549', lat: 53.552736, lon: 10.006909, time: '0:43h' },
        { name: 'Kiel Hbf', id: '8003368', lat: 54.3149, lon: 10.1320, time: '1:05h' },
        { name: 'Travemünde Strand', id: '8005929', lat: 53.9592, lon: 10.8711, time: '0:20h' },
        { name: 'Schwerin Hbf', id: '8000339', lat: 53.6343, lon: 11.4075, time: '1:05h' },
        { name: 'Lüneburg', id: '8003762', lat: 53.2505, lon: 10.4191, time: '1:10h' },
        { name: 'Bad Oldesloe', id: '8000020', lat: 53.8064, lon: 10.3694, time: '0:15h' },
        { name: 'Neustadt(Holst)', id: '8004338', lat: 54.1075, lon: 10.8142, time: '0:35h' },
        { name: 'Rostock Hbf', id: '8000309', lat: 54.0782, lon: 12.1311, time: '1:50h' }
      ]
    },
    {
      label: 'Köln',
      station: { id: '8000207', name: 'Köln Hbf', location: { latitude: 50.9432, longitude: 6.9586 } },
      destinations: [
        { name: 'Düsseldorf Hbf', id: '8000085', lat: 51.2198, lon: 6.7943, time: '0:30h' },
        { name: 'Bonn Hbf', id: '8000044', lat: 50.7323, lon: 7.0970, time: '0:20h' },
        { name: 'Aachen Hbf', id: '8000001', lat: 50.7678, lon: 6.0915, time: '0:50h' },
        { name: 'Koblenz Hbf', id: '8000206', lat: 50.3506, lon: 7.5886, time: '0:55h' },
        { name: 'Wuppertal Hbf', id: '8000266', lat: 51.2543, lon: 7.1492, time: '0:35h' },
        { name: 'Mönchengladbach', id: '8000253', lat: 51.1963, lon: 6.4461, time: '0:45h' },
        { name: 'Mainz Hbf', id: '8000240', lat: 50.0012, lon: 8.2588, time: '1:40h' },
        { name: 'Siegen Hbf', id: '8000086', lat: 50.8753, lon: 8.0169, time: '1:35h' }
      ]
    },
    {
      label: 'München',
      station: { id: '8000261', name: 'München Hbf', location: { latitude: 48.1402, longitude: 11.5583 } },
      destinations: [
        { name: 'Augsburg Hbf', id: '8000013', lat: 48.3654, lon: 10.8856, time: '0:40h' },
        { name: 'Garmisch-Partenk.', id: '8000122', lat: 47.4919, lon: 11.0963, time: '1:20h' },
        { name: 'Salzburg Hbf', id: '8100002', lat: 47.8130, lon: 13.0456, time: '1:45h' },
        { name: 'Regensburg Hbf', id: '8000311', lat: 49.0117, lon: 12.0991, time: '1:30h' },
        { name: 'Rosenheim', id: '8000320', lat: 47.8504, lon: 12.1192, time: '0:40h' },
        { name: 'Ingolstadt Hbf', id: '8000185', lat: 48.7443, lon: 11.4361, time: '0:50h' },
        { name: 'Kempten(Allgäu)', id: '8000199', lat: 47.7197, lon: 10.3164, time: '1:25h' },
        { name: 'Landshut(Bay)Hbf', id: '8000223', lat: 48.5444, lon: 12.1436, time: '0:45h' }
      ]
    },
    {
      label: 'Frankfurt',
      station: { id: '8000105', name: 'Frankfurt(Main)Hbf', location: { latitude: 50.1071, longitude: 8.6637 } },
      destinations: [
        { name: 'Wiesbaden Hbf', id: '8000250', lat: 50.0710, lon: 8.2435, time: '0:35h' },
        { name: 'Mainz Hbf', id: '8000240', lat: 50.0012, lon: 8.2588, time: '0:35h' },
        { name: 'Heidelberg Hbf', id: '8000156', lat: 49.4036, lon: 8.6756, time: '0:55h' },
        { name: 'Fulda', id: '8000115', lat: 50.5547, lon: 9.6841, time: '1:15h' },
        { name: 'Darmstadt Hbf', id: '8000068', lat: 49.8725, lon: 8.6297, time: '0:20h' },
        { name: 'Mannheim Hbf', id: '8000244', lat: 49.4794, lon: 8.4689, time: '0:40h' },
        { name: 'Gießen', id: '8000124', lat: 50.5828, lon: 8.6625, time: '0:45h' },
        { name: 'Würzburg Hbf', id: '8000260', lat: 49.8017, lon: 9.9356, time: '1:10h' }
      ]
    }
  ];

  readonly currentHubDestinations = computed(() => {
    const hub = this.startingHubs.find(h => h.label === this.selectedStartingHub()) ?? this.startingHubs[0];
    return hub.destinations;
  });

  readonly primaryDestinations = computed(() => {
    const dests = this.currentHubDestinations();
    // Return 4 destinations to form exactly 2 balanced rows with starting selector on row 1 and dropdown on row 2
    return dests.slice(0, Math.min(dests.length, 4));
  });

  readonly formattedSelectedDate = computed(() => {
    const dStr = this.selectedDate();
    if (!dStr) return 'Datum wählen';
    const parts = dStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
      }
    }
    return dStr;
  });

  readonly calendarMonthLabel = computed(() => {
    const d = this.calendarViewDate();
    return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  });

  readonly calendarGrid = computed(() => {
    const viewDate = this.calendarViewDate();
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const selectedDateStr = this.selectedDate() || this.getCurrentDateString();
    const todayStr = this.getCurrentDateString();

    const firstDayOfMonth = new Date(year, month, 1);
    // In JS getDay(): 0 is Sunday, 1 is Monday... 6 is Saturday. Convert to Monday=0
    const dayOfWeek = (firstDayOfMonth.getDay() + 6) % 7; 

    const days: { dateStr: string; dayNumber: number; isCurrentMonth: boolean; isToday: boolean; isSelected: boolean; isPast: boolean }[] = [];

    // Days from previous month
    const prevMonthLastDate = new Date(year, month, 0).getDate();
    for (let i = dayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDate - i;
      const prevDate = new Date(year, month - 1, d);
      const dateStr = this.formatDateIso(prevDate);
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDateStr,
        isPast: dateStr < todayStr
      });
    }

    // Days of current month
    const lastDateCurrentMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= lastDateCurrentMonth; d++) {
      const curDate = new Date(year, month, d);
      const dateStr = this.formatDateIso(curDate);
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDateStr,
        isPast: dateStr < todayStr
      });
    }

    // Days of next month to fill complete weeks (multiples of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d);
      const dateStr = this.formatDateIso(nextDate);
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDateStr,
        isPast: dateStr < todayStr
      });
    }

    return days;
  });

  readonly visiblePopularDestinations = computed(() => {
    const dests = this.currentHubDestinations();
    return this.showAllPopularDestinations()
      ? dests
      : dests.slice(0, 3);
  });

  readonly curatedDestinations: CuratedDestination[] = [
    {
      name: 'Westerland (Sylt)',
      stationName: 'Westerland(Sylt)',
      stationId: '8006423',
      lat: 54.9073,
      lon: 8.3097,
      category: 'kueste',
      categoryLabel: '🌊 Küste & Meer',
      line: 'RE 6 Direkt',
      duration: '3:10h',
      description: 'Über den Hindenburgdamm direkt an die Nordsee: Dünen, Wattenmeer & Brandung.'
    },
    {
      name: 'Lübeck Altstadt',
      stationName: 'Lübeck Hbf',
      stationId: '8000237',
      lat: 53.8672,
      lon: 10.6698,
      category: 'kultur',
      categoryLabel: '🏰 Kultur & Welterbe',
      line: 'RE 8 / RE 80 Direkt',
      duration: '0:43h',
      description: 'UNESCO-Altstadtinsel, Holstentor, Marzipan-Tradition und backsteingotische Gassen.'
    },
    {
      name: 'Lüneburger Heide',
      stationName: 'Lüneburg',
      stationId: '8003762',
      lat: 53.2505,
      lon: 10.4191,
      category: 'natur',
      categoryLabel: '🌲 Natur & Wandern',
      line: 'metronom RE 3 Direkt',
      duration: '0:30h',
      description: 'Historische Salzstadt mit romantischem Wasserviertel und direktem Zugang zur Heide.'
    },
    {
      name: 'Schweriner Schloss',
      stationName: 'Schwerin Hbf',
      stationId: '8000339',
      lat: 53.6343,
      lon: 11.4075,
      category: 'kultur',
      categoryLabel: '🏰 Schloss & Kultur',
      line: 'RE 1 Direkt',
      duration: '1:15h',
      description: 'Märchenhaftes Schloss im Schweriner See, herrschaftliche Parks und Schlossgarten.'
    },
    {
      name: 'Kieler Förde & Strand',
      stationName: 'Kiel Hbf',
      stationId: '8003368',
      lat: 54.3149,
      lon: 10.1320,
      category: 'kueste',
      categoryLabel: '🌊 Küste & Segeln',
      line: 'RE 7 / RE 70 Direkt',
      duration: '1:13h',
      description: 'Landeshauptstadt mit maritimem Flair, Fördefähren nach Laboe und Ostseestrand.'
    },
    {
      name: 'Bremen & Schnoor',
      stationName: 'Bremen Hbf',
      stationId: '8000050',
      lat: 53.0834,
      lon: 8.8138,
      category: 'kultur',
      categoryLabel: '🏰 Kultur & Hanse',
      line: 'metronom RE 4 Direkt',
      duration: '1:05h',
      description: 'Die Bremer Stadtmusikanten, das historische Schnoorviertel und die Weserpromenade.'
    },
    {
      name: 'Ostseebad Warnemünde',
      stationName: 'Rostock Hbf',
      stationId: '8000309',
      lat: 54.0782,
      lon: 12.1311,
      category: 'kueste',
      categoryLabel: '🌊 Ostsee & Strand',
      line: 'RE 1 / S-Bahn',
      duration: '2:05h',
      description: 'Breiter weißer Ostseesandstrand, Leuchtturm und fangfrischer Fisch am Alten Strom.'
    },
    {
      name: 'Harzgebirge & Goslar',
      stationName: 'Goslar',
      stationId: '8000130',
      lat: 51.9060,
      lon: 10.4285,
      category: 'natur',
      categoryLabel: '🌲 Natur & Berge',
      line: 'metronom + RE',
      duration: '2:35h',
      description: 'Tausendjährige Kaiserstadt am Fuße des Harzes mit Wanderrouten in den Nationalpark.'
    }
  ];

  readonly sideHighlights = this.curatedDestinations.slice(0, 4);

  readonly filteredDiscoveryDestinations = computed(() => {
    const category = this.discoveryCategory();
    if (category === 'all') {
      return this.curatedDestinations;
    }
    return this.curatedDestinations.filter(d => d.category === category);
  });

  searchForm = this.fb.group({
    date: [this.getCurrentDateString(), Validators.required],
    time: [this.getCurrentTimeString(), Validators.required],
    dTicketOnly: [true],
    includeFernverkehr: [false]
  });

  readonly sortedJourneys = computed(() => {
    const list = [...this.journeys()];
    const criteria = this.sortBy();

    if (criteria === 'fastest') {
      return list.sort((a, b) => {
        if (a.durationMinutes !== b.durationMinutes) {
          return a.durationMinutes - b.durationMinutes;
        }
        if (a.transfers !== b.transfers) {
          return a.transfers - b.transfers;
        }
        return new Date(a.departure).getTime() - new Date(b.departure).getTime();
      });
    }
    if (criteria === 'fewest-transfers') {
      return list.sort((a, b) => {
        if (a.transfers !== b.transfers) {
          return a.transfers - b.transfers;
        }
        if (a.durationMinutes !== b.durationMinutes) {
          return a.durationMinutes - b.durationMinutes;
        }
        return new Date(a.departure).getTime() - new Date(b.departure).getTime();
      });
    }
    if (criteria === 'departure') {
      return list.sort((a, b) => {
        const timeA = new Date(a.departure).getTime();
        const timeB = new Date(b.departure).getTime();
        if (timeA !== timeB) {
          return timeA - timeB;
        }
        return a.durationMinutes - b.durationMinutes;
      });
    }
    return list;
  });

  readonly currentStreetAndNumber = computed<string>(() => {
    const streetNum = this.transitService.userStreetNumber();
    if (streetNum && streetNum !== 'Aktueller Standort' && streetNum !== 'Hamburg Hbf' && !streetNum.includes('Mönckebergstraße')) {
      const firstPart = streetNum.split(',')[0].trim();
      return firstPart.replace(/\b\d{5}\b.*$/, '').trim();
    }
    const addr = this.transitService.userAddress();
    if (addr && addr !== 'Aktueller Standort' && !addr.includes('Mönckebergstraße')) {
      const parts = addr.split(',');
      if (parts.length > 0 && parts[0].trim()) {
        const firstPart = parts[0].trim();
        return firstPart.replace(/\b\d{5}\b.*$/, '').trim();
      }
    }
    const loc = this.transitService.userLocation();
    if (this.transitService.isRealGpsAcquired() && loc) {
      const nearest = this.transitService.findNearestStationToCoordinates(loc.latitude, loc.longitude);
      return nearest ? `Nähe ${nearest.name}` : 'Aktueller Standort';
    }
    return 'Aktueller Standort';
  });

  readonly currentFullAddress = computed<string>(() => {
    const addr = this.transitService.userAddress();
    if (addr && addr !== 'Aktueller Standort' && addr !== 'Hamburg Hbf' && !addr.includes('Mönckebergstraße')) {
      return addr;
    }
    const streetNum = this.transitService.userStreetNumber();
    if (streetNum && streetNum !== 'Aktueller Standort' && streetNum !== 'Hamburg Hbf' && !streetNum.includes('Mönckebergstraße')) {
      return streetNum;
    }
    const loc = this.transitService.userLocation();
    if (this.transitService.isRealGpsAcquired() && loc) {
      const nearest = this.transitService.findNearestStationToCoordinates(loc.latitude, loc.longitude);
      return nearest ? `Nähe ${nearest.name}${nearest.address ? ', ' + nearest.address : ''}` : 'Aktueller Standort';
    }
    return 'Aktueller Standort';
  });

  readonly standortMapStation = computed<Station>(() => {
    const loc = this.transitService.userLocation() || { latitude: 53.552736, longitude: 10.006909 };
    return {
      id: 'current-location',
      name: `Dein Standort (${this.currentStreetAndNumber()})`,
      isCurrentLocation: true,
      location: loc
    };
  });

  readonly nearbyStations = computed<NearbyStationDisplay[]>(() => {
    const loc = this.transitService.userLocation() || { latitude: 53.552736, longitude: 10.006909 };
    const list: NearbyStationDisplay[] = [];

    for (const s of ALL_GERMAN_STATIONS) {
      if (
        !s.location ||
        s.isCurrentLocation ||
        s.id === 'current-location' ||
        s.name.toLowerCase().includes('standort') ||
        s.name.toLowerCase().includes('location')
      ) {
        continue;
      }
      const distKm = calculatePreciseDistanceKm(
        loc.latitude,
        loc.longitude,
        s.location.latitude,
        s.location.longitude
      );
      const meters = Math.round(distKm * 1000);
      const distText = meters < 1000 ? `${meters} m` : `${distKm.toFixed(1)} km`;
      const walkMin = Math.max(2, Math.round(meters / 80));

      list.push({
        id: s.id,
        name: s.name,
        location: s.location,
        distKm,
        distanceText: distText,
        walkMinutes: walkMin
      });
    }

    list.sort((a, b) => a.distKm - b.distKm);
    return list.slice(0, 4);
  });

  readonly smartVorschlaege = computed<Station[]>(() => {
    const recent = this.transitService.recentStations() || [];
    const nearbyNames = new Set(this.nearbyStations().map(s => s.name.toLowerCase()));
    const fromName = this.fromStation()?.name?.toLowerCase();
    const toName = this.toStation()?.name?.toLowerCase();

    const cleanRecent: Station[] = [];
    for (const s of recent) {
      if (!s || !s.name) continue;
      const nLower = s.name.toLowerCase();
      if (
        s.isCurrentLocation ||
        s.id === 'current-location' ||
        nLower.includes('standort') ||
        nLower.includes('location') ||
        nearbyNames.has(nLower) ||
        (fromName && nLower === fromName) ||
        (toName && nLower === toName)
      ) {
        continue;
      }
      if (!cleanRecent.some(x => x.name.toLowerCase() === nLower)) {
        cleanRecent.push({
          id: s.id,
          name: s.name,
          location: s.location
        });
      }
    }

    const fallbackCandidates: Station[] = [
      { id: '8000237', name: 'Lübeck Hbf' },
      { id: '8000199', name: 'Kiel Hbf' },
      { id: '8000050', name: 'Bremen Hbf' },
      { id: '8006385', name: 'Westerland (Sylt)' },
      { id: '8010304', name: 'Rostock Hbf' },
      { id: '8000152', name: 'Hannover Hbf' },
      { id: '8010324', name: 'Schwerin Hbf' },
      { id: '8000244', name: 'Lüneburg' }
    ];

    const result: Station[] = [...cleanRecent];
    for (const candidate of fallbackCandidates) {
      if (result.length >= 4) break;
      const cLower = candidate.name.toLowerCase();
      const inResult = result.some(r => r.name.toLowerCase() === cLower);
      const inNearby = nearbyNames.has(cLower);
      const isSelected = (fromName && cLower === fromName) || (toName && cLower === toName);

      if (!inResult && !inNearby && !isSelected) {
        result.push(candidate);
      }
    }

    return result.slice(0, 4);
  });

  applySuggestionToActiveInput(station: Station) {
    const target = this.activeInput();
    if (target === 'from') {
      this.fromStation.set(station);
      this.fromStationQuery.set(station.name);
      this.transitService.recordRecentStation(station);
      this.checkAndTriggerAutoSearch('from');
    } else if (target.startsWith('via-')) {
      this.onViaStationChange(target, station);
      this.transitService.recordRecentStation(station);
    } else {
      this.toStation.set(station);
      this.toStationQuery.set(station.name);
      this.transitService.recordRecentStation(station);
      this.checkAndTriggerAutoSearch('to');
    }
  }

  async refreshDestinationWeather(event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
    }
    const to = this.toStation();
    const list = this.journeys();
    const target = to || this.activeJourneyForMap()?.destination || (list.length > 0 ? list[0]?.destination : null);
    if (target) {
      await this.weatherService.getWeatherForStation(target, true);
    }
  }

  constructor() {
    effect(() => {
      const list = this.journeys();
      const to = this.toStation();
      if (list.length > 0) {
        const target = to || list[0]?.destination;
        if (target) {
          this.weatherService.getWeatherForStation(target);
        }
      }
    });
  }

  ngOnInit() {
    this.transitService.startActiveTracking();
    this.syncStandortOrigin();
  }

  ngAfterViewInit() {
    this.focusDestinationInput();
  }

  focusOriginInput() {
    this.activeInput.set('from');
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        const el = document.getElementById('input-from-station') as HTMLInputElement;
        if (el) {
          el.focus();
          this.activeInput.set('from');
        }
      }, 60);
    }
  }

  focusDestinationInput() {
    this.activeInput.set('to');
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        const el = document.getElementById('input-to-station') as HTMLInputElement;
        if (el) {
          el.focus();
          this.activeInput.set('to');
        }
      }, 60);
    }
  }

  /**
   * Automatische Suche und intelligenter Fokus-Wechsel:
   * - Wenn das Ziel (Destino) eingegeben/ausgewählt wurde:
   *     - Falls Startbahnhof vorhanden ist: Sofort Verbindungssuche starten!
   *     - Falls Startbahnhof leer ist: Fokus sofort auf den Startbahnhof (Origen) legen.
   * - Sobald der Startbahnhof eingegeben wurde:
   *     - Prüfen, ob das Ziel bereits feststeht: Wenn ja, sofort suchen!
   *     - Falls kein Ziel vorhanden: Fokus auf das Ziel legen.
   */
  checkAndTriggerAutoSearch(triggerSource: 'from' | 'to' | 'via') {
    const from = this.fromStation();
    const fromQ = this.fromStationQuery().trim();
    const to = this.toStation();
    const toQ = this.toStationQuery().trim();

    const hasFrom = !!((from && (from.name || from.isCurrentLocation)) || (fromQ && fromQ !== ''));
    const hasTo = !!((to && to.name) || (toQ && toQ !== ''));

    if (triggerSource === 'to') {
      if (hasTo && hasFrom) {
        // Ziel erkannt und Start ist vorhanden -> Sofort suchen!
        setTimeout(() => this.onSearchSubmit(), 80);
      } else if (hasTo && !hasFrom) {
        // Ziel erkannt, aber Start ist leer -> Fokus sofort auf Start!
        this.focusOriginInput();
      }
    } else if (triggerSource === 'from') {
      if (hasFrom && hasTo) {
        // Start eingegeben und Ziel bereits vorhanden -> Sofort suchen!
        setTimeout(() => this.onSearchSubmit(), 80);
      } else if (hasFrom && !hasTo) {
        // Start eingegeben, aber Ziel noch leer -> Fokus auf Ziel!
        this.focusDestinationInput();
      }
    } else if (triggerSource === 'via') {
      if (hasFrom && hasTo) {
        setTimeout(() => this.onSearchSubmit(), 80);
      }
    }
  }

  private async syncStandortOrigin() {
    const loc = this.transitService.userLocation();
    const currentStreet = this.currentStreetAndNumber();
    this.fromStation.set({
      id: 'current-location',
      name: currentStreet,
      isCurrentLocation: true,
      location: loc || undefined
    });
    this.fromStationQuery.set(currentStreet);

    if (!this.transitService.isRealGpsAcquired()) {
      try {
        const res = await this.transitService.requestDetailedGeolocation(false);
        if (res.success && res.coords && this.fromStation()?.isCurrentLocation) {
          const streetAndNumber = res.userStreetNumber || this.currentStreetAndNumber() || 'Aktueller Standort';
          this.fromStation.set({
            id: 'current-location',
            name: streetAndNumber,
            isCurrentLocation: true,
            location: res.coords
          });
          this.fromStationQuery.set(streetAndNumber);
        }
      } catch {
        // Handled silently
      }
    }
  }

  async applyStandortToOrigin(forceRetry = true) {
    this.standortActionState.set('locating');
    this.standortFeedbackMessage.set('Aktuelle GPS-Position wird abgefragt...');
    this.transitService.startActiveTracking();

    try {
      // Erzwingt eine frische GPS-Abfrage des Geräts / Browsers
      const res = await this.transitService.requestDetailedGeolocation(forceRetry);
      if (res.success && res.coords) {
        this.standortActionState.set('success');
        let streetAndNumber = res.userStreetNumber || this.currentStreetAndNumber();
        if (!streetAndNumber || streetAndNumber === 'Aktueller Standort' || streetAndNumber.startsWith('Standort (')) {
          const nearest = this.transitService.findNearestStationToCoordinates(res.coords.latitude, res.coords.longitude);
          streetAndNumber = nearest ? nearest.name : 'Aktueller Standort';
        }

        this.fromStation.set({
          id: 'current-location',
          name: streetAndNumber,
          isCurrentLocation: true,
          location: res.coords
        });
        this.fromStationQuery.set(streetAndNumber);
        this.standortFeedbackMessage.set(`Standort „${streetAndNumber}“ als Start übernommen!`);
        this.showGpsPromptModal.set(false);

        // Automatische Weiterleitung: Wenn Ziel schon da ist -> sofort suchen, sonst Cursor ins Ziel
        this.checkAndTriggerAutoSearch('from');

        setTimeout(() => {
          if (this.standortActionState() === 'success') {
            this.standortActionState.set('idle');
            this.standortFeedbackMessage.set(null);
          }
        }, 4000);
      } else {
        // Geolocation denied, GPS disabled, or timeout -> Prompt to enable GPS
        this.standortActionState.set('gps-warning');
        this.gpsPromptErrorCode.set(res.errorCode ?? null);
        this.gpsPromptMessage.set(res.errorMessage || 'Standortdienst (GPS) ist nicht aktiv. Bitte aktiviere dein GPS.');
        this.standortFeedbackMessage.set(res.errorMessage || 'GPS nicht aktiv. Bitte Standortdienst aktivieren.');
        this.showGpsPromptModal.set(true);
      }
    } catch (err) {
      console.warn('Fehler bei der Standortermittlung:', err);
      this.standortActionState.set('gps-warning');
      this.gpsPromptMessage.set('Standort konnte nicht ermittelt werden. Bitte prüfe dein GPS.');
      this.standortFeedbackMessage.set('GPS-Fehler. Bitte Standortdienst prüfen.');
      this.showGpsPromptModal.set(true);
    }
  }

  openGpsHelpModal() {
    this.showGpsPromptModal.set(true);
  }

  closeGpsModal() {
    this.showGpsPromptModal.set(false);
  }

  async retryGpsActivation() {
    await this.applyStandortToOrigin(true);
  }

  useFallbackLocationAndContinue() {
    const fallbackLoc = { latitude: 53.552736, longitude: 10.006909 };
    const street = 'Hamburg Hbf (Standort)';
    this.fromStation.set({
      id: '8002549',
      name: street,
      isCurrentLocation: false,
      location: fallbackLoc
    });
    this.fromStationQuery.set(street);
    this.standortActionState.set('idle');
    this.standortFeedbackMessage.set(null);
    this.showGpsPromptModal.set(false);
    this.checkAndTriggerAutoSearch('from');
  }

  openStandortMap() {
    this.showStandortMap.set(true);
    const loc = this.transitService.userLocation() || { latitude: 53.552736, longitude: 10.006909 };
    const street = this.currentStreetAndNumber();
    const st: Station = {
      id: 'current-location',
      name: `Dein Standort (${street})`,
      isCurrentLocation: true,
      location: loc
    };
    this.showStationOnMap.emit(st);
  }

  closeStandortMap() {
    this.showStandortMap.set(false);
  }

  getCurrentDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  getCurrentTimeString(): string {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  swapStations() {
    const from = this.fromStation();
    const to = this.toStation();
    this.fromStation.set(to);
    this.toStation.set(from);

    // If there are multiple via stations, reverse their order on route swap
    if (this.viaStations().length > 1) {
      this.viaStations.update(list => [...list].reverse());
    }

    if (to && from) {
      this.onSearchSubmit();
    }
  }

  addViaStation() {
    const id = 'via-' + Date.now();
    this.viaStations.update(list => [...list, { id, station: null, query: '' }]);
    this.activeInput.set(id);
  }

  removeViaStation(id: string) {
    this.viaStations.update(list => list.filter(v => v.id !== id));
    if (this.hasSearched() && this.fromStation() && this.toStation()) {
      this.onSearchSubmit();
    }
  }

  onViaStationChange(id: string, station: Station | null) {
    this.viaStations.update(list => list.map(v => v.id === id ? { ...v, station, query: station ? station.name : '' } : v));
    if (station && this.fromStation() && this.toStation()) {
      this.checkAndTriggerAutoSearch('via');
    }
  }

  onViaQueryChange(id: string, query: string) {
    this.viaStations.update(list => list.map(v => v.id === id ? { ...v, query } : v));
  }

  setDestination(dest: { name: string; id: string; lat: number; lon: number }) {
    this.toStation.set({
      id: dest.id,
      name: dest.name,
      location: { latitude: dest.lat, longitude: dest.lon }
    });
    this.toStationQuery.set(dest.name);
    this.checkAndTriggerAutoSearch('to');
  }

  onDropdownDestinationChange(destId: string) {
    if (!destId) return;
    const dest = this.currentHubDestinations().find(d => d.id === destId);
    if (dest) {
      this.setDestination(dest);
    }
  }

  onStartingHubChange(hubLabel: string) {
    this.selectedStartingHub.set(hubLabel);
    const hub = this.startingHubs.find(h => h.label === hubLabel);
    if (hub) {
      this.fromStation.set(hub.station);
      // If the toStation matches the new origin station, select the first destination of the new hub
      if (this.toStation()?.id === hub.station.id && hub.destinations.length > 0) {
        const first = hub.destinations[0];
        this.toStation.set({
          id: first.id,
          name: first.name,
          location: { latitude: first.lat, longitude: first.lon }
        });
      }
      this.onSearchSubmit();
    }
  }

  selectCuratedDestination(dest: CuratedDestination) {
    this.fromStation.set({
      id: '8002549',
      name: 'Hamburg Hbf',
      location: { latitude: 53.552736, longitude: 10.006909 }
    });
    this.toStation.set({
      id: dest.stationId,
      name: dest.stationName || dest.name,
      location: { latitude: dest.lat, longitude: dest.lon }
    });
    this.onSearchSubmit();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleDatePickerPopup() {
    this.showDatePickerPopup.update(v => !v);
  }

  openDatePickerPopup() {
    const currentDateVal = this.selectedDate() || this.searchForm.get('date')?.value;
    if (currentDateVal) {
      const parts = currentDateVal.split('-');
      if (parts.length === 3) {
        this.calendarViewDate.set(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1));
      }
    }
    this.showDatePickerPopup.set(true);
  }

  closeDatePickerPopup() {
    this.showDatePickerPopup.set(false);
  }

  changeCalendarMonth(offset: number) {
    const current = this.calendarViewDate();
    const nextDate = new Date(current.getFullYear(), current.getMonth() + offset, 1);
    this.calendarViewDate.set(nextDate);
  }

  selectCalendarDate(dateStr: string) {
    this.selectedDate.set(dateStr);
    this.searchForm.patchValue({ date: dateStr });
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const currentView = this.calendarViewDate();
      if (currentView.getFullYear() !== year || currentView.getMonth() !== month) {
        this.calendarViewDate.set(new Date(year, month, 1));
      }
    }
  }

  setDatePreset(preset: 'today' | 'tomorrow' | 'weekend') {
    const now = new Date();
    if (preset === 'today') {
      const dateStr = this.getCurrentDateString();
      this.selectedDate.set(dateStr);
      this.searchForm.patchValue({ date: dateStr });
      this.calendarViewDate.set(now);
    } else if (preset === 'tomorrow') {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const dateStr = this.formatDateIso(tomorrow);
      this.selectedDate.set(dateStr);
      this.searchForm.patchValue({ date: dateStr });
      this.calendarViewDate.set(tomorrow);
    } else if (preset === 'weekend') {
      const day = now.getDay(); // 0 is Sunday, 6 is Saturday
      const daysUntilSaturday = (6 - day + 7) % 7 || 7;
      const saturday = new Date(now.getTime() + daysUntilSaturday * 24 * 60 * 60 * 1000);
      const dateStr = this.formatDateIso(saturday);
      this.selectedDate.set(dateStr);
      this.searchForm.patchValue({ date: dateStr });
      this.calendarViewDate.set(saturday);
    }
  }

  clearDatePicker() {
    const todayStr = this.getCurrentDateString();
    this.selectedDate.set(todayStr);
    this.searchForm.patchValue({ date: todayStr });
    this.calendarViewDate.set(new Date());
    this.closeDatePickerPopup();
  }

  cancelDatePicker() {
    this.closeDatePickerPopup();
  }

  applyDatePicker() {
    this.searchForm.patchValue({
      date: this.selectedDate(),
      time: this.selectedTime()
    });
    this.closeDatePickerPopup();
  }

  private formatDateIso(d: Date): string {
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  toggleTimePickerPopup() {
    this.showTimePickerPopup.update(v => !v);
  }

  closeTimePickerPopup() {
    this.showTimePickerPopup.set(false);
  }

  onTimeInputChange(event: Event) {
    const val = (event.target as HTMLInputElement)?.value;
    if (val) {
      this.selectedTime.set(val);
      this.searchForm.patchValue({ time: val });
    }
  }

  setTimePreset(preset: 'now' | 'plus15m' | 'plus1h' | 'plus2h' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'tomorrow') {
    const now = new Date();
    if (preset === 'now') {
      const dateStr = this.getCurrentDateString();
      const timeStr = this.getCurrentTimeString();
      this.selectedDate.set(dateStr);
      this.selectedTime.set(timeStr);
      this.searchForm.patchValue({
        date: dateStr,
        time: timeStr
      });
    } else if (preset === 'plus15m') {
      const later = new Date(now.getTime() + 15 * 60000);
      const dateStr = this.formatDateIso(later);
      const timeStr = `${later.getHours().toString().padStart(2, '0')}:${later.getMinutes().toString().padStart(2, '0')}`;
      this.selectedDate.set(dateStr);
      this.selectedTime.set(timeStr);
      this.searchForm.patchValue({
        date: dateStr,
        time: timeStr
      });
    } else if (preset === 'plus1h') {
      const later = new Date(now.getTime() + 60 * 60000);
      const dateStr = this.formatDateIso(later);
      const timeStr = `${later.getHours().toString().padStart(2, '0')}:${later.getMinutes().toString().padStart(2, '0')}`;
      this.selectedDate.set(dateStr);
      this.selectedTime.set(timeStr);
      this.searchForm.patchValue({
        date: dateStr,
        time: timeStr
      });
    } else if (preset === 'plus2h') {
      const later = new Date(now.getTime() + 120 * 60000);
      const dateStr = this.formatDateIso(later);
      const timeStr = `${later.getHours().toString().padStart(2, '0')}:${later.getMinutes().toString().padStart(2, '0')}`;
      this.selectedDate.set(dateStr);
      this.selectedTime.set(timeStr);
      this.searchForm.patchValue({
        date: dateStr,
        time: timeStr
      });
    } else if (preset === 'morning') {
      this.selectedTime.set('08:00');
      this.searchForm.patchValue({
        time: '08:00'
      });
    } else if (preset === 'noon') {
      this.selectedTime.set('12:00');
      this.searchForm.patchValue({
        time: '12:00'
      });
    } else if (preset === 'afternoon') {
      this.selectedTime.set('15:30');
      this.searchForm.patchValue({
        time: '15:30'
      });
    } else if (preset === 'evening') {
      this.selectedTime.set('18:00');
      this.searchForm.patchValue({
        time: '18:00'
      });
    } else if (preset === 'tomorrow') {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60000);
      const dateStr = this.formatDateIso(tomorrow);
      this.selectedDate.set(dateStr);
      this.selectedTime.set('08:15');
      this.searchForm.patchValue({
        date: dateStr,
        time: '08:15'
      });
    }
  }

  enableFernverkehrAndSearch() {
    this.searchForm.patchValue({ includeFernverkehr: true });
    this.onSearchSubmit();
  }

  onFromStationChange(station: Station | null) {
    this.fromStation.set(station);
    if (station) {
      this.fromStationQuery.set(station.name);
      this.checkAndTriggerAutoSearch('from');
    } else {
      this.fromStationQuery.set('');
    }
  }

  onToStationChange(station: Station | null) {
    this.toStation.set(station);
    if (station) {
      this.toStationQuery.set(station.name);
      this.checkAndTriggerAutoSearch('to');
    } else {
      this.toStationQuery.set('');
    }
  }

  async onSearchSubmit() {
    let from = this.fromStation();
    let to = this.toStation();

    // Fallback if queries exist in input boxes but station object wasn't set yet
    if (!from && this.fromStationQuery().trim()) {
      const q = this.fromStationQuery().trim();
      const match = ALL_GERMAN_STATIONS.find(s => s.name.toLowerCase() === q.toLowerCase());
      from = match || { id: 'custom-from', name: q };
      this.fromStation.set(from);
    }

    if (!to && this.toStationQuery().trim()) {
      const q = this.toStationQuery().trim();
      const match = ALL_GERMAN_STATIONS.find(s => s.name.toLowerCase() === q.toLowerCase());
      to = match || { id: 'custom-to', name: q };
      this.toStation.set(to);
    }

    // If 'from' has not been explicitly chosen, automatically activate current location!
    if (!from) {
      await this.applyStandortToOrigin();
      from = this.fromStation();
    }

    if (!to) {
      this.focusDestinationInput();
      return;
    }

    if (!from) {
      this.focusOriginInput();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.transitService.hasPlannerResults.set(true);

    const formVal = this.searchForm.value;
    const depDateTime = `${formVal.date}T${formVal.time}:00`;

    const isFromCurrentLocation = !!(
      from.isCurrentLocation ||
      from.id === 'current-location' ||
      from.name.toLowerCase().includes('aktueller standort') ||
      from.name.toLowerCase().includes('mein standort') ||
      from.name.toLowerCase().includes('standort')
    );

    let fromQuery = from.name;

    if (isFromCurrentLocation) {
      this.transitService.startActiveTracking();
      const userLoc = this.transitService.userLocation() || (await this.transitService.requestGeolocation(true));
      if (userLoc) {
        const nearest = this.transitService.findNearestStationToCoordinates(userLoc.latitude, userLoc.longitude);
        fromQuery = nearest.name;
      }
    } else {
      this.transitService.stopActiveTracking();
    }

    const activeVia = this.viaStations().find(v => (v.station && v.station.name) || v.query.trim());
    const viaName = activeVia ? (activeVia.station?.name || activeVia.query.trim()) : undefined;

    const res = await this.transitService.findConnections({
      from: fromQuery,
      to: to.name,
      via: viaName,
      departureTime: depDateTime,
      dTicketOnly: formVal.dTicketOnly ?? true,
      includeFernverkehr: formVal.includeFernverkehr ?? false,
      isFromCurrentLocation: isFromCurrentLocation,
      currentLocationCoords: isFromCurrentLocation ? (this.transitService.userLocation() || undefined) : undefined
    });

    this.isLoading.set(false);
    this.hasSearched.set(true);
    this.journeys.set(res.journeys);
    if (res.journeys.length > 0) {
      this.selectedMapJourney.set(res.journeys[0]);
    }

    // Intelligently save searched stations to recent searches
    this.transitService.recordRecentStation(to);
    if (activeVia?.station) {
      this.transitService.recordRecentStation(activeVia.station);
    }
    if (!isFromCurrentLocation && from) {
      this.transitService.recordRecentStation(from);
    }

    if (res.error && res.journeys.length === 0) {
      this.errorMessage.set(res.error);
    }

    if (typeof document !== 'undefined') {
      setTimeout(() => {
        const el = document.getElementById('search-results-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    }
  }

  resetSearch() {
    this.hasSearched.set(false);
    this.isLoading.set(false);
    this.journeys.set([]);
    this.selectedMapJourney.set(null);
    this.showInlineMapPreview.set(false);
    this.isMapExpanded.set(false);
    this.resultsViewMode.set('list');
    this.errorMessage.set('');
    this.transitService.hasPlannerResults.set(false);
    this.weatherService.currentWeather.set(null);
    this.showVerbindungenHeader.set(false);
    this.showWeather.set(false);
    this.focusDestinationInput();
  }

  setResultsViewMode(mode: 'list' | 'map'): void {
    this.resultsViewMode.set(mode);
    if (mode === 'map' && !this.selectedMapJourney() && this.sortedJourneys().length > 0) {
      this.selectedMapJourney.set(this.sortedJourneys()[0]);
    }
    setTimeout(() => {
      this.resultsMapView?.invalidateSize();
      this.inlineMapView?.invalidateSize();
    }, 150);
  }

  toggleMapExpandCollapse(): void {
    const cur = this.isMapExpanded();
    this.isMapExpanded.set(!cur);
    if (!cur && this.resultsViewMode() === 'list') {
      this.showInlineMapPreview.set(true);
    }
    setTimeout(() => {
      this.resultsMapView?.invalidateSize();
      this.inlineMapView?.invalidateSize();
    }, 150);
  }

  toggleInlineMapPreview(): void {
    const next = !this.showInlineMapPreview();
    this.showInlineMapPreview.set(next);
    if (!next) {
      this.isMapExpanded.set(false);
    }
    setTimeout(() => {
      this.inlineMapView?.invalidateSize();
    }, 150);
  }

  selectJourneyForMap(journey: ConnectionJourney, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedMapJourney.set(journey);
    setTimeout(() => {
      this.resultsMapView?.invalidateSize();
      this.inlineMapView?.invalidateSize();
    }, 100);
  }

  showJourneyInMapFocus(journey: ConnectionJourney, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedMapJourney.set(journey);
    this.resultsViewMode.set('map');
    setTimeout(() => {
      this.resultsMapView?.invalidateSize();
    }, 150);
  }

  onWalkIconClick(journey: ConnectionJourney, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.selectedMapJourney.set(journey);
    if (this.resultsViewMode() === 'map') {
      setTimeout(() => {
        this.resultsMapView?.invalidateSize();
        this.resultsMapView?.focusStep(0);
        this.resultsMapView?.focusWalkingTrajectory();
      }, 150);
    }
    this.viewWalkRoute.emit(journey);
  }

  getMapToggleTooltip(): string {
    if (this.resultsViewMode() === 'map') {
      return this.isMapExpanded() ? 'Kartenhöhe auf Standard verkleinern' : 'Kartenhöhe auf Vollansicht vergrößern';
    }
    return this.isMapExpanded() ? 'Kartenansicht einklappen' : 'Karte vergrößern & einblenden';
  }

  toggleVerbindungenHeader() {
    this.showVerbindungenHeader.set(!this.showVerbindungenHeader());
  }

  toggleWeather() {
    this.showWeather.set(!this.showWeather());
  }

  setSortCriteria(criteria: 'fastest' | 'fewest-transfers' | 'departure') {
    this.sortBy.set(criteria);
  }

  toggleSortOptions() {
    this.showSortOptions.set(!this.showSortOptions());
  }

  getSortLabel(): string {
    switch (this.sortBy()) {
      case 'fastest': return '⚡ Schnellste';
      case 'fewest-transfers': return '🔄 Umstiege';
      case 'departure': return '⏰ Abfahrt';
      default: return '⚡ Schnellste';
    }
  }

  getDynamicSortBadge(journey: ConnectionJourney, index: number): { label: string; isTop: boolean; icon: string } {
    const criteria = this.sortBy();
    if (criteria === 'fastest') {
      if (index === 0) {
        return { label: `⚡ Schnellste Verbindung (${journey.durationFormatted})`, isTop: true, icon: 'bolt' };
      }
      if (journey.transfers === 0) {
        return { label: 'Direktverbindung', isTop: false, icon: 'check_circle' };
      }
      return { label: `${journey.durationFormatted}`, isTop: false, icon: 'timer' };
    } else if (criteria === 'fewest-transfers') {
      if (index === 0) {
        const transfersText = journey.transfers === 0 ? '0 Umstiege (Direkt)' : `${journey.transfers} Umstieg`;
        return { label: `🔄 Wenigste Umstiege (${transfersText})`, isTop: true, icon: 'swap_horiz' };
      }
      if (journey.transfers === 0) {
        return { label: '0 Umstiege (Direkt)', isTop: false, icon: 'check_circle' };
      }
      return { label: `${journey.transfers} Umstiege`, isTop: false, icon: 'swap_horiz' };
    } else {
      // departure
      if (index === 0) {
        return { label: `⏰ Früheste Abfahrt (${this.formatTime(journey.departure)} Uhr)`, isTop: true, icon: 'schedule' };
      }
      return { label: `Abfahrt ${this.formatTime(journey.departure)} Uhr`, isTop: false, icon: 'schedule' };
    }
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

  openJourneyDetail(journey: ConnectionJourney) {
    this.viewDetail.emit(journey);
  }

  toggleAccessibilityExpand(journeyId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.expandedAccessibilityJourneyId.update(curr => (curr === journeyId ? null : journeyId));
  }

  getFirstDisruptionNote(acc: RouteAccessibilitySummary): string {
    if (!acc.stationNotes || acc.stationNotes.length === 0) return '';
    const disrupted = acc.stationNotes.find(n => n.hasDisruption);
    return disrupted ? `${disrupted.stationName}: ${disrupted.note}` : '';
  }

  openAccessibilityMonitor(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.switchTab.emit('accessibility');
  }

  toggleExpandJourney(journeyId: string) {
    this.expandedJourneyId.update(current => (current === journeyId ? null : journeyId));
  }

  toggleLegExpanded(journeyId: string, legIndex: number) {
    const key = `${journeyId}_leg_${legIndex}`;
    this.expandedLegKeys.update(map => ({
      ...map,
      [key]: !map[key]
    }));
  }

  isLegExpanded(journeyId: string, legIndex: number): boolean {
    const key = `${journeyId}_leg_${legIndex}`;
    return Boolean(this.expandedLegKeys()[key]);
  }

  toggleAmenitiesExpanded(journeyId: string, legIndex: number) {
    const key = `${journeyId}_amenity_${legIndex}`;
    this.expandedAmenitiesKeys.update(map => ({
      ...map,
      [key]: !map[key]
    }));
  }

  isAmenitiesExpanded(journeyId: string, legIndex: number): boolean {
    const key = `${journeyId}_amenity_${legIndex}`;
    return Boolean(this.expandedAmenitiesKeys()[key]);
  }

  toggleWarningExpanded(journeyId: string) {
    this.expandedWarningKeys.update(map => ({
      ...map,
      [journeyId]: !map[journeyId]
    }));
  }

  isWarningExpanded(journeyId: string): boolean {
    return Boolean(this.expandedWarningKeys()[journeyId]);
  }

  getLegOperator(leg: TransitLeg): string {
    if (leg.line?.operator?.name) {
      return leg.line.operator.name;
    }
    const lineName = (leg.line?.name || '').toUpperCase();
    const product = (leg.line?.product || '').toLowerCase();
    const mode = (leg.line?.mode || '').toLowerCase();

    if (lineName.startsWith('ICE') || lineName.startsWith('IC') || lineName.startsWith('EC') || lineName.startsWith('ECE')) {
      return 'DB Fernverkehr AG';
    }
    if (lineName.startsWith('ME') || lineName.includes('METRONOM')) {
      return 'metronom Eisenbahngesellschaft mbH';
    }
    if (lineName.startsWith('ERX') || lineName.includes('ERIXX') || lineName.includes('ENNO')) {
      return 'erixx GmbH (Netinera)';
    }
    if (lineName.startsWith('AKN') || lineName.startsWith('A1') || lineName.startsWith('A2') || lineName.startsWith('A3')) {
      return 'AKN Eisenbahn GmbH';
    }
    if (lineName.startsWith('NBE') || lineName.includes('NORDBAHN')) {
      return 'nordbahn Eisenbahngesellschaft';
    }
    if (lineName.startsWith('S') || product === 'suburban') {
      return 'S-Bahn Hamburg GmbH (DB Regio)';
    }
    if (lineName.startsWith('U') || product === 'subway') {
      return 'Hamburger Hochbahn AG (HHA)';
    }
    if (lineName.startsWith('FÄHRE') || lineName.startsWith('HADAG') || mode === 'ferry') {
      return 'HADAG Seetouristik und Fährdienst AG';
    }
    if (lineName.startsWith('RE') || lineName.startsWith('RB')) {
      return 'DB Regio AG (Region Nord / NAH.SH)';
    }
    if (product === 'bus') {
      return 'Hamburger Hochbahn AG / VHH';
    }
    return 'Deutsche Bahn AG / Verbundpartner';
  }

  getLegVehicleType(leg: TransitLeg): string {
    const lineName = (leg.line?.name || '').toUpperCase();
    const product = (leg.line?.product || '').toLowerCase();
    const mode = (leg.line?.mode || '').toLowerCase();

    if (lineName.startsWith('ICE')) {
      return 'ICE 4 / ICE 3neo / ICE 1 (Hochgeschwindigkeits-Triebzug)';
    }
    if (lineName.startsWith('IC') || lineName.startsWith('EC')) {
      return 'Intercity 2 Doppelstockwagen / IC-Wagenzug';
    }
    if (lineName.startsWith('RE1')) {
      return 'Hanse-Express (Doppelstock-Wendezug BR 146 / Twindexx)';
    }
    if (lineName.startsWith('RE7') || lineName.startsWith('RE70')) {
      return 'Stadler KISS / FLIRT (Elektrischer Doppelstocktriebzug NAH.SH)';
    }
    if (lineName.startsWith('RE8') || lineName.startsWith('RE80') || lineName.startsWith('RB81')) {
      return 'Alstom Coradia LINT / Doppelstock-Triebzug DB Regio';
    }
    if (lineName.startsWith('ME')) {
      return 'Bombardier Twindexx Doppelstock-Garnitur (metronom)';
    }
    if (lineName.startsWith('S') || product === 'suburban') {
      return 'Baureihe 490 / 474 (Moderner S-Bahn-Elektrotriebzug)';
    }
    if (lineName.startsWith('U') || product === 'subway') {
      return 'DT5 / DT4 U-Bahn-Triebwagen (Hamburger Hochbahn)';
    }
    if (lineName.startsWith('FÄHRE') || lineName.startsWith('HADAG') || mode === 'ferry') {
      return 'HADAG Typ 2000 / Typ 2020 Hafenfähre';
    }
    if (lineName.startsWith('RE') || lineName.startsWith('RB')) {
      return 'Klimatisierter Regional-Triebzug (DB Regio)';
    }
    if (product === 'bus') {
      return 'Mercedes-Benz eCitaro / Niederflur-Gelenkbus';
    }
    return 'Moderner Nahverkehrszug';
  }

  getLegAmenities(leg: TransitLeg): { icon: string; title: string; detail: string; color: string }[] {
    const lineName = (leg.line?.name || '').toUpperCase();
    const product = (leg.line?.product || '').toLowerCase();
    const mode = (leg.line?.mode || '').toLowerCase();

    const isIce = lineName.startsWith('ICE') || lineName.startsWith('ECE') || lineName.startsWith('TGV');
    const isIcEc = lineName.startsWith('IC') || lineName.startsWith('EC');
    const isRegional = lineName.startsWith('RE') || lineName.startsWith('RB') || lineName.startsWith('ME') || lineName.startsWith('AKN') || lineName.startsWith('ERX') || lineName.startsWith('NBE');
    const isSuburban = lineName.startsWith('S') || product === 'suburban';
    const isSubway = lineName.startsWith('U') || product === 'subway';
    const isFerry = lineName.startsWith('FÄHRE') || lineName.startsWith('HADAG') || mode === 'ferry';
    const isBus = product === 'bus' || mode === 'bus';

    if (isIce) {
      return [
        { icon: 'pedal_bike', title: 'Fahrradmitnahme', detail: 'Verbindliche Stellplatzreservierung & Fernverkehrs-Fahrradkarte nötig', color: 'text-[#2D6A4F] bg-[#EDF9F0]' },
        { icon: 'restaurant', title: 'Bordrestaurant & Bordbistro', detail: 'Frische warme Speisen, Bio-Kaffee, Snacks & Am-Platz-Service (1. Kl.)', color: 'text-[#E65100] bg-[#FFF3E0]' },
        { icon: 'ac_unit', title: 'Vollklimatisierung', detail: 'Automatische Fahrgastraum-Klimatisierung mit Frischluftzufuhr', color: 'text-[#0284C7] bg-[#E0F2FE]' },
        { icon: 'wifi', title: 'Highspeed-WLAN (WIFIonICE)', detail: 'Kostenlos in 1. & 2. Klasse inklusive ICE-Portal (Filme, News, Hörbücher)', color: 'text-[#2D6A4F] bg-[#EDF9F0]' },
        { icon: 'power', title: 'Steckdosen & USB', detail: '230V-Steckdosen an jedem Doppelsitzplatz / USB-Ports in ICE 4 & ICE 3neo', color: 'text-[#5D4037] bg-[#FAF7F2]' },
        { icon: 'accessible', title: 'Barrierefreiheit', detail: 'Reservierbare Rollstuhlplätze, fahrzeugeigener Hublift & Universal-WC', color: 'text-[#1B4332] bg-[#EDF9F0]' },
        { icon: 'volume_off', title: 'Ruhe- & Familienbereiche', detail: 'Gekennzeichnete Ruhezonen, Kleinkindabteile & Handy-Arbeitsbereiche', color: 'text-[#6D28D9] bg-[#EDE9FE]' }
      ];
    }

    if (isIcEc) {
      return [
        { icon: 'pedal_bike', title: 'Fahrradmitnahme', detail: 'Reservierungspflichtig mit Fernverkehrs-Fahrradkarte', color: 'text-[#2D6A4F] bg-[#EDF9F0]' },
        { icon: 'restaurant', title: 'Bordbistro / Snack-Service', detail: 'Bordbistro oder mobiler Snack- & Heißgetränkeverkauf am Platz', color: 'text-[#E65100] bg-[#FFF3E0]' },
        { icon: 'ac_unit', title: 'Klimaanlage', detail: 'Fahrgastraum-Klimatisierung in IC2- und modernisierten IC-Wagen', color: 'text-[#0284C7] bg-[#E0F2FE]' },
        { icon: 'wifi', title: 'Kostenloses WLAN', detail: 'WLAN-Zugang im IC2 & modernisierten Intercity-Zügen', color: 'text-[#2D6A4F] bg-[#EDF9F0]' },
        { icon: 'power', title: 'Steckdosen', detail: 'Steckdosen an Tischen und Sitzreihen', color: 'text-[#5D4037] bg-[#FAF7F2]' },
        { icon: 'accessible', title: 'Barrierefreiheit', detail: 'Rollstuhlbereich, Einstiegshilfe & barrierefreies WC', color: 'text-[#1B4332] bg-[#EDF9F0]' }
      ];
    }

    if (isRegional) {
      return [
        { icon: 'pedal_bike', title: 'Fahrradmitnahme', detail: 'Im Mehrzweckabteil mit Fahrrad-Tageskarte Nahverkehr (Kapazität vorbehalten)', color: 'text-[#2D6A4F] bg-[#EDF9F0]' },
        { icon: 'restaurant', title: 'Verpflegung', detail: 'Snack-/Getränkeangebot oder Verpflegungsstationen an den Bahnhöfen', color: 'text-[#E65100] bg-[#FFF3E0]' },
        { icon: 'ac_unit', title: 'Klimatisierung', detail: 'Vollklimatisierte moderne Nahverkehrswagen (Twindexx, KISS, FLIRT, LINT)', color: 'text-[#0284C7] bg-[#E0F2FE]' },
        { icon: 'wifi', title: 'Kostenloses Regional-WLAN', detail: 'Freies Fahrgast-WLAN (z.B. NAH.SH WLAN / DB Regio WiFi / Metronom Free WiFi)', color: 'text-[#2D6A4F] bg-[#EDF9F0]' },
        { icon: 'power', title: 'Steckdosen', detail: 'Verfügbar in der 1. Klasse und an ausgewählten Tischen der 2. Klasse', color: 'text-[#5D4037] bg-[#FAF7F2]' },
        { icon: 'accessible', title: 'Barrierefreier Einstieg', detail: 'Stufenarmer Einstieg, fahrzeugeigene Klapprampe & rollstuhlgerechtes WC', color: 'text-[#1B4332] bg-[#EDF9F0]' }
      ];
    }

    if (isSuburban) {
      return [
        { icon: 'pedal_bike', title: 'Fahrradmitnahme', detail: 'Im HVV kostenlos außerhalb der Sperrzeiten (Mo–Fr 6–9 & 16–18 Uhr, Sommerferien ganztags)', color: 'text-[#2D6A4F] bg-[#EDF9F0]' },
        { icon: 'ac_unit', title: 'Fahrgastraum-Klimatisierung', detail: 'Moderne S-Bahn-Baureihe 490 vollklimatisiert mit Durchgangswagen', color: 'text-[#0284C7] bg-[#E0F2FE]' },
        { icon: 'accessible', title: 'Stufenloser Einstieg', detail: 'Ebenerdiger Einstieg an Hochbahnsteigen & Einstiegshilfe an Tür 1 beim Triebfahrzeugführer', color: 'text-[#1B4332] bg-[#EDF9F0]' },
        { icon: 'wifi', title: 'Stations- & Fahrzeug-WLAN', detail: 'Freies WLAN (MobyKlick / DB WiFi) an Hamburger S-Bahn-Haltestellen', color: 'text-[#2D6A4F] bg-[#EDF9F0]' }
      ];
    }

    if (isSubway) {
      return [
        { icon: 'pedal_bike', title: 'Fahrradmitnahme', detail: 'Kostenlos im HVV außerhalb der Sperrzeiten (werktags 6–9 & 16–18 Uhr)', color: 'text-[#2D6A4F] bg-[#EDF9F0]' },
        { icon: 'ac_unit', title: 'Belüftung & Klimatisierung', detail: 'DT5-Triebwagen klimatisiert & voll durchgängig', color: 'text-[#0284C7] bg-[#E0F2FE]' },
        { icon: 'accessible', title: 'Barrierefreiheit', detail: 'Über 95% der U-Bahn-Stationen mit Aufzügen & Blindenleitsystem barrierefrei ausgebaut', color: 'text-[#1B4332] bg-[#EDF9F0]' }
      ];
    }

    if (isFerry) {
      return [
        { icon: 'pedal_bike', title: 'Fahrradmitnahme', detail: 'Fahrräder auf dem Hauptdeck im HVV kostenfrei gestattet', color: 'text-[#2D6A4F] bg-[#EDF9F0]' },
        { icon: 'deck', title: 'Freideck & Panoramasalon', detail: 'Beheizter Innensalon und offenes Oberdeck mit Blick auf Elbe und Hafen', color: 'text-[#0284C7] bg-[#E0F2FE]' },
        { icon: 'accessible', title: 'Barrierefreiheit', detail: 'Stufenfreier Zugang über schwimmende HADAG-Pontons und Rampen', color: 'text-[#1B4332] bg-[#EDF9F0]' }
      ];
    }

    if (isBus) {
      return [
        { icon: 'pedal_bike', title: 'Fahrradmitnahme', detail: 'Reguläre Fahrräder im Bus nicht gestattet (nur zusammengeklappte Falträder)', color: 'text-[#9A2218] bg-[#FBEAEB]' },
        { icon: 'ac_unit', title: 'Klimatisierung', detail: 'Vollklimatisierte moderne Niederflurbusse / Elektrobusse (eCitaro)', color: 'text-[#0284C7] bg-[#E0F2FE]' },
        { icon: 'accessible', title: 'Barrierefreier Einstieg', detail: '100% Niederflurfahrzeuge mit Absenkautomatik (Kneeling) & Klapprampe', color: 'text-[#1B4332] bg-[#EDF9F0]' }
      ];
    }

    return [
      { icon: 'pedal_bike', title: 'Fahrradmitnahme', detail: 'Nach Maßgabe freier Plätze im Fahrzeug', color: 'text-[#2D6A4F] bg-[#EDF9F0]' },
      { icon: 'ac_unit', title: 'Klimatisierung', detail: 'Fahrgastraum belüftet / klimatisiert', color: 'text-[#0284C7] bg-[#E0F2FE]' },
      { icon: 'accessible', title: 'Barrierefreiheit', detail: 'Niederflureinstieg mit Klapprampe', color: 'text-[#1B4332] bg-[#EDF9F0]' }
    ];
  }

  getTotalStopovers(journey: ConnectionJourney): number {
    if (!journey.legs || journey.legs.length === 0) return 0;
    return journey.legs.reduce((acc, leg) => acc + (leg.stopovers?.length || 0), 0);
  }

  isLastLeg(journey: ConnectionJourney, legIndex: number): boolean {
    return legIndex === (journey.legs?.length || 1) - 1;
  }

  getPreviousStationName(journey: ConnectionJourney): string | null {
    if (!journey.legs || journey.legs.length === 0) return null;
    const lastLeg = journey.legs[journey.legs.length - 1];
    const intermediateStops = this.getLegIntermediateStopovers(lastLeg);
    if (intermediateStops.length > 0) {
      return intermediateStops[intermediateStops.length - 1]?.stop?.name || null;
    }
    if (journey.legs.length > 1) {
      return lastLeg.origin.name || null;
    }
    return null;
  }

  getLegIntermediateStopovers(leg: TransitLeg): Stopover[] {
    if (!leg?.stopovers || leg.stopovers.length === 0) return [];
    return leg.stopovers.filter((s: Stopover) => {
      const name = s.stop?.name;
      return Boolean(name) && name !== leg.origin.name && name !== leg.destination.name;
    });
  }

  getLegStopoverNames(leg: TransitLeg): string[] {
    return this.getLegIntermediateStopovers(leg)
      .map((s: Stopover) => s.stop?.name)
      .filter((n: string | undefined): n is string => Boolean(n));
  }

  getLegIntermediatePreview(leg: TransitLeg, max = 3): string {
    const stops = this.getLegStopoverNames(leg);
    if (stops.length === 0) return '';
    if (stops.length <= max) {
      return stops.join(' • ');
    }
    return `${stops.slice(0, max).join(' • ')} +${stops.length - max} weitere`;
  }

  getLegVehicleIcon(leg: TransitLeg): string {
    if (leg.walking) return 'directions_walk';
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
    if (leg.walking) return 'bg-[#F5EFE6] text-[#4E342E] border-[#E6DED6]';
    const name = leg.line?.name || '';
    if (name.startsWith('RE')) return 'bg-[#1B4332] text-white border-[#2D6A4F]';
    if (name.startsWith('RB')) return 'bg-[#4E342E] text-white border-[#5D4037]';
    if (name.startsWith('S')) return 'bg-[#15803D] text-white border-[#166534]';
    if (name.startsWith('U')) return 'bg-[#0284C7] text-white border-[#0369A1]';
    if (name.startsWith('ICE') || name.startsWith('IC')) return 'bg-[#C8372D] text-white border-[#B91C1C]';
    if (name.startsWith('Bus')) return 'bg-[#7C3AED] text-white border-[#6D28D9]';
    return 'bg-[#3E2723] text-white border-[#4E342E]';
  }

  formatHvvDuration(minutes: number): string {
    if (!minutes || minutes <= 0) return '0 min';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
  }

  getFirstTransitDeparture(journey: ConnectionJourney): { stationName: string; time: string } {
    const firstTransitLeg = journey.legs?.find(l => !l.walking && l.line?.name);
    if (firstTransitLeg) {
      return {
        stationName: firstTransitLeg.origin?.name || journey.origin.name,
        time: this.formatTime(firstTransitLeg.departure || journey.departure)
      };
    }
    return {
      stationName: journey.origin.name,
      time: this.formatTime(journey.departure)
    };
  }

  getHvvBadgeStyle(rawName: string): { bg: string; text: string; shape: string } {
    const name = (rawName || '').trim().toUpperCase();
    if (name.startsWith('RB') || name.startsWith('RE') || name.startsWith('ME') || name.startsWith('AKN')) {
      return { bg: 'bg-[#1F1612]', text: 'text-white', shape: 'rounded' };
    }
    if (name === 'S1') return { bg: 'bg-[#15803D]', text: 'text-white', shape: 'rounded-full' };
    if (name === 'S2') return { bg: 'bg-[#991B1B]', text: 'text-white', shape: 'rounded-full' };
    if (name === 'S3') return { bg: 'bg-[#6B21A8]', text: 'text-white', shape: 'rounded-full' };
    if (name === 'S4') return { bg: 'bg-[#0284C7]', text: 'text-white', shape: 'rounded-full' };
    if (name === 'S5') return { bg: 'bg-[#0369A1]', text: 'text-white', shape: 'rounded-full' };
    if (name === 'S7') return { bg: 'bg-[#C2410C]', text: 'text-white', shape: 'rounded-full' };
    if (name.startsWith('S')) return { bg: 'bg-[#15803D]', text: 'text-white', shape: 'rounded-full' };
    if (name === 'U1') return { bg: 'bg-[#0284C7]', text: 'text-white', shape: 'rounded' };
    if (name === 'U2') return { bg: 'bg-[#DC2626]', text: 'text-white', shape: 'rounded' };
    if (name === 'U3') return { bg: 'bg-[#FACC15]', text: 'text-[#1F1612]', shape: 'rounded' };
    if (name === 'U4') return { bg: 'bg-[#0D9488]', text: 'text-white', shape: 'rounded' };
    if (name.startsWith('U')) return { bg: 'bg-[#0284C7]', text: 'text-white', shape: 'rounded' };
    if (name.startsWith('BUS') || name.startsWith('X')) return { bg: 'bg-[#B91C1C]', text: 'text-white', shape: 'rounded' };
    if (name.startsWith('FÄHRE') || name.startsWith('HADAG')) return { bg: 'bg-[#0369A1]', text: 'text-white', shape: 'rounded' };
    return { bg: 'bg-[#1F1612]', text: 'text-white', shape: 'rounded' };
  }

  getDisplayRouteSegments(journey: ConnectionJourney): {
    type: 'walk' | 'transit';
    durationMinutes?: number;
    lineName?: string;
    hasAlert?: boolean;
    style?: { bg: string; text: string; shape: string };
  }[] {
    const segments: {
      type: 'walk' | 'transit';
      durationMinutes?: number;
      lineName?: string;
      hasAlert?: boolean;
      style?: { bg: string; text: string; shape: string };
    }[] = [];

    const hasStartWalk = Boolean(journey.isFromCurrentLocation);
    if (hasStartWalk) {
      segments.push({
        type: 'walk',
        durationMinutes: journey.walkToStartMinutes || 5
      });
    }

    if (journey.legs && journey.legs.length > 0) {
      journey.legs.forEach((leg, index) => {
        if (leg.walking) {
          if (index === 0 && hasStartWalk) return;
          segments.push({
            type: 'walk',
            durationMinutes: leg.durationMinutes || 5
          });
        } else {
          const lineName = leg.line?.name || 'Zug';
          const hasAlert = Boolean(leg.departureDelay || (leg.remarks && leg.remarks.length > 0));
          segments.push({
            type: 'transit',
            lineName,
            hasAlert,
            style: this.getHvvBadgeStyle(lineName)
          });
        }
      });
    }

    return segments;
  }

  hasJourneyAlerts(journey: ConnectionJourney): boolean {
    if (journey.cancelled) return true;
    if (journey.hasDelay && journey.maxDelay >= 3) return true;
    if (journey.legs?.some(l => l.cancelled || (l.remarks && l.remarks.length > 0))) return true;
    return false;
  }

  getJourneyAlertText(journey: ConnectionJourney): string {
    if (journey.cancelled) return 'Achtung: Fahrt oder Teilabschnitt fällt aus';
    const allRemarks: string[] = [];
    journey.legs?.forEach(l => {
      if (l.remarks) {
        l.remarks.forEach(r => {
          const text = r.summary || r.text;
          if (text) allRemarks.push(text);
        });
      }
    });
    if (allRemarks.length > 0) {
      if (allRemarks.length === 1) return `Achtung: ${allRemarks[0]}`;
      return `Achtung: ${allRemarks.length} Meldungen auf dieser Verbindung`;
    }
    if (journey.hasDelay && journey.maxDelay > 0) {
      return `Achtung: Voraussichtlich +${journey.maxDelay} Min. Verspätung`;
    }
    return 'Achtung: Aktuelle Betriebsmeldung vorhanden';
  }

  getTransferComfort(journey: ConnectionJourney) {
    if (journey.transfers === 0) {
      return {
        type: 'direct',
        label: 'Direktverbindung (0 Umstiege)',
        shortLabel: 'Direktfahrt',
        badgeClass: 'bg-[#EDF9F0] text-[#1B4332] border-[#B7E4C7]',
        icon: 'bolt'
      };
    }
    const minBuffer = journey.transferDetails?.length
      ? Math.min(...journey.transferDetails.map(t => t.bufferMinutes))
      : 12;

    if (minBuffer >= 8) {
      return {
        type: 'comfortable',
        label: `Entspannter Umstieg (${minBuffer} Min. Puffer)`,
        shortLabel: `${minBuffer} Min. Umstieg`,
        badgeClass: 'bg-[#EDF9F0] text-[#1B4332] border-[#B7E4C7]',
        icon: 'check_circle'
      };
    } else if (minBuffer <= 5) {
      return {
        type: 'tight',
        label: `Knapper Umstieg (${minBuffer} Min. Puffer)`,
        shortLabel: `${minBuffer} Min. Umstieg`,
        badgeClass: 'bg-[#FFF3E0] text-[#E65100] border-[#FFE0B2]',
        icon: 'warning'
      };
    } else {
      return {
        type: 'normal',
        label: `${journey.transfers}x Umsteigen (${minBuffer} Min. Puffer)`,
        shortLabel: `${journey.transfers}x Umstieg`,
        badgeClass: 'bg-[#FAF7F2] text-[#4E342E] border-[#E6DED6]',
        icon: 'sync_alt'
      };
    }
  }

  calculateCo2(durationMinutes: number): string {
    const km = Math.max(15, Math.round((durationMinutes / 60) * 80));
    const kg = ((km * 140) / 1000).toFixed(1);
    return `${kg} kg CO₂`;
  }

  getOccupancyPrediction(journey: ConnectionJourney) {
    let depHour = 8;
    try {
      depHour = new Date(journey.departure).getHours();
    } catch {
      depHour = 8;
    }
    const isPeak = (depHour >= 7 && depHour <= 9) || (depHour >= 16 && depHour <= 18);
    if (isPeak) {
      return {
        level: 2,
        label: 'Mittlere Auslastung',
        badgeClass: 'text-[#8B5E3C] bg-[#FFF8E1] border-[#FFE082]'
      };
    }
    return {
      level: 1,
      label: 'Geringe Auslastung',
      badgeClass: 'text-[#2D6A4F] bg-[#F1F8E9] border-[#C5E1A5]'
    };
  }

  async copyJourneySummary(journey: ConnectionJourney) {
    const lines = journey.legs.map(l => l.line?.name || 'Zug').join(' → ');
    const text = `🚆 ${journey.origin.name} (${this.formatTime(journey.departure)}) → ${journey.destination.name} (${this.formatTime(journey.arrival)})\n` +
      `⏱ Dauer: ${journey.durationFormatted || this.formatDuration(journey.durationMinutes)} | ${journey.transfers === 0 ? 'Direktverbindung' : journey.transfers + ' Umstiege'}\n` +
      `Linien: ${lines}\n` +
      `Ticket: ${journey.isDeutschlandticketValid ? '100% Deutschlandticket' : 'Fernverkehr'}`;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        this.copiedJourneyId.set(journey.id);
        setTimeout(() => {
          if (this.copiedJourneyId() === journey.id) {
            this.copiedJourneyId.set(null);
          }
        }, 2500);
      }
    } catch {
      // fallback
    }
  }

  toggleFavoriteRoute(journey: ConnectionJourney) {
    const fromName = journey.origin.name;
    const toName = journey.destination.name;
    if (this.isFavorite(journey)) {
      this.transitService.removeFavoriteRoute(`${fromName.toLowerCase()}-${toName.toLowerCase()}`);
    } else {
      this.transitService.addFavoriteRoute(fromName, toName);
    }
  }

  isFavorite(journey: ConnectionJourney): boolean {
    return this.transitService.isFavoriteRoute(journey.origin.name, journey.destination.name);
  }

  setFromAndTo(from: Station, to?: Station) {
    this.fromStation.set(from);
    if (to) {
      this.toStation.set(to);
      this.onSearchSubmit();
    }
  }

  continueJourneyFromTransfer(transferStation: Station) {
    this.fromStation.set(transferStation);
    this.setTimePreset('now');
    this.onSearchSubmit();
  }

  isOriginCurrentLocation(): boolean {
    const from = this.fromStation();
    return !!(
      from && (
        from.isCurrentLocation ||
        from.id === 'current-location' ||
        from.name.toLowerCase().includes('aktueller standort') ||
        from.name.toLowerCase().includes('mein standort') ||
        from.name.toLowerCase().includes('standort')
      )
    );
  }

  getWalkTimeToStation(station: Station | null): { minutes: number; distanceText: string } {
    const userLoc = this.transitService.userLocation();
    if (!station || !station.location || !userLoc) {
      return { minutes: 5, distanceText: 'ca. 350 m' };
    }
    const metrics = this.transitService.calculateWalkMetrics(
      userLoc.latitude,
      userLoc.longitude,
      station.location.latitude,
      station.location.longitude
    );
    return { minutes: metrics.minutes, distanceText: metrics.distanceText };
  }

  getLeaveRecommendation(journey: ConnectionJourney): string {
    if (!journey.isFromCurrentLocation && !this.isOriginCurrentLocation()) {
      return this.formatTime(journey.departure);
    }
    const walkMinutes = journey.walkToStartMinutes || 5;
    try {
      const depDate = new Date(journey.departure);
      if (!isNaN(depDate.getTime())) {
        const leaveDate = new Date(depDate.getTime() - (walkMinutes + 3) * 60000);
        return leaveDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      }
    } catch {
      // fallback
    }
    return this.formatTime(journey.departure);
  }

  requestGpsLocation(): void {
    this.transitService.requestGeolocation(true);
  }

  onWalkGuideClick(event: Event, journey: ConnectionJourney): void {
    event.stopPropagation();
    if (!this.transitService.userLocation()) {
      this.transitService.requestGeolocation(true);
    }
    this.showOnMap.emit(journey);
  }

  shiftTimeBy(hours: number): void {
    const current = this.selectedTime();
    const [hStr, mStr] = current.split(':');
    let h = parseInt(hStr || '0', 10);
    const m = parseInt(mStr || '0', 10);
    h = (h + hours + 24) % 24;
    const newTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    this.selectedTime.set(newTime);
    this.onSearchSubmit();
  }
}
