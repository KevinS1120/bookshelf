import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initAuth, isConfigured, signOut } from './auth';
import { newerVersionAvailable } from './native';
import { statusPatch } from './util';
import * as library from './library';
import Library from './components/Library';
import BookDetails from './components/BookDetails';
import Reader from './components/Reader';
import CoverDialog from './components/CoverDialog';
import SettingsDialog from './components/SettingsDialog';
import Welcome from './components/Welcome';

export default function App() {
  const [state, setState] = useState(isConfigured ? { status: 'loading' } : { status: 'signed-out' });

  useEffect(() => {
    if (!isConfigured) return;
    (async () => {
      let account;
      try {
        account = await initAuth();
      } catch (err) {
        return setState({ status: 'signed-out', error: err.message });
      }
      if (!account) return setState({ status: 'signed-out' });
      setState({ status: 'connecting', account });
      try {
        const folder = await library.connect();
        setState({ status: 'ready', account, folder });
      } catch (err) {
        setState({ status: 'error', account, error: `Couldn't open your OneDrive: ${err.message}` });
      }
    })();
  }, []);

  if (state.status === 'loading') return <div className="loading">Signing in…</div>;
  if (state.status === 'signed-out') return <Welcome error={state.error} />;
  if (state.status === 'connecting') return <Welcome busy="Opening your Bookshelf folder in OneDrive…" />;
  if (state.status === 'error') return <Welcome error={state.error} canSignOut />;
  return <Bookshelf account={state.account} folder={state.folder} />;
}

function Bookshelf({ account, folder }) {
  const [books, setBooks] = useState(null);
  const [extras, setExtras] = useState({ settings: {}, activity: {} });
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [readingId, setReadingId] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [coverId, setCoverId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const readingRef = useRef(null);
  readingRef.current = readingId;

  const refresh = useCallback(async () => {
    try {
      setBooks(await library.listBooks());
      setExtras(library.getExtras());
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
      setBooks((b) => b ?? []);
    }
  }, []);

  // Pick up changes made on other devices whenever this one comes back into view,
  // and every so often while the library is open. Also reload into a newer
  // version of the app if one has been published (home-screen apps hang on to old ones).
  useEffect(() => {
    refresh();
    const idle = () => document.visibilityState === 'visible' && !readingRef.current;
    const checkForUpdate = async () => {
      if (idle() && (await newerVersionAvailable()) && idle()) window.location.reload();
    };
    checkForUpdate();
    const onVisible = () => {
      if (!idle()) return;
      refresh();
      checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => idle() && refresh(), 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [refresh]);

  // Updates the screen immediately, then saves to OneDrive (batched when `delay` is set).
  // remote: false only updates the screen.
  const updateBook = useCallback((id, patch, { delay = 0, remote = true } = {}) => {
    setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    if (!remote) return Promise.resolve(null);
    return library.saveBook(id, patch, delay).then(
      (saved) => {
        setSaveError('');
        return saved;
      },
      (err) => {
        setSaveError(`Changes aren't being saved: ${err.message}`);
        return null;
      },
    );
  }, []);

  const addBook = useCallback((book) => setBooks((prev) => [...prev.filter((b) => b.id !== book.id), book]), []);

  const removeBook = useCallback(async (id) => {
    try {
      await library.deleteBook(id);
      setBooks((prev) => prev.filter((b) => b.id !== id));
      setDetailsId(null);
    } catch (err) {
      alert(err.message);
    }
  }, []);

  const openBook = useCallback(
    async (book) => {
      // Fetch the latest copy so we resume where any device left off.
      let latest = book;
      try {
        latest = await library.getBook(book.id);
      } catch {
        /* fall back to what we have */
      }
      const patch = { lastOpenedAt: Date.now() };
      if (latest.status === 'to-read' || latest.status === 'paused') {
        Object.assign(patch, statusPatch(latest, 'reading'));
      }
      setBooks((prev) => prev.map((b) => (b.id === book.id ? { ...latest, ...patch } : b)));
      updateBook(book.id, patch);
      setDetailsId(null);
      setReadingId(book.id);
    },
    [updateBook],
  );

  const closeReader = useCallback(() => {
    library.flushAll();
    setReadingId(null);
    refresh();
  }, [refresh]);

  // Quick actions from a book's ⋯ menu.
  const actions = useMemo(
    () => ({
      open: openBook,
      details: (book) => setDetailsId(book.id),
      status: (book, status) => updateBook(book.id, statusPatch(book, status)),
      startOver: (book) => updateBook(book.id, { progress: 0, location: null }),
      cover: (book) => setCoverId(book.id),
      remove: (book) => confirm(`Remove "${book.title}" from your library? It goes to your OneDrive recycle bin.`) && removeBook(book.id),
    }),
    [openBook, updateBook, removeBook],
  );

  const allTags = useMemo(
    () => [...new Set((books ?? []).flatMap((b) => b.tags))].sort((a, b) => a.localeCompare(b)),
    [books],
  );

  const setGoal = useCallback(async (year, count) => {
    setExtras((x) => ({ ...x, settings: { ...x.settings, goals: { ...x.settings.goals, [year]: count || undefined } } }));
    try {
      setExtras(await library.setGoal(year, count));
    } catch (err) {
      setSaveError(`Couldn't save your goal: ${err.message}`);
    }
  }, []);

  if (!books) return <div className="loading">Loading your library…</div>;

  const reading = books.find((b) => b.id === readingId);
  if (reading) {
    return (
      <>
        <Reader key={reading.id} book={reading} onUpdate={updateBook} onClose={closeReader} />
        {saveError && <div className="save-error">{saveError}</div>}
      </>
    );
  }

  const selected = books.find((b) => b.id === detailsId);
  const coverBook = books.find((b) => b.id === coverId);
  return (
    <>
      <Library
        books={books}
        extras={extras}
        allTags={allTags}
        actions={actions}
        onAdd={addBook}
        onRefresh={refresh}
        onSettings={() => setShowSettings(true)}
        onSetGoal={setGoal}
        error={loadError || saveError}
      />
      {selected && (
        <BookDetails
          book={selected}
          allTags={allTags}
          onUpdate={updateBook}
          onOpen={openBook}
          onCover={() => setCoverId(selected.id)}
          onDelete={removeBook}
          onClose={() => setDetailsId(null)}
        />
      )}
      {coverBook && (
        <CoverDialog
          book={coverBook}
          onSave={(patch) => updateBook(coverBook.id, patch)}
          onClose={() => setCoverId(null)}
        />
      )}
      {showSettings && (
        <SettingsDialog
          account={account}
          folder={folder}
          books={books}
          onSignOut={signOut}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}
