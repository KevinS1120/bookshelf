// Chore schedules: what's due each day. Days are local 'YYYY-MM-DD' keys.
//
// chore: {
//   id, name, notes,
//   schedule: { type: 'once' | 'daily' | 'weekly' | 'monthly', every: n, days: [0-6] (weekly), start: day },
//   createdAt,
// }

import { dayKey } from '../util';

export const toDate = (key) => new Date(`${key}T12:00:00`); // noon: safe across DST changes
export const addDays = (key, n) => {
  const d = toDate(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86_400_000);
export const today = () => dayKey();

const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const weekStart = (key) => addDays(key, -toDate(key).getDay()); // the Sunday on or before

export function occursOn(s, key) {
  if (!s || key < s.start) return false;
  const every = Math.max(1, s.every || 1);
  switch (s.type) {
    case 'once':
      return key === s.start;
    case 'daily':
      return daysBetween(s.start, key) % every === 0;
    case 'weekly': {
      const days = s.days?.length ? s.days : [toDate(s.start).getDay()];
      if (!days.includes(toDate(key).getDay())) return false;
      return (daysBetween(weekStart(s.start), weekStart(key)) / 7) % every === 0;
    }
    case 'monthly': {
      const a = toDate(s.start);
      const b = toDate(key);
      const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
      if (months % every !== 0) return false;
      // The 31st becomes the last day in shorter months.
      return b.getDate() === Math.min(a.getDate(), daysInMonth(b.getFullYear(), b.getMonth()));
    }
    default:
      return false;
  }
}

// The last time it came up before `key`, looking back at most a year.
export function previousOccurrence(s, key) {
  for (let k = addDays(key, -1), i = 0; k >= s.start && i < 400; k = addDays(k, -1), i++) {
    if (occursOn(s, k)) return k;
  }
  return null;
}

export const doneKey = (choreId, key) => `${choreId}|${key}`;

// The chores for a day. On today, missed ones still waiting are included as overdue
// (until they're done or come up again).
export function choresFor(doc, key, now = today()) {
  const list = [];
  for (const chore of Object.values(doc.chores)) {
    const s = chore.schedule;
    if (occursOn(s, key)) {
      list.push({ chore, day: key, overdue: false });
    } else if (key === now) {
      const prev = previousOccurrence(s, key);
      if (prev && !doc.done[doneKey(chore.id, prev)]) list.push({ chore, day: prev, overdue: true });
    }
  }
  return list.map((item) => ({ ...item, done: doc.done[doneKey(item.chore.id, item.day)] ?? null }));
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

export function describeSchedule(s) {
  const every = Math.max(1, s.every || 1);
  switch (s.type) {
    case 'once':
      return `Once, ${toDate(s.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
    case 'daily':
      return every === 1 ? 'Every day' : `Every ${every} days`;
    case 'weekly': {
      const days = (s.days?.length ? s.days : [toDate(s.start).getDay()]).slice().sort();
      const names = days.length === 7 ? 'every day' : days.map((d) => DAY_NAMES[d]).join(', ');
      return every === 1 ? `Weekly · ${names}` : `Every ${every} weeks · ${names}`;
    }
    case 'monthly': {
      const day = ordinal(toDate(s.start).getDate());
      return every === 1 ? `Monthly on the ${day}` : `Every ${every} months on the ${day}`;
    }
    default:
      return '';
  }
}

// Monday-first week containing `key`.
export function weekOf(key) {
  const offset = (toDate(key).getDay() + 6) % 7;
  const monday = addDays(key, -offset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
