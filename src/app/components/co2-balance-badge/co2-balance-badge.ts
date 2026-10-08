import {
  Component,
  ChangeDetectionStrategy,
  input,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConnectionJourney } from '../../models/transit.models';
import { ALL_GERMAN_STATIONS, calculateDistanceKm } from '../../data/stations-data';

// Official German Federal Environment Agency (Umweltbundesamt UBA) reference emissions (g CO2e / person-km):
// - Average passenger car (PKW) in Germany: 154 g CO₂ / pkm
// - Regional rail transport (SPNV / Nahverkehr): 32 g CO₂ / pkm
// - Avoided social climate damage costs (UBA Klimakostensatz): 237 € per tonne CO₂ (0.237 €/kg)
// - Mature tree absorption: approx. 12.5 kg CO₂ / year (~34.2 g / day)
const PKW_EMISSIONS_G_PER_KM = 154;
const BAHN_EMISSIONS_G_PER_KM = 32;
const UBA_CLIMATE_COST_EUR_PER_KG = 0.237;
const TREE_ANNUAL_KG_CO2 = 12.5;

@Component({
  selector: 'app-co2-balance-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  host: {
    '(keydown.escape)': 'onEscape()'
  },
  template: `
    <!-- Trigger Button / Badge -->
    @if (variant() === 'compact') {
      <button
        type="button"
        (click)="openOverlay($event)"
        (keydown.enter)="openOverlay($event)"
        (keydown.space)="openOverlay($event)"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-[#EDF9F0] hover:bg-[#D8F3DC] text-[#1B4332] border border-[#B7E4C7] transition-all cursor-pointer shadow-2xs group active:scale-95 select-none"
        [title]="'CO₂-Ersparnis: ' + savedKgFormatted() + ' kg im Vergleich zum Pkw. Klicken für Berechnungsdetails.'"
        aria-haspopup="dialog"
        [attr.aria-expanded]="isOpen()"
        aria-label="CO₂-Bilanz anzeigen"
      >
        <span class="mat-icon text-[12px] text-[#2D6A4F] group-hover:scale-110 transition-transform select-none" aria-hidden="true">eco</span>
        <span>-{{ savedKgFormatted() }} kg CO₂</span>
        <span class="mat-icon text-[11px] text-[#2D6A4F]/70 select-none" aria-hidden="true">info</span>
      </button>
    } @else if (variant() === 'detailed') {
      <!-- Full Showcase Card for Journey Detail or Overview -->
      <div
        (click)="openOverlay($event)"
        (keydown.enter)="openOverlay($event)"
        (keydown.space)="openOverlay($event)"
        role="button"
        tabindex="0"
        class="w-full rounded-2xl p-3 sm:p-3.5 bg-gradient-to-r from-[#EDF9F0] to-[#E2F5E8] border border-[#B7E4C7] text-[#1B4332] flex items-center justify-between gap-3 shadow-2xs hover:shadow-xs transition-all cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-[#2D6A4F]"
        title="Detaillierte CO₂-Berechnung und UBA-Vergleichswerte öffnen"
        aria-haspopup="dialog"
        [attr.aria-expanded]="isOpen()"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-xl bg-[#2D6A4F] text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <span class="mat-icon text-lg" aria-hidden="true">eco</span>
          </div>
          <div class="min-w-0">
            <div class="text-xs sm:text-sm font-black leading-tight flex items-center gap-1.5 flex-wrap">
              <span>-{{ savedKgFormatted() }} kg CO₂ gegenüber Pkw gespart</span>
              <span class="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-white/80 text-[#2D6A4F] border border-[#B7E4C7]">-{{ percentageSaved() }}%</span>
            </div>
            <div class="text-[11px] font-semibold text-[#2D6A4F]/90 truncate mt-0.5">
              Strecke: {{ distanceKm() }} km • Bahn: {{ bahnKg() }} kg vs. Pkw: {{ pkwKg() }} kg • Formel anzeigen
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1 text-xs font-black text-[#2D6A4F] shrink-0">
          <span class="hidden xs:inline">Details</span>
          <span class="mat-icon text-sm group-hover:translate-x-0.5 transition-transform" aria-hidden="true">arrow_forward</span>
        </div>
      </div>
    } @else {
      <!-- Standard Badge (Default in Results List) -->
      <button
        type="button"
        (click)="openOverlay($event)"
        (keydown.enter)="openOverlay($event)"
        (keydown.space)="openOverlay($event)"
        class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black bg-[#EDF9F0] hover:bg-[#D8F3DC] text-[#1B4332] border border-[#B7E4C7] transition-all cursor-pointer shadow-2xs group active:scale-95 select-none"
        [title]="'CO₂-Bilanz: ' + savedKgFormatted() + ' kg Einsparung ggü. PKW (' + distanceKm() + ' km). Details zur Berechnung ansehen.'"
        aria-haspopup="dialog"
        [attr.aria-expanded]="isOpen()"
        aria-label="CO₂-Bilanz und Einsparung anzeigen"
      >
        <span class="mat-icon text-[14px] text-[#2D6A4F] group-hover:scale-110 transition-transform select-none" aria-hidden="true">eco</span>
        <span>-{{ savedKgFormatted() }} kg CO₂</span>
        <span class="hidden sm:inline text-[11px] font-bold opacity-80">vs. Pkw</span>
        <span class="mat-icon text-[12px] text-[#2D6A4F]/80 group-hover:text-[#2D6A4F] select-none" aria-hidden="true">help_outline</span>
      </button>
    }

    <!-- ======================================================== -->
    <!-- INFORMATIVE OVERLAY / DIALOG (MODAL)                      -->
    <!-- ======================================================== -->
    @if (isOpen()) {
      <div
        class="fixed inset-0 z-[600] flex items-center justify-center p-3 sm:p-5 select-none overflow-y-auto"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="dialogTitleId"
      >
        <!-- Accessible Backdrop Button -->
        <button
          type="button"
          class="fixed inset-0 w-full h-full bg-[#1F1612]/60 backdrop-blur-xs transition-opacity cursor-default -z-10 border-0 p-0"
          (click)="closeOverlay($event)"
          tabindex="-1"
          aria-label="Dialog schließen"
        ></button>

        <!-- Modal Dialog Window -->
        <div
          class="relative w-full max-w-lg bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-[#E6DED6] text-[#1F1612] overflow-hidden z-10 my-auto max-h-[92vh] flex flex-col"
        >
          <!-- Header Bar -->
          <div class="relative bg-gradient-to-r from-[#EDF9F0] via-[#FAFDF9] to-[#E8F5E9] px-5 py-4 border-b border-[#D8E6DB] flex items-center justify-between gap-3 shrink-0">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-9 h-9 rounded-xl bg-[#2D6A4F] text-white flex items-center justify-center shrink-0 shadow-2xs">
                <span class="mat-icon text-xl leading-none" aria-hidden="true">eco</span>
              </div>
              <div class="min-w-0">
                <h3 [id]="dialogTitleId" class="text-sm sm:text-base font-black text-[#1B4332] leading-tight truncate">
                  CO₂-Bilanz & Streckenrechner
                </h3>
                <p class="text-[11px] text-[#40916C] font-semibold truncate mt-0.5">
                  Vergleich: ÖPNV / Schiene vs. Pkw
                </p>
              </div>
            </div>

            <button
              type="button"
              (click)="closeOverlay()"
              class="w-8 h-8 rounded-full bg-white/80 hover:bg-white text-[#795548] hover:text-[#1F1612] border border-[#D8E6DB] flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95 shadow-2xs"
              title="Overlay schließen"
              aria-label="Overlay schließen"
            >
              <span class="mat-icon text-lg leading-none">close</span>
            </button>
          </div>

          <!-- Scrollable Content Body -->
          <div class="p-5 sm:p-6 space-y-4 overflow-y-auto select-text">
            
            <!-- 1. Route Summary Pill -->
            <div class="bg-[#FAF7F2] rounded-xl p-3 border border-[#E6DED6] flex items-center justify-between gap-3 flex-wrap">
              <div class="flex items-center gap-2 min-w-0">
                <span class="mat-icon text-[#8D6E63] text-base shrink-0" aria-hidden="true">route</span>
                <span class="text-xs font-bold text-[#4E342E] truncate">
                  {{ originName() }} ➔ {{ destName() }}
                </span>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span class="px-2 py-0.5 rounded-full bg-white text-xs font-black text-[#2D6A4F] border border-[#D7CCC8]">
                  {{ distanceKm() }} km Strecke
                </span>
                <span class="px-2 py-0.5 rounded-full bg-white text-xs font-bold text-[#795548] border border-[#D7CCC8]">
                  {{ durationMinutes() }} Min.
                </span>
              </div>
            </div>

            <!-- 2. Primary Hero Comparison Card -->
            <div class="rounded-2xl p-4 bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] text-white shadow-md relative overflow-hidden">
              <div class="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-[#52B788]/20 blur-xl pointer-events-none"></div>

              <div class="relative z-10 space-y-3">
                <div class="flex items-baseline justify-between gap-2">
                  <span class="text-xs font-bold uppercase tracking-wider text-[#A7F3D0]">
                    Ihre Einsparung auf dieser Fahrt
                  </span>
                  <span class="px-2 py-0.5 rounded-full bg-[#52B788] text-white text-[11px] font-black uppercase">
                    -{{ percentageSaved() }}% weniger CO₂
                  </span>
                </div>

                <div class="flex items-baseline gap-2">
                  <span class="text-3xl sm:text-4xl font-black tracking-tight text-white">
                    -{{ savedKgFormatted() }} kg
                  </span>
                  <span class="text-sm font-bold text-[#D8F3DC]">CO₂-Äquivalente vermieden</span>
                </div>

                <!-- Comparison Bars -->
                <div class="space-y-2 pt-2 border-t border-white/20 text-xs">
                  <!-- Train Bar -->
                  <div>
                    <div class="flex justify-between font-bold mb-1 text-[11px]">
                      <span class="flex items-center gap-1">
                        <span class="mat-icon text-xs text-[#74C69D]">train</span>
                        <span>Bahn / ÖPNV (32 g/km)</span>
                      </span>
                      <span class="font-mono text-[#D8F3DC]">{{ bahnKg() }} kg CO₂</span>
                    </div>
                    <div class="w-full h-2.5 bg-black/25 rounded-full overflow-hidden p-0.5">
                      <div class="h-full bg-[#74C69D] rounded-full transition-all duration-500" [style.width.%]="bahnBarPercent()"></div>
                    </div>
                  </div>

                  <!-- Car Bar -->
                  <div>
                    <div class="flex justify-between font-bold mb-1 text-[11px]">
                      <span class="flex items-center gap-1">
                        <span class="mat-icon text-xs text-[#FCA5A5]">directions_car</span>
                        <span>PKW-Vergleichsfahrt (154 g/km)</span>
                      </span>
                      <span class="font-mono text-[#FCA5A5]">{{ pkwKg() }} kg CO₂</span>
                    </div>
                    <div class="w-full h-2.5 bg-black/25 rounded-full overflow-hidden p-0.5">
                      <div class="h-full bg-[#EF4444] rounded-full transition-all duration-500" style="width: 100%;"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 3. Wie wird das berechnet? (Transparente Formel) -->
            <div class="rounded-xl border border-[#E6DED6] bg-white p-4 space-y-3">
              <div class="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#3E2723]">
                <span class="mat-icon text-sm text-[#2D6A4F]">calculate</span>
                <span>So wird die Einsparung berechnet</span>
              </div>

              <div class="space-y-2 text-xs text-[#4E342E] leading-relaxed">
                <!-- Step 1 -->
                <div class="flex items-start gap-2.5 p-2 rounded-lg bg-[#FAF7F2]">
                  <span class="w-5 h-5 rounded-full bg-[#E6DED6] text-[#3E2723] font-black text-[11px] flex items-center justify-center shrink-0">1</span>
                  <div>
                    <strong class="font-bold text-[#1F1612]">Streckendistanz:</strong>
                    <span> {{ distanceKm() }} km für die gewählte Verbindung (ermittelt über DB-Haltestellenkoordinaten).</span>
                  </div>
                </div>

                <!-- Step 2 -->
                <div class="flex items-start gap-2.5 p-2 rounded-lg bg-[#FAF7F2]">
                  <span class="w-5 h-5 rounded-full bg-[#E6DED6] text-[#3E2723] font-black text-[11px] flex items-center justify-center shrink-0">2</span>
                  <div>
                    <strong class="font-bold text-[#1F1612]">Pkw-Ausstoß:</strong>
                    <span> {{ distanceKm() }} km × 154 g/km = </span>
                    <strong class="font-mono text-[#B91C1C]">{{ pkwKg() }} kg CO₂</strong>.
                    <div class="text-[10px] text-[#795548] mt-0.5">
                      Offizieller Referenzwert des Umweltbundesamtes (UBA) für durchschnittliche Pkw in Deutschland im Realbetrieb.
                    </div>
                  </div>
                </div>

                <!-- Step 3 -->
                <div class="flex items-start gap-2.5 p-2 rounded-lg bg-[#FAF7F2]">
                  <span class="w-5 h-5 rounded-full bg-[#E6DED6] text-[#3E2723] font-black text-[11px] flex items-center justify-center shrink-0">3</span>
                  <div>
                    <strong class="font-bold text-[#1F1612]">Schienenverkehr (ÖPNV):</strong>
                    <span> {{ distanceKm() }} km × 32 g/km = </span>
                    <strong class="font-mono text-[#2D6A4F]">{{ bahnKg() }} kg CO₂</strong>.
                    <div class="text-[10px] text-[#795548] mt-0.5">
                      UBA-Emissionsfaktor für Schienenpersonennahverkehr (SPNV) unter Berücksichtigung des deutschen Bahnstrommixes.
                    </div>
                  </div>
                </div>

                <!-- Step 4 -->
                <div class="flex items-start gap-2.5 p-2 rounded-lg bg-[#EDF9F0] border border-[#B7E4C7]">
                  <span class="w-5 h-5 rounded-full bg-[#2D6A4F] text-white font-black text-[11px] flex items-center justify-center shrink-0">4</span>
                  <div>
                    <strong class="font-bold text-[#1B4332]">Netto-Ersparnis:</strong>
                    <span> {{ pkwKg() }} kg - {{ bahnKg() }} kg = </span>
                    <strong class="font-black text-[#1B4332] font-mono text-sm">{{ savedKgFormatted() }} kg CO₂</strong>
                    <span> ({{ percentageSaved() }}% Entlastung).</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 4. Zusatzwerte: Monetärer Wert & Baum-Bindung -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <!-- Monetäre Schadenskosten -->
              <div class="p-3 rounded-xl bg-[#FAF7F2] border border-[#E6DED6] space-y-1">
                <div class="flex items-center gap-1.5 font-bold text-[#3E2723]">
                  <span class="mat-icon text-[#2D6A4F] text-sm">payments</span>
                  <span>Klimakostenvorteil</span>
                </div>
                <div class="text-base font-black text-[#1B4332]">
                  ca. {{ avoidedClimateCostEur() }} €
                </div>
                <p class="text-[10px] text-[#795548] leading-tight">
                  Vermiedene gesellschaftliche Umwelt- & Klimaschadenskosten (UBA-Satz: 237 € pro Tonne CO₂).
                </p>
              </div>

              <!-- Baum-Bindungszeit -->
              <div class="p-3 rounded-xl bg-[#FAF7F2] border border-[#E6DED6] space-y-1">
                <div class="flex items-center gap-1.5 font-bold text-[#3E2723]">
                  <span class="mat-icon text-[#2D6A4F] text-sm">forest</span>
                  <span>Baum-Äquivalent</span>
                </div>
                <div class="text-base font-black text-[#1B4332]">
                  {{ treeDays() }} Tage
                </div>
                <p class="text-[10px] text-[#795548] leading-tight">
                  Entspricht der Speicherleistung eines ausgewachsenen Laubbaums für diese Zeitspanne.
                </p>
              </div>
            </div>

            <!-- 5. Bezug zu La Perla & Transparenzhinweis -->
            <div class="p-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-xs text-[#166534] flex items-start gap-2.5">
              <span class="mat-icon text-[#16A34A] text-base shrink-0 mt-0.5" aria-hidden="true">volunteer_activism</span>
              <div class="leading-relaxed text-[11px]">
                <strong class="font-bold">Gemeinschaftsinitiative La Perla (Nicaragua):</strong>
                Jede Zugfahrt vermeidet reale Treibhausgase. Dieses Bewusstsein verbinden wir mit unserem Engagement für die Aufforstung und Bildung von Kindern in La Perla (Achuapa).
              </div>
            </div>

            <!-- Source Footer -->
            <div class="text-[10px] text-[#8D6E63] text-center pt-1 border-t border-[#E6DED6]">
              Datenbasis: Umweltbundesamt (UBA) – „Vergleich der durchschnittlichen Emissionen einzelner Verkehrsmittel im Personenverkehr in Deutschland“.
            </div>

          </div>

          <!-- Bottom Action Buttons -->
          <div class="px-5 py-3 bg-[#FAF7F2] border-t border-[#E6DED6] flex items-center justify-end shrink-0">
            <button
              type="button"
              (click)="closeOverlay()"
              class="px-5 py-2 rounded-xl bg-[#2D6A4F] hover:bg-[#1B4332] active:scale-95 text-white font-bold text-xs sm:text-sm cursor-pointer shadow-xs transition-all flex items-center gap-1.5"
            >
              <span>Verstanden</span>
              <span class="mat-icon text-sm">check</span>
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class Co2BalanceBadge {
  // Input journey
  readonly journey = input<ConnectionJourney | null>(null);

  // Variant: 'compact' (for card slider), 'badge' (for results list), 'detailed' (large showcase card)
  readonly variant = input<'compact' | 'badge' | 'detailed'>('badge');

  // Modal open signal
  readonly isOpen = signal<boolean>(false);

  // Unique ID for a11y
  readonly dialogTitleId = 'co2-dialog-title-' + Math.random().toString(36).substring(2, 9);

  // Computed Origin & Destination names
  readonly originName = computed(() => this.journey()?.origin?.name || 'Startbahnhof');
  readonly destName = computed(() => this.journey()?.destination?.name || 'Zielbahnhof');
  readonly durationMinutes = computed(() => this.journey()?.durationMinutes || 45);

  // Distance computation in km:
  // 1. If journey.distanceKm is provided (>0), use it
  // 2. If origin & destination have geo-locations or can be found in ALL_GERMAN_STATIONS, compute great-circle distance * 1.25 (track curve factor)
  // 3. Fallback based on journey duration: avg 75 km/h for regional rail
  readonly distanceKm = computed<number>(() => {
    const j = this.journey();
    if (!j) return 40;
    if (j.distanceKm && j.distanceKm > 0) {
      return Math.round(j.distanceKm);
    }

    let lat1 = j.origin?.location?.latitude;
    let lon1 = j.origin?.location?.longitude;
    let lat2 = j.destination?.location?.latitude;
    let lon2 = j.destination?.location?.longitude;

    if (!lat1 || !lon1) {
      const match1 = ALL_GERMAN_STATIONS.find(s => s.name.toLowerCase() === j.origin?.name?.toLowerCase() || s.id === j.origin?.id);
      if (match1?.location) {
        lat1 = match1.location.latitude;
        lon1 = match1.location.longitude;
      }
    }

    if (!lat2 || !lon2) {
      const match2 = ALL_GERMAN_STATIONS.find(s => s.name.toLowerCase() === j.destination?.name?.toLowerCase() || s.id === j.destination?.id);
      if (match2?.location) {
        lat2 = match2.location.latitude;
        lon2 = match2.location.longitude;
      }
    }

    if (lat1 && lon1 && lat2 && lon2) {
      const directKm = calculateDistanceKm(lat1, lon1, lat2, lon2);
      // Rail tracks are typically ~20-30% longer than straight lines
      const railKm = Math.max(8, Math.round(directKm * 1.25));
      return railKm;
    }

    // Duration fallback (e.g. 60 min -> ~70 km)
    const est = Math.max(12, Math.round(((j.durationMinutes || 45) / 60) * 75));
    return est;
  });

  // PKW emissions in kg CO2
  readonly pkwKg = computed<string>(() => {
    const km = this.distanceKm();
    const kg = (km * PKW_EMISSIONS_G_PER_KM) / 1000;
    return kg.toFixed(1);
  });

  // Train emissions in kg CO2
  readonly bahnKg = computed<string>(() => {
    const km = this.distanceKm();
    const kg = (km * BAHN_EMISSIONS_G_PER_KM) / 1000;
    return kg.toFixed(1);
  });

  // Saved CO2 in kg
  readonly savedKgNumber = computed<number>(() => {
    const km = this.distanceKm();
    const saved = (km * (PKW_EMISSIONS_G_PER_KM - BAHN_EMISSIONS_G_PER_KM)) / 1000;
    return Math.max(0.1, Number(saved.toFixed(1)));
  });

  readonly savedKgFormatted = computed<string>(() => {
    return this.savedKgNumber().toFixed(1);
  });

  // Saved percentage (approx 79%)
  readonly percentageSaved = computed<number>(() => {
    const pct = Math.round(((PKW_EMISSIONS_G_PER_KM - BAHN_EMISSIONS_G_PER_KM) / PKW_EMISSIONS_G_PER_KM) * 100);
    return pct;
  });

  // Train bar percentage relative to PKW (32 / 154 = ~20.8%)
  readonly bahnBarPercent = computed<number>(() => {
    return Math.max(12, Math.round((BAHN_EMISSIONS_G_PER_KM / PKW_EMISSIONS_G_PER_KM) * 100));
  });

  // Avoided societal climate damage costs according to UBA (237 € / tonne = 0.237 € / kg)
  readonly avoidedClimateCostEur = computed<string>(() => {
    const eur = this.savedKgNumber() * UBA_CLIMATE_COST_EUR_PER_KG;
    return eur < 1 ? eur.toFixed(2) : eur.toFixed(2);
  });

  // Mature tree absorption days (1 tree = 12.5 kg/yr = ~34.2 g/day)
  readonly treeDays = computed<number>(() => {
    const days = Math.round((this.savedKgNumber() * 1000) / (TREE_ANNUAL_KG_CO2 * 1000 / 365));
    return Math.max(1, days);
  });

  openOverlay(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.isOpen.set(true);
  }

  closeOverlay(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.isOpen.set(false);
  }

  onEscape(): void {
    if (this.isOpen()) {
      this.isOpen.set(false);
    }
  }
}
