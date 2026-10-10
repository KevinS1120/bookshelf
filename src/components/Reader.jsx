import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as library from '../library';
import { useBackClose, useGestureDebug, useWakeLock } from '../native';
import { chromeVars, useReaderSettings } from '../settings';
import { dayKey, uid } from '../util';
import EpubReader from './EpubReader';
import PdfReader from './PdfReader';
import ReaderSettings from './ReaderSettings';
import SidePanel from './SidePanel';
import Stars from './Stars';
import { BookmarkIcon, ChevronLeft, ChevronRight, ListIcon, TextIcon } from './icons';

export default function Reader({ book, onUpdate, onClose }) {
  const [settings, updateSettings, resetSettings] = useReaderSettings();
  const viewRef = useRef(null);
  const [initialLocation] = useState(book.location);
  const [pos, setPos] = useState(null); // { location, progress, label, tocIndex }
  const posRef = useRef(null);
  const [toc, setToc] = useState([]);
  const [panel, setPanel] = useState(null); // 'contents' | 'bookmarks' | 'settings'
  const [chrome, setChrome] = useState(true);
  const [error, setError] = useState('');
  const [canScrub, setCanScrub] = useState(false);
  const [scrub, setScrub] = useState(null);
  const scrubTimer = useRef(null);
  const [remote, setRemote] = useState(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  // When the server last recorded a position we know about; anything newer came from another device.
  const lastSeenRef = useRef(book.progressUpdatedAt || 0);
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;
  const { id } = book;
  const bookmarks = book.bookmarks ?? [];

  // Reading time: the time between page turns counts, up to 5 minutes per page,
  // so a book left open on the table doesn't rack up hours.
  const lastActiveRef = useRef(Date.now());
  const creditTime = useCallback(() => {
    const now = Date.now();
    const secs = Math.min(now - lastActiveRef.current, 5 * 60_000) / 1000;
    lastActiveRef.current = now;
    library.addReadingTime(dayKey(now), secs);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') creditTime();
      else lastActiveRef.current = Date.now(); // time away doesn't count
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (document.visibilityState === 'visible') creditTime();
    };
  }, [creditTime]);

  const handleRelocate = useCallback(
    (p) => {
      if (posRef.current) creditTime(); // skip the initial position when the book opens
      posRef.current = p;
      setPos(p);
      const patch = p.progress == null ? { location: p.location } : { location: p.location, progress: p.progress };
      updateRef.current(id, patch, { delay: 1500 }).then((saved) => {
        if (saved?.progressUpdatedAt) lastSeenRef.current = Math.max(lastSeenRef.current, saved.progressUpdatedAt);
      });
    },
    [id, creditTime],
  );

  // Coming back to this tab (e.g. after reading on another device): check for a newer position.
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const fresh = await library.getBook(id);
        const { bookmarks, rating, status, finishedAt } = fresh;
        updateRef.current(id, { bookmarks, rating, status, finishedAt }, { remote: false });
        const here = posRef.current?.location;
        if ((fresh.progressUpdatedAt || 0) > lastSeenRef.current && fresh.location != null && String(fresh.location) !== String(here)) {
          setRemote(fresh);
        }
      } catch {
        /* offline; try again next time */
      }
    };
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [id]);

  const panelRef = useRef(panel);
  panelRef.current = panel;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Left third: back, right third: forward, middle: show/hide the toolbars.
  const handleTap = useCallback(
    (frac) => {
      if (panelRef.current) return setPanel(null);
      if (book.format === 'epub' && settingsRef.current.layout === 'scroll') return setChrome((c) => !c);
      if (frac < 0.3) viewRef.current?.prev();
      else if (frac > 0.7) viewRef.current?.next();
      else setChrome((c) => !c);
    },
    [book.format],
  );

  // Back button/gesture closes an open panel first, then the book.
  useBackClose(onClose);
  useBackClose(() => setPanel(null), !!panel);
  useWakeLock();
  const debugLines = useGestureDebug();

  const handleZoom = useCallback((pdfZoom) => updateSettings({ pdfZoom }), [updateSettings]);

  const handleKey = useCallback((e) => {
    if (e.target?.closest?.('input, textarea, select')) return;
    if (e.key === 'Escape') return panelRef.current && setPanel(null);
    if (e.key === 'ArrowRight' || e.key === 'PageDown') viewRef.current?.next();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') viewRef.current?.prev();
    else return;
    e.preventDefault();
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const currentBookmark = useMemo(
    () => (pos ? bookmarks.find((b) => viewRef.current?.contains(b.location)) : null),
    [pos, bookmarks],
  );

  async function toggleBookmark() {
    if (!pos) return;
    if (currentBookmark) {
      onUpdate(id, { bookmarks: bookmarks.filter((b) => b.id !== currentBookmark.id) });
      return;
    }
    const excerpt = await viewRef.current?.excerpt();
    const bm = { id: uid(), location: pos.location, progress: pos.progress, label: pos.label, excerpt, createdAt: Date.now() };
    onUpdate(id, { bookmarks: [...bookmarks, bm] });
  }

  function markFinished() {
    onUpdate(id, {
      status: 'finished',
      progress: 1,
      finishedAt: book.finishedAt || Date.now(),
      startedAt: book.startedAt || Date.now(),
    });
    setJustFinished(true);
  }

  function onScrub(value) {
    setScrub(value);
    clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(() => {
      viewRef.current?.goToFraction(value / 1000);
      setScrub(null);
    }, 300);
  }

  const progress = pos?.progress ?? book.progress;
  const pct = Math.round(progress * 100);
  const atEnd = progress >= 0.995;
  const showFinish = !bannerDismissed && (justFinished || (atEnd && book.status !== 'finished'));

  const getFile = useCallback(() => library.fileBlob(id), [id]);

  const childProps = {
    ref: viewRef,
    bookId: id,
    getFile,
    initialLocation,
    settings,
    onRelocate: handleRelocate,
    onToc: setToc,
    onTap: handleTap,
    onZoom: handleZoom,
    onKey: handleKey,
    onError: setError,
    onScrubbable: setCanScrub,
  };

  return (
    <div className={`reader${chrome ? '' : ' chrome-hidden'}`} style={chromeVars(settings)}>
      <header className="reader-bar">
        <button className="btn ghost back" onClick={onClose} aria-label="Back to library">
          <ChevronLeft />
          <span className="hide-sm">Library</span>
        </button>
        <div className="reader-title">
          <strong className="clamp-1">{book.title}</strong>
          {book.author && <span className="muted clamp-1">{book.author}</span>}
        </div>
        <div className="reader-actions">
          <button
            className={`icon-btn${panel === 'contents' || panel === 'bookmarks' ? ' active' : ''}`}
            onClick={() => setPanel((p) => (p === 'contents' || p === 'bookmarks' ? null : 'contents'))}
            aria-label="Contents and bookmarks"
            title="Contents and bookmarks"
          >
            <ListIcon />
          </button>
          <button
            className={`icon-btn${currentBookmark ? ' bookmarked' : ''}`}
            onClick={toggleBookmark}
            aria-pressed={!!currentBookmark}
            aria-label={currentBookmark ? 'Remove bookmark' : 'Bookmark this page'}
            title={currentBookmark ? 'Remove bookmark' : 'Bookmark this page'}
          >
            <BookmarkIcon filled={!!currentBookmark} />
          </button>
          <button
            className={`icon-btn${panel === 'settings' ? ' active' : ''}`}
            onClick={() => setPanel((p) => (p === 'settings' ? null : 'settings'))}
            aria-label="Display settings"
            title="Display settings"
          >
            <TextIcon />
          </button>
        </div>
      </header>
      <div className="reader-progress">
        <div style={{ width: `${pct}%` }} />
      </div>

      <div className="reader-stage">
        {error ? (
          <div className="reader-message">{error}</div>
        ) : book.format === 'pdf' ? (
          <PdfReader {...childProps} />
        ) : (
          <EpubReader {...childProps} />
        )}

        {settings.dim > 0 && <div className="dimmer" style={{ opacity: settings.dim / 100 }} />}
        {debugLines.length > 0 && <pre className="touch-test">{debugLines.join(String.fromCharCode(10))}</pre>}

        {(panel === 'contents' || panel === 'bookmarks') && (
          <SidePanel
            tab={panel}
            onTab={setPanel}
            toc={toc}
            tocIndex={pos?.tocIndex ?? -1}
            bookmarks={bookmarks}
            onTocSelect={(item) => {
              viewRef.current?.goToTocItem(item);
              setPanel(null);
            }}
            onBookmarkSelect={(b) => {
              viewRef.current?.goTo(b.location);
              setPanel(null);
            }}
            onBookmarkRemove={(bmId) => onUpdate(id, { bookmarks: bookmarks.filter((b) => b.id !== bmId) })}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'settings' && (
          <ReaderSettings
            settings={settings}
            onChange={updateSettings}
            onReset={resetSettings}
            format={book.format}
            onClose={() => setPanel(null)}
          />
        )}

        {remote && (
          <div className="banner" role="status">
            <span>
              You got to <strong>{Math.round((remote.progress ?? 0) * 100)}%</strong> on another device.
            </span>
            <button
              className="btn primary"
              onClick={() => {
                viewRef.current?.goTo(remote.location);
                lastSeenRef.current = remote.progressUpdatedAt;
                setRemote(null);
              }}
            >
              Jump there
            </button>
            <button
              className="icon-btn"
              onClick={() => {
                lastSeenRef.current = remote.progressUpdatedAt;
                setRemote(null);
              }}
              aria-label="Stay here"
            >
              ×
            </button>
          </div>
        )}

        {showFinish && !remote && (
          <div className="banner" role="status">
            {justFinished ? (
              <>
                <span>Finished! How would you rate it?</span>
                <Stars value={book.rating} onChange={(rating) => onUpdate(id, { rating })} size="lg" />
              </>
            ) : (
              <>
                <span>You've reached the end.</span>
                <button className="btn primary" onClick={markFinished}>
                  Mark as finished
                </button>
              </>
            )}
            <button className="icon-btn" onClick={() => setBannerDismissed(true)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
      </div>

      <footer className="reader-footer">
        <button className="icon-btn" onClick={() => viewRef.current?.prev()} aria-label="Previous page">
          <ChevronLeft />
        </button>
        <div className="scrubber">
          <input
            type="range"
            min="0"
            max="1000"
            value={scrub ?? Math.round(progress * 1000)}
            disabled={!canScrub}
            onChange={(e) => onScrub(Number(e.target.value))}
            aria-label="Position in book"
          />
          <span className="scrub-label">
            {scrub != null ? `${Math.round(scrub / 10)}%` : pos?.label || (canScrub ? '' : 'Loading…')}
          </span>
        </div>
        <button className="icon-btn" onClick={() => viewRef.current?.next()} aria-label="Next page">
          <ChevronRight />
        </button>
      </footer>
    </div>
  );
}
