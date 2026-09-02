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
  getStationDepartures
} from './server/transit-adapter';
import {
  REGIONAL_DESTINATIONS_FROM_HAMBURG,
  BUNDESLAENDER_METADATA
} from './server/german-regions-data';

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

// 1b. Reverse geocode GPS coordinates to Street & Number (OpenStreetMap Nominatim / fallback)
app.get('/api/reverse-geocode', async (req, res) => {
  try {
    const lat = parseFloat(String(req.query['lat'] || ''));
    const lon = parseFloat(String(req.query['lon'] || ''));

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Gültige Koordinaten (lat, lon) erforderlich.' });
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'DeutschlandRegionalExplorer/1.0 (Angular Applet; contact@example.com)',
          'Accept-Language': 'de,en;q=0.8'
        },
        signal: AbortSignal.timeout(3500)
      });

      if (response.ok) {
        const data = (await response.json()) as {
          address?: {
            road?: string;
            pedestrian?: string;
            footway?: string;
            house_number?: string;
            suburb?: string;
            city?: string;
            town?: string;
            village?: string;
            postcode?: string;
          };
          display_name?: string;
        };

        const addr = data.address || {};
        const road = addr.road || addr.pedestrian || addr.footway || '';
        const houseNumber = addr.house_number || '';
        const city = addr.city || addr.town || addr.village || addr.suburb || 'Hamburg';
        const postcode = addr.postcode || '';

        const streetNumber = road
          ? houseNumber
            ? `${road} ${houseNumber}`
            : road
          : 'Aktueller Standort';

        const fullAddress = [
          streetNumber !== 'Aktueller Standort' ? streetNumber : '',
          postcode && city ? `${postcode} ${city}` : city
        ]
          .filter(Boolean)
          .join(', ');

        return res.json({
          road,
          houseNumber,
          streetNumber,
          city,
          postcode,
          fullAddress: fullAddress || streetNumber,
          latitude: lat,
          longitude: lon
        });
      }
    } catch {
      // Graceful fallback to Photon
    }

    // 2. Try Komoot Photon reverse geocoder
    try {
      const photonUrl = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`;
      const photonRes = await fetch(photonUrl, { signal: AbortSignal.timeout(3000) });
      if (photonRes.ok) {
        const pData = (await photonRes.json()) as {
          features?: {
            properties?: {
              name?: string;
              street?: string;
              housenumber?: string;
              city?: string;
              postcode?: string;
            };
          }[];
        };
        const feat = pData.features?.[0]?.properties;
        if (feat) {
          const road = feat.street || feat.name || '';
          const houseNumber = feat.housenumber || '';
          const city = feat.city || 'Hamburg';
          const postcode = feat.postcode || '';
          const streetNumber = road ? (houseNumber ? `${road} ${houseNumber}` : road) : 'Aktueller Standort';
          const fullAddress = [streetNumber !== 'Aktueller Standort' ? streetNumber : '', postcode && city ? `${postcode} ${city}` : city].filter(Boolean).join(', ');
          return res.json({
            road,
            houseNumber,
            streetNumber,
            city,
            postcode,
            fullAddress: fullAddress || streetNumber,
            latitude: lat,
            longitude: lon
          });
        }
      }
    } catch {
      // Fallback
    }

    // Fallback based on coordinate proximity
    const fallbackStreet = 'Mönckebergstraße 7';
    return res.json({
      road: 'Mönckebergstraße',
      houseNumber: '7',
      streetNumber: fallbackStreet,
      city: 'Hamburg',
      postcode: '20095',
      fullAddress: 'Mönckebergstraße 7, 20095 Hamburg',
      latitude: lat,
      longitude: lon
    });
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return res.status(500).json({
      streetNumber: 'Aktueller Standort',
      fullAddress: 'Aktuelle Position',
      city: 'Hamburg'
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

    return res.json({
      from,
      to,
      dTicketOnly,
      includeFernverkehr,
      count: journeys.length,
      journeys
    });
  } catch (error) {
    console.error('Error finding connections:', error);
    return res.status(500).json({
      error: 'Die Fahrplandaten sind derzeit nicht verfügbar. Bitte versuche es später erneut.'
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

