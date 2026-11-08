import { useEffect, useRef, useState } from 'react';
import { haptic, useBackClose, useDragToClose } from '../native';
import { addDays, choresFor, daysBetween, describeSchedule, toDate, weekOf } from '../chores/schedule';

const SUGGESTIONS = [
  'Dishes', 'Take out trash', 'Recycling', 'Laundry', 'Vacuum', 'Mop floors', 'Clean bathroom', 'Wipe counters',
  'Change sheets', 'Water plants', 'Grocery run', 'Clean fridge', 'Dust', 'Feed pets', 'Walk dog', 'Mow lawn',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function relativeDay(key, todayKey) {
  const diff = daysBetween(todayKey, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return WEEKDAY_NAMES[toDate(key).getDay()];
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- the screen ----------

export default function Chores({ chores, onHome }) {
  const { doc, error, today, toggle, saveChore, deleteChore } = chores;
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState(null); // chore, or {} for a new one
  const [showAll, setShowAll] = useState(false);

  // Follow the date over midnight if you're looking at "today".
  const lastToday = useRef(today);
  useEffect(() => {
    if (lastToday.current !== today) setSelected((s) => (s === lastToday.current ? today : s));
    lastToday.current = today;
  }, [today]);

  // Swipe sideways to go a day forward or back.
  const swipe = useRef(null);
  const onTouchStart = (e) => {
    const t = e.touches[0];
    swipe.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || e.target.closest('input, .week-strip, .modal-backdrop')) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(t.clientY - s.y) * 2) {
      haptic(8);
      setSelected((d) => addDays(d, dx < 0 ? 1 : -1));
    }
  };

  if (!doc) return <div className="loading">Loading chores…</div>;

  const items = choresFor(doc, selected, today);
  const overdue = items.filter((i) => i.overdue && !i.done);
  const due = items
    .filter((i) => !i.overdue)
    .sort((a, b) => !!a.done - !!b.done || a.chore.name.localeCompare(b.chore.name));
  const left = due.filter((i) => !i.done).length + overdue.length;
  const hasChores = Object.keys(doc.chores).length > 0;

  const check = (item) => {
    haptic(item.done ? 8 : 15);
    toggle(item.chore.id, item.day);
  };

  return (
    <div className="chores-page" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="lib-header chores-header">
        <button className="home-btn" onClick={onHome} aria-label="Home">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Home
        </button>
        <div className="brand">
          <h1>Chores</h1>
        </div>
        <button className="btn small-btn" onClick={() => setShowAll(true)}>
          All chores
        </button>
      </header>

      <main className="chores-main">
        {error && <div className="save-error inline">{error}</div>}
        <div className="chores-date">
          <span className="field-label">{relativeDay(selected, today)}</span>
          <h2>{toDate(selected).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
          {selected !== today && (
            <button className="btn small-btn today-btn" onClick={() => setSelected(today)}>
              Back to today
            </button>
          )}
        </div>

        <WeekStrip doc={doc} selected={selected} today={today} onSelect={setSelected} />

        {overdue.length > 0 && (
          <section className="chore-section">
            <h3 className="field-label overdue-label">Missed</h3>
            <ul className="chore-list">
              {overdue.map((i) => (
                <ChoreRow key={i.chore.id + i.day} item={i} today={today} onCheck={check} onEdit={setEditing} />
              ))}
            </ul>
          </section>
        )}

        <section className="chore-section">
          {overdue.length > 0 && <h3 className="field-label">{relativeDay(selected, today)}</h3>}
          {due.length > 0 ? (
            <ul className="chore-list">
              {due.map((i) => (
                <ChoreRow key={i.chore.id + i.day} item={i} today={today} onCheck={check} onEdit={setEditing} />
              ))}
            </ul>
          ) : (
            <div className="chores-empty">
              <p>{hasChores ? 'Nothing due. Enjoy the day.' : 'No chores yet.'}</p>
              {!hasChores && (
                <button className="btn primary" onClick={() => setEditing({})}>
                  Add your first chore
                </button>
              )}
            </div>
          )}
          {due.length > 0 && left === 0 && <p className="all-done">All done{selected === today ? ' for today' : ''}.</p>}
        </section>
      </main>

      <button className="fab" onClick={() => setEditing({})} aria-label="Add a chore">
        <span aria-hidden="true">+</span> Add chore
      </button>

      {showAll && <AllChores doc={doc} onEdit={setEditing} onNew={() => setEditing({})} onClose={() => setShowAll(false)} />}
      {editing && (
        <ChoreEditor
          chore={editing}
          defaultDay={selected}
          onSave={(c) => {
            saveChore(c);
            setEditing(null);
          }}
          onDelete={
            editing.id
              ? () => {
                  if (confirm(`Delete "${editing.name}"? Its check-offs go too.`)) {
                    deleteChore(editing.id);
                    setEditing(null);
                  }
                }
              : null
          }
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function WeekStrip({ doc, selected, today, onSelect }) {
  const days = weekOf(selected);
  return (
    <div className="week-strip">
      <button className="week-nav" onClick={() => onSelect(addDays(selected, -7))} aria-label="Previous week">
        ‹
      </button>
      {days.map((d) => {
        const list = choresFor(doc, d, today).filter((i) => !i.overdue);
        const open = list.filter((i) => !i.done).length;
        const cls = ['week-day', d === selected && 'selected', d === today && 'is-today', d < today && 'past'].filter(Boolean).join(' ');
        return (
          <button key={d} className={cls} onClick={() => onSelect(d)} aria-label={toDate(d).toDateString()} aria-pressed={d === selected}>
            <span className="wd">{WEEKDAYS[toDate(d).getDay()]}</span>
            <span className="dn">{toDate(d).getDate()}</span>
            <span className="marks">
              {list.length > 0 && open === 0 ? (
                <span className="all-check">✓</span>
              ) : (
                Array.from({ length: Math.min(open, 4) }, (_, i) => <span key={i} className="mark" />)
              )}
            </span>
          </button>
        );
      })}
      <button className="week-nav" onClick={() => onSelect(addDays(selected, 7))} aria-label="Next week">
        ›
      </button>
    </div>
  );
}

function ChoreRow({ item, today, onCheck, onEdit }) {
  const { chore, done, overdue, day } = item;
  let meta;
  if (overdue && !done) {
    const ago = daysBetween(day, today);
    meta = `Was due ${ago === 1 ? 'yesterday' : ago < 7 ? WEEKDAY_NAMES[toDate(day).getDay()] : toDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  } else meta = describeSchedule(chore.schedule);
  return (
    <li className={`chore-row${done ? ' done' : ''}${overdue ? ' overdue' : ''}`}>
      <button
        className="chore-check"
        onClick={() => onCheck(item)}
        aria-pressed={!!done}
        aria-label={`${done ? 'Undo' : 'Mark done'}: ${chore.name}`}
      >
        <CheckIcon />
      </button>
      <button className="chore-body" onClick={() => onEdit(chore)}>
        <span className="chore-name">{chore.name}</span>
        <span className="chore-meta">
          {meta}
          {chore.notes ? ` · ${chore.notes}` : ''}
        </span>
      </button>
    </li>
  );
}

// ---------- sheets ----------

function Sheet({ label, className = '', onClose, children }) {
  const ref = useRef(null);
  useBackClose(onClose);
  useDragToClose(ref, onClose);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal chores-sheet ${className}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-handle" data-drag-handle />
        {children}
      </div>
    </div>
  );
}

function AllChores({ doc, onEdit, onNew, onClose }) {
  const list = Object.values(doc.chores).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Sheet label="All chores" onClose={onClose}>
      <h2>All chores</h2>
      {list.length === 0 && <p className="muted">No chores yet.</p>}
      <ul className="all-chores">
        {list.map((c) => (
          <li key={c.id}>
            <button onClick={() => onEdit(c)}>
              <span className="chore-name">{c.name}</span>
              <span className="chore-meta">
                {describeSchedule(c.schedule)}
                {c.notes ? ` · ${c.notes}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="row-gap end">
        <button className="btn primary" onClick={onNew}>
          New chore
        </button>
      </div>
    </Sheet>
  );
}

function ChoreEditor({ chore, defaultDay, onSave, onDelete, onClose }) {
  const isNew = !chore.id;
  const s0 = chore.schedule ?? { type: 'weekly', every: 1, days: [toDate(defaultDay).getDay()], start: defaultDay };
  const [name, setName] = useState(chore.name ?? '');
  const [notes, setNotes] = useState(chore.notes ?? '');
  const [type, setType] = useState(s0.type);
  const [every, setEvery] = useState(s0.every ?? 1);
  const [days, setDays] = useState(s0.days?.length ? s0.days : [toDate(s0.start).getDay()]);
  const [start, setStart] = useState(s0.start);

  const schedule = { type, every: type === 'once' ? 1 : Math.max(1, Number(every) || 1), start, ...(type === 'weekly' ? { days } : {}) };
  const unit = { daily: 'day', weekly: 'week', monthly: 'month' }[type];
  const toggleDay = (d) => setDays((list) => (list.includes(d) ? (list.length > 1 ? list.filter((x) => x !== d) : list) : [...list, d].sort()));

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !start) return;
    onSave({ id: chore.id, createdAt: chore.createdAt, name: name.trim(), notes: notes.trim(), schedule });
  };

  return (
    <Sheet label={isNew ? 'New chore' : 'Edit chore'} className="chore-editor" onClose={onClose}>
      <form onSubmit={submit}>
        <h2>{isNew ? 'New chore' : 'Edit chore'}</h2>
        <input
          className="text-input chore-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What needs doing?"
          maxLength={80}
          autoFocus={isNew && !matchMedia('(pointer: coarse)').matches}
        />
        {isNew && !name && (
          <div className="collections suggestions">
            {SUGGESTIONS.map((s) => (
              <button type="button" key={s} onClick={() => setName(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <span className="field-label">How often</span>
        <div className="seg chore-seg">
          {[
            ['once', 'Once'],
            ['daily', 'Daily'],
            ['weekly', 'Weekly'],
            ['monthly', 'Monthly'],
          ].map(([id, label]) => (
            <button type="button" key={id} className={type === id ? 'active' : ''} onClick={() => setType(id)}>
              {label}
            </button>
          ))}
        </div>
        {type !== 'once' && (
          <div className="inline-field">
            <span className="muted">Every</span>
            <div className="stepper">
              <button type="button" onClick={() => setEvery((n) => Math.max(1, n - 1))} aria-label="Fewer">
                −
              </button>
              <span>{every}</span>
              <button type="button" onClick={() => setEvery((n) => Math.min(30, n + 1))} aria-label="More">
                +
              </button>
            </div>
            <span className="muted">
              {unit}
              {every > 1 ? 's' : ''}
            </span>
          </div>
        )}
        {type === 'weekly' && (
          <div className="day-picks" role="group" aria-label="Days of the week">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                type="button"
                key={d}
                className={days.includes(d) ? 'active' : ''}
                onClick={() => toggleDay(d)}
                aria-pressed={days.includes(d)}
                aria-label={WEEKDAY_NAMES[d]}
              >
                {WEEKDAYS[d]}
              </button>
            ))}
          </div>
        )}
        <label className="inline-field">
          <span className="muted">{type === 'once' ? 'On' : 'Starting'}</span>
          <input className="text-input date-input" type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </label>
        <p className="schedule-preview">{describeSchedule(schedule)}</p>

        <span className="field-label">Notes</span>
        <input
          className="text-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional, e.g. bins go out the night before"
          maxLength={140}
        />

        <div className="row-gap designer-actions">
          {onDelete && (
            <button type="button" className="btn danger-ghost" onClick={onDelete}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>
            {isNew ? 'Add chore' : 'Save'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
