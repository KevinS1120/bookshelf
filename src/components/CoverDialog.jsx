import { useEffect, useRef, useState } from 'react';
import { extractCover } from '../importBook';
import { fetchImage, searchCovers, toCoverJpeg } from '../images';
import { fileBlob, removeCover, setCover } from '../library';
import { useBackClose, useDragToClose } from '../native';
import Cover from './Cover';

export default function CoverDialog({ book, onSave, onClose }) {
  const [query, setQuery] = useState([book.title, book.author].filter(Boolean).join(' '));
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const sheetRef = useRef(null);
  useBackClose(onClose);
  useDragToClose(sheetRef, onClose, { enabled: !busy });

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  async function run(label, fn) {
    setError('');
    setBusy(label);
    try {
      onSave(await fn());
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy('');
    }
  }

  const applyImage = (getBlob) => run('Saving cover…', async () => setCover(book, await toCoverJpeg(await getBlob())));

  async function search(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    try {
      setResults(await searchCovers(query.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={sheetRef} className="modal cover-dialog" role="dialog" aria-modal="true" aria-label="Change cover">
        <div className="sheet-handle" data-drag-handle />
        <h2>Change cover</h2>
        <p className="muted clamp-1">{book.title}</p>

        <div className="cover-dialog-top">
          <Cover book={book} className="cover-preview" />
          <div className="cover-actions">
            <button className="btn primary" disabled={!!busy} onClick={() => fileRef.current.click()}>
              Upload an image…
            </button>
            <button
              className="btn"
              disabled={!!busy}
              onClick={() =>
                run('Getting the cover from the book…', async () => {
                  const original = await extractCover(await fileBlob(book.id), book.format);
                  return original ? setCover(book, original) : removeCover(book);
                })
              }
            >
              Use the book's own cover
            </button>
            <button className="btn ghost" disabled={!!busy || book.noCover} onClick={() => run('Removing…', () => removeCover(book))}>
              No cover
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files[0];
                e.target.value = '';
                if (file) applyImage(() => file);
              }}
            />
          </div>
        </div>

        <form className="cover-search" onSubmit={search}>
          <span className="field-label">Find a cover online</span>
          <div className="row-gap nowrap">
            <input className="text-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Title and author" />
            <button className="btn" type="submit" disabled={searching || !!busy}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>

        {busy && <p className="setup-busy">{busy}</p>}
        {error && <p className="setup-error">{error}</p>}

        {results &&
          (results.length === 0 ? (
            <p className="muted">No covers found. Try fewer words, or just the title.</p>
          ) : (
            <div className="cover-results">
              {results.map((r) => (
                <button key={r.id} className="cover-result" disabled={!!busy} onClick={() => applyImage(() => fetchImage(r.full))}>
                  <img src={r.thumb} alt="" loading="lazy" />
                  <span className="clamp-2">{r.title}</span>
                  <span className="muted clamp-1">
                    {r.author}
                    {r.year ? ` · ${r.year}` : ''}
                  </span>
                </button>
              ))}
            </div>
          ))}
        <p className="muted small">Online covers come from Open Library.</p>
      </div>
    </div>
  );
}
