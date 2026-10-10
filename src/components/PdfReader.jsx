import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { pdfjsLib } from '../importBook';
import { themeColors } from '../settings';

const PAD = 16;
const GAP = 24; // space between pages while swiping
// iOS Safari silently refuses to draw canvases larger than about 16.7 million pixels.
const MAX_CANVAS_PIXELS = 16_000_000;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

function flattenOutline(items, depth = 0) {
  return items.flatMap((it) => [
    { label: (it.title || '').trim() || 'Untitled', depth, dest: it.dest },
    ...flattenOutline(it.items || [], depth + 1),
  ]);
}

async function resolveDest(doc, dest) {
  if (typeof dest === 'string') dest = await doc.getDestination(dest);
  if (!Array.isArray(dest)) return null;
  const ref = dest[0];
  const index = ref && typeof ref === 'object' ? await doc.getPageIndex(ref) : Number.isInteger(ref) ? ref : null;
  return index == null ? null : index + 1;
}

// Shows a rendered page canvas inside a slot.
function mount(slot, canvas) {
  if (!slot) return;
  if (!canvas) return slot.replaceChildren();
  const sheet = document.createElement('div');
  sheet.className = 'pdf-sheet';
  sheet.appendChild(canvas);
  slot.replaceChildren(sheet);
}

