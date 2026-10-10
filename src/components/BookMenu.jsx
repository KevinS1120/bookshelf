import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { STATUSES } from '../util';

// The ⋯ menu on each book: open, change status, start over, cover, remove.
export default function BookMenu({ book, onOpen, onDetails, onStatus, onStartOver, onCover, onDelete, className = '' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const b = buttonRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(b.right - m.width, window.innerWidth - m.width - 8));
    const below = b.bottom + 4;
    const top = below + m.height > window.innerHeight - 8 ? Math.max(8, b.top - m.height - 4) : below;
    setPos({ left, top });
  }, [open]);

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
          setPos(null);
          setOpen((o) => !o);
        }}
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="menu"
            role="menu"
            style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
          >
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
            <div className="menu-sep" />
            <button role="menuitem" className="danger" onClick={act(onDelete)}>
              Remove from library
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
