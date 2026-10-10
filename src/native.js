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

// ---------- drag a bottom sheet down to dismiss (phones) ----------

export function useDragToClose(ref, onClose, { enabled = true } = {}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let drag = null;

    const start = (e) => {
      if (!isTouchLayout() || e.touches.length !== 1) return;
      const t = e.touches[0];
      const top = el.getBoundingClientRect().top;
      const onHandle = e.target.closest?.('[data-drag-handle]');
      // Drag from the handle/header, or from anywhere when the sheet is scrolled to the top.
      const inHeader = t.clientY - top < 64;
      if (!onHandle && !(inHeader && el.scrollTop <= 0)) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      drag = { y: t.clientY, t: Date.now(), dy: 0 };
    };
    const move = (e) => {
      if (!drag) return;
      drag.dy = Math.max(0, e.touches[0].clientY - drag.y);
      if (drag.dy > 4) {
        e.preventDefault();
        el.style.transition = 'none';
        el.style.transform = `translateY(${drag.dy}px)`;
      }
    };
    const end = () => {
      if (!drag) return;
      const { dy, t } = drag;
      drag = null;
      const fast = dy / Math.max(1, Date.now() - t) > 0.6;
      el.style.transition = 'transform 0.22s ease-out';
      if (dy > 120 || (fast && dy > 30)) {
        el.style.transform = 'translateY(100%)';
        haptic(8);
        setTimeout(() => onCloseRef.current(), 180);
      } else {
        el.style.transform = '';
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
    const movePull = (e) => {
      if (startY == null) return;
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
