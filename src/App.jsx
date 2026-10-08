import { useCallback, useEffect, useRef, useState } from 'react';
import { initAuth, isConfigured, signOut } from './auth';
import * as library from './library';
import Library from './components/Library';
import BookDetails from './components/BookDetails';
import Reader from './components/Reader';
import SettingsDialog from './components/SettingsDialog';
import Setup from './components/Setup';
import Welcome from './components/Welcome';

// A link from another device (Settings → Other devices) carries the library location.
function takeLibraryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('library');
  if (!raw) return;
  try {
    const loc = JSON.parse(raw);
    if (loc?.driveId && loc?.folderId) library.useLocation(loc);
  } catch {
    /* ignore a mangled link */
  }
  params.delete('library');
  const rest = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
}
takeLibraryFromUrl();

export default function App() {
  const [auth, setAuth] = useState(isConfigured ? { status: 'loading' } : { status: 'signed-out' });
  const [location, setLocation] = useState(() => {
    const loc = library.savedLocation();
    library.useLocation(loc);
    return loc;
  });

  useEffect(() => {
    if (!isConfigured) return;
    initAuth().then(
      (account) => setAuth(account ? { status: 'ready', account } : { status: 'signed-out' }),
      (err) => setAuth({ status: 'signed-out', error: err.message }),
    );
  }, []);

  const chooseLocation = useCallback((loc) => {
    library.useLocation(loc);
    setLocation(loc);
  }, []);

  if (auth.status === 'loading') return <div className="loading">Signing in…</div>;
  if (auth.status === 'signed-out') return <Welcome error={auth.error} />;
  if (!location) return <Setup account={auth.account} onDone={chooseLocation} onSignOut={signOut} />;
  return <Bookshelf key={location.folderId} account={auth.account} location={location} onChangeLibrary={() => chooseLocation(null)} />;
}

function Bookshelf({ account, location, onChangeLibrary }) {
  const [books, setBooks] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [readingId, setReadingId] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const readingRef = useRef(null);
  readingRef.current = readingId;

  const refresh = useCallback(async () => {
    try {
      setBooks(await library.listBooks());
      setLoadError('');
    } catch (err) {
      setLoadError(err.status === 404 ? "This library can't be found anymore. Choose it again in Settings." : err.message);
      setBooks((b) => b ?? []);
    }
  }, []);

  // Pick up changes made on other devices whenever this one comes back into view,
  // and every so often while the library is open.
  useEffect(() => {
    refresh();
    const idle = () => document.visibilityState === 'visible' && !readingRef.current;
    const onVisible = () => idle() && refresh();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => idle() && refresh(), 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [refresh]);

  // Updates the screen immediately, then saves to SharePoint (batched when `delay` is set).
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
      if (latest.status === 'to-read') {
        patch.status = 'reading';
        patch.startedAt = latest.startedAt || Date.now();
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
  return (
    <>
      <Library
        books={books}
        onAdd={addBook}
        onSelect={(b) => setDetailsId(b.id)}
        onOpen={openBook}
        onRefresh={refresh}
        onSettings={() => setShowSettings(true)}
        error={loadError || saveError}
      />
      {selected && (
        <BookDetails
          book={selected}
          onUpdate={updateBook}
          onOpen={openBook}
          onDelete={removeBook}
          onClose={() => setDetailsId(null)}
        />
      )}
      {showSettings && (
        <SettingsDialog
          account={account}
          location={location}
          books={books}
          onSignOut={signOut}
          onChangeLibrary={onChangeLibrary}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}
