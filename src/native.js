// App-like behavior: back button/gesture, drag-to-dismiss sheets, long-press,
// pull-to-refresh, keeping the screen on, and haptics.
import { useEffect, useRef, useState } from 'react';

// A short vibration on phones that support it (Android). iOS ignores it.
export const haptic = (ms = 10) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
};

const isTouchLayout = () => window.matchMedia('(max-width: 720px)').matches;

// ---------- touch test (Settings → Touch test) ----------
// Shows what the device reports while you swipe in a book, to diagnose gestures.

const DEBUG_KEY = 'bookshelf-touch-test';
const debugLines = [];
const debugListeners = new Set();

export function gestureDebugOn() {
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export function setGestureDebug(on) {
  try {
    if (on) localStorage.setItem(DEBUG_KEY, '1');
    else localStorage.removeItem(DEBUG_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function debugGesture(what, data = {}) {
  if (!gestureDebugOn()) return;
  const time = new Date().toISOString().slice(17, 22);
  debugLines.push(`${time} ${what} ${JSON.stringify(data)}`);
  while (debugLines.length > 16) debugLines.shift();
  debugListeners.forEach((fn) => fn());
}

// Lines to show, plus a log of raw touch/pointer events reaching the page.
export function useGestureDebug() {
  const [lines, setLines] = useState([]);
  useEffect(() => {
    if (!gestureDebugOn()) return;
    const update = () => setLines([...debugLines]);
    debugListeners.add(update);
    let moves = 0;
    const raw = (e) => {
      if (e.type.endsWith('move') && ++moves % 10 !== 1) return; // don't flood with moves
      if (e.type.endsWith('start') || e.type.endsWith('down')) moves = 0;
      const t = e.target;
      const where = typeof t?.className === 'string' && t.className ? t.className.split(' ')[0] : t?.tagName;
      debugGesture(`· ${e.type}`, { on: where, pt: e.pointerType, cancelable: e.cancelable, n: e.touches?.length });
    };
    const types = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel'];
    types.forEach((type) => document.addEventListener(type, raw, { capture: true, passive: true }));
    debugGesture('touch test on', { ua: navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90), standalone: !!navigator.standalone });
    return () => {
      debugListeners.delete(update);
      types.forEach((type) => document.removeEventListener(type, raw, { capture: true }));
    };
  }, []);
  return lines;
}

// ---------- app updates ----------
// Home-screen apps can hang on to an old version. Check now and then whether a
// newer one has been published, and reload into it at a safe moment.

const currentBuild = () => document.querySelector('script[type="module"][src*="assets/"]')?.getAttribute('src')?.split('/').pop();

export async function newerVersionAvailable() {
  const mine = currentBuild();
  if (!mine) return false; // development server
  try {
    const res = await fetch(`./index.html?check=${Date.now()}`, { cache: 'no-store' });
    const html = await res.text();
    const latest = html.match(/assets\/(index-[\w-]+\.js)/)?.[1];
    if (!latest || latest === mine) return false;
    // Reload at most once per new version, in case servers briefly disagree.
    if (sessionStorage.getItem('bookshelf-reloaded-for') === latest) return false;
    sessionStorage.setItem('bookshelf-reloaded-for', latest);
    return true;
  } catch {
    return false;
  }
}

// ---------- back button / back gesture ----------
// While anything is open (a book, a panel, a menu), there is one extra history
// entry. Android's back button or the browser's back swipe removes it, which
// closes the top-most thing instead of leaving the app. Changes are synced
// after React settles, so several things opening and closing at once never
// leave history out of step.

const stack = []; // open things, oldest first
let guard = false; // whether our history entry exists
let ignorePops = 0;
let syncTimer = null;

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (stack.length && !guard) {
      window.history.pushState({ bookshelf: true }, '');
      guard = true;
    } else if (!stack.length && guard) {
      guard = false;
      ignorePops++;
      window.history.back();
    }
  }, 0);
}

window.addEventListener('popstate', () => {
  if (ignorePops > 0) {
    ignorePops--;
    return;
  }
  if (!guard) return;
  guard = false;
  const top = stack.pop();
  top?.onClose();
  scheduleSync(); // more still open: put the entry back
});

export function useBackClose(onClose, active = true) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!active) return;
    const entry = { onClose: () => onCloseRef.current() };
    stack.push(entry);
    scheduleSync();
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      scheduleSync();
    };
  }, [active]);
}

// ---------- swipe a panel down to dismiss (touch screens) ----------
// Works from anywhere on the panel: dragging down while its content is scrolled
// to the top pulls the panel down; let go far enough (or flick) and it closes.

const isTouchScreen = () => window.matchMedia('(pointer: coarse)').matches || isTouchLayout();

// Whether something between the touch and the panel is scrolled down (then the
// drag should scroll it back up instead of closing the panel).
function scrolledDown(target, panel) {
  for (let node = target; node && node !== panel.parentNode; node = node.parentNode) {
    if (node.nodeType === 1 && node.scrollTop > 0 && node.scrollHeight > node.clientHeight) return true;
  }
  return false;
}

