import { useRef } from 'react';
import { useDragToClose } from '../native';
import { formatDate } from '../util';

export default function SidePanel({ tab, onTab, toc, tocIndex, bookmarks, onTocSelect, onBookmarkSelect, onBookmarkRemove, onClose }) {
  const sorted = [...bookmarks].sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0));
  const sheetRef = useRef(null);
  useDragToClose(sheetRef, onClose);

  return (
    <nav ref={sheetRef} className="sheet side-panel" aria-label="Contents and bookmarks">
      <div className="sheet-handle" data-drag-handle />
      <div className="sheet-head" data-drag-handle>
        <div className="seg">
          <button className={tab === 'contents' ? 'active' : ''} onClick={() => onTab('contents')}>
            Contents
          </button>
          <button className={tab === 'bookmarks' ? 'active' : ''} onClick={() => onTab('bookmarks')}>
            Bookmarks{bookmarks.length ? ` (${bookmarks.length})` : ''}
          </button>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="sheet-body flush">
        {tab === 'contents' ? (
          toc.length === 0 ? (
            <p className="set-hint pad">This book has no table of contents.</p>
          ) : (
            toc.map((t, i) => (
              <button
                key={i}
                className={`list-item${i === tocIndex ? ' active' : ''}`}
                style={{ paddingLeft: 16 + t.depth * 16 }}
                onClick={() => onTocSelect(t)}
              >
                {t.label}
              </button>
            ))
          )
        ) : sorted.length === 0 ? (
          <p className="set-hint pad">No bookmarks yet. Tap the bookmark icon at the top to save your place.</p>
        ) : (
          sorted.map((b) => (
            <div key={b.id} className="list-item bookmark">
              <button className="bookmark-main" onClick={() => onBookmarkSelect(b)}>
                <strong>{b.label || 'Bookmark'}</strong>
                {b.excerpt && <span className="bookmark-excerpt">“{b.excerpt}…”</span>}
                <span className="set-hint">{formatDate(b.createdAt)}</span>
              </button>
              <button className="icon-btn" onClick={() => onBookmarkRemove(b.id)} aria-label="Delete bookmark">
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </nav>
  );
}
