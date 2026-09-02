import {
  Component,
  EventEmitter,
  Output,
  signal,
  computed,
  ChangeDetectionStrategy,
  inject,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Station, ConnectionJourney, TransitLeg, Stopover } from '../../models/transit.models';
import { TransitService } from '../../services/transit.service';
import { StationInput } from '../../components/station-input/station-input';

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
  imports: [CommonModule, ReactiveFormsModule, StationInput],
  template: `
    <div class="space-y-5">
      
      <!-- PRIMARY GRID LAYOUT: Connection Planner & Results (Left) + 'Entdecke Deutschland' Highlights (Right) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        <!-- LEFT COLUMN: Minimalist Connection Planner & Direct Results underneath -->
        <div class="lg:col-span-7 space-y-5">
          <!-- CARD 1: Minimalist Connection Planner (DB Navigator style clean layout) -->
          <div class="relative bg-white rounded-xl p-4 sm:p-5 pt-5 sm:pt-6 border border-[#E6DED6] shadow-xs space-y-4">
          
          <!-- Floating Eco Badge with negative margin sitting over the rounded top-left corner border -->
          <div class="absolute -top-3 left-4 inline-flex items-center gap-1 px-2.5 py-0.5 bg-white border border-[#B7E4C7] rounded-full shadow-2xs z-10 select-none">
            <span class="mat-icon text-[16px] text-[#2D6A4F] transform scale-120 inline-block">eco</span>
            <span class="tracking-wide text-[11px] font-black uppercase text-[#1B4332]">-80% CO₂ vs. Pkw</span>
          </div>

          <!-- Form Area -->
          <form [formGroup]="searchForm" (ngSubmit)="onSearchSubmit()" class="space-y-3.5">
            
            <!-- DB-style Clean Station Inputs with vertical swap connector -->
            <div class="relative bg-[#FAF7F2] p-2.5 sm:p-3 rounded-xl border border-[#E6DED6]">
              <div class="grid grid-cols-1 gap-2.5 relative">
                
                <!-- Start Station (Clean with placeholder, no redundant 'Von' label) -->
                <div>
                  <app-station-input
                    [showLabel]="false"
                    label=""
                    placeholder="Von (z.B. Aktueller Standort oder Hamburg Hbf)"
                    iconName="trip_origin"
                    inputId="input-from-station"
                    [initialStation]="fromStation()"
                    [allowCurrentLocation]="true"
                    (stationChange)="onFromStationChange($event)"
                  ></app-station-input>
                </div>

                <!-- Subtle separator line -->
                <div class="h-px bg-[#E6DED6] mx-2"></div>

                <!-- Destination Station (Clean with placeholder, no redundant 'Nach' label) -->
                <div>
                  <app-station-input
                    [showLabel]="false"
                    label=""
                    placeholder="Nach (z.B. Lübeck Hbf, Sylt, Bremen)"
                    iconName="place"
                    inputId="input-to-station"
                    [initialStation]="toStation()"
                    [allowCurrentLocation]="false"
                    (stationChange)="toStation.set($event)"
                  ></app-station-input>
                </div>

                <!-- DB-Style Floating Swap Button on the right side -->
                <button
                  type="button"
                  id="btn-swap-stations"
                  (click)="swapStations()"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white hover:bg-[#EFEBE6] text-[#4E342E] flex items-center justify-center cursor-pointer transition-all shadow-xs border border-[#D7CCC8] hover:border-[#1B4332] z-10"
                  title="Start und Ziel tauschen"
                  aria-label="Start- und Zielbahnhof tauschen"
                >
                  <span class="mat-icon text-base text-[#2D6A4F]" aria-hidden="true">swap_vert</span>
                </button>
              </div>
            </div>

            <!-- Compact Filter Bar: Optionen & Direkt-Ziele Toggle + D-Ticket Status Badge fitting the full width without horizontal scroll -->
            <div class="flex items-center gap-2 pt-1 w-full">
              <!-- Toggle Button to expand/collapse options from 'Direkt ab' to 'Verbindung suchen' -->
              <button
                type="button"
                id="btn-toggle-search-options"
                (click)="showSearchOptions.set(!showSearchOptions())"
                class="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#2D6A4F] text-xs font-bold border border-[#D7CCC8] hover:border-[#1B4332] flex items-center justify-between gap-1.5 cursor-pointer transition-colors shadow-2xs"
                [title]="showSearchOptions() ? 'Suchoptionen einklappen' : 'Suchoptionen und Direktziele ausklappen'"
                [attr.aria-expanded]="showSearchOptions()"
                aria-label="Suchoptionen und Schnellreiseziele umschalten"
              >
                <div class="flex items-center gap-1.5 min-w-0 truncate">
                  <span class="mat-icon text-sm shrink-0" aria-hidden="true">tune</span>
                  <span class="truncate">{{ showSearchOptions() ? 'Optionen verbergen' : 'Optionen & Direkt-Ziele' }}</span>
                </div>
                <span class="mat-icon text-xs text-[#8D6E63] shrink-0" aria-hidden="true">{{ showSearchOptions() ? 'expand_less' : 'expand_more' }}</span>
              </button>

              <!-- D-Ticket Badge with eco leaf icon placed strictly side-by-side with matching height and no overflow -->
              @if (searchForm.get('dTicketOnly')?.value) {
                <span class="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-[#EDF9F0] border border-[#B7E4C7] text-xs font-bold text-[#1B4332] shrink-0 whitespace-nowrap shadow-2xs">
                  <span class="mat-icon text-sm text-[#2D6A4F]" aria-hidden="true">eco</span>
                  <span>D-Ticket</span>
                </span>
              } @else {
                <span class="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#E6DED6] text-xs font-bold text-[#795548] shrink-0 whitespace-nowrap shadow-2xs">
                  <span>inkl. ICE/IC</span>
                </span>
              }
            </div>

            <!-- Wide Search Button when collapsed (matching the aesthetic of Verbindung suchen) -->
            @if (!showSearchOptions()) {
              <div class="pt-0.5">
                <button
                  type="submit"
                  id="btn-search-compact"
                  [disabled]="isLoading() || !fromStation() || !toStation()"
                  class="w-full py-2.5 sm:py-3 bg-[#1B4332] hover:bg-[#132A1E] disabled:bg-[#EFEBE6] disabled:text-[#A1887F] disabled:cursor-not-allowed text-white font-black text-xs tracking-wider rounded-lg shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  aria-label="Verbindung suchen"
                >
                  @if (isLoading()) {
                    <span class="mat-icon animate-spin text-sm" aria-hidden="true">sync</span>
                    <span>LADEN...</span>
                  } @else {
                    <span class="mat-icon text-sm" aria-hidden="true">search</span>
                    <span>VERBINDUNG SUCHEN</span>
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

                <!-- Custom Unified Date & Time Picker Modal (Centered in Middle of Screen) -->
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
                      <div class="grid grid-cols-7 gap-1 text-center text-xs mb-3" role="grid" aria-label="Monatsübersicht">
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

                      <!-- Quick Time Access Options: Jetzt, in 15min, 1h, 2h + Tageszeiten -->
                      <div class="pt-2.5 border-t border-[#EFEBE6] mb-3 space-y-1.5">
                        <div class="flex items-center justify-between">
                          <span class="text-[10px] font-bold text-[#8D6E63] uppercase tracking-wider flex items-center gap-1">
                            <span class="mat-icon text-[11px] text-[#2D6A4F]" aria-hidden="true">schedule</span>
                            <span>Uhrzeit wählen</span>
                          </span>
                          <span class="text-[10px] font-bold text-[#1B4332] bg-[#EDF9F0] px-1.5 py-0.5 rounded-[4px]">{{ selectedTime() }} Uhr</span>
                        </div>

                        <!-- 4 Quick Buttons (Jetzt, 15 min, 1h, 2h) -->
                        <div class="grid grid-cols-4 gap-1">
                          <button
                            type="button"
                            (click)="setTimePreset('now')"
                            class="px-1 py-1 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EDF9F0] hover:border-[#2D6A4F] text-[#1B4332] border border-[#E6DED6] text-[10px] font-bold flex flex-col items-center gap-0.5 cursor-pointer transition-colors"
                            title="Jetzt abfahren"
                            aria-label="Abfahrtszeit auf Jetzt setzen"
                          >
                            <span class="mat-icon text-[11px] text-[#2D6A4F]" aria-hidden="true">bolt</span>
                            <span>Jetzt</span>
                          </button>
                          <button
                            type="button"
                            (click)="setTimePreset('plus15m')"
                            class="px-1 py-1 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EFEBE6] hover:border-[#2D6A4F] text-[#3E2723] border border-[#E6DED6] text-[10px] font-bold flex flex-col items-center gap-0.5 cursor-pointer transition-colors"
                            title="In 15 Minuten"
                            aria-label="Abfahrtszeit plus 15 Minuten setzen"
                          >
                            <span class="mat-icon text-[11px] text-[#2D6A4F]" aria-hidden="true">timer</span>
                            <span>15 min</span>
                          </button>
                          <button
                            type="button"
                            (click)="setTimePreset('plus1h')"
                            class="px-1 py-1 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EFEBE6] hover:border-[#2D6A4F] text-[#3E2723] border border-[#E6DED6] text-[10px] font-bold flex flex-col items-center gap-0.5 cursor-pointer transition-colors"
                            title="In 1 Stunde"
                            aria-label="Abfahrtszeit plus 1 Stunde setzen"
                          >
                            <span class="mat-icon text-[11px] text-[#795548]" aria-hidden="true">update</span>
                            <span>1h</span>
                          </button>
                          <button
                            type="button"
                            (click)="setTimePreset('plus2h')"
                            class="px-1 py-1 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EFEBE6] hover:border-[#2D6A4F] text-[#3E2723] border border-[#E6DED6] text-[10px] font-bold flex flex-col items-center gap-0.5 cursor-pointer transition-colors"
                            title="In 2 Stunden"
                            aria-label="Abfahrtszeit plus 2 Stunden setzen"
                          >
                            <span class="mat-icon text-[11px] text-[#795548]" aria-hidden="true">more_time</span>
                            <span>2h</span>
                          </button>
                        </div>

                        <!-- Tageszeiten Presets -->
                        <div class="grid grid-cols-4 gap-1 pt-0.5">
                          <button
                            type="button"
                            (click)="setTimePreset('morning')"
                            class="px-1 py-0.5 rounded-[3px] bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#4E342E] text-[9px] font-semibold border border-[#E6DED6] text-center cursor-pointer"
                            aria-label="Abfahrtszeit Morgens um 08:00 Uhr"
                          >
                            08:00
                          </button>
                          <button
                            type="button"
                            (click)="setTimePreset('noon')"
                            class="px-1 py-0.5 rounded-[3px] bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#4E342E] text-[9px] font-semibold border border-[#E6DED6] text-center cursor-pointer"
                            aria-label="Abfahrtszeit Mittags um 12:00 Uhr"
                          >
                            12:00
                          </button>
                          <button
                            type="button"
                            (click)="setTimePreset('afternoon')"
                            class="px-1 py-0.5 rounded-[3px] bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#4E342E] text-[9px] font-semibold border border-[#E6DED6] text-center cursor-pointer"
                            aria-label="Abfahrtszeit Nachmittags um 15:30 Uhr"
                          >
                            15:30
                          </button>
                          <button
                            type="button"
                            (click)="setTimePreset('evening')"
                            class="px-1 py-0.5 rounded-[3px] bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#4E342E] text-[9px] font-semibold border border-[#E6DED6] text-center cursor-pointer"
                            aria-label="Abfahrtszeit Abends um 18:00 Uhr"
                          >
                            18:00
                          </button>
                        </div>
                      </div>

                      <!-- Horizontal Action Buttons: Löschen, Abbrechen, Festlegen -->
                      <div class="flex items-center justify-between gap-2 pt-2.5 border-t border-[#EFEBE6]">
                        <button
                          type="button"
                          (click)="clearDatePicker()"
                          class="flex-1 py-1.5 px-2 text-center bg-[#FAF7F2] hover:bg-[#FBE9E7] text-[#C62828] hover:border-[#EF9A9A] border border-[#E6DED6] text-xs font-semibold rounded-[4px] cursor-pointer transition-colors"
                          title="Zurücksetzen"
                          aria-label="Datum und Zeit zurücksetzen"
                        >
                          Löschen
                        </button>
                        <button
                          type="button"
                          (click)="cancelDatePicker()"
                          class="flex-1 py-1.5 px-2 text-center bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#5D4037] border border-[#E6DED6] text-xs font-semibold rounded-[4px] cursor-pointer transition-colors"
                          title="Abbrechen"
                          aria-label="Datumsauswahl abbrechen"
                        >
                          Abbrechen
                        </button>
                        <button
                          type="button"
                          (click)="applyDatePicker()"
                          class="flex-1 py-1.5 px-2 text-center bg-[#2D6A4F] hover:bg-[#1B4332] text-white text-xs font-bold rounded-[4px] cursor-pointer transition-colors shadow-2xs"
                          title="Festlegen"
                          aria-label="Ausgewähltes Datum und Zeit festlegen"
                        >
                          Festlegen
                        </button>
                      </div>
                    </div>
                  </div>
                }
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

              <!-- Quick Time Preset Button OUTSIDE the Time Input right at the end -->
              <div class="relative shrink-0">
                <button
                  type="button"
                  id="btn-time-tune"
                  (click)="toggleTimePickerPopup()"
                  class="w-8 h-[31px] rounded-[4px] bg-[#FAF7F2] hover:bg-[#EDF9F0] hover:border-[#2D6A4F] text-[#4E342E] hover:text-[#1B4332] border border-[#D7CCC8] flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                  title="Uhrzeit-Schnellauswahl öffnen"
                  aria-label="Uhrzeit-Schnellauswahl öffnen"
                  [attr.aria-expanded]="showTimePickerPopup()"
                >
                  <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">tune</span>
                </button>

                <!-- Dedicated Centered Time Modal anchored as focused dialog -->
                @if (showTimePickerPopup()) {
                  <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Abfahrtszeit wählen">
                    <!-- Semi-transparent backdrop to focus as main object on screen -->
                    <div
                      class="fixed inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-150"
                      (click)="closeTimePickerPopup()"
                      aria-hidden="true"
                    ></div>

                    <div
                      class="relative w-full max-w-[300px] bg-white border border-[#D7CCC8] rounded-[8px] shadow-2xl p-4 z-10 animate-in fade-in zoom-in-95 duration-150 my-auto"
                    >
                      <div class="flex items-center justify-between pb-2 mb-2.5 border-b border-[#EFEBE6]">
                        <span class="text-xs font-bold text-[#1F1612] flex items-center gap-1.5">
                          <span class="mat-icon text-sm text-[#2D6A4F]" aria-hidden="true">schedule</span>
                          <span>Abfahrtszeit wählen</span>
                        </span>
                        <button
                          type="button"
                          (click)="showTimePickerPopup.set(false)"
                          class="w-6 h-6 flex items-center justify-center rounded-[4px] text-[#8D6E63] hover:text-[#2E1F18] hover:bg-[#FAF7F2] cursor-pointer transition-colors"
                          title="Schließen"
                          aria-label="Uhrzeit-Auswahl schließen"
                        >
                          <span class="mat-icon text-sm" aria-hidden="true">close</span>
                        </button>
                      </div>

                      <!-- Schnellauswahl: Jetzt, in 15 min, in 1h, in 2h -->
                      <div class="text-[10px] font-bold text-[#8D6E63] uppercase tracking-wider mb-1.5">Schnelloptionen</div>
                      <div class="grid grid-cols-4 gap-1 mb-2.5">
                        <button
                          type="button"
                          (click)="setTimePreset('now'); showTimePickerPopup.set(false)"
                          class="px-1 py-1.5 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EDF9F0] hover:border-[#2D6A4F] text-[#1B4332] border border-[#E6DED6] text-[10px] font-bold flex flex-col items-center gap-0.5 cursor-pointer shadow-2xs transition-colors"
                          title="Jetzt abfahren"
                          aria-label="Jetzt abfahren"
                        >
                          <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">bolt</span>
                          <span>Jetzt</span>
                        </button>
                        <button
                          type="button"
                          (click)="setTimePreset('plus15m'); showTimePickerPopup.set(false)"
                          class="px-1 py-1.5 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EFEBE6] hover:border-[#2D6A4F] text-[#3E2723] border border-[#E6DED6] text-[10px] font-bold flex flex-col items-center gap-0.5 cursor-pointer shadow-2xs transition-colors"
                          title="In 15 Minuten"
                          aria-label="In 15 Minuten abfahren"
                        >
                          <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">timer</span>
                          <span>15 min</span>
                        </button>
                        <button
                          type="button"
                          (click)="setTimePreset('plus1h'); showTimePickerPopup.set(false)"
                          class="px-1 py-1.5 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EFEBE6] hover:border-[#2D6A4F] text-[#3E2723] border border-[#E6DED6] text-[10px] font-bold flex flex-col items-center gap-0.5 cursor-pointer shadow-2xs transition-colors"
                          title="In 1 Stunde"
                          aria-label="In 1 Stunde abfahren"
                        >
                          <span class="mat-icon text-xs text-[#795548]" aria-hidden="true">update</span>
                          <span>1h</span>
                        </button>
                        <button
                          type="button"
                          (click)="setTimePreset('plus2h'); showTimePickerPopup.set(false)"
                          class="px-1 py-1.5 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EFEBE6] hover:border-[#2D6A4F] text-[#3E2723] border border-[#E6DED6] text-[10px] font-bold flex flex-col items-center gap-0.5 cursor-pointer shadow-2xs transition-colors"
                          title="In 2 Stunden"
                          aria-label="In 2 Stunden abfahren"
                        >
                          <span class="mat-icon text-xs text-[#795548]" aria-hidden="true">more_time</span>
                          <span>2h</span>
                        </button>
                      </div>

                      <!-- Tageszeiten Presets -->
                      <div class="text-[10px] font-bold text-[#8D6E63] uppercase tracking-wider mb-1.5">Tageszeiten</div>
                      <div class="grid grid-cols-2 gap-1.5 mb-3">
                        <button
                          type="button"
                          (click)="setTimePreset('morning'); showTimePickerPopup.set(false)"
                          class="px-2 py-1.5 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#3E2723] text-[11px] font-semibold border border-[#E6DED6] flex items-center justify-between cursor-pointer"
                          aria-label="Abfahrtszeit Morgens um 08:00 Uhr"
                        >
                          <span>Morgens</span>
                          <span class="text-[10px] text-[#8D6E63] font-normal">08:00</span>
                        </button>
                        <button
                          type="button"
                          (click)="setTimePreset('noon'); showTimePickerPopup.set(false)"
                          class="px-2 py-1.5 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#3E2723] text-[11px] font-semibold border border-[#E6DED6] flex items-center justify-between cursor-pointer"
                          aria-label="Abfahrtszeit Mittags um 12:00 Uhr"
                        >
                          <span>Mittags</span>
                          <span class="text-[10px] text-[#8D6E63] font-normal">12:00</span>
                        </button>
                        <button
                          type="button"
                          (click)="setTimePreset('afternoon'); showTimePickerPopup.set(false)"
                          class="px-2 py-1.5 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#3E2723] text-[11px] font-semibold border border-[#E6DED6] flex items-center justify-between cursor-pointer"
                          aria-label="Abfahrtszeit Nachmittags um 15:30 Uhr"
                        >
                          <span>Nachmittags</span>
                          <span class="text-[10px] text-[#8D6E63] font-normal">15:30</span>
                        </button>
                        <button
                          type="button"
                          (click)="setTimePreset('evening'); showTimePickerPopup.set(false)"
                          class="px-2 py-1.5 rounded-[4px] bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#3E2723] text-[11px] font-semibold border border-[#E6DED6] flex items-center justify-between cursor-pointer"
                          aria-label="Abfahrtszeit Abends um 18:00 Uhr"
                        >
                          <span>Abends</span>
                          <span class="text-[10px] text-[#8D6E63] font-normal">18:00</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        (click)="showTimePickerPopup.set(false)"
                        class="w-full py-1.5 text-center bg-[#2D6A4F] hover:bg-[#1B4332] text-white text-xs font-bold rounded-[4px] cursor-pointer transition-colors shadow-2xs"
                        aria-label="Ausgewählte Uhrzeit übernehmen"
                      >
                        Übernehmen
                      </button>
                    </div>
                  </div>
                }
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
                [disabled]="isLoading() || !fromStation() || !toStation()"
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
              <!-- Results Header & Sort Controls with floating separated Leaf and Title badges on top border -->
              <div class="relative bg-white p-3 sm:p-3.5 pt-4 sm:pt-4.5 rounded-xl sm:rounded-2xl border border-[#E6DED6] shadow-xs flex flex-wrap items-center justify-between gap-2.5">
                
                <!-- Floating Eco Badges over the top border: Leaf Icon badge separated from Verbindungen Name badge -->
                <div class="absolute -top-3.5 left-4 flex items-center gap-1.5 z-10 select-none">
                  <!-- 1. Separate Leaf Icon Badge with negative margin over container border -->
                  <div class="inline-flex items-center justify-center w-7 h-7 bg-white border border-[#B7E4C7] rounded-full shadow-2xs">
                    <span class="mat-icon text-[16px] text-[#2D6A4F] transform scale-110">eco</span>
                  </div>
                  <!-- 2. Separate Verbindungen Name Badge with negative margin over container border -->
                  <div class="inline-flex items-center px-3 py-0.5 bg-white border border-[#B7E4C7] rounded-full shadow-2xs">
                    <span class="tracking-wide text-xs font-black uppercase text-[#1B4332]">
                      Verbindungen ({{ sortedJourneys().length }})
                    </span>
                  </div>
                </div>

                <!-- Subtitle: Origin → Destination -->
                <div class="flex items-center gap-2 min-w-0 pt-0.5">
                  <span class="text-xs text-[#795548] font-semibold truncate">
                    {{ fromStation()?.name }} → {{ toStation()?.name }}
                  </span>
                </div>

                <!-- Compact Sort Toggle Button (Expandable) -->
                <button
                  type="button"
                  id="btn-sort-toggle"
                  (click)="toggleSortOptions()"
                  class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#FAF7F2] hover:bg-[#EDF9F0] text-[#4E342E] hover:text-[#1B4332] border border-[#E6DED6] hover:border-[#B7E4C7] transition-all cursor-pointer shadow-2xs shrink-0"
                  [class.bg-[#EDF9F0]]="showSortOptions()"
                  [class.border-[#B7E4C7]]="showSortOptions()"
                  [class.text-[#1B4332]]="showSortOptions()"
                  title="Sortieroptionen anzeigen oder verbergen"
                  [attr.aria-expanded]="showSortOptions()"
                  aria-label="Sortieroptionen umschalten"
                >
                  <span class="text-[11px]">{{ getSortLabel() }}</span>
                  <span class="mat-icon text-xs text-[#795548] transition-transform duration-200" [class.rotate-180]="showSortOptions()" aria-hidden="true">expand_more</span>
                </button>
              </div>

              <!-- Collapsible Compact Sort Options -->
              @if (showSortOptions()) {
                <div class="flex items-center justify-end gap-1.5 px-3 py-1.5 bg-[#FAF7F2] rounded-xl border border-[#E6DED6] shadow-2xs -mt-2 animate-in fade-in zoom-in-95 duration-100 flex-wrap" role="group" aria-label="Sortierkriterien">
                  <button
                    type="button"
                    (click)="setSortCriteria('fastest')"
                    [class.bg-[#1B4332]]="sortBy() === 'fastest'"
                    [class.text-white]="sortBy() === 'fastest'"
                    [class.border-[#1B4332]]="sortBy() === 'fastest'"
                    [class.bg-white]="sortBy() !== 'fastest'"
                    [class.text-[#4E342E]]="sortBy() !== 'fastest'"
                    [class.border-[#D7CCC8]]="sortBy() !== 'fastest'"
                    class="px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer border shadow-2xs hover:border-[#2D6A4F] shrink-0 flex items-center gap-1"
                    title="Nach kürzester Reisezeit sortieren"
                    [attr.aria-pressed]="sortBy() === 'fastest'"
                    aria-label="Nach kürzester Reisezeit sortieren"
                  >
                    <span aria-hidden="true">⚡</span>
                    <span>Schnellste</span>
                  </button>
                  <button
                    type="button"
                    (click)="setSortCriteria('fewest-transfers')"
                    [class.bg-[#1B4332]]="sortBy() === 'fewest-transfers'"
                    [class.text-white]="sortBy() === 'fewest-transfers'"
                    [class.border-[#1B4332]]="sortBy() === 'fewest-transfers'"
                    [class.bg-white]="sortBy() !== 'fewest-transfers'"
                    [class.text-[#4E342E]]="sortBy() !== 'fewest-transfers'"
                    [class.border-[#D7CCC8]]="sortBy() !== 'fewest-transfers'"
                    class="px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer border shadow-2xs hover:border-[#2D6A4F] shrink-0 flex items-center gap-1"
                    title="Nach wenigsten Umstiegen sortieren"
                    [attr.aria-pressed]="sortBy() === 'fewest-transfers'"
                    aria-label="Nach wenigsten Umstiegen sortieren"
                  >
                    <span aria-hidden="true">🔄</span>
                    <span>Umstiege</span>
                  </button>
                  <button
                    type="button"
                    (click)="setSortCriteria('departure')"
                    [class.bg-[#1B4332]]="sortBy() === 'departure'"
                    [class.text-white]="sortBy() === 'departure'"
                    [class.border-[#1B4332]]="sortBy() === 'departure'"
                    [class.bg-white]="sortBy() !== 'departure'"
                    [class.text-[#4E342E]]="sortBy() !== 'departure'"
                    [class.border-[#D7CCC8]]="sortBy() !== 'departure'"
                    class="px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer border shadow-2xs hover:border-[#2D6A4F] shrink-0 flex items-center gap-1"
                    title="Nach Abfahrtszeit sortieren"
                    [attr.aria-pressed]="sortBy() === 'departure'"
                    aria-label="Nach Abfahrtszeit sortieren"
                  >
                    <span aria-hidden="true">⏰</span>
                    <span>Abfahrt</span>
                  </button>
                </div>
              }

              <!-- Linear Connections List (Switch Style, Compact, Clean & Clickable for full details) -->
              <div class="space-y-3" role="feed" aria-label="Gefundene Fahrtverbindungen">
                @for (journey of sortedJourneys(); track journey.id) {
                  @let comfort = getTransferComfort(journey);
                  @let dynamicBadge = getDynamicSortBadge(journey, $index);

                  <div
                    (click)="openJourneyDetail(journey)"
                    (keydown.enter)="openJourneyDetail(journey)"
                    (keydown.space)="openJourneyDetail(journey)"
                    role="button"
                    tabindex="0"
                    class="group bg-white hover:bg-[#FAF7F2] rounded-xl sm:rounded-2xl p-3.5 sm:p-4 border transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-md hover:border-[#2D6A4F] relative space-y-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]"
                    [class.border-[#2D6A4F]]="$index === 0"
                    [class.border-[#E6DED6]]="$index !== 0"
                    [attr.aria-label]="'Fahrt von ' + formatTime(journey.departure) + ' bis ' + formatTime(journey.arrival) + ' Uhr, Reisedauer ' + (journey.durationFormatted || formatDuration(journey.durationMinutes)) + ', ' + comfort.shortLabel + '. Details öffnen.'"
                  >
                    <!-- Top Line: Times, Realtime Delays, Badges -->
                    <div class="flex items-center justify-between gap-2 pb-2 border-b border-[#EDE5DC] flex-wrap">
                      <!-- Times & Real-time Delay -->
                      <div class="flex items-baseline gap-2">
                        <span class="text-xl sm:text-2xl font-black text-[#1F1612] tracking-tight">
                          {{ formatTime(journey.departure) }}
                        </span>
                        <span class="text-xs font-bold text-[#8D6E63]">bis</span>
                        <span class="text-xl sm:text-2xl font-black text-[#1F1612] tracking-tight">
                          {{ formatTime(journey.arrival) }}
                        </span>
                        
                        @if (journey.hasDelay && journey.maxDelay > 0) {
                          <span class="text-[11px] font-bold text-[#E65100] bg-[#FFF3E0] px-2 py-0.5 rounded-full border border-[#FFE0B2]">
                            +{{ journey.maxDelay }} Min.
                          </span>
                        } @else {
                          <span class="text-[10px] font-bold text-[#1B4332] bg-[#EDF9F0] px-2 py-0.5 rounded-full border border-[#B7E4C7] hidden sm:inline-flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-[#2D6A4F]" aria-hidden="true"></span>
                            Pünktlich
                          </span>
                        }
                      </div>

                      <!-- Badges: Dynamic Sort, Duration, Transfers, Ticket -->
                      <div class="flex items-center gap-1.5 flex-wrap">
                        @if (dynamicBadge) {
                          <span 
                            class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-black text-[11px] border shadow-2xs shrink-0"
                            [class.bg-[#EDF9F0]]="dynamicBadge.isTop"
                            [class.text-[#1B4332]]="dynamicBadge.isTop"
                            [class.border-[#B7E4C7]]="dynamicBadge.isTop"
                            [class.bg-[#FAF7F2]]="!dynamicBadge.isTop"
                            [class.text-[#5D4037]]="!dynamicBadge.isTop"
                            [class.border-[#E6DED6]]="!dynamicBadge.isTop"
                          >
                            <span class="mat-icon text-[12px]" aria-hidden="true">{{ dynamicBadge.icon }}</span>
                            <span>{{ dynamicBadge.label }}</span>
                          </span>
                        }

                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#FAF7F2] group-hover:bg-white text-[#1F1612] border border-[#E6DED6] rounded-full text-[11px] font-black shadow-2xs">
                          <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">schedule</span>
                          <span>{{ journey.durationFormatted || formatDuration(journey.durationMinutes) }}</span>
                        </span>

                        <span
                          class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shadow-2xs"
                          [class]="comfort.badgeClass"
                        >
                          <span class="mat-icon text-xs" aria-hidden="true">{{ comfort.icon }}</span>
                          <span>{{ comfort.shortLabel }}</span>
                        </span>

                        <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-[#EDF9F0] text-[#1B4332] border border-[#B7E4C7] rounded-full text-[11px] font-bold shadow-2xs hidden sm:inline-flex">
                          <span>✓ D-Ticket</span>
                        </span>
                      </div>
                    </div>

                    <!-- Linear Route Segment Visuals (Switch app style: ultra compact, zero excess padding) -->
                    <div class="flex items-center overflow-x-auto no-scrollbar py-0.5 text-xs text-[#1F1612]" aria-label="Streckenabschnitte">
                      
                      <!-- 1. Walking from user location (Clickable to guide to station on map) - ONLY if journey started from current location -->
                      @if (journey.isFromCurrentLocation) {
                        <button
                          type="button"
                          id="btn-walk-guide-{{ journey.id || $index }}"
                          (click)="onWalkGuideClick($event, journey)"
                          class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#EDE5DC] hover:bg-[#D8F3DC] text-[#1B4332] font-black text-[10px] shrink-0 transition-colors border border-transparent hover:border-[#2D6A4F] cursor-pointer"
                          title="Fußweg zur Station auf der Karte anzeigen"
                          [attr.aria-label]="'Fußweg zur Station ' + (journey.walkToStartMinutes || 5) + ' Minuten auf Karte anzeigen'"
                        >
                          <span class="mat-icon text-[11px] text-[#2D6A4F]" aria-hidden="true">directions_walk</span>
                          <span>{{ journey.walkToStartMinutes || 5 }}'</span>
                        </button>

                        <span class="text-[#B7A99A] text-[10px] font-bold shrink-0 mx-0.5" aria-hidden="true">›</span>
                      }

                      <!-- 2. Transit Legs and Transfers in linear chain (ultra-compact Switch badges) -->
                      @for (leg of journey.legs; track $index) {
                        <div class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-black shadow-2xs shrink-0" [class]="getLegBadgeClass(leg)">
                          <span class="mat-icon text-[10px]" aria-hidden="true">{{ getLegVehicleIcon(leg) }}</span>
                          <span>{{ leg.line?.name || 'Zug' }}</span>
                          @if (leg.departurePlatform) {
                            <span class="text-[8px] font-normal opacity-90 ml-0.5">Gl.{{ leg.departurePlatform }}</span>
                          }
                        </div>

                        @if ($index < journey.legs.length - 1) {
                          <span class="text-[#B7A99A] text-[10px] font-bold shrink-0 mx-0.5" aria-hidden="true">›</span>
                          
                          <div class="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-[#FFF3CD] text-[#856404] font-black text-[9px] shrink-0 border border-[#FFE082]" title="Umsteigezeit">
                            <span class="mat-icon text-[9px]" aria-hidden="true">sync_alt</span>
                            <span>{{ journey.transferDetails[$index]?.bufferMinutes || 8 }}'</span>
                          </div>

                          <span class="text-[#B7A99A] text-[10px] font-bold shrink-0 mx-0.5" aria-hidden="true">›</span>
                        }
                      }

                      <span class="text-[#B7A99A] text-[10px] font-bold shrink-0 mx-0.5" aria-hidden="true">›</span>

                      <!-- 3. Final Destination Pin -->
                      <div class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#FAF7F2] text-[#1F1612] font-bold shrink-0 text-[10px]">
                        <span class="mat-icon text-[10px] text-[#9A2218]" aria-hidden="true">place</span>
                        <span class="truncate max-w-[120px] sm:max-w-[180px]">{{ journey.destination.name }}</span>
                        <span class="text-[9px] text-[#795548] font-normal">({{ formatTime(journey.arrival) }})</span>
                      </div>

                    </div>

                    <!-- Bottom Recommendation & Trigger Action for details -->
                    <div class="flex items-center justify-between text-[11px] pt-1 text-[#795548] border-t border-[#F5EFE6]">
                      <div class="flex items-center gap-1 font-medium truncate">
                        <span class="mat-icon text-xs text-[#2D6A4F]" aria-hidden="true">schedule</span>
                        @if (journey.isFromCurrentLocation) {
                          <span>
                            Um <strong>{{ getLeaveRecommendation(journey) }} Uhr losgehen</strong> für {{ formatTime(journey.departure) }} Uhr Abfahrt
                          </span>
                        } @else {
                          <span>
                            Abfahrt um <strong>{{ formatTime(journey.departure) }} Uhr</strong> ab {{ journey.origin.name }}
                          </span>
                        }
                      </div>

                      <div class="inline-flex items-center gap-1 font-bold text-[#1B4332] group-hover:text-[#2D6A4F] group-hover:translate-x-0.5 transition-transform shrink-0">
                        <span>Details & Haltestellen</span>
                        <span class="mat-icon text-xs" aria-hidden="true">arrow_forward</span>
                      </div>
                    </div>

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
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
        
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

    </div>
  `
})
export class PlannerView implements OnInit {
  @Output() showOnMap = new EventEmitter<ConnectionJourney>();
  @Output() viewDetail = new EventEmitter<ConnectionJourney>();
  @Output() switchTab = new EventEmitter<'planner' | 'live-board' | 'hamburg-hub' | 'surprise' | 'favorites'>();

