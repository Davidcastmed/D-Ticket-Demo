import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import {
  searchStations,
  searchConnections,
  getStationDepartures,
  getJourneyLiveRealtimeStatus
} from './server/transit-adapter';
import {
  REGIONAL_DESTINATIONS_FROM_HAMBURG,
  BUNDESLAENDER_METADATA,
  TOP_GERMAN_STATIONS
} from './server/german-regions-data';
import {
  getStationAccessibility,
  evaluateRouteAccessibility,
  HAMBURG_ACCESSIBILITY_DATA
} from './server/accessibility-data';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
app.use(express.json());

const angularApp = new AngularNodeAppEngine();

/**
 * REST API Endpoints for Deutschland Regional Explorer
 */

// 1. Search stations & stops across Germany with optional geolocation
app.get('/api/stations', async (req, res) => {
  try {
    const query = String(req.query['query'] || req.query['q'] || '').trim();
    if (!query) {
      return res.json([]);
    }
    const lat = req.query['lat'] ? parseFloat(String(req.query['lat'])) : undefined;
    const lon = req.query['lon'] ? parseFloat(String(req.query['lon'])) : undefined;
    const stations = await searchStations(query, isNaN(lat as number) ? undefined : lat, isNaN(lon as number) ? undefined : lon);
    return res.json(stations);
  } catch (error) {
    console.error('Error searching stations:', error);
    return res.status(500).json({ error: 'Fehler bei der Stationssuche' });
  }
});

