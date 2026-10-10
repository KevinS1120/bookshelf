import { useEffect, useState } from 'react';

export const STATUSES = [
  { id: 'to-read', label: 'To read' },
  { id: 'reading', label: 'Reading' },
  { id: 'paused', label: 'On hold' },
  { id: 'finished', label: 'Finished' },
  { id: 'dnf', label: 'Did not finish' },
];

export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label ?? id;

// A small per-browser preference stored in localStorage.
export function usePref(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(`pref:${key}`);
      return raw == null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`pref:${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }, [key, value]);
  return [value, setValue];
}

export function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(ts) {
  return ts ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
}

export function toDateInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateInput(value) {
  return value ? new Date(`${value}T12:00:00`).getTime() : null;
}

export function hueFor(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

// crypto.randomUUID only exists on https/localhost, and phones reach the app over plain http.
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Fields to save when a book's status changes (keeps dates sensible).
export function statusPatch(book, status) {
  const now = Date.now();
  const patch = { status };
  if (status === 'reading' && !book.startedAt) patch.startedAt = now;
  if (status === 'finished') {
    patch.finishedAt = book.finishedAt || now;
    patch.startedAt = book.startedAt || now;
  }
  if (status === 'to-read') patch.finishedAt = null;
  return patch;
}

export const dayKey = (ts = Date.now()) => toDateInput(ts);

export function formatDuration(seconds) {
  if (seconds < 60) return '<1m';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

// Consecutive days with some reading, ending today (or yesterday, if not yet today).
export function readingStreak(activity) {
  const day = new Date();
  if (!(activity[dayKey(day)] >= 60)) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (activity[dayKey(day)] >= 60) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}
