/**
 * Project + asset loader. Stubbed in Phase 0 — real project.json parsing
 * and an asset preloader (tiles, portraits, audio) land in Phase 1 (GDD
 * Part IX). Kept here now so the file structure matches the GDD and
 * main.js has a single, stable seam to call into as this fills in.
 */

/**
 * Fetch and parse a project.json file.
 * @param {string} url
 * @returns {Promise<object>}
 */
export async function loadProject(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load project file: ${url} (${res.status})`);
  return res.json();
}
