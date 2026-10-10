import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import ePub from 'epubjs';
import * as library from '../library';
import { PAGE_WIDTH_MAX, epubCss } from '../settings';

// epub.js's own theme switching leaves old rules behind, so each chapter
// document gets one <style> element that we rewrite.
function applyStyles(contents, css) {
  const doc = contents.document;
  if (!doc?.head) return;
  let el = doc.getElementById('bookshelf-style');
  if (!el) {
    el = doc.createElement('style');
    el.id = 'bookshelf-style';
    doc.head.appendChild(el);
  }
  el.textContent = css;
}

function flattenToc(items, depth = 0) {
  return items.flatMap((item) => [
    { id: item.id, href: item.href, label: item.label.trim(), depth },
    ...flattenToc(item.subitems || [], depth + 1),
  ]);
}

const stripHash = (href) => (href || '').split('#')[0];

// display() can land one page early when the target sits right at a page
// boundary; step forward if the target ended up past the visible page.
async function displayAt(rendition, cfi) {
  await rendition.display(cfi || undefined);
  if (!cfi || !cfi.startsWith('epubcfi(')) return;
  const end = rendition.currentLocation()?.end?.cfi;
  if (end && new ePub.CFI().compare(cfi, end) > 0) await rendition.next();
}

function chapterIndex(toc, href) {
  const base = stripHash(href);
  if (!base) return -1;
  return toc.findIndex((t) => {
    const b = stripHash(t.href);
    return b && (base.endsWith(b) || b.endsWith(base));
  });
}

