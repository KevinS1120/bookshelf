// Minimal Microsoft Graph client.
import { getToken } from './auth';

const BASE = 'https://graph.microsoft.com/v1.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function graph(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const url = path.startsWith('https://') ? path : `${BASE}${path}`;
  const isJson = body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && typeof body !== 'string';
  for (let attempt = 0; ; attempt++) {
    const token = await getToken();
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: isJson ? JSON.stringify(body) : body,
      });
    } catch {
      throw new Error("Can't reach Microsoft 365. Check your internet connection.");
    }
    // Throttled or briefly unavailable: back off and retry.
    if ([429, 503, 504].includes(res.status) && attempt < 4) {
      await sleep((Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000);
      continue;
    }
    if (!res.ok) {
      let message;
      try {
        message = (await res.json()).error?.message;
      } catch {
        /* not JSON */
      }
      const err = new Error(message || `Microsoft 365 request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    if (raw) return res;
    return res.status === 204 ? null : res.json();
  }
}

// Follows @odata.nextLink paging and returns every item.
export async function graphAll(path) {
  const items = [];
  for (let next = path; next; ) {
    const page = await graph(next);
    items.push(...page.value);
    next = page['@odata.nextLink'];
  }
  return items;
}

// Downloads a pre-authenticated URL (driveItem @microsoft.graph.downloadUrl).
export async function download(url, as = 'blob') {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Can't reach Microsoft 365. Check your internet connection.");
  }
  if (!res.ok) throw Object.assign(new Error(`Download failed (${res.status})`), { status: res.status });
  return as === 'text' ? res.text() : res.blob();
}
