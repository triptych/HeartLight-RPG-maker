/**
 * project.json open/save (GDD 6.2). Two paths:
 *
 * 1. File System Access API (`showOpenFilePicker`/`FileSystemFileHandle`) —
 *    Chrome/Edge, Andrew's dev environment. Keeps a live handle so repeated
 *    saves write straight back to the same file in the project folder —
 *    the "playtest is one click" workflow depends on Studio and the served
 *    game agreeing on one file, not a downloads-folder copy drifting away
 *    from it.
 * 2. Fallback for browsers without it (Firefox, Safari as of this writing):
 *    a plain `<input type=file>` picker to open, and a download-a-blob
 *    prompt to save — the GDD's "import/export single project file" path.
 *    There's no live handle in this mode, so every save is a fresh
 *    download the user re-drops into place by hand.
 *
 * Either way the caller gets back the same shape: `{ project, save }`,
 * where `save(project)` persists using whichever path was used to open.
 */

const supportsFSAccess = typeof window !== 'undefined' && 'showOpenFilePicker' in window;

/** @returns {Promise<{project: object, save: (p: object) => Promise<void>, mode: 'fs-access'|'fallback'}>} */
export async function openProject() {
  if (supportsFSAccess) {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Hearthlight project', accept: { 'application/json': ['.json'] } }],
    });
    const file = await handle.getFile();
    const project = JSON.parse(await file.text());
    return {
      project,
      mode: 'fs-access',
      save: (p) => writeToHandle(handle, p),
    };
  }
  return openViaFileInput();
}

/** Fallback open: prompts with a hidden `<input type=file>`, resolves once a file is chosen. */
function openViaFileInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('No file selected'));
      try {
        const project = JSON.parse(await file.text());
        resolve({ project, mode: 'fallback', save: (p) => downloadProject(p) });
      } catch (err) {
        reject(err);
      }
    }, { once: true });
    input.click();
  });
}

async function writeToHandle(handle, project) {
  const writable = await handle.createWritable();
  await writable.write(formatProjectJson(project));
  await writable.close();
}

/** Fallback save: triggers a browser download of the updated project.json. */
function downloadProject(project) {
  const blob = new Blob([formatProjectJson(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'project.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Start a brand-new, empty project (GDD Part VII schema) — used when there's
 * nothing to open yet rather than forcing a hand-authored starting file.
 */
export function blankProject() {
  return {
    meta: { title: 'Untitled', version: '0.0.1', engine: '1.0', startMap: '', startPos: [0, 0], chapterVar: 'chapter' },
    system: { elements: [], terms: {}, party: [], tileSize: 32 },
    actors: {}, classes: {}, skills: {}, items: {}, weapons: {}, armors: {},
    enemies: {}, troops: {}, recipes: {}, states: {}, maps: {}, scenes: {},
    assets: { manifest: {} },
  };
}

function formatProjectJson(project) {
  return JSON.stringify(project, null, 2);
}

export const projectIoSupportsFSAccess = supportsFSAccess;
