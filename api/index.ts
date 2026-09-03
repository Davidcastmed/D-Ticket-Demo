import type { IncomingMessage, ServerResponse } from 'http';
import {
  searchStations,
  searchConnections,
  getStationDepartures
} from '../src/server/transit-adapter';
import {
  REGIONAL_DESTINATIONS_FROM_HAMBURG,
  BUNDESLAENDER_METADATA
} from '../src/server/german-regions-data';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const host = req.headers.host || 'localhost';
  const fullUrl = new URL(req.url || '/', `https://${host}`);
  const pathname = fullUrl.pathname;
  const searchParams = fullUrl.searchParams;

  res.setHeader('Content-Type', 'application/json');

  try {
    // 1. Search stations
    if (pathname.endsWith('/stations') || pathname.includes('/api/stations')) {
      const query = String(searchParams.get('query') || searchParams.get('q') || '').trim();
      if (!query) {
        res.statusCode = 200;
        res.end(JSON.stringify([]));
        return;
      }
      const lat = searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : undefined;
      const lon = searchParams.get('lon') ? parseFloat(searchParams.get('lon')!) : undefined;
      const stations = await searchStations(query, isNaN(lat as number) ? undefined : lat, isNaN(lon as number) ? undefined : lon);
      res.statusCode = 200;
      res.end(JSON.stringify(stations));
      return;
    }

    // 2. Search connections
    if (pathname.endsWith('/connections') || pathname.includes('/api/connections')) {
      const from = String(searchParams.get('from') || '').trim();
      const to = String(searchParams.get('to') || '').trim();
      const departure = searchParams.get('departure') || undefined;
      const dTicketOnly = searchParams.get('dTicketOnly') !== 'false';
      const includeFernverkehr = searchParams.get('includeFernverkehr') === 'true';

      if (!from || !to) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Start- und Zielbahnhof sind erforderlich.' }));
        return;
      }

      const journeys = await searchConnections({
        from,
        to,
        departure,
        dTicketOnly,
        includeFernverkehr
      });

      res.statusCode = 200;
      res.end(JSON.stringify({
        from,
        to,
        dTicketOnly,
        includeFernverkehr,
        count: journeys.length,
        journeys
      }));
      return;
    }

    // 3. Departures
    if (pathname.endsWith('/departures') || pathname.includes('/api/departures')) {
      const station = String(searchParams.get('station') || searchParams.get('stationId') || '').trim();
      if (!station) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Bahnhof ist erforderlich.' }));
        return;
      }
      const result = await getStationDepartures(station);
      res.statusCode = 200;
      res.end(JSON.stringify(result));
      return;
    }

    // 4. Regional destinations from Hamburg
    if (pathname.endsWith('/destinations/from-hamburg') || pathname.includes('/api/destinations/from-hamburg')) {
      const bundesland = searchParams.get('bundesland') || undefined;
      let items = REGIONAL_DESTINATIONS_FROM_HAMBURG;
      if (bundesland) {
        items = items.filter(d => d.bundesland.toLowerCase() === bundesland.toLowerCase());
      }
      res.statusCode = 200;
      res.end(JSON.stringify(items));
      return;
    }

    // 5. Bundesländer
    if (pathname.endsWith('/bundeslaender') || pathname.includes('/api/bundeslaender')) {
      res.statusCode = 200;
      res.end(JSON.stringify(BUNDESLAENDER_METADATA));
      return;
    }

    // 6. Surprise
    if (pathname.endsWith('/surprise') || pathname.includes('/api/surprise')) {
      const maxMinutes = searchParams.get('maxMinutes') ? Number(searchParams.get('maxMinutes')) : 999;
      const category = searchParams.get('category') || undefined;

      let candidates = REGIONAL_DESTINATIONS_FROM_HAMBURG.filter(d => d.durationMin <= maxMinutes);
      if (category && category !== 'all' && category !== 'beliebig') {
        candidates = candidates.filter(d => d.category.toLowerCase().includes(category.toLowerCase()));
      }
      if (candidates.length === 0) {
        candidates = REGIONAL_DESTINATIONS_FROM_HAMBURG;
      }
      const shuffled = [...candidates].sort(() => 0.5 - Math.random());
      res.statusCode = 200;
      res.end(JSON.stringify(shuffled.slice(0, 4)));
      return;
    }

    // Default 404 for unknown route
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Route nicht gefunden' }));
  } catch (error) {
    console.error('API Handler Error:', error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Interner Serverfehler' }));
  }
}
