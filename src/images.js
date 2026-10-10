// Turns any image (upload, photo, web cover) into a reasonably sized JPEG cover.
export async function toCoverJpeg(blob, maxWidth = 600, maxHeight = 900) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file doesn't look like an image."));
      el.src = url;
    });
    const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs get a white background instead of black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Open Library cover search (free, no account needed).
export async function searchCovers(query) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=24&fields=key,title,author_name,cover_i,first_publish_year`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Couldn't reach Open Library. Check your connection.");
  }
  if (!res.ok) throw new Error(`Open Library search failed (${res.status})`);
  const { docs = [] } = await res.json();
  return docs
    .filter((d) => d.cover_i)
    .map((d) => ({
      id: d.cover_i,
      title: d.title,
      author: d.author_name?.[0] ?? '',
      year: d.first_publish_year ?? null,
      thumb: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`,
      full: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`,
    }));
}

export async function fetchImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't download that cover (${res.status})`);
  return res.blob();
}
