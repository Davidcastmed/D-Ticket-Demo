import {
  Component,
  EventEmitter,
  Output,
  signal,
  ChangeDetectionStrategy,
  inject,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegionalGetaway, Station } from '../../models/transit.models';
import { TransitService } from '../../services/transit.service';

@Component({
  selector: 'app-surprise-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="space-y-6">
      
      <!-- Generator Intro Card (hvv switch Card) -->
      <div class="bg-white rounded-3xl p-6 sm:p-7 shadow-xs border border-[#E6DED6] space-y-6" role="region" aria-label="Zufalls-Ausflugsplaner">
        <div class="flex items-center gap-3">
          <span class="w-10 h-10 rounded-2xl bg-[#D8F3DC] text-[#1B4332] flex items-center justify-center font-bold" aria-hidden="true">
            <span class="mat-icon text-xl">casino</span>
          </span>
          <div>
            <h2 class="text-base sm:text-lg font-black text-[#1F1612]">Überrasche mich</h2>
            <p class="text-xs text-[#795548]">
              «Ich habe heute frei. Wohin kann ich mit meinem Deutschlandticket fahren?»
            </p>
          </div>
        </div>

        <!-- Filter Controls -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
          
          <!-- Max Travel Time Filter -->
          <div>
            <span id="label-max-time" class="block text-xs font-bold uppercase tracking-wider text-[#8D6E63] mb-2.5">
              Maximale Fahrtdauer ab Hamburg
            </span>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-labelledby="label-max-time">
              <button
                type="button"
                id="btn-time-90"
                (click)="maxMinutes.set(90); rollSurprise()"
                [class.bg-[#1B4332]]="maxMinutes() === 90"
                [class.text-white]="maxMinutes() === 90"
                [class.bg-[#FAF7F2]]="maxMinutes() !== 90"
                [class.text-[#4E342E]]="maxMinutes() !== 90"
                class="px-3 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer text-center border border-[#E6DED6] shadow-2xs"
                [attr.aria-pressed]="maxMinutes() === 90"
                aria-label="Maximale Fahrtdauer 1,5 Stunden"
              >
                Max. 1,5 Std.
              </button>
              <button
                type="button"
                id="btn-time-150"
                (click)="maxMinutes.set(150); rollSurprise()"
                [class.bg-[#1B4332]]="maxMinutes() === 150"
                [class.text-white]="maxMinutes() === 150"
                [class.bg-[#FAF7F2]]="maxMinutes() !== 150"
                [class.text-[#4E342E]]="maxMinutes() !== 150"
                class="px-3 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer text-center border border-[#E6DED6] shadow-2xs"
                [attr.aria-pressed]="maxMinutes() === 150"
                aria-label="Maximale Fahrtdauer 2,5 Stunden"
              >
                Max. 2,5 Std.
              </button>
              <button
                type="button"
                id="btn-time-240"
                (click)="maxMinutes.set(240); rollSurprise()"
                [class.bg-[#1B4332]]="maxMinutes() === 240"
                [class.text-white]="maxMinutes() === 240"
                [class.bg-[#FAF7F2]]="maxMinutes() !== 240"
                [class.text-[#4E342E]]="maxMinutes() !== 240"
                class="px-3 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer text-center border border-[#E6DED6] shadow-2xs"
                [attr.aria-pressed]="maxMinutes() === 240"
                aria-label="Maximale Fahrtdauer 4 Stunden"
              >
                Max. 4 Std.
              </button>
              <button
                type="button"
                id="btn-time-999"
                (click)="maxMinutes.set(999); rollSurprise()"
                [class.bg-[#1B4332]]="maxMinutes() === 999"
                [class.text-white]="maxMinutes() === 999"
                [class.bg-[#FAF7F2]]="maxMinutes() !== 999"
                [class.text-[#4E342E]]="maxMinutes() !== 999"
                class="px-3 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer text-center border border-[#E6DED6] shadow-2xs"
                [attr.aria-pressed]="maxMinutes() === 999"
                aria-label="Beliebige Fahrtdauer"
              >
                Beliebig
              </button>
            </div>
          </div>

          <!-- Category / Vibe Filter -->
          <div>
            <span id="label-cat-vibe" class="block text-xs font-bold uppercase tracking-wider text-[#8D6E63] mb-2.5">
              Art des Ausflugs
            </span>
            <div class="flex items-center gap-2 flex-wrap" role="group" aria-labelledby="label-cat-vibe">
              @for (cat of categories; track cat) {
                <button
                  type="button"
                  (click)="selectedCategory.set(cat); rollSurprise()"
                  [class.bg-[#1B4332]]="selectedCategory() === cat"
                  [class.text-white]="selectedCategory() === cat"
                  [class.bg-[#FAF7F2]]="selectedCategory() !== cat"
                  [class.text-[#4E342E]]="selectedCategory() !== cat"
                  class="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border border-[#E6DED6] shadow-2xs"
                  [attr.aria-pressed]="selectedCategory() === cat"
                  [attr.aria-label]="'Kategorie ' + cat + ' filtern'"
                >
                  {{ cat }}
                </button>
              }
            </div>
          </div>

        </div>

        <!-- Big Roll Button -->
        <div class="pt-4 border-t border-[#EDE5DC] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="text-xs text-[#5D4037] flex items-center gap-2 font-medium">
            <span class="mat-icon text-[#2D6A4F] text-base" aria-hidden="true">verified</span>
            <span>Ausschließlich gültig mit dem Deutschlandticket</span>
          </div>

          <button
            type="button"
            id="btn-roll-surprise"
            (click)="rollSurprise()"
            class="w-full sm:w-auto px-7 py-3 bg-[#1B4332] hover:bg-[#132A1E] text-white font-black text-xs tracking-wider rounded-full shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            aria-label="Neue Reisevorschläge zufällig generieren"
          >
            <span class="mat-icon text-base" aria-hidden="true">shuffle</span>
            <span>NEUE VORSCHLÄGE GENERIEREN</span>
          </button>
        </div>
      </div>

      <!-- Generated Suggestions Grid -->
      <div class="space-y-4" role="region" aria-label="Ausflugsvorschläge">
        <h3 class="text-sm font-black text-[#1F1612] flex items-center gap-2">
          <span>Ausgewählte Ideen für deinen Tagestrip</span>
          <span class="text-xs text-[#8D6E63]">({{ suggestions().length }} Vorschläge)</span>
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          @for (dest of suggestions(); track dest.id) {
            <div class="bg-white rounded-3xl p-5 sm:p-6 border border-[#E6DED6] shadow-xs hover:border-[#2D6A4F] hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              
              <div>
                <div class="flex items-center justify-between">
                  <span class="text-xs font-black text-[#1B4332] bg-[#D8F3DC] px-2.5 py-0.5 rounded-full border border-[#B7E4C7]">
                    {{ dest.bundesland }}
                  </span>
                  <span class="text-xs font-bold text-[#8D6E63]">
                    {{ dest.category }}
                  </span>
                </div>

                <h4 class="text-xl font-black text-[#1F1612] mt-2">
                  {{ dest.name }}
                </h4>
                <p class="text-xs text-[#5D4037] mt-1 leading-relaxed">
                  {{ dest.description }}
                </p>

                <!-- Highlight Box -->
                <div class="mt-3 p-3 bg-[#FAF7F2] border border-[#EDE5DC] rounded-2xl text-xs text-[#3E2723] flex items-start gap-2.5">
                  <span class="mat-icon text-[#D4A373] text-sm mt-0.5" aria-hidden="true">lightbulb</span>
                  <div>
                    <span class="font-bold">Highlight:</span> {{ dest.highlight }}
                  </div>
                </div>
              </div>

              <!-- Transit Info & Action -->
              <div class="pt-3 border-t border-[#EDE5DC] flex items-center justify-between gap-3">
                <div class="text-xs text-[#5D4037] space-y-0.5 font-medium">
                  <div class="flex items-center gap-2">
                    <span class="font-black text-[#1F1612]">{{ dest.durationFormatted }}</span>
                    <span>•</span>
                    <span>{{ dest.transfers === 0 ? 'Direktzug' : dest.transfers + ' Umstieg' }}</span>
                  </div>
                  <div class="text-[11px] text-[#1B4332] font-black">
                    {{ dest.lines.join(', ') }}
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-plan-surprise-{{ dest.id }}"
                  (click)="planTrip(dest)"
                  class="px-5 py-2.5 bg-[#1B4332] hover:bg-[#132A1E] text-white rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  [attr.aria-label]="'Verbindung nach ' + dest.name + ' im Planer öffnen'"
                >
                  <span class="mat-icon text-sm" aria-hidden="true">train</span>
                  <span>Verbindung</span>
                </button>
              </div>

            </div>
          }
        </div>
      </div>

    </div>
  `
})
export class SurpriseView implements OnInit {
  @Output() navigateToPlanner = new EventEmitter<{ from: Station; to: Station }>();

  private transitService = inject(TransitService);

  readonly maxMinutes = signal<number>(150);
  readonly selectedCategory = signal<string>('Alle');
  readonly suggestions = signal<RegionalGetaway[]>([]);

  readonly categories = [
    'Alle',
    'Küste & Meer',
    'Historische Altstädte',
    'Natur & Wandern',
    'Großstadt & Kultur',
    'Seen & Schlösser'
  ];

  ngOnInit() {
    this.rollSurprise();
  }

  async rollSurprise() {
    const data = await this.transitService.getSurpriseDestinations(
      this.maxMinutes(),
      this.selectedCategory() === 'Alle' ? undefined : this.selectedCategory()
    );
    this.suggestions.set(data);
  }

  planTrip(dest: RegionalGetaway) {
    this.navigateToPlanner.emit({
      from: {
        id: '8002549',
        name: 'Hamburg Hbf',
        location: { latitude: 53.552736, longitude: 10.006909 }
      },
      to: {
        id: dest.stationId,
        name: dest.stationName,
        location: { latitude: dest.latitude, longitude: dest.longitude }
      }
    });
  }
}
