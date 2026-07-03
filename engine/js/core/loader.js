/**
 * Project + asset loader. Phase 0 only had loadProject(); Phase 1 adds the
 * asset-fetching map mode needs (map JSON, tileset JSON, tileset image).
 * Still intentionally thin — a real preloader/cache lands when content
 * volume demands it (Phase 7+).
 */

/**
 * Fetch and parse any JSON file (project.json, a map, a tileset).
 * @param {string} url
 * @returns {Promise<object>}
 */
export async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load JSON: ${url} (${res.status})`);
  return res.json();
}

/**
 * Fetch and parse a project.json file. Kept as a named alias of loadJSON
 * for call-site clarity.
 * @param {string} url
 * @returns {Promise<object>}
 */
export async function loadProject(url) {
  return loadJSON(url);
}

/**
 * Load an image and resolve once it's decoded and ready to draw.
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Load a tileset: its JSON metadata plus the spritesheet image it points to.
 * The image path in the tileset JSON is resolved relative to the JSON's own URL.
 * @param {string} url path to the tileset .json file
 * @returns {Promise<{meta: object, image: HTMLImageElement}>}
 */
export async function loadTileset(url) {
  const meta = await loadJSON(url);
  const imageUrl = new URL(meta.image, new URL(url, window.location.href)).href;
  const image = await loadImage(imageUrl);
  return { meta, image };
}
