import { Injectable, signal } from '@angular/core';
import { Station } from '../models/transit.models';

export interface DestinationWeather {
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  description: string;
  icon: string;
  matIcon: string;
  humidity: number;
  windSpeedKmH: number;
  precipitation: number;
  cityName: string;
  isDay: boolean;
  time: string;
}

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private readonly cache = new Map<string, { data: DestinationWeather; timestamp: number }>();
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache

  readonly currentWeather = signal<DestinationWeather | null>(null);
  readonly isLoading = signal<boolean>(false);

  /**
   * Fetches weather for a destination station.
   */
  async getWeatherForStation(station: Station | null, forceRefresh = false): Promise<DestinationWeather | null> {
    if (!station || !station.name) {
      this.currentWeather.set(null);
      return null;
    }

    const cleanCity = this.extractCityName(station.name);
    const cacheKey = station.location
      ? `${station.location.latitude.toFixed(2)}_${station.location.longitude.toFixed(2)}`
      : cleanCity.toLowerCase();

    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        this.currentWeather.set(cached.data);
        return cached.data;
      }
    }

    this.isLoading.set(true);

    try {
      let lat = station.location?.latitude;
      let lon = station.location?.longitude;

      // If coordinates are missing, resolve city coordinates via Open-Meteo Geocoding
      if (lat === undefined || lon === undefined) {
        const coords = await this.geocodeCity(cleanCity);
        if (coords) {
          lat = coords.lat;
          lon = coords.lon;
        }
      }

      if (lat === undefined || lon === undefined) {
        this.isLoading.set(false);
        return null;
      }

      const weather = await this.fetchOpenMeteo(lat, lon, cleanCity);
      if (weather) {
        this.cache.set(cacheKey, { data: weather, timestamp: Date.now() });
        this.currentWeather.set(weather);
        return weather;
      }
      return null;
    } catch (err) {
      console.warn('Could not load destination weather:', err);
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  private extractCityName(stationName: string): string {
    let name = stationName.trim();
    // Remove (Main), (Holst), (Elbe), (Saale), (tief), etc.
    name = name.replace(/\([^)]*\)/g, ' ');
    // Remove "Hbf", "Bahnhof", "Bf", "ZOB", "Flughafen"
    name = name.replace(/\b(Hbf|Hauptbahnhof|Bahnhof|Bf|ZOB|Flughafen|Messe|Station)\b/gi, ' ');
    // Remove comma and secondary parts (e.g. "Dauenhof, Westerhorn" -> "Dauenhof")
    if (name.includes(',')) {
      name = name.split(',')[0];
    }
    // Remove slash separated details (e.g. "Köln Messe/Deutz" -> "Köln")
    if (name.includes('/')) {
      name = name.split('/')[0];
    }
    name = name.trim();
    return name || stationName.trim();
  }

  private async geocodeCity(cityName: string): Promise<{ lat: number; lon: number } | null> {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=de&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && Array.isArray(data.results) && data.results.length > 0) {
        const first = data.results[0];
        return {
          lat: first.latitude,
          lon: first.longitude
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async fetchOpenMeteo(lat: number, lon: number, cityName: string): Promise<DestinationWeather | null> {
    try {
      const params = new URLSearchParams({
        latitude: lat.toFixed(4),
        longitude: lon.toFixed(4),
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
        timezone: 'auto'
      });

      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
        signal: AbortSignal.timeout(3500)
      });
      if (!res.ok) return null;

      const data = await res.json();
      const cur = data?.current;
      if (!cur) return null;

      const code = cur.weather_code ?? 0;
      const { description, icon, matIcon } = this.interpretWmoCode(code, cur.is_day === 1);

      return {
        temperature: Math.round(cur.temperature_2m),
        apparentTemperature: Math.round(cur.apparent_temperature),
        weatherCode: code,
        description,
        icon,
        matIcon,
        humidity: Math.round(cur.relative_humidity_2m || 0),
        windSpeedKmH: Math.round(cur.wind_speed_10m || 0),
        precipitation: cur.precipitation || 0,
        cityName,
        isDay: cur.is_day === 1,
        time: cur.time || ''
      };
    } catch {
      return null;
    }
  }

  private interpretWmoCode(code: number, isDay: boolean): { description: string; icon: string; matIcon: string } {
    switch (code) {
      case 0:
        return {
          description: isDay ? 'Sonnig' : 'Klar',
          icon: isDay ? '☀️' : '🌙',
          matIcon: isDay ? 'wb_sunny' : 'bedtime'
        };
      case 1:
      case 2:
        return {
          description: isDay ? 'Heiter' : 'Leicht bewölkt',
          icon: isDay ? '🌤️' : '☁️',
          matIcon: isDay ? 'partly_cloudy_day' : 'nights_stay'
        };
      case 3:
        return {
          description: 'Bewölkt',
          icon: '☁️',
          matIcon: 'cloud'
        };
      case 45:
      case 48:
        return {
          description: 'Nebel',
          icon: '🌫️',
          matIcon: 'foggy'
        };
      case 51:
      case 53:
      case 55:
        return {
          description: 'Nieselregen',
          icon: '🌦️',
          matIcon: 'grain'
        };
      case 61:
      case 63:
      case 65:
        return {
          description: 'Regen',
          icon: '🌧️',
          matIcon: 'water_drop'
        };
      case 66:
      case 67:
        return {
          description: 'Eisregen',
          icon: '🌨️',
          matIcon: 'ac_unit'
        };
      case 71:
      case 73:
      case 75:
      case 77:
        return {
          description: 'Schnee',
          icon: '❄️',
          matIcon: 'ac_unit'
        };
      case 80:
      case 81:
      case 82:
        return {
          description: 'Schauer',
          icon: '🌧️',
          matIcon: 'shower'
        };
      case 85:
      case 86:
        return {
          description: 'Schneeschauer',
          icon: '🌨️',
          matIcon: 'weather_snowy'
        };
      case 95:
      case 96:
      case 99:
        return {
          description: 'Gewitter',
          icon: '⛈️',
          matIcon: 'thunderstorm'
        };
      default:
        return {
          description: 'Überwiegend trocken',
          icon: '⛅',
          matIcon: 'partly_cloudy_day'
        };
    }
  }
}
