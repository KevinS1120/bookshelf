import { useEffect, useMemo, useRef, useState } from 'react';
import { haptic, useBackClose, useDragToClose } from '../native';
import { usePref } from '../util';
import { PERSON_COLORS } from '../chores/useChores';
import { addDays, choresFor, daysBetween, describeSchedule, toDate, weekOf } from '../chores/schedule';

const SUGGESTIONS = [
  'Dishes', 'Take out trash', 'Recycling', 'Laundry', 'Vacuum', 'Mop floors', 'Clean bathroom', 'Wipe counters',
  'Change sheets', 'Water plants', 'Grocery run', 'Clean fridge', 'Dust', 'Feed pets', 'Walk dog', 'Mow lawn',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const person = (people, id) => people.find((p) => p.id === id);
const whoLabel = (chore, people) =>
  chore.assign === 'anyone' ? 'Anyone' : chore.assign === 'turns' ? 'Take turns' : person(people, chore.assign)?.name ?? '';

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

function TurnsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="turns-icon">
      <path
        d="M4 9h13l-3-3M20 15H7l3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Avatar({ p, size = 26 }) {
  if (!p) return <span className="avatar anyone" style={{ width: size, height: size }}>✶</span>;
  return (
    <span className="avatar" style={{ background: p.color, width: size, height: size }} title={p.name}>
      {p.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

// ---------- the screen ----------

export default function Chores({ chores, accountName, onHome }) {
  const { doc, error, today, toggle, saveChore, deleteChore, setPeople } = chores;
  const [me, setMe] = usePref('chores:me', null);
  const [filter, setFilter] = usePref('chores:filter', 'all');
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState(null); // chore, or {} for a new one
  const [showAll, setShowAll] = useState(false);
  const [showPeople, setShowPeople] = useState(false);

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
    if (!s || e.target.closest('input, .week-strip')) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(t.clientY - s.y) * 2) {
      haptic(8);
      setSelected((d) => addDays(d, dx < 0 ? 1 : -1));
    }
  };

  if (!doc) return <div className="loading">Loading chores…</div>;

  const people = doc.people;
  if (people.length < 2) {
    return (
      <div className="chores-page">
        <ChoresHeader onHome={onHome} />
        <main className="chores-main">
          <PeopleForm
            people={people}
            accountName={accountName}
            me={me}
            first
            onSave={(list, mine) => {
              setPeople(list);
              setMe(mine);
            }}
          />
        </main>
      </div>
    );
  }

  const matches = (who) => filter === 'all' || who === filter || who === 'anyone';
  const items = choresFor(doc, selected, today).filter((i) => matches(i.who));
  const overdue = items.filter((i) => i.overdue && !i.done);
  const due = items
    .filter((i) => !i.overdue)
    .sort((a, b) => !!a.done - !!b.done || a.chore.name.localeCompare(b.chore.name));
  const left = due.filter((i) => !i.done).length + overdue.length;

  const check = (item) => {
    haptic(item.done ? 8 : 15);
    const by = me && person(people, me) ? me : item.who !== 'anyone' ? item.who : people[0].id;
    toggle(item.chore.id, item.day, by);
  };

  // Done this week, per person (Monday to Sunday).
  const week = weekOf(today);
  const score = Object.fromEntries(people.map((p) => [p.id, 0]));
  for (const [k, v] of Object.entries(doc.done)) {
    const d = k.split('|')[1];
    if (d >= week[0] && d <= week[6] && v.by in score) score[v.by]++;
  }
  const anyScore = Object.values(score).some(Boolean);

  return (
    <div className="chores-page" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <ChoresHeader onHome={onHome}>
        <button className="btn small-btn" onClick={() => setShowAll(true)}>
          All chores
        </button>
      </ChoresHeader>

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

        <WeekStrip doc={doc} selected={selected} today={today} matches={matches} onSelect={setSelected} />

        <div className="seg who-filter" role="tablist" aria-label="Whose chores">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            Everyone
          </button>
          {people.map((p) => (
            <button key={p.id} className={filter === p.id ? 'active' : ''} onClick={() => setFilter(p.id)}>
              <span className="dot" style={{ background: p.color }} />
              {p.name}
            </button>
          ))}
        </div>

        {overdue.length > 0 && (
          <section className="chore-section">
            <h3 className="field-label overdue-label">Missed</h3>
            <ul className="chore-list">
              {overdue.map((i) => (
                <ChoreRow key={i.chore.id + i.day} item={i} people={people} today={today} onCheck={check} onEdit={setEditing} />
              ))}
            </ul>
          </section>
        )}

        <section className="chore-section">
          {overdue.length > 0 && <h3 className="field-label">{relativeDay(selected, today)}</h3>}
          {due.length > 0 ? (
            <ul className="chore-list">
              {due.map((i) => (
                <ChoreRow key={i.chore.id + i.day} item={i} people={people} today={today} onCheck={check} onEdit={setEditing} />
              ))}
            </ul>
          ) : (
            <div className="chores-empty">
              <p>{Object.keys(doc.chores).length ? 'Nothing due. Enjoy the day.' : 'No chores yet.'}</p>
              {!Object.keys(doc.chores).length && (
                <button className="btn primary" onClick={() => setEditing({})}>
                  Add your first chore
                </button>
              )}
            </div>
          )}
          {due.length > 0 && left === 0 && <p className="all-done">All done for {relativeDay(selected, today).toLowerCase() === 'today' ? 'today' : 'the day'}.</p>}
        </section>

        {anyScore && (
          <p className="chore-score">
            <span className="field-label">This week</span>
            {people.map((p) => (
              <span key={p.id} className="score-person">
                <span className="dot" style={{ background: p.color }} />
                {p.name} <b>{score[p.id]}</b>
              </span>
            ))}
          </p>
        )}
      </main>

      <button className="fab" onClick={() => setEditing({})} aria-label="Add a chore">
        <span aria-hidden="true">+</span> Add chore
      </button>

      {showAll && (
        <AllChores
          doc={doc}
          onEdit={(c) => setEditing(c)}
          onNew={() => setEditing({})}
          onPeople={() => setShowPeople(true)}
          onClose={() => setShowAll(false)}
        />
      )}
      {editing && (
        <ChoreEditor
          chore={editing}
          people={people}
          defaultDay={selected}
          onSave={(c) => {
            saveChore(c);
            setEditing(null);
          }}
          onDelete={
            editing.id
              ? () => {
                  if (confirm(`Delete "${editing.name}"? Its history goes too.`)) {
                    deleteChore(editing.id);
                    setEditing(null);
                  }
                }
              : null
          }
          onClose={() => setEditing(null)}
        />
      )}
      {showPeople && (
        <Sheet label="People" onClose={() => setShowPeople(false)}>
          <PeopleForm
            people={people}
            accountName={accountName}
            me={me}
            onSave={(list, mine) => {
              setPeople(list);
              setMe(mine);
              setShowPeople(false);
            }}
            onCancel={() => setShowPeople(false)}
          />
        </Sheet>
      )}
    </div>
  );
}

function ChoresHeader({ onHome, children }) {
  return (
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
      {children}
    </header>
  );
}

function WeekStrip({ doc, selected, today, matches, onSelect }) {
  const days = weekOf(selected);
  return (
    <div className="week-strip">
      <button className="week-nav" onClick={() => onSelect(addDays(selected, -7))} aria-label="Previous week">
        ‹
      </button>
      {days.map((d) => {
        const list = choresFor(doc, d, today).filter((i) => !i.overdue && matches(i.who));
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

function ChoreRow({ item, people, today, onCheck, onEdit }) {
  const { chore, done, overdue, who, day } = item;
  const p = person(people, who);
  const doneBy = done && person(people, done.by);
  let meta;
  if (done) meta = doneBy ? `Done by ${doneBy.name}` : 'Done';
  else if (overdue) {
    const ago = daysBetween(day, today);
    meta = `Was due ${ago === 1 ? 'yesterday' : ago < 7 ? WEEKDAY_NAMES[toDate(day).getDay()] : toDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  } else meta = describeSchedule(chore.schedule);
  return (
    <li className={`chore-row${done ? ' done' : ''}${overdue ? ' overdue' : ''}`}>
      <button
        className="chore-check"
        style={{ '--who': p?.color ?? 'var(--accent)' }}
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
          {chore.notes && !done ? ` · ${chore.notes}` : ''}
        </span>
      </button>
      <span className="chore-who" title={p ? p.name : 'Anyone'}>
        {chore.assign === 'turns' && <TurnsIcon />}
        <Avatar p={p} />
      </span>
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

function AllChores({ doc, onEdit, onNew, onPeople, onClose }) {
  const list = Object.values(doc.chores).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Sheet label="All chores" onClose={onClose}>
      <h2>All chores</h2>
      {list.length === 0 && <p className="muted">No chores yet.</p>}
      <ul className="all-chores">
        {list.map((c) => {
          const p = person(doc.people, c.assign);
          return (
            <li key={c.id}>
              <button onClick={() => onEdit(c)}>
                <span className="chore-name">{c.name}</span>
                <span className="chore-meta">{describeSchedule(c.schedule)}</span>
                <span className="chore-who">
                  {c.assign === 'turns' && <TurnsIcon />}
                  {p ? <Avatar p={p} size={22} /> : <span className="muted small">{whoLabel(c, doc.people)}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="row-gap">
        <button className="btn ghost" onClick={onPeople}>
          People
        </button>
        <span className="spacer" />
        <button className="btn primary" onClick={onNew}>
          New chore
        </button>
      </div>
    </Sheet>
  );
}

function ChoreEditor({ chore, people, defaultDay, onSave, onDelete, onClose }) {
  const isNew = !chore.id;
  const s0 = chore.schedule ?? { type: 'weekly', every: 1, days: [toDate(defaultDay).getDay()], start: defaultDay };
  const [name, setName] = useState(chore.name ?? '');
  const [notes, setNotes] = useState(chore.notes ?? '');
  const [assign, setAssign] = useState(chore.assign ?? 'turns');
  const [turnStart, setTurnStart] = useState(chore.turnStart ?? people[0].id);
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
    onSave({
      ...chore,
      name: name.trim(),
      notes: notes.trim(),
      assign,
      ...(assign === 'turns' ? { turnStart } : { turnStart: undefined }),
      schedule,
    });
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

        <span className="field-label">Who</span>
        <div className="seg chore-seg">
          {people.map((p) => (
            <button type="button" key={p.id} className={assign === p.id ? 'active' : ''} onClick={() => setAssign(p.id)}>
              <span className="dot" style={{ background: p.color }} />
              {p.name}
            </button>
          ))}
          <button type="button" className={assign === 'turns' ? 'active' : ''} onClick={() => setAssign('turns')}>
            Take turns
          </button>
          <button type="button" className={assign === 'anyone' ? 'active' : ''} onClick={() => setAssign('anyone')}>
            Anyone
          </button>
        </div>
        {assign === 'turns' && (
          <div className="inline-field">
            <span className="muted">Goes first</span>
            <div className="seg chore-seg small">
              {people.map((p) => (
                <button type="button" key={p.id} className={turnStart === p.id ? 'active' : ''} onClick={() => setTurnStart(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
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
              <button type="button" key={d} className={days.includes(d) ? 'active' : ''} onClick={() => toggleDay(d)} aria-pressed={days.includes(d)} aria-label={WEEKDAY_NAMES[d]}>
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
        <input className="text-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, e.g. bins go out the night before" maxLength={140} />

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

function PeopleForm({ people, accountName, me, first, onSave, onCancel }) {
  const firstName = (accountName ?? '').split(/\s+/)[0];
  const [list, setList] = useState(() =>
    [0, 1].map((i) => people[i] ?? { id: `p${i + 1}`, name: i === 0 ? firstName : '', color: PERSON_COLORS[i] }),
  );
  const [mine, setMine] = useState(me ?? (first ? 'p1' : null));
  const edit = (i, patch) => setList((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const ok = list.every((p) => p.name.trim());

  return (
    <form
      className="people-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSave(list.map((p) => ({ ...p, name: p.name.trim() })), mine);
      }}
    >
      {first ? (
        <>
          <h2>Who's doing chores?</h2>
          <p className="muted">Two people share the list. You can change names and colors later.</p>
        </>
      ) : (
        <h2>People</h2>
      )}
      {list.map((p, i) => (
        <div key={p.id} className="person-edit">
          <Avatar p={{ ...p, name: p.name || '?' }} size={40} />
          <div className="person-fields">
            <input
              className="text-input"
              value={p.name}
              onChange={(e) => edit(i, { name: e.target.value })}
              placeholder={i === 0 ? 'Your name' : 'Their name'}
              maxLength={24}
            />
            <div className="person-colors">
              {PERSON_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`text-color${p.color === c ? ' active' : ''}`}
                  style={{ background: c }}
                  onClick={() => edit(i, { color: c })}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
      <span className="field-label">On this device, I'm</span>
      <div className="seg chore-seg">
        {list.map((p) => (
          <button type="button" key={p.id} className={mine === p.id ? 'active' : ''} onClick={() => setMine(p.id)} disabled={!p.name.trim()}>
            {p.name.trim() || '…'}
          </button>
        ))}
      </div>
      <p className="muted small">Chores you check off on this device are counted for you.</p>
      <div className="row-gap end">
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn primary" disabled={!ok}>
          {first ? 'Start' : 'Save'}
        </button>
      </div>
    </form>
  );
}
