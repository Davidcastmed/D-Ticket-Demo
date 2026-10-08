/**
 * Utility functions for station name normalization and cleaning
 * specifically tailored for Hamburg, Kiel, and the surrounding regional transit network.
 */

/**
 * Normalizes station names within the Hamburg and Schleswig-Holstein network,
 * cleaning redundant prefixes while preserving full unambiguous identities for
 * major central stations (Hamburg Hbf, Kiel Hbf, Lübeck Hbf, etc.).
 */
export function cleanStationName(rawName: string): string {
  if (!rawName) return '';
  let name = rawName.trim();

  // Special canonical mappings for Hamburg Hbf and Kiel Hbf
  const lower = name.toLowerCase();
  if (lower === 'hamburg' || lower === 'hamburg hbf' || lower === 'hamburg hauptbahnhof' || lower === 'hauptbahnhof') {
    return 'Hamburg Hbf';
  }
  if (lower === 'kiel' || lower === 'kiel hbf' || lower === 'kiel hauptbahnhof') {
    return 'Kiel Hbf';
  }

  if (/^Hamburg\s+(Hbf|Hauptbahnhof)$/i.test(name)) {
    return 'Hamburg Hbf';
  }
  if (/^Kiel\s+(Hbf|Hauptbahnhof)$/i.test(name)) {
    return 'Kiel Hbf';
  }

  // Preserve exact recognized major hubs without stripping city names
  if (/^(Lübeck|Bremen|Hannover|Schwerin|Rostock|Braunschweig|Oldenburg|Osnabrück|Wolfsburg)\s+Hbf$/i.test(name)) {
    return name;
  }

  // Strip prefix "Hamburg " or "Hamburg-" or "Kiel " or "Kiel-" for local stations (e.g. Hamburg-Altona -> Altona)
  name = name.replace(/^(Hamburg|Kiel)[\s\-,–—]+/i, '');

  // Strip parenthetical city indicators: (Hamburg), (Kiel)
  name = name.replace(/\s*\(\s*(Hamburg|Kiel)\s*\)/gi, '');

  // Strip suffix ", Hamburg" or " (Hamburg)" or ", Kiel" or " (Kiel)"
  name = name.replace(/[\s\-,–—]+(Hamburg|Kiel)$/i, '');

  // Clean extra spaces, leading/trailing punctuation & slashes
  name = name
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-,–—/]+|[\s\-,–—/]+$/g, '')
    .trim();

  // If cleaning resulted in empty string or generic "Hbf", restore full hub name
  if (!name || name.toLowerCase() === 'hbf' || name.toLowerCase() === 'hauptbahnhof') {
    if (lower.includes('kiel')) return 'Kiel Hbf';
    return 'Hamburg Hbf';
  }

  return name;
}