export default function EpubReader({
  ref,
  bookId,
  getFile,
  initialLocation,
  settings,
  onRelocate,
  onToc,
  onTap,
  onKey,
  onError,
  onScrubbable,
}) {
  const viewerRef = useRef(null);
  const renditionRef = useRef(null);
  const turnRef = useRef(null);
  const bookRef = useRef(null);
  const tocRef = useRef([]);
  const lastRef = useRef({ cfi: initialLocation || null, end: null, atEnd: false, href: '' });
  const [book, setBook] = useState(null);
  const live = useRef({});
  live.current = { settings, onRelocate, onToc, onTap, onKey, onError, onScrubbable };

  const report = useCallback(() => {
    const b = bookRef.current;
    const l = lastRef.current;
    if (!b || !l.cfi) return;
    const progress = l.atEnd ? 1 : b.locations.length() ? b.locations.percentageFromCfi(l.cfi) : null;
    const tocIndex = chapterIndex(tocRef.current, l.href);
    const chapter = tocRef.current[tocIndex]?.label;
    const pct = progress != null ? `${Math.round(progress * 100)}%` : null;
    live.current.onRelocate({ location: l.cfi, progress, label: [chapter, pct].filter(Boolean).join(' · '), tocIndex });
  }, []);

  // Load the book once, then build (or download) its location map for percentages.
  useEffect(() => {
    let cancelled = false;
    let b;
    (async () => {
      const buf = await (await getFile()).arrayBuffer();
      if (cancelled) return;
      b = ePub(buf);
      // Put our styles into each chapter's HTML before it is laid out. Styling it
      // afterwards would re-flow the text and lose the reader's place.
      b.spine.hooks.serialize.register((output, section) => {
        const style = `<style id="bookshelf-style">${epubCss(live.current.settings)}</style>`;
        section.output = section.output.replace(/<\/head>/i, `${style}</head>`);
      });
      await b.ready;
      const nav = await b.loaded.navigation;
      if (cancelled) return;
      tocRef.current = flattenToc(nav.toc);
      live.current.onToc(tocRef.current);
      bookRef.current = b;
      setBook(b);

      const cached = await library.getLocations(bookId);
      if (cancelled) return;
      if (cached) {
        b.locations.load(cached);
      } else {
        await b.locations.generate(1000);
        if (cancelled) return;
        library.saveLocations(bookId, b.locations.save());
      }
      live.current.onScrubbable(true);
      report();
    })().catch((err) => {
      if (cancelled) return;
      console.error(err);
      live.current.onError("Couldn't open this EPUB.");
    });
    return () => {
      cancelled = true;
      bookRef.current = null;
      try {
        b?.destroy();
      } catch {
        /* already torn down */
      }
    };
  }, [bookId, getFile, report]);

  // The rendition is rebuilt when the layout (paged / single / scroll) changes.
  const scroll = settings.layout === 'scroll';
  useEffect(() => {
    if (!book) return;
    let alive = true;
    const rendition = book.renderTo(viewerRef.current, {
      width: '100%',
      height: '100%',
      flow: scroll ? 'scrolled' : 'paginated',
      manager: scroll ? 'continuous' : 'default',
      spread: settings.layout === 'single' ? 'none' : 'auto',
      minSpreadWidth: 900,
      allowScriptedContent: false,
    });
    rendition.hooks.content.register((contents) => applyStyles(contents, epubCss(live.current.settings)));

    rendition.on('relocated', (loc) => {
      lastRef.current = { cfi: loc.start.cfi, end: loc.end?.cfi ?? null, atEnd: !!loc.atEnd, href: loc.start.href };
      report();
    });
    rendition.on('keydown', (e) => live.current.onKey(e));

    // Taps and swipes happen inside the chapter iframe, so translate them to the viewer.
    let suppressClick = false; // the click a mouse sends after dragging
    rendition.on('click', (e, contents) => {
      if (suppressClick) return;
      if (e.target?.closest?.('a') || contents.window.getSelection()?.toString()) return;
      const frame = contents.window.frameElement;
      const viewer = viewerRef.current;
      if (!frame || !viewer) return;
      const x = frame.getBoundingClientRect().left + e.clientX;
      const vr = viewer.getBoundingClientRect();
      live.current.onTap((x - vr.left) / vr.width);
    });

    // Drag to turn: the page follows your finger. Within a chapter the pages sit
    // side by side in a scrolling container, so dragging scrolls it directly;
    // epub.js notices the scroll and updates the position. Pointer events cover
    // fingers, pens and mice; the chapter pages are touch-action: pan-y so the
    // browser leaves sideways drags to us.
    let drag = null;
    const container = () => rendition.manager?.container;

    const onDown = (e) => {
      if (scroll || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const c = container();
      if (!c) return;
      drag = { id: e.pointerId, x: e.screenX, y: e.screenY, t: Date.now(), start: c.scrollLeft, mode: null, dx: 0, doc: e.target.ownerDocument };
    };
    const onMove = (e) => {
      const c = container();
      if (!drag || e.pointerId !== drag.id || !c) return;
      const dx = e.screenX - drag.x;
      const dy = e.screenY - drag.y;
      if (!drag.mode) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        drag.mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'none';
        if (drag.mode === 'swipe') c.style.scrollBehavior = 'auto';
      }
      if (drag.mode !== 'swipe') return;
      e.preventDefault();
      drag.doc.getSelection?.()?.removeAllRanges(); // a mouse drag shouldn't select text
      drag.dx = dx;
      const max = c.scrollWidth - c.clientWidth;
      const target = drag.start - dx;
      c.scrollLeft = Math.min(max, Math.max(0, target));
      // Past the first/last page of the chapter: stretch a little.
      const over = target < 0 ? -target : target > max ? max - target : 0;
      c.style.transform = over ? `translateX(${over * 0.3}px)` : '';
    };
    const onUp = (e) => {
      const c = container();
      if (!drag || e.pointerId !== drag.id || !c) return;
      const { mode, dx, start, t } = drag;
      drag = null;
      if (mode !== 'swipe') return;
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 300);
      c.style.transition = 'transform 0.2s ease-out';
      c.style.transform = '';
      setTimeout(() => {
        c.style.transition = '';
      }, 220);
      const v = dx / Math.max(1, Date.now() - t);
      const commit = e.type !== 'pointercancel' && (Math.abs(dx) > c.clientWidth * 0.2 || (Math.abs(v) > 0.3 && Math.abs(dx) > 20));
      if (commit) turn(dx < 0 ? 1 : -1, start);
      else c.scrollTo({ left: start, behavior: 'smooth' });
    };

    rendition.hooks.content.register((contents) => {
      const doc = contents.document;
      doc.addEventListener('pointerdown', onDown);
      doc.addEventListener('pointermove', onMove);
      doc.addEventListener('pointerup', onUp);
      doc.addEventListener('pointercancel', onUp);
      doc.addEventListener('dragstart', (e) => e.preventDefault());
    });

    // Animated page turn (buttons, keys, taps, swipes).
    function turn(dir, start = container()?.scrollLeft ?? 0) {
      const c = container();
      if (!c || scroll) return dir > 0 ? rendition.next() : rendition.prev();
      const delta = rendition.manager.layout?.delta || c.clientWidth;
      const max = c.scrollWidth - c.clientWidth;
      const target = start + dir * delta;
      if (target >= -1 && target <= max + 1) {
        c.scrollTo({ left: target, behavior: 'smooth' });
      } else {
        // Into the next/previous chapter: let epub.js load it.
        c.scrollLeft = start;
        if (dir > 0) rendition.next();
        else rendition.prev();
      }
    }
    turnRef.current = turn;

    displayAt(rendition, lastRef.current.cfi)
      .catch(() => alive && rendition.display())
      .then(() => {
        // Only expose the rendition once it can actually turn pages.
        if (alive) renditionRef.current = rendition;
      })
      .catch(() => {});

    return () => {
      alive = false;
      renditionRef.current = null;
      turnRef.current = null;
      try {
        rendition.destroy();
      } catch {
        /* destroyed along with the book */
      }
    };
  }, [book, settings.layout, scroll, report]);

  // Colors can be swapped in place.
  const colorKey = `${settings.theme}|${settings.customBg}|${settings.customFg}`;
  useEffect(() => {
    const css = epubCss(live.current.settings);
    renditionRef.current?.getContents().forEach((c) => applyStyles(c, css));
  }, [colorKey]);

  // Typography changes re-flow the text, so re-render at the current position.
  const typeKey = `${settings.fontSize}|${settings.font}|${settings.lineHeight}|${settings.align}`;
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    const timer = setTimeout(() => {
      const css = epubCss(live.current.settings);
      r.getContents().forEach((c) => applyStyles(c, css));
      r.clear();
      displayAt(r, lastRef.current.cfi).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [typeKey]);

  // Margins and page width change the viewer's size; epub.js needs to re-measure.
  useEffect(() => {
    let timer;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => renditionRef.current?.resize(), 150);
    });
    ro.observe(viewerRef.current);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      next: () => renditionRef.current && turnRef.current?.(1),
      prev: () => renditionRef.current && turnRef.current?.(-1),
      goTo: (cfi) => renditionRef.current && displayAt(renditionRef.current, cfi).catch(() => {}),
      goToFraction: (f) => {
        const b = bookRef.current;
        if (b?.locations.length()) renditionRef.current?.display(b.locations.cfiFromPercentage(f));
      },
      goToTocItem: (item) => renditionRef.current?.display(item.href),
      contains: (cfi) => {
        const { cfi: start, end } = lastRef.current;
        if (!start || !end || typeof cfi !== 'string') return false;
        try {
          const c = new ePub.CFI();
          return c.compare(start, cfi) <= 0 && c.compare(cfi, end) <= 0;
        } catch {
          return false;
        }
      },
      excerpt: async () => {
        const r = renditionRef.current;
        const { cfi, end } = lastRef.current;
        if (!r || !cfi) return null;
        try {
          const a = r.getRange(cfi);
          let text = a.startContainer.textContent;
          const b = end && r.getRange(end);
          if (b && a.startContainer.ownerDocument === b.startContainer.ownerDocument) {
            const range = a.startContainer.ownerDocument.createRange();
            range.setStart(a.startContainer, a.startOffset);
            range.setEnd(b.endContainer, b.endOffset);
            text = range.toString();
          }
          return text.replace(/\s+/g, ' ').trim().slice(0, 140) || null;
        } catch {
          return null;
        }
      },
    }),
    [],
  );

  const maxWidth = settings.pageWidth >= PAGE_WIDTH_MAX ? 'none' : `${settings.pageWidth + settings.margin * 2}px`;
  return (
    <div className="epub-stage">
      <div
        className="epub-viewer"
        ref={viewerRef}
        style={{ paddingInline: `min(${settings.margin}px, 8vw)`, maxWidth }}
        onClick={(e) => {
          // Clicks in the margins, outside the chapter iframe.
          if (e.target !== e.currentTarget) return;
          const r = e.currentTarget.getBoundingClientRect();
          onTap((e.clientX - r.left) / r.width);
        }}
      />
    </div>
  );
}
