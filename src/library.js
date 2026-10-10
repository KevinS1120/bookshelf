// The library lives in a "Bookshelf" folder in your OneDrive. Each book is a
// file there (drop PDFs/EPUBs in from anywhere and they show up). Reading data
// for every book is kept in one file, _bookshelf/library.json, next to covers
// and EPUB page maps.
import { cachedToken } from './auth';
import * as cache from './cache';
import { LIBRARY_FOLDER } from './config';
import { download, graph, graphAll } from './graph';

let folder = null; // { id, webUrl }

// Finds (or creates) the Bookshelf folder. Called once after sign-in.
export async function connect() {
  let item;
  try {
    item = await graph(`/me/drive/root:/${LIBRARY_FOLDER}`);
  } catch (err) {
    if (err.status !== 404) throw err;
    item = await graph('/me/drive/root/children', {
      method: 'POST',
      body: { name: LIBRARY_FOLDER, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
    });
  }
  folder = { id: item.id, webUrl: item.webUrl };
  return folder;
}

const itemPath = (rel) => `/me/drive/items/${folder.id}:/${rel.split('/').map(encodeURIComponent).join('/')}:`;
const isBookFile = (item) => item.file && /\.(pdf|epub)$/i.test(item.name);

// ---------- reading data (_bookshelf/library.json) ----------
// Saves use the file's ETag so two devices saving at once can't overwrite each
// other: if the file changed since we read it, we re-read, re-apply, and retry.

const DATA_FILE = '_bookshelf/library.json';
// doc: { version, books: { [id]: {...} }, settings: { goals: { [year]: n } }, activity: { [yyyy-mm-dd]: seconds } }
let data = null; // { doc, eTag }
const emptyDoc = () => ({ version: 1, books: {}, settings: {}, activity: {} });

async function readData() {
  let meta;
  try {
    meta = await graph(itemPath(DATA_FILE));
  } catch (err) {
    if (err.status !== 404) throw err;
    data = { doc: emptyDoc(), eTag: null };
    return data;
  }
  if (data?.eTag !== meta.eTag) {
    const doc = JSON.parse(await download(meta['@microsoft.graph.downloadUrl'], 'text'));
    data = { doc: { ...emptyDoc(), ...doc }, eTag: meta.eTag };
  }
  return data;
}

function writeRequest(doc, eTag) {
  return {
    url: `${itemPath(DATA_FILE)}/content${eTag ? '' : '?@microsoft.graph.conflictBehavior=fail'}`,
    body: JSON.stringify(doc),
    headers: { 'Content-Type': 'application/json', ...(eTag ? { 'If-Match': eTag } : {}) },
  };
}

let writing = Promise.resolve();
function updateData(mutate) {
  const run = async () => {
    if (!data) await readData();
    for (let attempt = 0; attempt < 5; attempt++) {
      const doc = structuredClone(data.doc);
      mutate(doc);
      const req = writeRequest(doc, data.eTag);
      try {
        const item = await graph(req.url, { method: 'PUT', body: req.body, headers: req.headers });
        data = { doc, eTag: item.eTag };
        return;
      } catch (err) {
        if (err.status !== 412 && err.status !== 409) throw err;
        await readData(); // changed on another device; merge onto the latest copy
      }
    }
    throw new Error('Your library is being changed on another device. Try again in a moment.');
  };
  writing = writing.then(run, run);
  return writing;
}

// ---------- books ----------

function toBook(item, d = {}) {
  return {
    id: item.id,
    fileName: item.name,
    size: item.size,
    format: /\.pdf$/i.test(item.name) ? 'pdf' : 'epub',
    title: d.title || item.name.replace(/\.(pdf|epub)$/i, ''),
    author: d.author || '',
    status: d.status || 'to-read',
    rating: d.rating ?? 0,
    progress: d.progress ?? 0,
    location: d.location ?? null,
    progressUpdatedAt: d.progressUpdatedAt ?? null,
    startedAt: d.startedAt ?? null,
    finishedAt: d.finishedAt ?? null,
    lastOpenedAt: d.lastOpenedAt ?? null,
    addedAt: d.addedAt ?? Date.parse(item.createdDateTime),
    review: d.review || '',
    bookmarks: d.bookmarks ?? [],
    pageCount: d.pageCount ?? null,
    tags: d.tags ?? [],
    coverVersion: d.coverVersion ?? null,
    noCover: !!d.noCover,
    webUrl: item.webUrl,
  };
}

const FIELDS = [
  'title', 'author', 'status', 'rating', 'progress', 'location', 'progressUpdatedAt', 'startedAt',
  'finishedAt', 'lastOpenedAt', 'addedAt', 'review', 'bookmarks', 'pageCount', 'tags', 'coverVersion', 'noCover',
];
const pick = (patch) => Object.fromEntries(Object.entries(patch).filter(([k]) => FIELDS.includes(k)));

export async function listBooks() {
  const [items] = await Promise.all([
    graphAll(`/me/drive/items/${folder.id}/children?$top=200&$select=id,name,size,file,createdDateTime,webUrl`),
    readData(),
  ]);
  return items.filter(isBookFile).map((item) => toBook(item, data.doc.books[item.id]));
}

export async function getBook(id) {
  const [item] = await Promise.all([graph(`/me/drive/items/${id}`), readData()]);
  return toBook(item, data.doc.books[id]);
}

// The book file, from this device's cache when possible.
export async function fileBlob(id) {
  const cached = await cache.getFile(id);
  if (cached) return cached;
  const item = await graph(`/me/drive/items/${id}`);
  const blob = await download(item['@microsoft.graph.downloadUrl']);
  cache.putFile(id, blob);
  return blob;
}

// Covers are listed once per session, then downloaded once per device.
let coverIndex = null;
function coverUrls() {
  coverIndex ??= graphAll(`${itemPath('_bookshelf/covers')}/children?$top=999`)
    .then((items) => new Map(items.map((i) => [i.name.replace(/\.\w+$/, ''), i['@microsoft.graph.downloadUrl']])))
    .catch(() => new Map());
  return coverIndex;
}

// A cover changed in the app gets a new version, so every device fetches it again.
const coverKey = (book) => (book.coverVersion ? `${book.id}@${book.coverVersion}` : book.id);
const coverPath = (id) => `_bookshelf/covers/${id}.jpg`;

export async function coverBlob(book) {
  if (book.noCover) return null;
  const key = coverKey(book);
  const cached = await cache.getCover(key);
  if (cached) return cached;
  let url;
  if (book.coverVersion) {
    try {
      url = (await graph(itemPath(coverPath(book.id))))['@microsoft.graph.downloadUrl'];
    } catch {
      return null;
    }
  } else {
    url = (await coverUrls()).get(book.id);
  }
  if (!url) return null;
  try {
    const blob = await download(url);
    cache.putCover(key, blob);
    return blob;
  } catch {
    coverIndex = null; // links expire after about an hour; fetch fresh ones next time
    return null;
  }
}

// Returns the fields to save on the book.
export async function setCover(book, blob) {
  await putSmall(coverPath(book.id), blob);
  const patch = { coverVersion: Date.now(), noCover: false };
  await cache.putCover(coverKey({ ...book, ...patch }), blob);
  return patch;
}

export async function removeCover(book) {
  try {
    await graph(itemPath(coverPath(book.id)), { method: 'DELETE' });
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  return { noCover: true, coverVersion: Date.now() };
}

export async function getLocations(id) {
  try {
    const item = await graph(itemPath(`_bookshelf/locations/${id}.json`));
    return await download(item['@microsoft.graph.downloadUrl'], 'text');
  } catch {
    return null;
  }
}

export function saveLocations(id, text) {
  return putSmall(`_bookshelf/locations/${id}.json`, new Blob([text], { type: 'application/json' })).catch(() => {});
}

// ---------- adding & removing ----------

function putSmall(rel, blob, query = '') {
  return graph(`${itemPath(rel)}/content${query}`, {
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
    const session = await graph(`${itemPath(name)}/createUploadSession`, {
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
  const record = { status: 'to-read', rating: 0, progress: 0, addedAt: Date.now(), ...pick(meta) };
  await updateData((doc) => {
    doc.books[item.id] = record;
  });
  if (cover) {
    await putSmall(coverPath(item.id), cover).catch(() => {});
    cache.putCover(item.id, cover);
  }
  return toBook(item, record);
}

export async function deleteBook(id) {
  // Goes to the OneDrive recycle bin, so it can be restored.
  await graph(`/me/drive/items/${id}`, { method: 'DELETE' });
  cache.removeBook(id);
  updateData((doc) => {
    delete doc.books[id];
  }).catch(() => {});
  for (const rel of [coverPath(id), `_bookshelf/locations/${id}.json`]) {
    graph(itemPath(rel), { method: 'DELETE' }).catch(() => {});
  }
}

// ---------- goal & reading activity ----------

export function getExtras() {
  const activity = { ...data?.doc.activity };
  for (const [day, secs] of Object.entries(pendingActivity)) activity[day] = (activity[day] || 0) + secs; // not saved yet
  return { settings: data?.doc.settings ?? {}, activity };
}

export async function setGoal(year, count) {
  await updateData((doc) => {
    doc.settings = { ...doc.settings, goals: { ...doc.settings?.goals, [year]: count || undefined } };
  });
  return getExtras();
}

// Reading time is collected per day and saved every so often.
const pendingActivity = {};
let activityTimer = null;

const applyActivity = (doc, amounts) => {
  doc.activity ??= {};
  for (const [day, secs] of Object.entries(amounts)) doc.activity[day] = (doc.activity[day] || 0) + secs;
};

function takeActivity() {
  const amounts = { ...pendingActivity };
  for (const k of Object.keys(pendingActivity)) delete pendingActivity[k];
  clearTimeout(activityTimer);
  activityTimer = null;
  return amounts;
}

export function addReadingTime(day, seconds) {
  if (seconds < 1) return;
  pendingActivity[day] = (pendingActivity[day] || 0) + Math.round(seconds);
  activityTimer ??= setTimeout(() => {
    const amounts = takeActivity();
    updateData((doc) => applyActivity(doc, amounts)).catch(() => {});
  }, 30_000);
}

// ---------- batched updates ----------
// Edits are merged per book and saved after `delay` ms, so typing a review or
// turning pages quickly doesn't save on every keystroke or page.

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

function applyPatch(doc, id, patch) {
  doc.books[id] = { ...doc.books[id], ...pick(patch) };
}

function flush(id) {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  clearTimeout(entry.timer);
  const patch = { ...entry.patch };
  if ('location' in patch || 'progress' in patch) patch.progressUpdatedAt = Date.now();
  const done = { progressUpdatedAt: patch.progressUpdatedAt ?? null };
  updateData((doc) => applyPatch(doc, id, patch)).then(
    () => entry.waiters.forEach((w) => w.resolve(done)),
    (err) => entry.waiters.forEach((w) => w.reject(err)),
  );
}

export function flushAll() {
  for (const id of [...pending.keys()]) flush(id);
}

// The page is going away (tab closed, app switched on a phone): save what's
// pending with a request that outlives the page. Best effort.
function flushOnClose() {
  const amounts = takeActivity();
  if ((!pending.size && !Object.keys(amounts).length) || !data) return;
  const patches = [];
  for (const [id, entry] of pending) {
    clearTimeout(entry.timer);
    const patch = { ...entry.patch };
    if ('location' in patch || 'progress' in patch) patch.progressUpdatedAt = Date.now();
    patches.push([id, patch]);
    entry.waiters.forEach((w) => w.resolve(null));
  }
  pending.clear();
  const applyAll = (doc) => {
    patches.forEach(([id, patch]) => applyPatch(doc, id, patch));
    applyActivity(doc, amounts);
  };

  const doc = structuredClone(data.doc);
  applyAll(doc);
  const token = cachedToken();
  const req = writeRequest(doc, data.eTag);
  if (token && req.body.length <= 60_000) {
    fetch(`https://graph.microsoft.com/v1.0${req.url}`, {
      method: 'PUT',
      keepalive: true,
      headers: { Authorization: `Bearer ${token}`, ...req.headers },
      body: req.body,
    }).catch(() => {});
  } else {
    // Too large for a keepalive request: try a normal save, which usually
    // finishes when an app is only switched away from rather than closed.
    updateData(applyAll).catch(() => {});
  }
}

window.addEventListener('pagehide', flushOnClose);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushOnClose();
});
