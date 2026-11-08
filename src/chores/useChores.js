// Chores, kept in Bookshelf/_home/chores.json so every device (and both people) see the same list.
import { useCallback, useEffect, useRef, useState } from 'react';
import { jsonStore } from '../store';
import { uid } from '../util';
import { daysBetween, doneKey, today } from './schedule';

// doc: { version, people: [{ id, name, color }], chores: { [id]: chore }, done: { 'choreId|day': { by, at } } }
const emptyDoc = () => ({ version: 1, people: [], chores: {}, done: {} });
const store = jsonStore('_home/chores.json', emptyDoc);

export const PERSON_COLORS = ['#c8a15a', '#7fa99b', '#b9727a', '#8e9ccc', '#c98a5a', '#a58fc0'];

export function useChores() {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState(today); // today's key; changes at midnight
  const pending = useRef(0);

  const refresh = useCallback(async () => {
    setDay(today());
    if (pending.current) return; // don't undo changes still being saved
    try {
      const latest = await store.read();
      if (!pending.current) setDoc(latest);
      setError('');
    } catch (err) {
      setError(`Couldn't load chores: ${err.message}`);
      setDoc((d) => d ?? emptyDoc());
    }
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => document.visibilityState === 'visible' && refresh(), 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [refresh]);

  // Shows the change right away, then saves it (re-applied onto the latest copy if needed).
  const change = useCallback((mutate) => {
    setDoc((d) => {
      const next = structuredClone(d);
      mutate(next);
      return next;
    });
    pending.current++;
    store.update(mutate).then(
      () => {
        if (--pending.current === 0) setDoc(store.current());
        setError('');
      },
      (err) => {
        pending.current--;
        setError(`Changes aren't being saved: ${err.message}`);
      },
    );
  }, []);

  const toggle = useCallback(
    (choreId, onDay, by) =>
      change((d) => {
        const k = doneKey(choreId, onDay);
        if (d.done[k]) delete d.done[k];
        else d.done[k] = { by, at: Date.now() };
      }),
    [change],
  );

  const saveChore = useCallback(
    (chore) => {
      const c = { ...chore, id: chore.id ?? uid(), createdAt: chore.createdAt ?? Date.now() };
      change((d) => {
        d.chores[c.id] = c;
      });
      return c;
    },
    [change],
  );

  const deleteChore = useCallback(
    (id) =>
      change((d) => {
        delete d.chores[id];
        for (const k of Object.keys(d.done)) if (k.startsWith(`${id}|`)) delete d.done[k];
      }),
    [change],
  );

  const setPeople = useCallback(
    (people) =>
      change((d) => {
        d.people = people;
        // Old check-offs (over a year) aren't needed any more.
        for (const k of Object.keys(d.done)) if (daysBetween(k.split('|')[1], today()) > 400) delete d.done[k];
      }),
    [change],
  );

  return { doc, error, today: day, refresh, toggle, saveChore, deleteChore, setPeople };
}
