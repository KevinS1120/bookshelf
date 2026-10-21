// Kindle books (AZW3 / KF8 and older MOBI) are converted to EPUB when they're
// added, so they read, sync and keep your place exactly like any other EPUB.
// Parsing is done by foliate-js (MIT); this file only writes the EPUB.
import JSZip from 'jszip';

const KINDLE_EXT = /\.(azw3|azw|mobi|prc|kf8)$/i;

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Kindle books bought from Amazon are encrypted; newer downloads use KFX, which isn't MOBI at all.
async function checkReadable(file) {
  const head = new DataView(await file.slice(0, 86).arrayBuffer());
  const magic = String.fromCharCode(...new Uint8Array(head.buffer, 60, 8));
  if (magic !== 'BOOKMOBI') {
    throw new Error("isn't an AZW3 or MOBI file the app can read (newer Kindle downloads use KFX, which can't be opened)");
  }
  const record0 = head.getUint32(78);
  const rec = new DataView(await file.slice(record0, record0 + 16).arrayBuffer());
  if (rec.getUint16(12) !== 0) {
    throw new Error('is copy-protected (DRM). Kindle Store books only open in Kindle apps; DRM-free AZW3/MOBI files work');
  }
}

// The file's own bytes win over the book's label (which is often "image/jpg").
function sniff(bytes, hint) {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  if (b[0] === 0x4f && b[1] === 0x54 && b[2] === 0x54 && b[3] === 0x4f) return 'font/otf';
  if (b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46) return b[3] === 0x32 ? 'font/woff2' : 'font/woff';
  if (b[0] === 0x00 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return 'font/ttf';
  if (b[0] === 0x3c) return 'image/svg+xml';
  if (hint === 'image/jpg') return 'image/jpeg';
  return hint ?? 'application/octet-stream';
}
const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
  'font/otf': 'otf', 'font/ttf': 'ttf', 'font/woff': 'woff', 'font/woff2': 'woff2', 'text/css': 'css',
};

// Replaces every match of a regex, with an async replacement, in order.
async function replaceAsync(str, regex, fn) {
  const found = [...str.matchAll(regex)];
  const results = [];
  for (const m of found) results.push(await fn(...m));
  let i = 0;
  return str.replace(regex, () => results[i++]);
}

// Makes a parsed document safe to write as XHTML.
function clean(doc) {
  for (const el of doc.querySelectorAll('script, guide, reference')) el.remove();
  for (const el of [...doc.getElementsByTagName('*')]) {
    if (el.localName.includes(':') && !el.namespaceURI?.includes('svg')) {
      el.replaceWith(...el.childNodes); // MOBI's <mbp:...> tags
      continue;
    }
    for (const a of [...el.attributes]) {
      const bad = /^on/i.test(a.name) || !/^[a-zA-Z_][\w.:-]*$/.test(a.name) || (a.name.includes(':') && !a.namespaceURI);
      if (bad) el.removeAttribute(a.name);
    }
  }
}

function parse(str) {
  const parser = new DOMParser();
  let doc = parser.parseFromString(str, 'application/xhtml+xml');
  if (doc.querySelector('parsererror') || doc.documentElement?.namespaceURI !== XHTML_NS) {
    doc = parser.parseFromString(str, 'text/html');
  }
  return doc;
}

function serialize(doc) {
  if (!doc.head) doc.documentElement.prepend(doc.createElementNS(XHTML_NS, 'head'));
  if (!doc.querySelector('head > title')) {
    const t = doc.createElementNS(XHTML_NS, 'title');
    doc.head.prepend(t);
  }
  let out = new XMLSerializer().serializeToString(doc.documentElement);
  // Last resort: if it still isn't well-formed XML, keep just the text.
  if (new DOMParser().parseFromString(out, 'application/xml').querySelector('parsererror')) {
    const paras = (doc.body?.innerText ?? doc.body?.textContent ?? '').split(/\n{2,}/).map((p) => `<p>${esc(p.trim())}</p>`);
    out = `<html xmlns="${XHTML_NS}"><head><title></title></head><body>${paras.join('')}</body></html>`;
  }
  return `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n${out}`;
}

