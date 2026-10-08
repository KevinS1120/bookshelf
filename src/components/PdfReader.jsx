import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { pdfjsLib } from '../importBook';
import { themeColors } from '../settings';

const PAD = 16;
// iOS Safari silently refuses to draw canvases larger than about 16.7 million pixels.
const MAX_CANVAS_PIXELS = 16_000_000;

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

export default function PdfReader({ ref, bookId, getFile, initialLocation, settings, onRelocate, onToc, onTap, onSwipe, onError, onScrubbable }) {
  const stageRef = useRef(null);
  const pageRef = useRef(null);
  const touchRef = useRef(null);
  const swipedRef = useRef(false);
  const tocPagesRef = useRef([]);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(Number(initialLocation) || 1);
  const [size, setSize] = useState(null);
  const live = useRef({});
  live.current = { onRelocate, onToc, onError, onScrubbable };

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
        if (!doc) return;
        if (cancelled) return;
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

  // Render into a fresh canvas each time, then swap it in: no flicker, and no
  // clashes with a previous render that is still being cancelled.
  useEffect(() => {
    if (!pdf || !size) return;
    let cancelled = false;
    let renderTask;
    (async () => {
      const p = await pdf.getPage(page);
      if (cancelled) return;
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
      renderTask = p.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      await renderTask.promise;
      if (!cancelled) pageRef.current?.replaceChildren(canvas);
    })().catch((err) => {
      if (err?.name !== 'RenderingCancelledException') console.error(err);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, page, size, settings.pdfFit, settings.pdfZoom]);

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

  useImperativeHandle(
    ref,
    () => ({
      next: () => go(page + 1),
      prev: () => go(page - 1),
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
    [pdf, page],
  );

  const colors = themeColors(settings);
  const recolor = settings.pdfRecolor && settings.theme !== 'light';

  return (
    <div
      className="pdf-stage"
      ref={stageRef}
      onTouchStart={(e) => {
        swipedRef.current = false;
        const t = e.touches[0];
        touchRef.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const start = touchRef.current;
        touchRef.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        const el = stageRef.current;
        const pannable = el.scrollWidth > el.clientWidth + 2 || (window.visualViewport?.scale ?? 1) > 1.01;
        if (!pannable && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          swipedRef.current = true;
          onSwipe(dx < 0 ? 'next' : 'prev');
        }
      }}
      onClick={(e) => {
        if (swipedRef.current) {
          swipedRef.current = false;
          return;
        }
        const r = stageRef.current.getBoundingClientRect();
        onTap((e.clientX - r.left) / r.width);
      }}
    >
      <div
        ref={pageRef}
        className={`pdf-page${recolor ? (colors.dark ? ' recolor-dark' : ' recolor-light') : ''}`}
        style={recolor ? { background: colors.bg } : undefined}
      />
    </div>
  );
}
