import { useEffect, useRef, useState } from 'react';
import { useBackClose, useDragToClose } from '../native';
import { STATUSES, formatDate, formatSize, fromDateInput, statusPatch, toDateInput } from '../util';
import Cover from './Cover';
import Stars from './Stars';

export default function BookDetails({ book, allTags, onUpdate, onOpen, onCover, onDelete, onClose }) {
  const update = (patch) => onUpdate(book.id, patch);
  // Text fields save shortly after you stop typing.
  const updateText = (patch) => onUpdate(book.id, patch, { delay: 700 });

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setStatus = (status) => update(statusPatch(book, status));
  const sheetRef = useRef(null);
  useBackClose(onClose);
  useDragToClose(sheetRef, onClose);

  const pct = Math.round(book.progress * 100);
  const action = book.progress > 0 && book.progress < 1 ? `Continue reading (${pct}%)` : 'Read';

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheetRef} className="modal" role="dialog" aria-modal="true" aria-label={book.title}>
        <div className="sheet-handle" data-drag-handle />
        <div className="details">
          <div className="details-side">
            <button className="cover-edit" onClick={onCover} title="Change cover">
              <Cover book={book} className="cover-lg" />
              <span className="cover-edit-label">Change cover</span>
            </button>
            <button className="btn primary block" onClick={() => onOpen(book)}>
              {action}
            </button>
            <p className="muted small">
              {book.format.toUpperCase()} · {formatSize(book.size)}
              {book.pageCount ? ` · ${book.pageCount} pages` : ''}
              <br />
              Added {formatDate(book.addedAt)}
              {book.lastOpenedAt && (
                <>
                  <br />
                  Last opened {formatDate(book.lastOpenedAt)}
                </>
              )}
            </p>
          </div>

          <div className="details-main">
            <input
              className="title-input"
              value={book.title}
              onChange={(e) => updateText({ title: e.target.value })}
              aria-label="Title"
            />
            <input
              className="author-input"
              value={book.author}
              placeholder="Add author"
              onChange={(e) => updateText({ author: e.target.value })}
              aria-label="Author"
            />

            <div className="field">
              <span className="field-label">Status</span>
              <div className="segmented">
                {STATUSES.map((s) => (
                  <button
                    key={s.id}
                    className={book.status === s.id ? 'active' : ''}
                    onClick={() => setStatus(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label">Rating</span>
              <Stars value={book.rating} onChange={(rating) => update({ rating })} size="lg" />
            </div>

            {book.progress > 0 && (
              <div className="field">
                <span className="field-label">Progress</span>
                <div className="progress-line">
                  <div className="progress">
                    <div style={{ width: `${pct}%` }} />
                  </div>
                  <span className="muted small">{pct}%</span>
                  <button
                    className="link-btn small"
                    onClick={() => confirm('Start this book over from the beginning?') && update({ progress: 0, location: null })}
                  >
                    Start over
                  </button>
                </div>
              </div>
            )}

            <div className="field">
              <span className="field-label">Collections</span>
              <TagEditor tags={book.tags} suggestions={allTags} onChange={(tags) => update({ tags })} />
            </div>

            <div className="field-row">
              <label className="field">
                <span className="field-label">Started</span>
                <input
                  type="date"
                  value={toDateInput(book.startedAt)}
                  onChange={(e) => update({ startedAt: fromDateInput(e.target.value) })}
                />
              </label>
              <label className="field">
                <span className="field-label">Finished</span>
                <input
                  type="date"
                  value={toDateInput(book.finishedAt)}
                  onChange={(e) => update({ finishedAt: fromDateInput(e.target.value) })}
                />
              </label>
            </div>

            <label className="field">
              <span className="field-label">Notes &amp; review</span>
              <textarea
                rows={5}
                value={book.review}
                placeholder="What did you think?"
                onChange={(e) => updateText({ review: e.target.value })}
              />
            </label>

            <div className="details-footer">
              <button
                className="btn danger-ghost"
                onClick={() =>
                  confirm(`Remove "${book.title}" from your library? It goes to your OneDrive recycle bin.`) && onDelete(book.id)
                }
              >
                Remove from library
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TagEditor({ tags, suggestions, onChange }) {
  const [draft, setDraft] = useState('');
  const add = (value) => {
    const t = value.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t]);
    setDraft('');
  };
  const unused = suggestions.filter((s) => !tags.includes(s));
  return (
    <div className="tags">
      {tags.map((t) => (
        <span key={t} className="tag">
          {t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
            ×
          </button>
        </span>
      ))}
      <input
        className="tag-input"
        value={draft}
        list="tag-suggestions"
        placeholder={tags.length ? 'Add…' : 'Add to a collection, e.g. Sci-fi'}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(',')) add(v.slice(0, -1));
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
      />
      <datalist id="tag-suggestions">
        {unused.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {unused.length > 0 && !draft && (
        <div className="tag-suggest">
          {unused.slice(0, 6).map((s) => (
            <button key={s} onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