export async function kindleToEpub(file) {
  await checkReadable(file);
  const [{ MOBI }, { unzlibSync }] = await Promise.all([import('foliate-js/mobi.js'), import('foliate-js/vendor/fflate.js')]);
  const mobi = new MOBI({ unzlib: unzlibSync });
  const book = await mobi.open(file);
  const isKF8 = !!mobi.headers.kf8;

  const zip = new JSZip();
  // mimetype has to come first, uncompressed
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  const manifest = []; // { id, href, type, props }
  let n = 0;
  const add = (path, data, type, props) => {
    const id = `i${n++}`;
    zip.file(`OEBPS/${path}`, data);
    manifest.push({ id, href: path, type, props });
    return id;
  };

  // Images, fonts, stylesheets: all in res/, referenced as ../res/x from text/.
  const resources = new Map(); // key -> file name in res/
  const svgFlows = new Map(); // file name -> svg text, for inlining
  const addResource = async (index, hint) => {
    const key = `r${index}`;
    if (resources.has(key)) return resources.get(key);
    const bytes = new Uint8Array(await mobi.loadResource(index));
    const type = sniff(bytes, hint);
    const name = `${key}.${EXT[type] ?? 'bin'}`;
    add(`res/${name}`, bytes, type);
    resources.set(key, name);
    return name;
  };

  // kindle:embed (images, fonts) and kindle:flow (stylesheets, SVG) links.
  const KINDLE_RES = /kindle:(flow|embed):(\w+)(?:\?mime=(\w+\/[-+.\w]+))?/g;
  const replaceKindle = (str, prefix) =>
    replaceAsync(str, KINDLE_RES, async (_, kind, id32, mime) => {
      const id = parseInt(id32, 32);
      try {
        if (kind === 'embed') return prefix + (await addResource(id - 1, mime));
        const key = `f${id}`;
        if (!resources.has(key)) {
          const type = mime ?? 'text/css';
          const name = `${key}.${EXT[type] ?? 'txt'}`;
          resources.set(key, name);
          const text = await replaceKindle(mobi.decode(await book.loadFlow(id)), '');
          if (type === 'image/svg+xml') svgFlows.set(name, text);
          add(`res/${name}`, text, type);
        }
        return prefix + resources.get(key);
      } catch (err) {
        console.warn('Missing Kindle resource', kind, id, err);
        return '';
      }
    });

  // Load every section as a document.
  const docs = []; // index -> Document | null
  if (isKF8) book.createDocument = (section) => book.loadText(section); // raw text, links untouched
  for (const [i, s] of book.sections.entries()) {
    if (!s.createDocument) {
      docs[i] = null;
      continue;
    }
    if (isKF8) {
      docs[i] = parse(await replaceKindle(await s.createDocument(), '../res/'));
    } else {
      const doc = await s.createDocument();
      for (const img of doc.querySelectorAll('img[recindex]')) {
        try {
          img.setAttribute('src', `../res/${await addResource(Number(img.getAttribute('recindex')) - 1)}`);
        } catch {
          img.remove();
        }
        img.removeAttribute('recindex');
      }
      const style = doc.createElement('style');
      style.textContent = 'blockquote { margin: 0 0 0 1em; }';
      doc.head?.append(style);
      docs[i] = doc;
    }
  }
  const fileOf = (i) => `s${i}.xhtml`;

  // Internal links: kindle:pos (KF8) and filepos (MOBI) become file#id.
  let anchors = 0;
  const resolve = async (href) => {
    try {
      const { index, anchor } = await book.resolveHref(href);
      const doc = docs[index];
      if (!doc) return null;
      const el = anchor?.(doc);
      if (!el) return fileOf(index);
      if (!el.id) el.id = `a${anchors++}`;
      return `${fileOf(index)}#${el.id}`;
    } catch {
      return null;
    }
  };
  for (const doc of docs) {
    if (!doc) continue;
    for (const a of doc.querySelectorAll('a[href^="kindle:pos"], a[filepos]')) {
      const fp = a.getAttribute('filepos');
      const to = await resolve(fp ? `filepos:${fp}` : a.getAttribute('href'));
      a.removeAttribute('filepos');
      if (to) a.setAttribute('href', to);
      else a.removeAttribute('href');
    }
    // SVG pages with images inside only work inline.
    for (const img of doc.querySelectorAll('img[src^="../res/f"]')) {
      const svg = svgFlows.get(img.getAttribute('src').slice(7));
      if (svg && /<image/i.test(svg)) {
        const node = new DOMParser().parseFromString(svg.replaceAll('xlink:href="', 'xlink:href="../res/'), 'image/svg+xml').documentElement;
        if (!node.querySelector('parsererror')) img.replaceWith(doc.importNode(node, true));
      }
    }
  }

  const spine = [];
  for (const [i, doc] of docs.entries()) {
    if (!doc) continue;
    clean(doc);
    spine.push(add(`text/${fileOf(i)}`, serialize(doc), 'application/xhtml+xml'));
  }
  if (!spine.length) throw new Error('has no readable text');

  // Table of contents.
  const navItems = async (items) => {
    let html = '';
    for (const item of items ?? []) {
      const href = await resolve(item.href);
      const label = esc(item.label?.trim() || 'Untitled');
      const sub = item.subitems?.length ? `<ol>${await navItems(item.subitems)}</ol>` : '';
      html += `<li>${href ? `<a href="text/${href}">${label}</a>` : `<span>${label}</span>`}${sub}</li>`;
    }
    return html;
  };
  const meta = book.metadata ?? {};
  const title = meta.title || file.name.replace(KINDLE_EXT, '');
  let toc = await navItems(book.toc);
  if (!toc) toc = `<li><a href="text/${manifest.find((m) => m.id === spine[0]).href.slice(5)}">${esc(title)}</a></li>`;
  add(
    'nav.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="${XHTML_NS}" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${toc}</ol></nav></body></html>`,
    'application/xhtml+xml',
    'nav',
  );

  // Cover.
  const { exth } = mobi.headers;
  const coverIndex = exth?.coverOffset < 0xffffffff ? exth.coverOffset : exth?.thumbnailOffset < 0xffffffff ? exth.thumbnailOffset : null;
  let coverId = null;
  if (coverIndex != null) {
    try {
      const name = await addResource(coverIndex);
      const item = manifest.find((m) => m.href === `res/${name}`);
      item.props = 'cover-image';
      coverId = item.id;
    } catch {
      /* no cover */
    }
  }

  const authors = (meta.author ?? []).filter(Boolean);
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">${esc(meta.identifier || `kindle-${file.size}`)}</dc:identifier>
<dc:title>${esc(title)}</dc:title>
${authors.map((a) => `<dc:creator>${esc(a)}</dc:creator>`).join('\n')}
<dc:language>${esc(meta.language || 'en')}</dc:language>
${meta.publisher ? `<dc:publisher>${esc(meta.publisher)}</dc:publisher>` : ''}
${meta.description ? `<dc:description>${esc(meta.description)}</dc:description>` : ''}
${coverId ? `<meta name="cover" content="${coverId}"/>` : ''}
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
</metadata>
<manifest>
${manifest.map((m) => `<item id="${m.id}" href="${esc(m.href)}" media-type="${m.type}"${m.props ? ` properties="${m.props}"` : ''}/>`).join('\n')}
</manifest>
<spine${book.dir === 'rtl' ? ' page-progression-direction="rtl"' : ''}>
${spine.map((id) => `<itemref idref="${id}"/>`).join('\n')}
</spine>
</package>`;

  zip.file('OEBPS/content.opf', opf);
  book.destroy?.();

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
  return new File([blob], file.name.replace(KINDLE_EXT, '.epub'), { type: 'application/epub+zip' });
}
