import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  computed,
  signal,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransitService } from './services/transit.service';
import { PwaService } from './services/pwa.service';
import { Station, ConnectionJourney } from './models/transit.models';
import { PlannerView } from './views/planner/planner-view';
import { LiveBoardView } from './views/live-board/live-board-view';
import { HamburgHubView } from './views/hamburg-hub/hamburg-hub-view';
import { SurpriseView } from './views/surprise/surprise-view';
import { FavoritesView } from './views/favorites/favorites-view';
import { AccessibilityView } from './views/accessibility/accessibility-view';
import { MapView } from './components/map/map-view';
import { JourneyDetail } from './components/journey-detail/journey-detail';
import { PwaInstallModal } from './components/pwa-install/pwa-install';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [
    CommonModule,
    PlannerView,
    LiveBoardView,
    HamburgHubView,
    SurpriseView,
    FavoritesView,
    AccessibilityView,
    MapView,
    JourneyDetail,
    PwaInstallModal
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly transitService = inject(TransitService);
  readonly pwaService = inject(PwaService);

  @ViewChild(PlannerView) plannerViewComponent?: PlannerView;
  @ViewChild(LiveBoardView) liveBoardViewComponent?: LiveBoardView;

  // Active sub-tab
  readonly currentTab = this.transitService.activeTab;

  // Map visibility toggle
  readonly showMap = signal<boolean>(true);

  // Subtle Header Menu dropdown
  readonly showMoreMenu = signal<boolean>(false);

  isExtraTabActive(): boolean {
    const tab = this.currentTab();
    return tab === 'favorites' || tab === 'hamburg-hub' || tab === 'surprise' || tab === 'accessibility';
  }

  getExtraTabLabel(): string {
    const tab = this.currentTab();
    if (tab === 'favorites') return 'Favoriten';
    if (tab === 'hamburg-hub') return 'Regionalnetz';
    if (tab === 'surprise') return 'Ausflugsplaner';
    if (tab === 'accessibility') return 'Barrierefreiheit';
    return 'Mehr';
  }

  getExtraTabIcon(): string {
    const tab = this.currentTab();
    if (tab === 'favorites') return 'star';
    if (tab === 'hamburg-hub') return 'anchor';
    if (tab === 'surprise') return 'shuffle';
    if (tab === 'accessibility') return 'accessible';
    return 'menu';
  }

  // Active inspection state
  readonly inspectJourney = signal<ConnectionJourney | null>(null);
  readonly mapActiveJourney = signal<ConnectionJourney | null>(null);
  readonly mapSelectedStation = signal<Station | null>(null);

  // Whether connection search results are currently visible in the planner
  readonly hasSearchResults = computed(() => {
    return this.currentTab() === 'planner' && this.transitService.hasPlannerResults();
  });

  readonly currentLocationDisplay = computed<string>(() => {
    const street = this.transitService.userStreetNumber();
    if (street && street !== 'Aktueller Standort' && street !== 'Hamburg Hbf') {
      return street;
    }
    const addr = this.transitService.userAddress();
    if (addr && addr !== 'Aktueller Standort' && addr !== 'Hamburg Hbf') {
      return addr.split(',')[0].trim();
    }
    const loc = this.transitService.userLocation();
    if (this.transitService.isRealGpsAcquired() && loc) {
      const nearest = this.transitService.findNearestStationToCoordinates(loc.latitude, loc.longitude);
      return nearest ? `Nähe ${nearest.name}` : 'GPS aktiv';
    }
    return 'Standort bereit';
  });

  navigateToHome(): void {
    this.transitService.activeTab.set('planner');
    this.transitService.hasPlannerResults.set(false);
    if (this.plannerViewComponent) {
      this.plannerViewComponent.resetSearch();
    }
  }

  setTab(tab: 'planner' | 'live-board' | 'hamburg-hub' | 'surprise' | 'favorites' | 'accessibility') {
    if (tab === 'planner' && this.currentTab() === 'planner' && this.transitService.hasPlannerResults()) {
      this.navigateToHome();
    } else {
      this.transitService.activeTab.set(tab);
    }
  }

  onShowJourneyOnMap(journey: ConnectionJourney) {
    this.mapActiveJourney.set(journey);
    this.mapSelectedStation.set(null);
    this.showMap.set(true);
    // Scroll map into view on mobile
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setTimeout(() => {
        document.getElementById('map-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }

  onOpenJourneyDetail(journey: ConnectionJourney) {
    this.inspectJourney.set(journey);
  }

  onNavigateToPlanner(event: { from: Station; to?: Station }) {
    this.transitService.activeTab.set('planner');
    setTimeout(() => {
      if (this.plannerViewComponent) {
        this.plannerViewComponent.setFromAndTo(event.from, event.to);
      }
    }, 50);
  }

  onNavigateToLiveBoard(station: Station) {
    this.transitService.activeTab.set('live-board');
    setTimeout(() => {
      if (this.liveBoardViewComponent) {
        this.liveBoardViewComponent.onStationSelected(station);
      }
    }, 50);
  }
}
