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
  readonly isOnline = signal<boolean>(true);
  readonly showIOSModal = signal<boolean>(false);
  readonly installOutcome = signal<'accepted' | 'dismissed' | null>(null);

  // Can show install action (either native prompt available or iOS instructions)
  readonly canInstall = computed(() => {
    if (this.isInstalled()) return false;
    return this.isInstallable() || this.isIOS();
  });

  constructor() {
    if (typeof window !== 'undefined') {
      this.initPwa();
    }
  }

  private initPwa(): void {
    // 1. Check if already installed / running in standalone window mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    this.isInstalled.set(isStandalone);

    // 2. Detect iOS device (iPhone, iPad, iPod)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    this.isIOS.set(isIOSDevice);

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

    // 6. Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            // Check for updates
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
          .catch(() => {
            // Service worker registration error handled silently
          });
      });
    }
  }

  /**
   * Trigger install flow
   */
  async promptInstall(): Promise<boolean> {
    if (this.isIOS()) {
      this.showIOSModal.set(true);
      return true;
    }

    if (!this.deferredPrompt) {
      // Fallback for desktop/android when prompt not yet fired: show iOS/Manual guidance
      this.showIOSModal.set(true);
      return false;
    }

    try {
      await this.deferredPrompt.prompt();
      const choice = await this.deferredPrompt.userChoice;
      this.installOutcome.set(choice.outcome);

      if (choice.outcome === 'accepted') {
        this.isInstalled.set(true);
        this.isInstallable.set(false);
        this.deferredPrompt = null;
        return true;
      }
    } catch {
      // Fallback
    }

    return false;
  }

  closeIOSModal(): void {
    this.showIOSModal.set(false);
  }
}
