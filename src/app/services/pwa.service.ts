import { Injectable, signal, computed } from '@angular/core';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

@Injectable({
  providedIn: 'root'
})
export class PwaService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  // Reactive state signals
  readonly isInstallable = signal<boolean>(false);
  readonly isInstalled = signal<boolean>(false);
  readonly isIOS = signal<boolean>(false);
  readonly isAndroid = signal<boolean>(false);
  readonly isOnline = signal<boolean>(true);
  readonly showIOSModal = signal<boolean>(false);
  readonly installOutcome = signal<'accepted' | 'dismissed' | null>(null);

  // The install button is ALWAYS visible to motivate the user until they actually install the app
  readonly canInstall = computed(() => {
    return !this.isInstalled();
  });

  constructor() {
    if (typeof window !== 'undefined') {
      this.initPwa();
    }
  }

  private initPwa(): void {
    // 1. Check if already installed / running in standalone window mode
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://');
      this.isInstalled.set(isStandalone);
    };
    checkStandalone();

    try {
      window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
        if (e.matches) {
          this.isInstalled.set(true);
        }
      });
    } catch {
      // ignore
    }

    // 2. Detect device & platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.isIOS.set(isIOSDevice);

    const isAndroidDevice = /android/.test(userAgent);
    this.isAndroid.set(isAndroidDevice);

    // 3. Online/offline connectivity listeners
    this.isOnline.set(navigator.onLine);
    window.addEventListener('online', () => this.isOnline.set(true));
    window.addEventListener('offline', () => this.isOnline.set(false));

    // 4. Intercept Chrome/Edge/Android beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.isInstallable.set(true);
    });

    // 5. Track successful app installation
    window.addEventListener('appinstalled', () => {
      this.isInstalled.set(true);
      this.isInstallable.set(false);
      this.deferredPrompt = null;
      this.installOutcome.set('accepted');
    });

    // 6. Register Service Worker reliably (even if window load already fired)
    if ('serviceWorker' in navigator) {
      const registerSW = () => {
        navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .then((reg) => {
            reg.onupdatefound = () => {
              const installingWorker = reg.installing;
              if (installingWorker) {
                installingWorker.onstatechange = () => {
                  if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New content is available; can automatically refresh or notify
                  }
                };
              }
            };
          })
          .catch((err) => {
            console.warn('Service worker registration failed:', err);
          });
      };

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
      }
    }
  }

  /**
   * Trigger install flow
   */
  async promptInstall(): Promise<boolean> {
    if (this.deferredPrompt) {
      try {
        await this.deferredPrompt.prompt();
        const choice = await this.deferredPrompt.userChoice;
        this.installOutcome.set(choice.outcome);

        if (choice.outcome === 'accepted') {
          this.isInstalled.set(true);
          this.isInstallable.set(false);
          this.deferredPrompt = null;
          this.showIOSModal.set(false);
          return true;
        } else {
          // If dismissed, keep install button visible to motivate later
          return false;
        }
      } catch (err) {
        console.warn('Fehler beim Installationsdialog:', err);
      }
    }

    // If native prompt is not yet available, or on iOS/Safari/desktop, open the guided install modal
    this.showIOSModal.set(true);
    return false;
  }

  closeIOSModal(): void {
    this.showIOSModal.set(false);
  }
}
