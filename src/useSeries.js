// Series: books grouped by dropping one onto another. Tags given to a series
// are kept on every book in it.
import { useRef, useState } from 'react';
import { suggestSeriesName } from './dnd';

// api: { getSeries, createSeries, updateSeries, removeFromSeries, deleteSeries }
export function useSeries({ api, books, updateBook, onError }) {
  const [series, setSeries] = useState([]);
  const [openSeriesId, setOpenSeriesId] = useState(null);
  const [naming, setNaming] = useState(null); // { bookIds, suggestion } for a new series
  const booksRef = useRef(books);
  booksRef.current = books;
  const seriesRef = useRef(series);
  seriesRef.current = series;

  const reload = () => setSeries(api.getSeries());

  const save = async (work) => {
    try {
      await work();
    } catch (err) {
      onError?.(`Couldn't save the series: ${err.message}`);
    }
    reload();
  };

  // Adds/removes tags on a book (case-insensitively), saving only if something changed.
  const applyTags = (book, add = [], remove = []) => {
    const drop = remove.map((t) => t.toLowerCase());
    const tags = book.tags.filter((t) => !drop.includes(t.toLowerCase()));
    for (const t of add) if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
    if (tags.length !== book.tags.length || tags.some((t, i) => t !== book.tags[i])) updateBook(book.id, { tags });
  };

  const addToSeries = (sr, book) => {
    if (sr.bookIds.includes(book.id)) return;
    const bookIds = [...sr.bookIds, book.id];
    setSeries((list) =>
      list
        .map((x) => (x.id === sr.id ? { ...x, bookIds } : { ...x, bookIds: x.bookIds.filter((id) => id !== book.id) }))
        .filter((x) => x.bookIds.length),
    );
    applyTags(book, sr.tags ?? []); // the series' tags go on the new book too
    save(() => api.updateSeries(sr.id, { bookIds }));
  };

  const setOrder = (sr, ids) => {
    setSeries((list) => list.map((x) => (x.id === sr.id ? { ...x, bookIds: ids } : x)));
    save(() => api.updateSeries(sr.id, { bookIds: ids }));
  };

  const reorder = (sr, movedId, targetId) => {
    const from = sr.bookIds.indexOf(movedId);
    const to = sr.bookIds.indexOf(targetId);
    const ids = sr.bookIds.filter((id) => id !== movedId);
    // Dropped on a later book: goes after it. On an earlier book: before it.
    ids.splice(ids.indexOf(targetId) + (from < to ? 1 : 0), 0, movedId);
    setOrder(sr, ids);
  };

  // One place up (-1) or down (+1).
  const move = (sr, bookId, delta) => {
    const ids = [...sr.bookIds];
    const i = ids.indexOf(bookId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(sr, ids);
  };

  // Sorts by the numbers in the titles; books without one keep their order, at the end.
  const autoOrder = (sr) => {
    const titleOf = (id) => booksRef.current.find((b) => b.id === id)?.title ?? '';
    const ranked = sr.bookIds.map((id, i) => ({ id, i, n: seriesNumber(titleOf(id)) }));
    ranked.sort((a, b) => (a.n ?? Infinity) - (b.n ?? Infinity) || a.i - b.i);
    const ids = ranked.map((r) => r.id);
    if (ids.some((id, i) => id !== sr.bookIds[i])) setOrder(sr, ids);
  };

  const setTags = (sr, tags) => {
    const old = sr.tags ?? [];
    const added = tags.filter((t) => !old.includes(t));
    const removed = old.filter((t) => !tags.includes(t));
    for (const id of sr.bookIds) {
      const book = booksRef.current.find((b) => b.id === id);
      if (book) applyTags(book, added, removed);
    }
    setSeries((list) => list.map((x) => (x.id === sr.id ? { ...x, tags } : x)));
    save(() => api.updateSeries(sr.id, { tags }));
  };

  const rename = (sr, name) => {
    setSeries((list) => list.map((x) => (x.id === sr.id ? { ...x, name } : x)));
    save(() => api.updateSeries(sr.id, { name }));
  };

  const ungroup = (sr) => {
    setOpenSeriesId(null);
    setSeries((list) => list.filter((x) => x.id !== sr.id));
    save(() => api.deleteSeries(sr.id));
  };

  const removeBook = (book) => {
    setSeries((list) => list.map((x) => ({ ...x, bookIds: x.bookIds.filter((id) => id !== book.id) })).filter((x) => x.bookIds.length));
    save(() => api.removeFromSeries(book.id));
  };

  const create = (name) => {
    const { bookIds } = naming;
    setNaming(null);
    save(async () => setOpenSeriesId(await api.createSeries(name, bookIds)));
  };

  // A book dropped onto a book or a series.
  const handleDrop = (dragged, target, context) => {
    const [kind, id] = target.split(':');
    const list = seriesRef.current;
    if (context?.seriesId) {
      // Inside an open series: reorder.
      const sr = list.find((x) => x.id === context.seriesId);
      if (kind === 'book' && sr?.bookIds.includes(id)) reorder(sr, dragged.id, id);
      return;
    }
    if (kind === 'series') {
      const sr = list.find((x) => x.id === id);
      if (sr) addToSeries(sr, dragged);
      return;
    }
    const targetBook = booksRef.current.find((b) => b.id === id);
    if (!targetBook) return;
    const existing = list.find((x) => x.bookIds.includes(id));
    if (existing) return addToSeries(existing, dragged);
    setNaming({ bookIds: [id, dragged.id], suggestion: suggestSeriesName([targetBook.title, dragged.title]) });
  };

  const open = series.find((x) => x.id === openSeriesId) ?? null;
  return {
    series,
    reload,
    open,
    openSeries: setOpenSeriesId,
    naming,
    cancelNaming: () => setNaming(null),
    create,
    rename,
    setTags,
    ungroup,
    removeBook,
    move,
    autoOrder,
    handleDrop,
  };
}

// The number of a book within its series, from its title: "Book 2", "#3",
// "Vol. 4", "Part II", "Book Three", "The Second ...", "Mistborn 2". Null if
// there isn't one. Numbers that are part of the name ("Catch-22", "Fahrenheit
// 451", "1984") still count, but only matter relative to the other books.
const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15 };

export function seriesNumber(title) {
  const t = title.toLowerCase().replace(/_+/g, ' ');
  let m = t.match(/(?:\bbook|\bbk\.?|\bvol(?:ume)?\.?|\bpart|\bpt\.?|\bno\.|\bnumber|#|\bepisode)\s*(\d+(?:\.\d+)?)/);
  if (m) return parseFloat(m[1]);
  m = t.match(/(?:\bbook|\bvol(?:ume)?\.?|\bpart|\bpt\.?)\s+([a-z]+)\b/);
  if (m && WORDS[m[1]] != null) return WORDS[m[1]];
  if (m && ROMAN[m[1]] != null) return ROMAN[m[1]];
  m = t.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/);
  if (m) return WORDS[m[1]];
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:\(|\[|:|-|$)/); // "Mistborn 2", "Saga 3: The ..."
  if (m) return parseFloat(m[1]);
  return null;
}
