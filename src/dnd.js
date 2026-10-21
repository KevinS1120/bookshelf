// Dragging books onto each other (to make a series) and into series.
//
// Touch: press and hold a book until it lifts, then move it. Holding without
// moving opens the book's menu instead. Mouse: click and drag.
// Drop targets are elements with data-drop="book:<id>" or data-drop="series:<id>".
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { haptic } from './native';

export const DragContext = createContext(null);
export const useDragManager = () => useContext(DragContext);

// Lives at the top of the library: tracks the dragged book, the floating copy
// that follows your finger, the target under it, and what happens on drop.
export function useDragController(onDrop) {
  const [drag, setDrag] = useState(null); // { book, x, y, dx, dy, w, h, over }
  const ref = useRef(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const scrollTimer = useRef(null);

  const targetAt = (x, y, selfId) => {
    const el = document.elementFromPoint(x, y)?.closest?.('[data-drop]');
    const target = el?.dataset.drop ?? null;
    return target === `book:${selfId}` ? null : target;
  };

  // Scroll the page (or the open series) while holding a book near the top/bottom edge.
  const autoScroll = () => {
    clearInterval(scrollTimer.current);
    scrollTimer.current = setInterval(() => {
      const d = ref.current;
      if (!d) return clearInterval(scrollTimer.current);
      const edge = 70;
      const speed = d.y < edge ? -(edge - d.y) / 3 : d.y > window.innerHeight - edge ? (d.y - (window.innerHeight - edge)) / 3 : 0;
      if (!speed) return;
      const scroller = document.elementFromPoint(d.x, d.y)?.closest?.('.modal') || window;
      scroller.scrollBy(0, speed);
    }, 16);
  };

  const begin = useCallback((book, x, y, rect, context) => {
    ref.current = { book, context, x, y, dx: x - rect.left, dy: y - rect.top, w: rect.width, h: rect.height, over: null };
    setDrag({ ...ref.current });
    document.body.classList.add('dragging-book');
    haptic(12);
    autoScroll();
  }, []);

  const move = useCallback((x, y) => {
    const d = ref.current;
    if (!d) return;
    d.x = x;
    d.y = y;
    const over = targetAt(x, y, d.book.id);
    if (over !== d.over && over) haptic(5);
    d.over = over;
    setDrag({ ...d });
  }, []);

  const end = useCallback((cancelled = false) => {
    const d = ref.current;
    ref.current = null;
    clearInterval(scrollTimer.current);
    document.body.classList.remove('dragging-book');
    setDrag(null);
    if (d && d.over && !cancelled) onDropRef.current(d.book, d.over, d.context);
  }, []);

  useEffect(() => () => clearInterval(scrollTimer.current), []);

  return { drag, begin, move, end };
}

// Props/ref for a draggable book element.
export function useDraggableBook(book, { onMenu, context, disabled = false } = {}) {
  const manager = useDragManager();
  const elRef = useRef(null);
  const live = useRef({});
  live.current = { book, onMenu, context, manager };

  const hasManager = !!manager;
  useEffect(() => {
    const el = elRef.current;
    if (!el || disabled || !hasManager) return;
    let s = null; // current press
    let suppressClick = false;

    const rect = () => (el.querySelector('.cover-wrap, .cover') ?? el).getBoundingClientRect();

    // ----- touch -----
    const touchStart = (e) => {
      if (e.touches.length !== 1) return (s = null);
      const t = e.touches[0];
      s = { x: t.clientX, y: t.clientY, armed: false, dragging: false };
      s.timer = setTimeout(() => {
        if (!s) return;
        s.armed = true; // lifted: move to drag, or let go for the menu
        el.classList.add('lifted');
        haptic(15);
      }, 420);
    };
    const touchMove = (e) => {
      if (!s) return;
      const t = e.touches[0];
      const moved = Math.hypot(t.clientX - s.x, t.clientY - s.y);
      if (!s.armed) {
        if (moved > 10) {
          clearTimeout(s.timer); // it's a scroll
          s = null;
        }
        return;
      }
      e.preventDefault(); // holding a book: don't scroll the page
      if (!s.dragging && moved > 6) {
        s.dragging = true;
        el.classList.remove('lifted');
        live.current.manager.begin(live.current.book, s.x, s.y, rect(), live.current.context);
      }
      if (s.dragging) live.current.manager.move(t.clientX, t.clientY);
    };
    const touchEnd = (e) => {
      if (!s) return;
      clearTimeout(s.timer);
      el.classList.remove('lifted');
      const { armed, dragging } = s;
      s = null;
      if (dragging) {
        e.preventDefault();
        suppressClick = true;
        live.current.manager.end(e.type === 'touchcancel');
      } else if (armed && e.type === 'touchend') {
        e.preventDefault();
        suppressClick = true;
        live.current.onMenu?.();
      }
    };

    // ----- mouse -----
    let m = null;
    const pointerDown = (e) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      m = { x: e.clientX, y: e.clientY, dragging: false, id: e.pointerId };
    };
    const pointerMove = (e) => {
      if (!m || e.pointerId !== m.id) return;
      if (!m.dragging && Math.hypot(e.clientX - m.x, e.clientY - m.y) > 6) {
        m.dragging = true;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* not capturable */
        }
        live.current.manager.begin(live.current.book, m.x, m.y, rect(), live.current.context);
      }
      if (m.dragging) {
        e.preventDefault();
        live.current.manager.move(e.clientX, e.clientY);
      }
    };
    const pointerUp = (e) => {
      if (!m || e.pointerId !== m.id) return;
      const { dragging } = m;
      m = null;
      if (dragging) {
        suppressClick = true;
        live.current.manager.end(e.type === 'pointercancel');
      }
    };

    // Right-click (or Android's own long-press) opens the menu.
    const contextMenu = (e) => {
      e.preventDefault();
      if (s) return; // a touch press handles the menu itself
      live.current.onMenu?.();
    };
    // Swallow the click after a drag or a press-and-hold.
    const click = (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    };
    const noNativeDrag = (e) => e.preventDefault();

    el.addEventListener('touchstart', touchStart, { passive: true });
    el.addEventListener('touchmove', touchMove, { passive: false });
    el.addEventListener('touchend', touchEnd, { passive: false });
    el.addEventListener('touchcancel', touchEnd);
    el.addEventListener('pointerdown', pointerDown);
    el.addEventListener('pointermove', pointerMove);
    el.addEventListener('pointerup', pointerUp);
    el.addEventListener('pointercancel', pointerUp);
    el.addEventListener('contextmenu', contextMenu);
    el.addEventListener('click', click, true);
    el.addEventListener('dragstart', noNativeDrag);
    return () => {
      clearTimeout(s?.timer);
      el.removeEventListener('touchstart', touchStart);
      el.removeEventListener('touchmove', touchMove);
      el.removeEventListener('touchend', touchEnd);
      el.removeEventListener('touchcancel', touchEnd);
      el.removeEventListener('pointerdown', pointerDown);
      el.removeEventListener('pointermove', pointerMove);
      el.removeEventListener('pointerup', pointerUp);
      el.removeEventListener('pointercancel', pointerUp);
      el.removeEventListener('contextmenu', contextMenu);
      el.removeEventListener('click', click, true);
      el.removeEventListener('dragstart', noNativeDrag);
    };
    // The manager is read through `live` so re-renders don't reset a press in progress.
  }, [disabled, hasManager]);

  return elRef;
}

// A sensible series name from the books' titles ("The Expanse 1" + "The Expanse 2" -> "The Expanse").
export function suggestSeriesName(titles) {
  const clean = (t) => t.replace(/[([].*?[)\]]/g, '').trim();
  const words = titles.map((t) => clean(t).split(/\s+/));
  const common = [];
  for (let i = 0; i < Math.min(...words.map((w) => w.length)); i++) {
    const w = words[0][i];
    if (words.every((ws) => ws[i]?.toLowerCase() === w.toLowerCase())) common.push(w);
    else break;
  }
  let name = common.join(' ');
  // Trim trailing punctuation and filler words ("Mistborn: The" -> "Mistborn").
  for (let prev = null; prev !== name; ) {
    prev = name;
    name = name.replace(/[\s:;,\-–—#.(]+$/, '').replace(/\s+(book|vol\.?|volume|part|and|the|of|a|an)$/i, '').trim();
  }
  return name.length >= 3 ? name : clean(titles[0]).replace(/\s*(?:#|book|vol\.?|volume|part)?\s*\d+\s*$/i, '').trim();
}
