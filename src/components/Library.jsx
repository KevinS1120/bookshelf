import { useEffect, useMemo, useRef, useState } from 'react';
import { createBook } from '../library';
import { importFile } from '../importBook';
import { countLocalBooks, migrateLocalBooks } from '../migrate';
import { STATUSES, usePref } from '../util';
import Cover from './Cover';
import Stars from './Stars';

const SORTS = {
  recent: { label: 'Recently opened', fn: (a, b) => (b.lastOpenedAt || b.addedAt) - (a.lastOpenedAt || a.addedAt) },
  added: { label: 'Recently added', fn: (a, b) => b.addedAt - a.addedAt },
  title: { label: 'Title', fn: (a, b) => a.title.localeCompare(b.title) },
  author: { label: 'Author', fn: (a, b) => (a.author || '~').localeCompare(b.author || '~') },
  rating: { label: 'Rating', fn: (a, b) => b.rating - a.rating },
};

export default function Library({ books, onAdd, onSelect, onOpen, onRefresh, onSettings, error }) {
  const [filter, setFilter] = usePref('lib-filter', 'all');
  const [sort, setSort] = usePref('lib-sort', 'recent');
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(null);
  const [notice, setNotice] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [localCount, setLocalCount] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    countLocalBooks().then(setLocalCount);
  }, []);

  async function migrate() {
    setNotice(null);
    const result = await migrateLocalBooks((i, total, title) => setImporting({ done: i, total, name: title }));
    setImporting(null);
    setLocalCount(result.failed.length ? localCount : 0);
    setNotice({ added: result.moved, errors: result.failed });
    onRefresh();
  }

  async function handleFiles(fileList) {
    const files = [...fileList];
    if (!files.length || importing) return;
    const seen = new Set(books.map((b) => `${b.fileName}|${b.size}`));
    const errors = [];
    let added = 0;
    setNotice(null);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setImporting({ done: i, total: files.length, name: f.name });
      const key = `${f.name}|${f.size}`;
      if (seen.has(key)) {
        errors.push(`${f.name} is already in your library`);
        continue;
      }
      try {
        const { meta, cover } = await importFile(f);
        const book = await createBook(meta, f, cover, (pct) =>
          setImporting({ done: i, total: files.length, name: f.name, pct }),
        );
        onAdd(book);
        seen.add(key);
        added++;
      } catch (err) {
        errors.push(err.message);
      }
    }
    setImporting(null);
    setNotice({ added, errors });
  }

  const counts = useMemo(() => {
    const c = { all: books.length };
    for (const s of STATUSES) c[s.id] = books.filter((b) => b.status === s.id).length;
    return c;
  }, [books]);

  const stats = useMemo(() => {
    const year = new Date().getFullYear();
    const rated = books.filter((b) => b.rating > 0);
    return {
      year,
      finishedThisYear: books.filter((b) => b.status === 'finished' && new Date(b.finishedAt).getFullYear() === year).length,
      avgRating: rated.length ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1) : null,
    };
  }, [books]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books
      .filter((b) => filter === 'all' || b.status === filter)
      .filter((b) => !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q))
      .sort(SORTS[sort]?.fn ?? SORTS.recent.fn);
  }, [books, filter, sort, query]);

  const continueReading = useMemo(
    () =>
      books
        .filter((b) => b.status === 'reading')
        .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))
        .slice(0, 3),
    [books],
  );

  const dropHandlers = {
    onDragOver: (e) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
    },
    onDrop: (e) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
  };

  return (
    <div className="library" {...dropHandlers}>
      <header className="lib-header">
        <div className="brand">
          <span className="brand-mark">📚</span>
          <h1>Bookshelf</h1>
        </div>
        <input
          className="search"
          type="search"
          placeholder="Search title or author"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn devices-btn" onClick={onSettings} title="Settings, other devices, and export">
          ⚙<span className="hide-sm"> Settings</span>
        </button>
        <button className="btn primary" onClick={() => inputRef.current.click()} disabled={!!importing}>
          + Add<span className="hide-sm"> books</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.epub,application/pdf,application/epub+zip"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </header>

      {(importing || notice) && (
        <div className={`notice${notice?.errors.length ? ' has-errors' : ''}`} role="status">
          {importing ? (
            <span>
              Adding {importing.done + 1} of {importing.total}: <em>{importing.name}</em>
              {importing.pct != null && importing.pct < 1 ? ` (uploading ${Math.round(importing.pct * 100)}%)` : '…'}
            </span>
          ) : (
            <>
              <div>
                {notice.added > 0 && `Added ${notice.added} book${notice.added > 1 ? 's' : ''}. `}
                {notice.errors.map((e) => (
                  <div key={e}>{e}</div>
                ))}
              </div>
              <button className="icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss">
                ×
              </button>
            </>
          )}
        </div>
      )}

      {error && <div className="notice has-errors">{error}</div>}

      {localCount > 0 && !importing && (
        <div className="notice">
          <span>
            {localCount} book{localCount > 1 ? 's are' : ' is'} saved only in this browser. Move{' '}
            {localCount > 1 ? 'them' : 'it'} to your shared library so your other devices can see{' '}
            {localCount > 1 ? 'them' : 'it'}.
          </span>
          <button className="btn primary" onClick={migrate}>
            Move now
          </button>
        </div>
      )}

      {books.length === 0 ? (
        <button className="empty" onClick={() => inputRef.current.click()}>
          <span className="empty-icon">📖</span>
          <strong>Your shelf is empty</strong>
          <span>Drop PDF or EPUB files anywhere on this page, or click to choose files.</span>
        </button>
      ) : (
        <main className="lib-main">
          <section className="stats">
            <Stat value={books.length} label={books.length === 1 ? 'book' : 'books'} />
            <Stat value={counts.reading} label="reading now" />
            <Stat value={stats.finishedThisYear} label={`finished in ${stats.year}`} />
            <Stat value={stats.avgRating ? `${stats.avgRating}★` : '—'} label="average rating" />
          </section>

          {filter === 'all' && !query && continueReading.length > 0 && (
            <section>
              <h2 className="section-title">Continue reading</h2>
              <div className="continue-row">
                {continueReading.map((b) => (
                  <button key={b.id} className="continue-card" onClick={() => onOpen(b)}>
                    <Cover book={b} className="cover-sm" />
                    <div className="continue-info">
                      <strong className="clamp-2">{b.title}</strong>
                      {b.author && <span className="muted">{b.author}</span>}
                      <div className="progress">
                        <div style={{ width: `${Math.round(b.progress * 100)}%` }} />
                      </div>
                      <span className="muted small">{Math.round(b.progress * 100)}% · Resume ›</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="toolbar">
            <div className="tabs" role="tablist">
              {[{ id: 'all', label: 'All' }, ...STATUSES].map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={filter === s.id}
                  className={filter === s.id ? 'active' : ''}
                  onClick={() => setFilter(s.id)}
                >
                  {s.label} <span className="count">{counts[s.id]}</span>
                </button>
              ))}
            </div>
            <label className="sort">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {Object.entries(SORTS).map(([id, s]) => (
                  <option key={id} value={id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {visible.length === 0 ? (
            <p className="muted center pad">No books match.</p>
          ) : (
            <div className="grid">
              {visible.map((b) => (
                <button key={b.id} className="book-card" onClick={() => onSelect(b)}>
                  <div className="cover-wrap">
                    <Cover book={b} />
                    <span className="badge">{b.format.toUpperCase()}</span>
                    {b.status === 'finished' && <span className="badge done">✓</span>}
                    {b.status === 'reading' && (
                      <div className="progress overlay">
                        <div style={{ width: `${Math.round(b.progress * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <strong className="clamp-2">{b.title}</strong>
                  {b.author && <span className="muted clamp-1">{b.author}</span>}
                  {b.rating > 0 && <Stars value={b.rating} size="sm" />}
                </button>
              ))}
            </div>
          )}
        </main>
      )}


      {dragging && (
        <div className="drop-overlay">
          <div>Drop to add to your shelf</div>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