export default function PdfReader({
  ref,
  bookId,
  getFile,
  initialLocation,
  settings,
  onRelocate,
  onToc,
  onTap,
  onZoom,
  onError,
  onScrubbable,
}) {
  const stageRef = useRef(null);
  const trackRef = useRef(null);
  const pageRef = useRef(null);
  const prevRef = useRef(null);
  const nextRef = useRef(null);
  const tocPagesRef = useRef([]);
  const canvasesRef = useRef(new Map()); // page number -> Promise<canvas>, for the current size/zoom
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(Number(initialLocation) || 1);
  const [size, setSize] = useState(null);
  const live = useRef({});
  live.current = { onRelocate, onToc, onTap, onZoom, onError, onScrubbable, pdf, page, settings };

  useEffect(() => {
    let cancelled = false;
    let task;
    getFile()
      .then((blob) => blob.arrayBuffer())
      .then((buf) => {
        if (cancelled) return null;
        task = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
        return task.promise;
      })
      .then(async (doc) => {
        if (!doc || cancelled) return;
        setPdf(doc);
        setPage((p) => Math.min(Math.max(1, p), doc.numPages));
        live.current.onScrubbable(true);
        const items = flattenOutline((await doc.getOutline().catch(() => null)) || []);
        if (cancelled) return;
        live.current.onToc(items);
        tocPagesRef.current = await Promise.all(items.map((it) => resolveDest(doc, it.dest).catch(() => null)));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        live.current.onError("Couldn't open this PDF.");
      });
    return () => {
      cancelled = true;
      task?.destroy();
    };
  }, [bookId, getFile]);

  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  // Rendered pages are kept for the current size and zoom; changing either starts over.
  const renderKey = size ? `${Math.round(size.w)}x${Math.round(size.h)}|${settings.pdfFit}|${settings.pdfZoom}` : '';
  useEffect(() => {
    canvasesRef.current = new Map();
  }, [renderKey, pdf]);

  function canvasFor(n) {
    const doc = live.current.pdf;
    if (!doc || !size || n < 1 || n > doc.numPages) return Promise.resolve(null);
    const cache = canvasesRef.current;
    if (cache.has(n)) return cache.get(n);
    const job = (async () => {
      const p = await doc.getPage(n);
      const base = p.getViewport({ scale: 1 });
      const fitW = (size.w - PAD * 2) / base.width;
      const fitH = (size.h - PAD * 2) / base.height;
      const scale = Math.max(0.1, (settings.pdfFit === 'width' ? fitW : Math.min(fitW, fitH)) * settings.pdfZoom);
      const viewport = p.getViewport({ scale });
      let dpr = window.devicePixelRatio || 1;
      const area = viewport.width * viewport.height;
      if (area * dpr * dpr > MAX_CANVAS_PIXELS) dpr = Math.sqrt(MAX_CANVAS_PIXELS / area);
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      await p.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      }).promise;
      return canvas;
    })();
    cache.set(n, job);
    // Keep only pages near where you are.
    for (const k of cache.keys()) if (Math.abs(k - n) > 3) cache.delete(k);
    job.catch(() => cache.delete(n));
    return job;
  }

  // Show the current page, then get its neighbours ready for swiping.
  useEffect(() => {
    if (!pdf || !size) return;
    let cancelled = false;
    canvasFor(page)
      .then((canvas) => {
        if (cancelled || !canvas) return;
        mount(pageRef.current, canvas);
        pageRef.current.style.transform = ''; // end of a pinch
        canvasFor(page + 1);
        canvasFor(page - 1);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [pdf, page, renderKey]);

  useEffect(() => {
    if (!pdf) return;
    stageRef.current?.scrollTo({ top: 0, left: 0 });
    let tocIndex = -1;
    let best = 0;
    tocPagesRef.current.forEach((p, i) => {
      if (p != null && p <= page && p >= best) {
        best = p;
        tocIndex = i;
      }
    });
    const total = pdf.numPages;
    live.current.onRelocate({
      location: page,
      progress: page >= total ? 1 : page / total,
      label: `Page ${page} of ${total}`,
      tocIndex,
    });
  }, [pdf, page]);

  const go = (n) => pdf && setPage(Math.min(Math.max(1, n), pdf.numPages));

  // Slide the page out to one side, bring the next one in, then settle.
  const turning = useRef(false);
  async function animateTurn(dir, fromX = 0) {
    const doc = live.current.pdf;
    const current = live.current.page;
    const target = current + dir;
    if (!doc || turning.current || target < 1 || target > doc.numPages) return false;
    turning.current = true;
    const track = trackRef.current;
    const width = track.offsetWidth + GAP;
    const incoming = await canvasFor(target);
    mount(dir > 0 ? nextRef.current : prevRef.current, incoming);
    track.classList.add('swiping');
    track.style.transition = 'none';
    track.style.transform = `translateX(${fromX}px)`;
    track.getBoundingClientRect(); // apply the starting position before animating
    track.style.transition = 'transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1)';
    track.style.transform = `translateX(${-dir * width}px)`;
    await new Promise((r) => setTimeout(r, 270));
    mount(pageRef.current, incoming); // already rendered, so no flash
    track.style.transition = 'none';
    track.style.transform = '';
    track.classList.remove('swiping');
    mount(prevRef.current, null);
    mount(nextRef.current, null);
    setPage(target);
    turning.current = false;
    return true;
  }

  useImperativeHandle(
    ref,
    () => ({
      next: () => animateTurn(1),
      prev: () => animateTurn(-1),
      goTo: (loc) => go(Number(loc) || 1),
      goToFraction: (f) => pdf && go(Math.round(f * (pdf.numPages - 1)) + 1),
      goToTocItem: async (item) => {
        const p = await resolveDest(pdf, item.dest).catch(() => null);
        if (p) go(p);
      },
      contains: (loc) => Number(loc) === page,
      excerpt: async () => {
        try {
          const content = await (await pdf.getPage(page)).getTextContent();
          const text = content.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
          return text.slice(0, 140) || null;
        } catch {
          return null;
        }
      },
    }),
    [pdf, page, size, renderKey],
  );

  // ---------- touch: drag to turn, pinch to zoom, double-tap to zoom ----------
  useEffect(() => {
    const stage = stageRef.current;
    const track = trackRef.current;
    let g = null; // current gesture
    let lastTap = 0;
    let tapTimer = null;

    const pannable = () =>
      stage.scrollWidth > stage.clientWidth + 2 || (window.visualViewport?.scale ?? 1) > 1.01;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const start = (e) => {
      if (turning.current) return;
      if (e.touches.length === 2) {
        g = { mode: 'pinch', d0: dist(e.touches), zoom0: live.current.settings.pdfZoom, scale: 1 };
        return;
      }
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      g = { mode: null, x: t.clientX, y: t.clientY, t: Date.now(), dx: 0 };
    };

    const move = (e) => {
      if (!g) return;
      if (g.mode === 'pinch') {
        if (e.touches.length < 2) return;
        e.preventDefault();
        const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.zoom0 * (dist(e.touches) / g.d0)));
        g.scale = z / g.zoom0;
        pageRef.current.style.transform = `scale(${g.scale})`;
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.mode) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        g.mode = Math.abs(dx) > Math.abs(dy) * 1.2 && !pannable() ? 'swipe' : 'scroll';
        if (g.mode === 'swipe') {
          const p = live.current.page;
          track.classList.add('swiping');
          track.style.transition = 'none';
          canvasFor(p - 1).then((c) => g?.mode === 'swipe' && mount(prevRef.current, c));
          canvasFor(p + 1).then((c) => g?.mode === 'swipe' && mount(nextRef.current, c));
        }
      }
      if (g.mode !== 'swipe') return;
      e.preventDefault();
      const p = live.current.page;
      const atEdge = (dx > 0 && p <= 1) || (dx < 0 && p >= live.current.pdf.numPages);
      g.dx = atEdge ? dx * 0.3 : dx; // rubber band at the first/last page
      track.style.transform = `translateX(${g.dx}px)`;
    };

    const end = async (e) => {
      if (!g) return;
      const gesture = g;
      if (gesture.mode === 'pinch') {
        if (e.touches.length > 0) return; // wait for the last finger
        g = null;
        const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, gesture.zoom0 * gesture.scale));
        // The scaled snapshot stays until the sharper re-render replaces it.
        if (Math.abs(z - gesture.zoom0) > 0.02) live.current.onZoom(Math.round(z * 100) / 100);
        else pageRef.current.style.transform = '';
        return;
      }
      g = null;
      if (gesture.mode === 'swipe') {
        const dt = Math.max(1, Date.now() - gesture.t);
        const v = gesture.dx / dt;
        const dir = gesture.dx < 0 ? 1 : -1;
        const commit = Math.abs(gesture.dx) > stage.clientWidth * 0.22 || (Math.abs(v) > 0.35 && Math.abs(gesture.dx) > 25);
        if (commit && (await animateTurn(dir, gesture.dx))) return;
        track.style.transition = 'transform 0.22s ease-out';
        track.style.transform = '';
        setTimeout(() => {
          if (turning.current) return;
          track.classList.remove('swiping');
          mount(prevRef.current, null);
          mount(nextRef.current, null);
        }, 230);
        return;
      }
      if (gesture.mode !== null) return; // scrolled
      // A tap. Double-tap in the middle zooms in/out; single taps are handled after a short wait there.
      const t = e.changedTouches[0];
      const r = stage.getBoundingClientRect();
      const frac = (t.clientX - r.left) / r.width;
      e.preventDefault(); // we handle the tap ourselves (no delayed click)
      if (frac > 0.3 && frac < 0.7) {
        const now = Date.now();
        if (now - lastTap < 300) {
          clearTimeout(tapTimer);
          lastTap = 0;
          const z = live.current.settings.pdfZoom;
          live.current.onZoom(z > 1.05 ? 1 : 2);
          return;
        }
        lastTap = now;
        tapTimer = setTimeout(() => live.current.onTap(frac), 260);
      } else {
        live.current.onTap(frac);
      }
    };

    // Mouse clicks (touch taps are handled above).
    const click = (e) => {
      if (e.pointerType === 'touch' || e.sourceCapabilities?.firesTouchEvents) return;
      const r = stage.getBoundingClientRect();
      live.current.onTap((e.clientX - r.left) / r.width);
    };

    stage.addEventListener('touchstart', start, { passive: true });
    stage.addEventListener('touchmove', move, { passive: false });
    stage.addEventListener('touchend', end, { passive: false });
    stage.addEventListener('touchcancel', end);
    stage.addEventListener('click', click);
    return () => {
      clearTimeout(tapTimer);
      stage.removeEventListener('touchstart', start);
      stage.removeEventListener('touchmove', move);
      stage.removeEventListener('touchend', end);
      stage.removeEventListener('touchcancel', end);
      stage.removeEventListener('click', click);
    };
    // canvasFor/animateTurn read the latest values through live.current and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, renderKey]);

  const colors = themeColors(settings);
  const recolor = settings.pdfRecolor && settings.theme !== 'light';

  return (
    <div className="pdf-stage" ref={stageRef}>
      <div
        ref={trackRef}
        className={`pdf-track${recolor ? (colors.dark ? ' recolor-dark' : ' recolor-light') : ''}`}
        style={recolor ? { '--sheet-bg': colors.bg } : undefined}
      >
        <div ref={prevRef} className="pdf-slot pdf-slot-prev" />
        <div ref={pageRef} className="pdf-page" />
        <div ref={nextRef} className="pdf-slot pdf-slot-next" />
      </div>
    </div>
  );
}
