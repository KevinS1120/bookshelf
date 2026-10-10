// Per-device cache of book files and covers (IndexedDB), so books you've opened
// recently reopen instantly and covers aren't downloaded again.
import { openDB } from 'idb';

const MAX_FILES = 12;

let dbPromise;
function db() {
  dbPromise ??= openDB('bookshelf-cache', 1, {
    upgrade(d) {
      d.createObjectStore('files');
      d.createObjectStore('covers');
      d.createObjectStore('used');
    },
  });
  return dbPromise;
}

// Storage can be unavailable (private browsing, full disk); the cache is optional.
async function safe(fn, fallback = null) {
  try {
    return await fn(await db());
  } catch {
    return fallback;
  }
}

export const getFile = (id) =>
  safe(async (d) => {
    const blob = await d.get('files', id);
    if (blob) await d.put('used', Date.now(), id);
    return blob ?? null;
  });

export const putFile = (id, blob) =>
  safe(async (d) => {
    await d.put('files', blob, id);
    await d.put('used', Date.now(), id);
    // Keep only the most recently opened books.
    const keys = await d.getAllKeys('used');
    if (keys.length <= MAX_FILES) return;
    const used = await d.getAll('used');
    const oldest = keys.map((k, i) => [k, used[i]]).sort((a, b) => a[1] - b[1]).slice(0, keys.length - MAX_FILES);
    for (const [k] of oldest) {
      await d.delete('files', k);
      await d.delete('used', k);
    }
  });

export const getCover = (id) => safe((d) => d.get('covers', id));
// Keys are "<book id>" or "<book id>@<version>"; older versions of a cover are dropped.
export const putCover = (key, blob) =>
  safe(async (d) => {
    const id = key.split('@')[0];
    for (const k of await d.getAllKeys('covers')) {
      if (k !== key && k.split('@')[0] === id) await d.delete('covers', k);
    }
    await d.put('covers', blob, key);
  });

export const removeBook = (id) =>
  safe(async (d) => {
    await d.delete('files', id);
    await d.delete('used', id);
    for (const k of await d.getAllKeys('covers')) if (k.split('@')[0] === id) await d.delete('covers', k);
  });
