import { useEffect, useMemo, useRef, useState } from 'react';
import { createBook } from '../library';
import { importFile } from '../importBook';
import { countLocalBooks, migrateLocalBooks } from '../migrate';
import { useLongPress, usePullToRefresh } from '../native';
import { STATUSES, dayKey, formatDuration, readingStreak, usePref } from '../util';
import BookMenu from './BookMenu';
import Cover from './Cover';
import Stars from './Stars';

const SORTS = {
  recent: { label: 'Recently opened', fn: (a, b) => (b.lastOpenedAt || b.addedAt) - (a.lastOpenedAt || a.addedAt) },
  added: { label: 'Recently added', fn: (a, b) => b.addedAt - a.addedAt },
  title: { label: 'Title', fn: (a, b) => a.title.localeCompare(b.title) },
  author: { label: 'Author', fn: (a, b) => (a.author || '~').localeCompare(b.author || '~') },
  rating: { label: 'Rating', fn: (a, b) => b.rating - a.rating },
  progress: { label: 'Progress', fn: (a, b) => b.progress - a.progress },
};

export default function Library({ books, extras, allTags, actions, onAdd, onRefresh, onSettings, onSetGoal, error }) {
  const [filter, setFilter] = usePref('lib-filter', 'all');
  const [tag, setTag] = usePref('lib-tag', null);
  const [sort, setSort] = usePref('lib-sort', 'recent');
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(null);
  const [notice, setNotice] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [localCount, setLocalCount] = useState(0);
  const inputRef = useRef(null);
  const { pull, refreshing } = usePullToRefresh(onRefresh);

  useEffect(() => {
    countLocalBooks().then(setLocalCount);
  }, []);

  // A collection that no longer has any books.
  const activeTag = tag && allTags.includes(tag) ? tag : null;

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
        // New books join the collection you're looking at.
        if (activeTag) meta.tags = [activeTag];
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

  const inTag = useMemo(() => (activeTag ? books.filter((b) => b.tags.includes(activeTag)) : books), [books, activeTag]);

  const counts = useMemo(() => {
    const c = { all: inTag.length };
    for (const s of STATUSES) c[s.id] = inTag.filter((b) => b.status === s.id).length;
    return c;
  }, [inTag]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inTag
      .filter((b) => filter === 'all' || b.status === filter)
      .filter((b) => !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.tags.some((t) => t.toLowerCase().includes(q)))
      .sort(SORTS[sort]?.fn ?? SORTS.recent.fn);
  }, [inTag, filter, sort, query]);

  const continueReading = useMemo(
    () =>
      books
        .filter((b) => b.status === 'reading')
        .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))
        .slice(0, 4),
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

  const menuProps = (b) => ({
    book: b,
    onOpen: () => actions.open(b),
    onDetails: () => actions.details(b),
    onStatus: (s) => actions.status(b, s),
    onStartOver: () => actions.startOver(b),
    onCover: () => actions.cover(b),
    onDelete: () => actions.remove(b),
  });

  return (
    <div className="library" {...dropHandlers}>
      {(pull > 0 || refreshing) && (
        <div className="ptr" style={{ transform: `translateY(${refreshing ? 56 : pull * 56}px)`, opacity: refreshing ? 1 : Math.min(1, pull) }}>
          <span className={`ptr-spinner${refreshing || pull >= 1 ? ' spin' : ''}`} style={refreshing ? undefined : { transform: `rotate(${pull * 270}deg)` }} />
        </div>
      )}
      <header className="lib-header">
        <div className="brand">
          <span className="brand-mark">📚</span>
          <h1>Bookshelf</h1>
        </div>
        <input
          className="search"
          type="search"
          placeholder="Search title, author, or collection"
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
          <Stats books={books} extras={extras} onSetGoal={onSetGoal} />

          {filter === 'all' && !query && !activeTag && continueReading.length > 0 && (
            <section>
              <h2 className="section-title">Continue reading</h2>
              <div className="continue-row">
                {continueReading.map((b) => (
                  <ContinueCard key={b.id} book={b} menuProps={menuProps(b)} onOpen={() => actions.open(b)} />
                ))}
              </div>
            </section>
          )}

          {allTags.length > 0 && (
            <div className="collections" role="tablist" aria-label="Collections">
              <span className="collections-label">Collections</span>
              <button className={!activeTag ? 'active' : ''} onClick={() => setTag(null)}>
                All books
              </button>
              {allTags.map((t) => (
                <button key={t} className={activeTag === t ? 'active' : ''} onClick={() => setTag(activeTag === t ? null : t)}>
                  {t}
                </button>
              ))}
            </div>
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
                <BookCard key={b.id} book={b} menuProps={menuProps(b)} onSelect={() => actions.details(b)} />
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

// Tap for details; press and hold (or right-click) for the actions menu.
function BookCard({ book: b, menuProps, onSelect }) {
  const menu = useRef(null);
  const press = useLongPress(() => menu.current?.open());
  return (
    <div className="book-card">
      <button className="book-open" onClick={onSelect} aria-label={b.title} {...press}>
        <div className="cover-wrap">
          <Cover book={b} />
          <span className="badge">{b.format.toUpperCase()}</span>
          {b.status === 'finished' && <span className="badge done">✓</span>}
          {b.status === 'paused' && <span className="badge paused">❚❚</span>}
          {(b.status === 'reading' || b.status === 'paused') && b.progress > 0 && (
            <div className="progress overlay">
              <div style={{ width: `${Math.round(b.progress * 100)}%` }} />
            </div>
          )}
        </div>
      </button>
      <BookMenu ref={menu} {...menuProps} className="menu-btn-cover" />
      <strong className="clamp-2">{b.title}</strong>
      {b.author && <span className="muted clamp-1">{b.author}</span>}
      {b.rating > 0 && <Stars value={b.rating} size="sm" />}
    </div>
  );
}

function ContinueCard({ book: b, menuProps, onOpen }) {
  const menu = useRef(null);
  const press = useLongPress(() => menu.current?.open());
  return (
    <div className="continue-card">
      <button className="continue-main" onClick={onOpen} {...press}>
        <Cover book={b} className="cover-sm" />
        <div className="continue-info">
          <strong className="clamp-2">{b.title}</strong>
          {b.author && <span className="muted clamp-1">{b.author}</span>}
          <div className="progress">
            <div style={{ width: `${Math.round(b.progress * 100)}%` }} />
          </div>
          <span className="muted small">{Math.round(b.progress * 100)}% · Resume ›</span>
        </div>
      </button>
      <BookMenu ref={menu} {...menuProps} className="menu-btn-inline" />
    </div>
  );
}

function Stats({ books, extras, onSetGoal }) {
  const year = new Date().getFullYear();
  const finished = books.filter((b) => b.status === 'finished' && new Date(b.finishedAt).getFullYear() === year).length;
  const goal = extras.settings.goals?.[year] ?? 0;
  const activity = extras.activity ?? {};
  const streak = readingStreak(activity);

  // Last 14 days, oldest first.
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return { key: dayKey(d), secs: activity[dayKey(d)] || 0, label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) };
  });
  const week = days.slice(7).reduce((s, d) => s + d.secs, 0);
  const max = Math.max(...days.map((d) => d.secs), 1);

  return (
    <section className="stats">
      <GoalStat year={year} finished={finished} goal={goal} onSetGoal={onSetGoal} />
      <div className="stat">
        <span className="stat-value">{books.filter((b) => b.status === 'reading').length}</span>
        <span className="stat-label">reading now</span>
      </div>
      <div className="stat">
        <span className="stat-value">
          {streak}
          {streak > 0 && <span className="flame"> 🔥</span>}
        </span>
        <span className="stat-label">day streak</span>
      </div>
      <div className="stat activity">
        <span className="stat-value">{week ? formatDuration(week) : '—'}</span>
        <span className="stat-label">read this week</span>
        <div className="bars" aria-hidden="true">
          {days.map((d) => (
            <span
              key={d.key}
              title={`${d.label}: ${d.secs ? formatDuration(d.secs) : 'no reading'}`}
              style={{ height: `${Math.max(d.secs ? 12 : 4, (d.secs / max) * 100)}%` }}
              className={d.secs ? 'on' : ''}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function GoalStat({ year, finished, goal, onSetGoal }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  if (editing) {
    return (
      <form
        className="stat goal-edit"
        onSubmit={(e) => {
          e.preventDefault();
          onSetGoal(year, Math.max(0, parseInt(value, 10) || 0));
          setEditing(false);
        }}
      >
        <span className="stat-label">Books to read in {year}</span>
        <div className="row-gap nowrap">
          <input
            className="text-input"
            type="number"
            min="0"
            max="999"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <button className="btn primary" type="submit">
            Save
          </button>
        </div>
      </form>
    );
  }

  const edit = () => {
    setValue(goal ? String(goal) : '12');
    setEditing(true);
  };

  if (!goal) {
    return (
      <button className="stat stat-button" onClick={edit}>
        <span className="stat-value">{finished}</span>
        <span className="stat-label">finished in {year}</span>
        <span className="stat-link">Set a reading goal ›</span>
      </button>
    );
  }
  const pct = Math.min(100, Math.round((finished / goal) * 100));
  return (
    <button className="stat stat-button" onClick={edit} title="Change your goal">
      <span className="stat-value">
        {finished}
        <span className="stat-of"> / {goal}</span>
      </span>
      <span className="stat-label">{finished >= goal ? `${year} goal reached! 🎉` : `books toward your ${year} goal`}</span>
      <div className="progress goal-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}