// 1b. Reverse geocode GPS coordinates to real Street & Number (OpenStreetMap / QGIS Nominatim / fallback)
app.get('/api/reverse-geocode', async (req, res) => {
  try {
    const lat = parseFloat(String(req.query['lat'] || ''));
    const lon = parseFloat(String(req.query['lon'] || ''));

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Gültige Koordinaten (lat, lon) erforderlich.' });
    }

    const providers = [
      // 1. QGIS Nominatim mirror (fast, highly reliable, not rate-limited for transit apps)
      `https://nominatim.qgis.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1`,
      // 2. Official OpenStreetMap Nominatim with valid compliant contact header
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&email=transitapp@deutschland-regional.app`
    ];

    for (const url of providers) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'DeutschlandRegionalExplorer/1.0 (transit@deutschland-regional.app)',
            'Accept-Language': 'de,es,en;q=0.8'
          },
          signal: AbortSignal.timeout(3800)
        });

        if (response.ok) {
          const data = (await response.json()) as {
            address?: Record<string, string>;
            display_name?: string;
            name?: string;
          };

          const addr = data.address || {};
          const road =
            addr['road'] ||
            addr['pedestrian'] ||
            addr['footway'] ||
            addr['path'] ||
            addr['cycleway'] ||
            addr['street'] ||
            addr['residential'] ||
            addr['square'] ||
            addr['plaza'] ||
            addr['neighbourhood'] ||
            addr['suburb'] ||
            addr['amenity'] ||
            data.name ||
            (data.display_name ? data.display_name.split(',')[0].trim() : '');
          const houseNumber = addr['house_number'] || addr['housenumber'] || '';
          const city =
            addr['city'] ||
            addr['town'] ||
            addr['village'] ||
            addr['municipality'] ||
            addr['county'] ||
            addr['state'] ||
            '';
          const postcode = addr['postcode'] || '';
          const country = addr['country'] || '';

          if (road || city) {
            const streetNumber = road
              ? (houseNumber ? `${road} ${houseNumber}` : road)
              : (city ? `Zentrum ${city}` : 'Aktueller Standort');

            const fullAddress = [
              streetNumber,
              postcode && city ? `${postcode} ${city}` : (postcode || city),
              country
            ]
              .filter(Boolean)
              .join(', ');

            return res.json({
              road,
              houseNumber,
              streetNumber,
              city,
              postcode,
              country,
              fullAddress: fullAddress || streetNumber,
              latitude: lat,
              longitude: lon
            });
          }
        }
      } catch {
        // Try next provider
      }
    }

    // Smart proximity fallback: Find the nearest known station or district in Germany
    let nearestStation = TOP_GERMAN_STATIONS[0];
    let minDistance = Infinity;

    for (const station of TOP_GERMAN_STATIONS) {
      const dLat = (station.latitude - lat) * (Math.PI / 180);
      const dLon = (station.longitude - lon) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat * (Math.PI / 180)) *
          Math.cos(station.latitude * (Math.PI / 180)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const dist = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (dist < minDistance) {
        minDistance = dist;
        nearestStation = station;
      }
    }

    const fallbackStreet = nearestStation ? `Nähe ${nearestStation.name}` : 'Aktueller Standort';
    const fallbackFull = nearestStation ? `Nähe ${nearestStation.name}, Deutschland` : 'Aktueller Standort';

    return res.json({
      road: nearestStation ? nearestStation.name : '',
      houseNumber: '',
      streetNumber: fallbackStreet,
      city: '',
      postcode: '',
      country: 'Deutschland',
      fullAddress: fallbackFull,
      latitude: lat,
      longitude: lon
    });
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return res.status(500).json({
      streetNumber: 'Aktueller Standort',
      fullAddress: 'Aktueller Standort',
      city: ''
    });
  }
});

// 2. Search regional connections with ranking & D-Ticket filter
app.get('/api/connections', async (req, res) => {
  try {
    const from = String(req.query['from'] || '').trim();
    const to = String(req.query['to'] || '').trim();
    const departure = req.query['departure'] ? String(req.query['departure']) : undefined;
    const dTicketOnly = req.query['dTicketOnly'] !== 'false';
    const includeFernverkehr = req.query['includeFernverkehr'] === 'true';

    if (!from || !to) {
      return res.status(400).json({ error: 'Start- und Zielbahnhof sind erforderlich.' });
    }

    const journeys = await searchConnections({
      from,
      to,
      departure,
      dTicketOnly,
      includeFernverkehr
    });

    // Enrich each journey with live accessibility and elevator status
    const enrichedJourneys = journeys.map(j => ({
      ...j,
      accessibility: evaluateRouteAccessibility(j)
    }));

    return res.json({
      from,
      to,
      dTicketOnly,
      includeFernverkehr,
      count: enrichedJourneys.length,
      journeys: enrichedJourneys
    });
  } catch (error) {
    console.error('Error finding connections:', error);
    return res.status(500).json({
      error: 'Die Fahrplandaten sind derzeit nicht verfügbar. Bitte versuche es später erneut.'
    });
  }
});

// 2b. Live Accessibility & Elevator Monitor for stations (Hamburg Open Data & DB FaSta)
app.get('/api/accessibility/station', (req, res) => {
  const station = String(req.query['station'] || req.query['stationId'] || '').trim();
  if (!station) {
    return res.status(400).json({ error: 'Bahnhofsname oder ID ist erforderlich.' });
  }
  const data = getStationAccessibility(station);
  return res.json(data);
});

// 2c. Overview of Hamburg Station Accessibility
app.get('/api/accessibility/hamburg', (_req, res) => {
  const stations = Object.values(HAMBURG_ACCESSIBILITY_DATA);
  const totalElevators = stations.reduce((acc, s) => acc + s.elevatorsTotal, 0);
  const totalInService = stations.reduce((acc, s) => acc + s.elevatorsInService, 0);
  const operationalRatePercent = totalElevators > 0 ? Math.round((totalInService / totalElevators) * 100) : 100;

  return res.json({
    summary: {
      totalStationsMonitored: stations.length,
      totalElevators,
      elevatorsInService: totalInService,
      elevatorsInMaintenance: stations.reduce((acc, s) => acc + s.elevatorsInMaintenance, 0),
      elevatorsOutOfOrder: stations.reduce((acc, s) => acc + s.elevatorsOutOfOrder, 0),
      operationalRatePercent,
      networkStatus: operationalRatePercent >= 95 ? 'Normalbetrieb' : 'Leichte Einschränkungen',
      dataSource: 'Hamburg Open Data (Urban Data Hub) & DB FaSta'
    },
    stations
  });
});

// 2d. Real-time delay and cancellation status for regional journey connections
app.post('/api/journey/live-status', async (req, res) => {
  try {
    const payload = req.body || {};
    const status = await getJourneyLiveRealtimeStatus(payload);
    return res.json(status);
  } catch (error) {
    console.error('Error fetching journey live status:', error);
    return res.status(500).json({
      error: 'Echtzeit-Fahrtdaten konnten nicht ermittelt werden.'
    });
  }
});

// 3. Station departures board ("Was fährt hier?")
app.get('/api/departures', async (req, res) => {
  try {
    const station = String(req.query['station'] || req.query['stationId'] || '').trim();
    if (!station) {
      return res.status(400).json({ error: 'Bahnhof ist erforderlich.' });
    }
    const result = await getStationDepartures(station);
    return res.json(result);
  } catch (error) {
    console.error('Error getting station departures:', error);
    return res.status(500).json({ error: 'Fehler beim Laden der Abfahrten.' });
  }
});

// 4. Regional destinations from Hamburg (organized by Bundesländer)
app.get('/api/destinations/from-hamburg', (req, res) => {
  const bundesland = req.query['bundesland'] ? String(req.query['bundesland']) : undefined;
  let items = REGIONAL_DESTINATIONS_FROM_HAMBURG;
  if (bundesland) {
    items = items.filter(d => d.bundesland.toLowerCase() === bundesland.toLowerCase());
  }
  return res.json(items);
});

// 5. Bundesländer metadata
app.get('/api/bundeslaender', (_req, res) => {
  return res.json(BUNDESLAENDER_METADATA);
});

// 6. "Überrasche mich" / Spontaneous regional suggestions
app.get('/api/surprise', (req, res) => {
  const maxMinutes = req.query['maxMinutes'] ? Number(req.query['maxMinutes']) : 999;
  const category = req.query['category'] ? String(req.query['category']) : undefined;

  let candidates = REGIONAL_DESTINATIONS_FROM_HAMBURG.filter(d => d.durationMin <= maxMinutes);
  if (category && category !== 'all' && category !== 'beliebig') {
    candidates = candidates.filter(d => d.category.toLowerCase().includes(category.toLowerCase()));
  }

  if (candidates.length === 0) {
    candidates = REGIONAL_DESTINATIONS_FROM_HAMBURG;
  }

  // Pick random candidate or shuffle
  const shuffled = [...candidates].sort(() => 0.5 - Math.random());
  return res.json(shuffled.slice(0, 4));
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.webmanifest') || filePath.endsWith('manifest.json')) {
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      }
    },
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = 3000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }
    console.log(`Deutschland Regional Explorer server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);