export function useDragToClose(ref, onClose, { enabled = true } = {}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let drag = null;
    const backdrop = el.parentElement?.classList.contains('modal-backdrop') ? el.parentElement : null;

    const start = (e) => {
      if (!isTouchScreen() || e.touches.length !== 1) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      const t = e.touches[0];
      const onHandle = !!e.target.closest?.('[data-drag-handle]');
      if (!onHandle && scrolledDown(e.target, el)) return;
      drag = { x: t.clientX, y: t.clientY, t: Date.now(), dy: 0, active: onHandle, onHandle };
    };
    const move = (e) => {
      if (!drag) return;
      if (document.body.classList.contains('dragging-book') || document.querySelector('.lifted')) {
        drag = null; // a book is being moved, not the panel
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - drag.x;
      const dy = t.clientY - drag.y;
      if (!drag.active) {
        // Pulling down at the top: claim the gesture right away so the page doesn't scroll/bounce.
        if (dy > 0 && dy >= Math.abs(dx)) {
          e.preventDefault();
          if (dy > 6) drag.active = true;
        } else if (Math.abs(dx) > 6 || dy < -2) {
          drag = null; // a sideways drag or a scroll up: not ours
        }
        if (!drag?.active) return;
      }
      e.preventDefault();
      drag.dy = Math.max(0, dy);
      el.style.transition = 'none';
      el.style.transform = `translateY(${drag.dy}px)`;
      if (backdrop) {
        backdrop.style.transition = 'none';
        backdrop.style.backgroundColor = `rgb(0 0 0 / ${0.45 * Math.max(0, 1 - drag.dy / 400)})`;
      }
    };
    const end = () => {
      if (!drag) return;
      const { dy, t, active } = drag;
      drag = null;
      if (!active) return;
      const fast = dy / Math.max(1, Date.now() - t) > 0.5;
      el.style.transition = 'transform 0.22s ease-out';
      if (backdrop) backdrop.style.transition = 'background-color 0.22s ease-out';
      if (dy > 110 || (fast && dy > 30)) {
        el.style.transform = 'translateY(100vh)';
        if (backdrop) backdrop.style.backgroundColor = 'rgb(0 0 0 / 0)';
        haptic(8);
        setTimeout(() => onCloseRef.current(), 200);
      } else {
        el.style.transform = '';
        if (backdrop) backdrop.style.backgroundColor = '';
      }
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [ref, enabled]);
}

// ---------- long press ----------
// Returns props for an element. Also handles right-click / Android's native long-press.

export function useLongPress(onLongPress, ms = 450) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onTouchStart: (e) => {
      fired.current = false;
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        haptic(15);
        onLongPress();
      }, ms);
    },
    onTouchMove: (e) => {
      const t = e.touches[0];
      if (start.current && Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > 10) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    onContextMenu: (e) => {
      e.preventDefault();
      cancel();
      if (!fired.current) {
        fired.current = true;
        onLongPress();
      }
    },
    // Swallow the click that follows a long press.
    onClickCapture: (e) => {
      if (fired.current) {
        e.stopPropagation();
        e.preventDefault();
        fired.current = false;
      }
    },
  };
}

// ---------- pull to refresh ----------

export function usePullToRefresh(onRefresh) {
  const [pull, setPull] = useState(0); // 0..1+ while pulling
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    let startY = null;
    let distance = 0;
    const startPull = (e) => {
      if (window.scrollY > 0 || e.touches.length !== 1 || document.querySelector('.modal-backdrop, .menu')) return;
      startY = e.touches[0].clientY;
      distance = 0;
    };
    const holdingBook = () => document.body.classList.contains('dragging-book') || document.querySelector('.lifted');
    const movePull = (e) => {
      if (startY == null) return;
      if (holdingBook()) {
        startY = null;
        setPull(0);
        return;
      }
      distance = e.touches[0].clientY - startY;
      if (distance <= 0 || window.scrollY > 0) {
        setPull(0);
        return;
      }
      setPull(Math.min(1.4, distance / 90));
    };
    const endPull = async () => {
      if (startY == null) return;
      startY = null;
      const go = distance > 90;
      setPull(0);
      if (!go) return;
      haptic(10);
      setRefreshing(true);
      try {
        await onRefreshRef.current();
      } finally {
        setRefreshing(false);
      }
    };
    window.addEventListener('touchstart', startPull, { passive: true });
    window.addEventListener('touchmove', movePull, { passive: true });
    window.addEventListener('touchend', endPull);
    return () => {
      window.removeEventListener('touchstart', startPull);
      window.removeEventListener('touchmove', movePull);
      window.removeEventListener('touchend', endPull);
    };
  }, []);

  return { pull, refreshing };
}

// ---------- keep the screen on while reading ----------

export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return;
    let lock = null;
    let alive = true;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (!alive) lock.release();
      } catch {
        /* low battery mode, or not allowed */
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
