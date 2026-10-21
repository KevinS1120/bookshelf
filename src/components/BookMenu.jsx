import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackClose, useDragToClose } from '../native';
import { STATUSES } from '../util';

const isPhone = () => window.matchMedia('(max-width: 720px)').matches;

// The ⋯ menu on each book: open, change status, start over, cover, remove.
// A dropdown on larger screens, an action sheet on phones. `ref.open()` opens it (long-press).
export default function BookMenu({ ref, book, onOpen, onDetails, onStatus, onStartOver, onCover, onRemoveFromSeries, onDelete, className = '' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const sheet = open && isPhone();

  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
  useBackClose(() => setOpen(false), open);
  useDragToClose(menuRef, () => setOpen(false), { enabled: sheet });

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    if (sheet) return setPos({});
    const b = buttonRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(b.right - m.width, window.innerWidth - m.width - 8));
    const below = b.bottom + 4;
    const top = below + m.height > window.innerHeight - 8 ? Math.max(8, b.top - m.height - 4) : below;
    setPos({ left, top });
  }, [open, sheet]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (menuRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onResize = () => setOpen(false);
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const act = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button
        ref={buttonRef}
        className={`menu-btn ${className}`}
        aria-label={`Options for ${book.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <>
            {sheet && <div className="menu-backdrop" />}
            <div
              ref={menuRef}
              className={`menu${sheet ? ' menu-sheet' : ''}`}
              role="menu"
              style={!pos ? { visibility: 'hidden', left: 0, top: 0 } : sheet ? undefined : { left: pos.left, top: pos.top }}
            >
              {sheet && (
                <div className="menu-title" data-drag-handle>
                  <div className="sheet-handle" />
                  <strong className="clamp-1">{book.title}</strong>
                  {book.author && <span className="muted clamp-1">{book.author}</span>}
                </div>
              )}
              <button role="menuitem" onClick={act(onOpen)}>
                {book.progress > 0 && book.progress < 1 ? 'Continue reading' : 'Read'}
              </button>
              <button role="menuitem" onClick={act(onDetails)}>
                Details &amp; notes
              </button>
              <div className="menu-sep" />
              <div className="menu-label">Status</div>
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  role="menuitemradio"
                  aria-checked={book.status === s.id}
                  className={book.status === s.id ? 'checked' : ''}
                  onClick={act(() => onStatus(s.id))}
                >
                  {s.label}
                </button>
              ))}
              <div className="menu-sep" />
              {book.progress > 0 && (
                <button role="menuitem" onClick={act(onStartOver)}>
                  Start over from the beginning
                </button>
              )}
              <button role="menuitem" onClick={act(onCover)}>
                Change cover…
              </button>
              {onRemoveFromSeries && (
                <button role="menuitem" onClick={act(onRemoveFromSeries)}>
                  Remove from series
                </button>
              )}
              <div className="menu-sep" />
              <button role="menuitem" className="danger" onClick={act(onDelete)}>
                Remove from library
              </button>
              {sheet && (
                <button className="menu-cancel" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
