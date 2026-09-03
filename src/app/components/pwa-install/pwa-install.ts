import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PwaService } from '../../services/pwa.service';

@Component({
  selector: 'app-pwa-install',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <!-- Persistent Floating Motivator Button (Always visible whenever user has not installed) -->
    @if (pwaService.canInstall()) {
      <aside
        id="floating-pwa-install-motivator"
        aria-label="App auf dem Gerät installieren"
        class="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center shadow-xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-300 pointer-events-auto"
      >
        <button
          type="button"
          id="btn-install-pwa-floating"
          (click)="onFloatingInstallClick()"
          class="group flex items-center gap-2.5 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-[#1B4332] hover:bg-[#2D6A4F] text-white rounded-2xl font-bold shadow-lg border border-[#2D6A4F]/70 cursor-pointer transition-all hover:scale-[1.03] active:scale-[0.97]"
          title="Deutschland Regional Explorer als App installieren"
          aria-label="App jetzt auf Ihrem Gerät installieren"
        >
          <div class="relative flex items-center justify-center w-7 h-7 rounded-xl bg-[#2D6A4F] text-[#B7E4C7] shrink-0 group-hover:bg-[#40916C] transition-colors">
            <span class="mat-icon text-lg">install_mobile</span>
            <span class="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#74C69D] opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#74C69D]"></span>
            </span>
          </div>
          <div class="text-left leading-tight pr-1">
            <div class="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
              <span>App installieren</span>
            </div>
            <div class="text-[10px] text-[#B7E4C7] font-medium hidden xs:block">
              Offline & schneller Schnellstart
            </div>
          </div>
        </button>
      </aside>
    }

    <!-- Installation Guidance Modal (iOS, Android, and Desktop instructions) -->
    @if (pwaService.showIOSModal()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
        <div class="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#E6DED6] overflow-hidden p-6 text-[#2E1F18]">
          <!-- Close button -->
          <button
            type="button"
            id="btn-close-pwa-modal"
            (click)="pwaService.closeIOSModal()"
            class="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#FAF7F2] hover:bg-[#EFEBE6] text-[#795548] flex items-center justify-center cursor-pointer transition-colors"
            aria-label="Schließen"
          >
            <span class="mat-icon text-lg">close</span>
          </button>

          <!-- Modal Header with App Icon -->
          <div class="flex items-center gap-3.5 mb-5">
            <div class="w-13 h-13 rounded-2xl bg-[#1B4332] p-2 flex items-center justify-center shadow-md shrink-0">
              <img src="/icon.svg" alt="App Icon" class="w-9 h-9" />
            </div>
            <div>
              <h3 class="text-base font-black text-[#1F1612]">App auf Ihrem Gerät installieren</h3>
              <p class="text-xs text-[#795548] font-medium">Deutschland Regional Explorer</p>
            </div>
          </div>

          <!-- Specific Step by Step Instructions -->
          @if (pwaService.isIOS()) {
            <!-- iOS Safari Instructions -->
            <div class="space-y-3 bg-[#FAF7F2] p-4 rounded-xl border border-[#EFEBE6] text-xs leading-relaxed">
              <div class="font-bold text-[#1B4332] flex items-center gap-1.5 text-sm">
                <span class="mat-icon text-base">phone_iphone</span>
                <span>Anleitung für iPhone & iPad (Safari):</span>
              </div>
              <ol class="list-decimal list-inside space-y-2 text-[#4E342E] pl-1 font-medium">
                <li>
                  Tippen Sie in der Safari-Symbolleiste unten auf das
                  <strong class="text-[#1F1612] font-bold">Teilen-Symbol</strong>
                  <span class="inline-flex items-center px-1.5 py-0.5 bg-white border border-[#DDD] rounded text-[11px] font-bold ml-1">
                    <span class="mat-icon text-xs mr-0.5">ios_share</span> Teilen
                  </span>
                </li>
                <li>
                  Scrollen Sie nach unten und wählen Sie
                  <strong class="text-[#1F1612] font-bold">„Zum Home-Bildschirm“</strong>
                  <span class="inline-flex items-center px-1.5 py-0.5 bg-white border border-[#DDD] rounded text-[11px] font-bold ml-1">
                    <span class="mat-icon text-xs mr-0.5">add_box</span>
                  </span>
                </li>
                <li>
                  Tippen Sie oben rechts auf <strong class="text-[#1B4332] font-bold">„Hinzufügen“</strong>.
                </li>
              </ol>
            </div>
          } @else {
            <!-- Android / Chrome / Edge Instructions -->
            <div class="space-y-3 bg-[#FAF7F2] p-4 rounded-xl border border-[#EFEBE6] text-xs leading-relaxed">
              <div class="font-bold text-[#1B4332] flex items-center gap-1.5 text-sm">
                <span class="mat-icon text-base">{{ pwaService.isAndroid() ? 'smartphone' : 'devices' }}</span>
                <span>Installation:</span>
              </div>
              <p class="text-[#4E342E]">
                Mit der installierten App greifen Sie blitzschnell auf Zugverbindungen, Abfahrtstafeln und Offline-Karten zu — im Vollbild ohne Browser-Leiste.
              </p>
              
              @if (pwaService.isInstallable()) {
                <div class="pt-2">
                  <button
                    type="button"
                    id="btn-direct-install-modal"
                    (click)="onDirectInstallClick()"
                    class="w-full py-3 bg-[#1B4332] hover:bg-[#2D6A4F] text-white rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm"
                  >
                    <span class="mat-icon text-lg">download</span>
                    <span>Jetzt direkt installieren</span>
                  </button>
                </div>
              } @else {
                <div class="bg-white p-3 rounded-lg border border-[#E6DED6] space-y-1.5 text-[#3E2723]">
                  <p class="font-bold text-xs text-[#1B4332] flex items-center gap-1">
                    <span class="mat-icon text-sm">info</span>
                    <span>Im Browser installieren:</span>
                  </p>
                  @if (pwaService.isAndroid()) {
                    <p class="text-[11px]">
                      Tippen Sie oben rechts auf das <strong>Menü (⋮)</strong> und wählen Sie <strong>„App installieren“</strong> oder <strong>„Zum Startbildschirm hinzufügen“</strong>.
                    </p>
                  } @else {
                    <p class="text-[11px]">
                      Klicken Sie in der Adressleiste oben rechts auf das <strong>Installations-Symbol (⊕)</strong> oder im Browsermenü (⋮) auf <strong>„App installieren“</strong>.
                    </p>
                  }
                </div>
              }
            </div>
          }

          <!-- Close / Fertig Button -->
          <div class="mt-5">
            <button
              type="button"
              id="btn-modal-close-confirm"
              (click)="pwaService.closeIOSModal()"
              class="w-full py-2.5 bg-white hover:bg-[#F5EFEB] text-[#4E342E] rounded-xl font-bold border border-[#E6DED6] text-xs transition-colors cursor-pointer"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Offline Floating Indicator -->
    @if (!pwaService.isOnline()) {
      <div class="fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#991B1B] text-white text-xs font-bold shadow-lg animate-in slide-in-from-bottom-2 duration-200">
        <span class="w-2 h-2 rounded-full bg-white animate-ping"></span>
        <span class="mat-icon text-sm">cloud_off</span>
        <span>Offline-Modus — Gespeicherte Daten werden genutzt</span>
      </div>
    }
  `
})
export class PwaInstallModal {
  readonly pwaService = inject(PwaService);

  onFloatingInstallClick(): void {
    this.pwaService.promptInstall();
  }

  onDirectInstallClick(): void {
    this.pwaService.promptInstall();
    this.pwaService.closeIOSModal();
  }
}
