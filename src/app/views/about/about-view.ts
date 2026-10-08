import {
  ChangeDetectionStrategy,
  Component,
  output,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Station } from '../../models/transit.models';

interface ImpactMetric {
  annualKm: number;
  co2SavedVsPlaneKg: number;
  co2SavedVsCarKg: number;
  monetaryValueEuro: number;
  treesPlanted: number;
  schoolMonthsFunded: number;
  waterCleanDays: number;
}

@Component({
  selector: 'app-about-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './about-view.html',
  styleUrl: './about-view.css',
})
export class AboutView {
  readonly navigateToPlanner = output<{ from: Station; to?: Station }>();

  // Interactive Calculator State with Reactive Form Control
  readonly kmControl = new FormControl<number>(7200, { nonNullable: true });
  readonly userNameControl = new FormControl<string>('Umweltbewusste/r Bahnreisende/r', { nonNullable: true });

  // Quick preset options for distance
  readonly presets = [
    { label: 'Gelegenheitsfahrer', km: 2400, desc: '~200 km / Monat' },
    { label: 'D-Ticket Pendler', km: 7200, desc: '~600 km / Monat' },
    { label: 'Regelmäßiger Ausflügler', km: 14000, desc: '~1.160 km / Monat' },
    { label: 'Vielreisende/r', km: 25000, desc: '~2.080 km / Monat' },
  ];

  // Active Tab inside About view: 'mission' | 'calculator' | 'nicaragua' | 'business-model' | 'certificate'
  readonly activeSubSection = signal<'story' | 'calculator' | 'business-model' | 'nicaragua'>('story');

  // Selected photo for lightbox modal
  readonly activePhotoModal = signal<{
    src: string;
    title: string;
    subtitle: string;
    description: string;
  } | null>(null);

  // Computed metrics based on kmControl
  readonly metrics = computed<ImpactMetric>(() => {
    const km = Math.max(0, Number(this.kmControl.value) || 0);

    // CO2 Factors:
    // Regional train DB: ~32 g CO2/pkm
    // Domestic flight / Kurzstrecke: ~245 g CO2/pkm -> saving ~213 g/pkm
    // Average ICE / car solo: ~154 g CO2/pkm -> saving ~122 g/pkm
    const co2SavedVsPlaneKg = Math.round((km * 0.213) * 10) / 10;
    const co2SavedVsCarKg = Math.round((km * 0.122) * 10) / 10;

    // Monetary compensation rate:
    // Based on EU ETS carbon allowance price ~75-85 € / ton CO2
    // plus environmental damage internalization benchmark (~120 € / t CO2 according to Federal Environment Agency UBA)
    const monetaryValueEuro = Math.round((co2SavedVsPlaneKg / 1000) * 85 * 100) / 100;

    // Direct community impact in La Perla, Achuapa:
    // 1 native tree sapling + nursery care + 3 years protection = approx. 4.50 €
    // or ~500 km saved = 1 tree
    const treesPlanted = Math.max(1, Math.floor(km / 480));

    // School materials & educational package: ~15 € per child / month
    const schoolMonthsFunded = Math.max(0, Math.floor(monetaryValueEuro / 12));

    // Clean water filter days
    const waterCleanDays = Math.round(km * 0.45);

    return {
      annualKm: km,
      co2SavedVsPlaneKg,
      co2SavedVsCarKg,
      monetaryValueEuro,
      treesPlanted,
      schoolMonthsFunded,
      waterCleanDays,
    };
  });

  setPreset(km: number) {
    this.kmControl.setValue(km);
  }

  openPhoto(photo: { src: string; title: string; subtitle: string; description: string }) {
    this.activePhotoModal.set(photo);
  }

  closePhotoModal() {
    this.activePhotoModal.set(null);
  }

  startPlanning() {
    this.navigateToPlanner.emit({
      from: { id: 'station-hamburg-hbf', name: 'Hamburg Hbf' },
      to: { id: 'station-wrist', name: 'Wrist' }
    });
  }
}
