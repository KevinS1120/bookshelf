// The library lives in a SharePoint document library (or a folder in one, such
// as "Bookshelf" in your OneDrive). Each book is a file; reading data is kept in
// library columns next to it. Covers and EPUB page maps go in a hidden
// "_bookshelf" folder.
import { cachedToken } from './auth';
import * as cache from './cache';
import { download, graph, graphAll } from './graph';

// ---------- which library ----------

const LOCATION_KEY = 'bookshelf-library';
let current = null;

export function savedLocation() {
  try {
    return JSON.parse(localStorage.getItem(LOCATION_KEY));
  } catch {
    return null;
  }
}

export function useLocation(loc) {
  current = loc;
  try {
    if (loc) localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
    else localStorage.removeItem(LOCATION_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function describe(item) {
  const driveId = item.parentReference?.driveId;
  const list = await graph(`/drives/${driveId}/list?$select=id,displayName,parentReference`);
  return {
    driveId,
    folderId: item.id,
    listId: list.id,
    siteId: list.parentReference.siteId,
    name: item.root ? list.displayName : item.name,
    webUrl: item.webUrl,
  };
}

// A "Bookshelf" folder in your own OneDrive (created if needed).
export async function locateOneDrive() {
  let folder;
  try {
    folder = await graph('/me/drive/root:/Bookshelf');
  } catch (err) {
    if (err.status !== 404) throw err;
    folder = await graph('/me/drive/root/children', {
      method: 'POST',
      body: { name: 'Bookshelf', folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
    });
  }
  return describe(folder);
}

// Any SharePoint/OneDrive folder or library, from a link to it.
export async function locateFromLink(url) {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(url.trim())));
  const encoded = `u!${b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')}`;
  let item;
  try {
    item = await graph(`/shares/${encoded}/driveItem`);
  } catch (err) {
    if (err.status === 404 || err.status === 400) {
      throw new Error("Couldn't find a folder at that link. In SharePoint, open the folder, choose Copy link, and paste it here.");
    }
    throw err;
  }
  if (!item.folder && !item.root) throw new Error('That link points to a file. Use a link to a folder or library instead.');
  return describe(item);
}

// ---------- library columns ----------

const STATUS_LABELS = { 'to-read': 'To read', reading: 'Reading', finished: 'Finished', dnf: 'Did not finish' };
const STATUS_IDS = Object.fromEntries(Object.entries(STATUS_LABELS).map(([k, v]) => [v, k]));

const COLUMNS = [
  { name: 'BookAuthor', displayName: 'Author', text: {} },
  { name: 'BookFormat', displayName: 'Format', choice: { choices: ['PDF', 'EPUB'], displayAs: 'dropDownMenu' } },
  { name: 'ReadStatus', displayName: 'Status', choice: { choices: Object.values(STATUS_LABELS), displayAs: 'dropDownMenu' } },
  { name: 'MyRating', displayName: 'Rating', number: { minimum: 0, maximum: 5, decimalPlaces: 'none' } },
  { name: 'ReadProgress', displayName: 'Progress %', number: { minimum: 0, maximum: 100, decimalPlaces: 'none' } },
  { name: 'DateStarted', displayName: 'Started', dateTime: { format: 'dateOnly' } },
  { name: 'DateFinished', displayName: 'Finished', dateTime: { format: 'dateOnly' } },
  { name: 'LastOpened', displayName: 'Last opened', dateTime: { format: 'dateTime' } },
  { name: 'PageCount', displayName: 'Pages', number: { decimalPlaces: 'none' } },
  { name: 'MyReview', displayName: 'Notes', text: { allowMultipleLines: true, linesForEditing: 6, textType: 'plain' } },
  // Used by the app; hidden from SharePoint views.
  { name: 'ReadLocation', displayName: 'Reading position', hidden: true, text: { allowMultipleLines: true, textType: 'plain' } },
  { name: 'ReadPercent', displayName: 'Exact progress', hidden: true, number: {} },
  { name: 'ProgressUpdated', displayName: 'Position updated', hidden: true, dateTime: { format: 'dateTime' } },
  { name: 'MyBookmarks', displayName: 'Bookmarks', hidden: true, text: { allowMultipleLines: true, textType: 'plain' } },
];

export async function missingColumns(loc = current) {
  const existing = await graphAll(`/sites/${loc.siteId}/lists/${loc.listId}/columns?$select=name`);
  const names = new Set(existing.map((c) => c.name));
  return COLUMNS.filter((c) => !names.has(c.name));
}

export async function ensureColumns(loc = current) {
  for (const column of await missingColumns(loc)) {
    await graph(`/sites/${loc.siteId}/lists/${loc.listId}/columns`, { method: 'POST', body: column });
  }
}

// ---------- books <-> SharePoint fields ----------

const ms = (v) => (v ? Date.parse(v) : null);
const iso = (v) => (v ? new Date(v).toISOString() : null);
const parseJSON = (v, fallback) => {
  try {
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const parseLocation = (v) => (v == null || v === '' ? null : /^\d+$/.test(v) ? Number(v) : v);

function toBook(item) {
  const f = item.listItem?.fields ?? {};
  const exact = f.ReadPercent ?? (f.ReadProgress != null ? f.ReadProgress / 100 : 0);
  return {
    id: item.id,
    fileName: item.name,
    size: item.size,
    format: /\.pdf$/i.test(item.name) ? 'pdf' : 'epub',
    title: f.Title || item.name.replace(/\.(pdf|epub)$/i, ''),
    author: f.BookAuthor || '',
    status: STATUS_IDS[f.ReadStatus] || 'to-read',
    rating: f.MyRating ?? 0,
    progress: Math.min(1, Math.max(0, exact)),
    location: parseLocation(f.ReadLocation),
    progressUpdatedAt: ms(f.ProgressUpdated),
    startedAt: ms(f.DateStarted),
    finishedAt: ms(f.DateFinished),
    lastOpenedAt: ms(f.LastOpened),
    addedAt: ms(item.createdDateTime),
    review: f.MyReview || '',
    bookmarks: parseJSON(f.MyBookmarks, []),
    pageCount: f.PageCount ?? null,
    webUrl: item.webUrl,
  };
}

function toFields(patch) {
  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    switch (key) {
      case 'title': out.Title = value; break;
      case 'author': out.BookAuthor = value; break;
      case 'format': out.BookFormat = value.toUpperCase(); break;
      case 'status': out.ReadStatus = STATUS_LABELS[value]; break;
      case 'rating': out.MyRating = value; break;
      case 'progress':
        out.ReadPercent = value;
        out.ReadProgress = Math.round(value * 100);
        break;
      case 'location': out.ReadLocation = value == null ? null : String(value); break;
      case 'progressUpdatedAt': out.ProgressUpdated = iso(value); break;
      case 'startedAt': out.DateStarted = iso(value); break;
      case 'finishedAt': out.DateFinished = iso(value); break;
      case 'lastOpenedAt': out.LastOpened = iso(value); break;
      case 'review': out.MyReview = value; break;
      case 'bookmarks': out.MyBookmarks = JSON.stringify(value ?? []); break;
      case 'pageCount': out.PageCount = value; break;
      default: break; // not stored
    }
  }
  return out;
}

const isBookFile = (item) => item.file && /\.(pdf|epub)$/i.test(item.name);
const itemPath = (loc, rel) => `/drives/${loc.driveId}/items/${loc.folderId}:/${rel.split('/').map(encodeURIComponent).join('/')}:`;

// ---------- reading ----------

export async function listBooks() {
  const items = await graphAll(
    `/drives/${current.driveId}/items/${current.folderId}/children?$expand=listItem($expand=fields)&$top=200`,
  );
  return items.filter(isBookFile).map(toBook);
}

export async function getBook(id) {
  return toBook(await graph(`/drives/${current.driveId}/items/${id}?$expand=listItem($expand=fields)`));
}

// The book file, from this device's cache when possible.
export async function fileBlob(id) {
  const cached = await cache.getFile(id);
  if (cached) return cached;
  const item = await graph(`/drives/${current.driveId}/items/${id}`);
  const blob = await download(item['@microsoft.graph.downloadUrl']);
  cache.putFile(id, blob);
  return blob;
}

// Covers are listed once per session, then downloaded once per device.
let coverIndex = null;
function coverUrls() {
  coverIndex ??= graphAll(`${itemPath(current, '_bookshelf/covers')}/children?$top=999`)
    .then((items) => new Map(items.map((i) => [i.name.replace(/\.\w+$/, ''), i['@microsoft.graph.downloadUrl']])))
    .catch(() => new Map());
  return coverIndex;
}

export async function coverBlob(id) {
  const cached = await cache.getCover(id);
  if (cached) return cached;
  const url = (await coverUrls()).get(id);
  if (!url) return null;
  try {
    const blob = await download(url);
    cache.putCover(id, blob);
    return blob;
  } catch {
    coverIndex = null; // links expire after about an hour; fetch fresh ones next time
    return null;
  }
}

export async function getLocations(id) {
  try {
    const item = await graph(itemPath(current, `_bookshelf/locations/${id}.json`));
    return await download(item['@microsoft.graph.downloadUrl'], 'text');
  } catch {
    return null;
  }
}

export function saveLocations(id, text) {
  return putSmall(`_bookshelf/locations/${id}.json`, new Blob([text], { type: 'application/json' })).catch(() => {});
}

// ---------- writing ----------

function putSmall(rel, blob, query = '') {
  return graph(`${itemPath(current, rel)}/content${query}`, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
  });
}

const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;
const CHUNK = 320 * 1024 * 16; // 5 MiB; chunks must be multiples of 320 KiB

async function uploadFile(file, name, onProgress) {
  try {
    if (file.size <= SIMPLE_UPLOAD_LIMIT) {
      const item = await putSmall(name, file, '?@microsoft.graph.conflictBehavior=fail');
      onProgress?.(1);
      return item;
    }
    const session = await graph(`${itemPath(current, name)}/createUploadSession`, {
      method: 'POST',
      body: { item: { '@microsoft.graph.conflictBehavior': 'fail' } },
    });
    for (let start = 0; start < file.size; start += CHUNK) {
      const end = Math.min(start + CHUNK, file.size);
      // Upload session URLs are pre-authorized: no Authorization header.
      const res = await fetch(session.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${start}-${end - 1}/${file.size}` },
        body: file.slice(start, end),
      });
      if (!res.ok) throw Object.assign(new Error(`Upload failed (${res.status})`), { status: res.status });
      onProgress?.(end / file.size);
      if (end === file.size) return res.json();
    }
  } catch (err) {
    if (err.status === 409) throw Object.assign(new Error(`${name} is already in your library`), { status: 409 });
    throw err;
  }
}

// meta: { title, author, format, fileName, pageCount, ...optional tracking fields }
export async function createBook(meta, file, cover, onProgress) {
  const item = await uploadFile(file, meta.fileName, onProgress);
  await graph(`/drives/${current.driveId}/items/${item.id}/listItem/fields`, {
    method: 'PATCH',
    body: toFields({ status: 'to-read', rating: 0, progress: 0, ...meta }),
  });
  if (cover) {
    await putSmall(`_bookshelf/covers/${item.id}.jpg`, cover).catch(() => {});
    cache.putCover(item.id, cover);
  }
  return getBook(item.id);
}

export async function deleteBook(id) {
  // Goes to the SharePoint recycle bin, so it can be restored.
  await graph(`/drives/${current.driveId}/items/${id}`, { method: 'DELETE' });
  cache.removeBook(id);
  for (const rel of [`_bookshelf/covers/${id}.jpg`, `_bookshelf/locations/${id}.json`]) {
    graph(itemPath(current, rel), { method: 'DELETE' }).catch(() => {});
  }
}

// ---------- batched updates ----------
// Edits are merged per book and sent after `delay` ms, so typing a review or
// turning pages quickly doesn't send a request for every keystroke or page.

const pending = new Map();

export function saveBook(id, patch, delay = 0) {
  let entry = pending.get(id);
  if (!entry) pending.set(id, (entry = { patch: {}, waiters: [] }));
  Object.assign(entry.patch, patch);
  clearTimeout(entry.timer);
  const result = new Promise((resolve, reject) => entry.waiters.push({ resolve, reject }));
  if (delay) entry.timer = setTimeout(() => flush(id), delay);
  else flush(id);
  return result;
}

function flush(id, closing = false) {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  clearTimeout(entry.timer);
  const patch = { ...entry.patch };
  if ('location' in patch || 'progress' in patch) patch.progressUpdatedAt = Date.now();
  const url = `https://graph.microsoft.com/v1.0/drives/${current.driveId}/items/${id}/listItem/fields`;
  const body = JSON.stringify(toFields(patch));
  const done = { progressUpdatedAt: patch.progressUpdatedAt ?? null };

  const token = closing && cachedToken();
  if (token) {
    // The page is going away: fire a request that outlives it.
    fetch(url, { method: 'PATCH', keepalive: true, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body }).catch(() => {});
    entry.waiters.forEach((w) => w.resolve(done));
    return;
  }
  graph(url, { method: 'PATCH', body: JSON.parse(body) }).then(
    () => entry.waiters.forEach((w) => w.resolve(done)),
    (err) => entry.waiters.forEach((w) => w.reject(err)),
  );
}

export function flushAll(closing = false) {
  for (const id of [...pending.keys()]) flush(id, closing);
}

window.addEventListener('pagehide', () => flushAll(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAll(true);
});
