/**
 * Utility functions for station name normalization and cleaning
 * specifically tailored for Hamburg, Kiel, and the surrounding metropolitan region.
 */

/**
 * Strips the city names 'Hamburg' and 'Kiel' from station names,
 * establishing the contextual assumption that all transit searches occur
 * within the Hamburg, Kiel and surrounding regional network.
 */
export function cleanStationName(rawName: string): string {
  if (!rawName) return '';
  let name = rawName.trim();

  // Special canonical mappings for main hubs
  if (/^Hamburg\s+(Hbf|Hauptbahnhof)$/i.test(name) || name.toLowerCase() === 'hamburg hbf') {
    return 'Hauptbahnhof';
  }
  if (/^Kiel\s+(Hbf|Hauptbahnhof)$/i.test(name) || name.toLowerCase() === 'kiel hbf') {
    return 'Hbf';
  }

  // Strip prefix "Hamburg " or "Hamburg-" or "Hamburg, " or "Kiel " or "Kiel-"
  name = name.replace(/^(Hamburg|Kiel)[\s\-,–—]+/i, '');

  // Strip suffix ", Hamburg" or " (Hamburg)" or ", Kiel" or " (Kiel)"
  name = name.replace(/[\s\-,–—]+(Hamburg|Kiel)$/i, '');
  name = name.replace(/\s*\((Hamburg|Kiel)\)/gi, '');

  // Strip standalone words "Hamburg" or "Kiel"
  name = name.replace(/\b(Hamburg|Kiel)\b/gi, '');

  // Clean extra spaces, leading/trailing punctuation
  name = name
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-,–—]+|[\s\-,–—]+$/g, '')
    .trim();

  return name || rawName;
}
