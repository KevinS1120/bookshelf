// The legacy build supports older iPads and phones.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import ePub from 'epubjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const KINDLE_EXT = /\.(azw3|azw|mobi|prc|kf8)$/i; // converted on import (convertKindle.js)
export { pdfjsLib };

function detectFormat(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (ext === 'epub' || file.type === 'application/epub+zip') return 'epub';
  return null;
}

function titleFromFileName(name) {
  return name.replace(/\.(pdf|epub)$/i, '').replace(/_+/g, ' ').trim();
}

// PDF metadata is often junk ("Microsoft Word - draft3.docx", "untitled").
function cleanPdfField(value) {
  const v = (value || '').trim();
  if (!v || /^untitled$/i.test(v) || /microsoft word|\.(docx?|pdf|indd|tex)$/i.test(v)) return '';
  return v;
}

async function readPdf(file) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const { info } = await pdf.getMetadata().catch(() => ({ info: {} }));
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 400 / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const cover = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return {
      title: cleanPdfField(info?.Title),
      author: cleanPdfField(info?.Author),
      cover,
      pageCount: pdf.numPages,
    };
  } finally {
    pdf.destroy();
  }
}

async function readEpub(file) {
  const book = ePub(await file.arrayBuffer());
  try {
    await book.ready;
    const meta = await book.loaded.metadata;
    let cover = null;
    try {
      const coverUrl = await book.coverUrl();
      if (coverUrl) cover = await (await fetch(coverUrl)).blob();
    } catch {
      /* no usable cover */
    }
    return { title: meta.title?.trim(), author: meta.creator?.trim(), cover };
  } finally {
    book.destroy();
  }
}

export async function importFile(original) {
  let file = original;
  if (KINDLE_EXT.test(original.name)) {
    // Kindle books become EPUBs, so they work like any other book from here on.
    try {
      const { kindleToEpub } = await import('./convertKindle');
      file = await kindleToEpub(original);
    } catch (err) {
      console.error(err);
      throw new Error(`${original.name} ${/^(is|isn't|has) /.test(err.message) ? err.message : "couldn't be converted (the file may be damaged)"}`);
    }
  }
  const format = detectFormat(file);
  if (!format) throw new Error(`${file.name}: only PDF, EPUB, AZW3 and MOBI files are supported`);
  let meta;
  try {
    meta = format === 'pdf' ? await readPdf(file) : await readEpub(file);
  } catch (err) {
    console.error(err);
    throw new Error(`${file.name}: couldn't read this file (it may be damaged or DRM-protected)`);
  }
  return {
    meta: {
      title: meta.title || titleFromFileName(file.name),
      author: meta.author || '',
      format,
      fileName: file.name,
      pageCount: meta.pageCount ?? null,
    },
    cover: meta.cover ?? null,
    file, // the converted EPUB, for Kindle books
  };
}

// The book's own cover (first page of a PDF, or the EPUB's cover image).
export async function extractCover(blob, format) {
  try {
    const meta = format === 'pdf' ? await readPdf(blob) : await readEpub(blob);
    return meta.cover ?? null;
  } catch {
    return null;
  }
}
