import { useEffect, useRef, useState } from 'react';
import { useDraggableBook, useDragManager } from '../dnd';
import { useBackClose, useDragToClose } from '../native';
import { seriesNumber } from '../useSeries';
import { statusLabel } from '../util';
import BookMenu from './BookMenu';
import Cover from './Cover';
import GenrePicker from './GenrePicker';

// A series in the library grid: its covers stacked. Drop a book on it to add it.
export function SeriesCard({ series, books, onOpen }) {
  const drag = useDragManager()?.drag;
  const over = drag?.over === `series:${series.id}`;
  const shown = books.slice(0, 3);
  const reading = books.find((b) => b.status === 'reading');
  const done = books.filter((b) => b.status === 'finished').length;
  return (
    <div className={`book-card series-card${over ? ' drop-target' : ''}`} data-drop={`series:${series.id}`}>
      <button className="book-open" onClick={onOpen} aria-label={`${series.name}, series of ${books.length}`}>
        <div className="series-stack">
          {shown
            .slice()
            .reverse()
            .map((b, i, arr) => (
              <div key={b.id} className={`series-layer layer-${arr.length - 1 - i}`}>
                <div className="cover-wrap">
                  <Cover book={b} />
                </div>
              </div>
            ))}
          <span className="badge series-badge">Series · {books.length}</span>
        </div>
      </button>
      <strong className="clamp-2">{series.name}</strong>
      <span className="muted clamp-1">
        {done ? `${done} of ${books.length} read` : reading ? `Reading #${books.indexOf(reading) + 1}` : `${books.length} books`}
      </span>
    </div>
  );
}

// Naming a new series (after dropping one book onto another).
export function NameSeriesDialog({ suggestion, count, onCreate, onCancel }) {
  const [name, setName] = useState(suggestion);
  const sheetRef = useRef(null);
  useBackClose(onCancel);
  useDragToClose(sheetRef, onCancel);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        ref={sheetRef}
        className="modal name-series"
        role="dialog"
        aria-modal="true"
        aria-label="Name this series"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(name.trim());
        }}
      >
        <div className="sheet-handle" data-drag-handle />
        <h2>New series</h2>
        <p className="muted">
          {count} books, grouped together. Tags you give the series are added to every book in it.
        </p>
        <input
          className="text-input series-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Series name"
          autoFocus
          onFocus={(e) => e.target.select()}
          maxLength={120}
        />
        <div className="row-gap end">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>
            Create series
          </button>
        </div>
      </form>
    </div>
  );
}

// An open series: its name, tags for every book in it, and its books in order
// (drag a book onto another to move it there).
export function SeriesView({ series, books, allTags, menuPropsFor, onSelect, onMove, onAutoOrder, onRename, onTags, onUngroup, onClose }) {
  const [name, setName] = useState(series.name);
  const sheetRef = useRef(null);
  useBackClose(onClose);
  useDragToClose(sheetRef, onClose);
  useEffect(() => setName(series.name), [series.name]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !e.target.closest?.('input') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const commitName = () => {
    const n = name.trim();
    if (n && n !== series.name) onRename(n);
    else setName(series.name);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheetRef} className="modal series-view" role="dialog" aria-modal="true" aria-label={series.name}>
        <div className="sheet-handle" data-drag-handle />
        <span className="field-label">Series</span>
        <input
          className="title-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          aria-label="Series name"
        />
        <p className="muted series-count">
          {books.length} book{books.length === 1 ? '' : 's'}
        </p>

        <div className="order-head">
          <span className="field-label">Reading order</span>
          {books.some((b) => seriesNumber(b.title) != null) && (
            <button className="btn small-btn" onClick={onAutoOrder} title="Sort by the numbers in the titles (Book 2, #3, Vol. IV…)">
              Auto-order
            </button>
          )}
        </div>
        <p className="muted small series-hint">Hold and drag a book to move it, or use the arrows.</p>
        <ol className="order-list">
          {books.map((b, i) => (
            <SeriesRow
              key={b.id}
              book={b}
              index={i}
              count={books.length}
              seriesId={series.id}
              menuProps={menuPropsFor(b)}
              onSelect={() => onSelect(b)}
              onMove={(delta) => onMove(b.id, delta)}
            />
          ))}
        </ol>

        <div className="field series-tags">
          <span className="field-label">Series tags</span>
          <p className="muted small series-hint">Added to every book in the series, including ones you add later.</p>
          <GenrePicker tags={series.tags ?? []} suggestions={allTags} onChange={onTags} />
        </div>


        <div className="details-footer">
          <button
            className="btn danger-ghost"
            onClick={() => confirm(`Ungroup "${series.name}"? The books stay in your library.`) && onUngroup()}
          >
            Ungroup series
          </button>
        </div>
      </div>
    </div>
  );
}

// The book following your finger while dragging.
export function DragGhost() {
  const drag = useDragManager()?.drag;
  if (!drag) return null;
  return (
    <div className="drag-ghost" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w }}>
      <div className="cover-wrap">
        <Cover book={drag.book} />
      </div>
      {drag.over && (
        <span className="drag-hint">
          {drag.context?.seriesId ? 'Move here' : drag.over.startsWith('series:') ? 'Add to series' : 'Make a series'}
        </span>
      )}
    </div>
  );
}

// One book in a series' reading order. Drag it onto another row to move it there.
function SeriesRow({ book: b, index, count, seriesId, menuProps, onSelect, onMove }) {
  const menu = useRef(null);
  const dragRef = useDraggableBook(b, { onMenu: () => menu.current?.open(), context: { seriesId } });
  const drag = useDragManager()?.drag;
  const isDragged = drag?.book.id === b.id;
  const isTarget = drag?.over === `book:${b.id}`;
  const pct = Math.round(b.progress * 100);
  const state =
    b.status === 'reading' && pct ? `Reading · ${pct}%` : b.status === 'to-read' ? (pct ? `${pct}%` : 'Not started') : statusLabel(b.status);
  return (
    <li className={`order-row${isDragged ? ' is-dragged' : ''}${isTarget ? ' drop-target' : ''}`} data-drop={`book:${b.id}`}>
      <button ref={dragRef} className="order-main" onClick={onSelect} aria-label={`${index + 1}. ${b.title}`}>
        <span className="order-num">{index + 1}</span>
        <span className="cover-wrap order-cover">
          <Cover book={b} />
        </span>
        <span className="order-text">
          <strong className="clamp-2">{b.title}</strong>
          <span className={`muted small order-state${b.status === 'finished' ? ' done' : ''}`}>
            {b.status === 'finished' ? '✓ ' : ''}
            {state}
          </span>
        </span>
      </button>
      <span className="order-arrows">
        <button className="icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${b.title} up`}>
          ▲
        </button>
        <button className="icon-btn" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${b.title} down`}>
          ▼
        </button>
      </span>
      <BookMenu ref={menu} {...menuProps} className="menu-btn-inline" />
    </li>
  );
}
