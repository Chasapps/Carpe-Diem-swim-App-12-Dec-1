// data.js
// =======
// Small module whose only job is to load the pools list from pools.json.
// Keeping data-loading in its own file makes it easy to reuse on multiple pages.

/**
 * Shape of a pool:
 * {
 *   name: string,
 *   lat: number,
 *   lng: number
 * }
 */

/**
 * Load the array of pools from pools.json.
 * - Returns a Promise that resolves to an array of pools.
 * - Throws an Error if the file cannot be loaded.
 */
export async function loadPools() {
  const response = await fetch('pools.json');

  if (!response.ok) {
    throw new Error(`Failed to load pools.json (status ${response.status})`);
  }

  const raw = await response.json();

  // Be defensive: coerce lat/lng into numbers so Leaflet is happy.
  return raw.map(p => ({
    name: p.name,
    lat: Number(p.lat),
    lng: Number(p.lng)
  }));
}