  private fb = inject(FormBuilder);
  readonly transitService = inject(TransitService);

  readonly fromStation = signal<Station | null>({
    id: '8002549',
    name: 'Hamburg Hbf',
    location: { latitude: 53.552736, longitude: 10.006909 }
  });
  readonly toStation = signal<Station | null>({
    id: '8000237',
    name: 'Lübeck Hbf',
    location: { latitude: 53.867208, longitude: 10.669862 }
  });

  readonly journeys = signal<ConnectionJourney[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly hasSearched = signal<boolean>(false);
  readonly showSearchOptions = signal<boolean>(false);
  readonly expandedJourneyId = signal<string | null>(null);
  readonly expandedLegKeys = signal<Record<string, boolean>>({});
  readonly expandedAmenitiesKeys = signal<Record<string, boolean>>({});
  readonly expandedWarningKeys = signal<Record<string, boolean>>({});
  readonly copiedJourneyId = signal<string | null>(null);
  readonly errorMessage = signal<string>('');
  readonly sortBy = signal<'fastest' | 'fewest-transfers' | 'departure'>('fastest');
  readonly showSortOptions = signal<boolean>(false);
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

  ngOnInit() {
    this.onSearchSubmit();
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

    if (to && from) {
      this.onSearchSubmit();
    }
  }

  setDestination(dest: { name: string; id: string; lat: number; lon: number }) {
    this.toStation.set({
      id: dest.id,
      name: dest.name,
      location: { latitude: dest.lat, longitude: dest.lon }
    });
    this.onSearchSubmit();
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
    if (station && this.toStation()) {
      this.onSearchSubmit();
    }
  }

  async onSearchSubmit() {
    const from = this.fromStation();
    const to = this.toStation();
    if (!from || !to) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    const formVal = this.searchForm.value;
    const depDateTime = `${formVal.date}T${formVal.time}:00`;

    const isFromCurrentLocation = !!(
      from.isCurrentLocation ||
      from.id === 'current-location' ||
      from.name.toLowerCase().includes('aktueller standort')
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

    const res = await this.transitService.findConnections({
      from: fromQuery,
      to: to.name,
      departureTime: depDateTime,
      dTicketOnly: formVal.dTicketOnly ?? true,
      includeFernverkehr: formVal.includeFernverkehr ?? false,
      isFromCurrentLocation: isFromCurrentLocation,
      currentLocationCoords: isFromCurrentLocation ? (this.transitService.userLocation() || undefined) : undefined
    });

    this.isLoading.set(false);
    this.hasSearched.set(true);
    this.journeys.set(res.journeys);

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
    const name = leg.line?.name || '';
    if (name.startsWith('RE')) return 'bg-[#1B4332] text-white border-[#2D6A4F]';
    if (name.startsWith('RB')) return 'bg-[#4E342E] text-white border-[#5D4037]';
    if (name.startsWith('S')) return 'bg-[#15803D] text-white border-[#166534]';
    if (name.startsWith('U')) return 'bg-[#0284C7] text-white border-[#0369A1]';
    if (name.startsWith('ICE') || name.startsWith('IC')) return 'bg-[#C8372D] text-white border-[#B91C1C]';
    if (name.startsWith('Bus')) return 'bg-[#7C3AED] text-white border-[#6D28D9]';
    return 'bg-[#3E2723] text-white border-[#4E342E]';
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

  setFromAndTo(from: Station, to: Station) {
    this.fromStation.set(from);
    this.toStation.set(to);
    this.onSearchSubmit();
  }

  continueJourneyFromTransfer(transferStation: Station) {
    this.fromStation.set(transferStation);
    this.setTimePreset('now');
    this.onSearchSubmit();
  }

  isOriginCurrentLocation(): boolean {
    const from = this.fromStation();
    return !!(from && (from.isCurrentLocation || from.id === 'current-location' || from.name.toLowerCase().includes('aktueller standort')));
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
