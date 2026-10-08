import { useState } from 'react';
import { ensureColumns, locateFromLink, locateOneDrive, missingColumns } from '../library';

// Choosing where the library lives, and adding the reading columns to it.
export default function Setup({ account, onDone, onSignOut }) {
  const [mode, setMode] = useState(null); // null | 'link'
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function connect(locate) {
    setError('');
    try {
      setBusy('Finding your library…');
      const loc = await locate();
      setBusy('Checking library columns…');
      if ((await missingColumns(loc)).length) {
        setBusy('Adding Status, Rating, and other columns to the library…');
        await ensureColumns(loc);
      }
      onDone(loc);
    } catch (err) {
      console.error(err);
      setError(
        err.status === 403
          ? "Microsoft 365 didn't allow this. You need edit rights to the library, and Georgia Tech may need to approve the app."
          : err.message,
      );
      setBusy('');
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="brand">
          <span className="brand-mark">📚</span>
          <h1>Bookshelf</h1>
        </div>
        <h2>Where should your books live?</h2>
        <p className="muted">
          Books are stored as files in SharePoint, with your ratings and progress in columns beside them. You can reach
          them from any device after signing in.
        </p>

        {busy ? (
          <p className="setup-busy">{busy}</p>
        ) : mode === 'link' ? (
          <form
            className="setup-link"
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) connect(() => locateFromLink(link));
            }}
          >
            <label className="field">
              <span className="field-label">Link to a SharePoint folder or library</span>
              <input
                className="text-input"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://gatech.sharepoint.com/…"
                autoFocus
              />
            </label>
            <p className="muted small">In SharePoint, open the folder, choose Copy link, and paste it here.</p>
            <div className="row-gap">
              <button className="btn ghost" type="button" onClick={() => setMode(null)}>
                Back
              </button>
              <button className="btn primary" type="submit" disabled={!link.trim()}>
                Use this library
              </button>
            </div>
          </form>
        ) : (
          <div className="setup-options">
            <button className="setup-option" onClick={() => connect(locateOneDrive)}>
              <strong>My OneDrive</strong>
              <span className="muted">A “Bookshelf” folder in your OneDrive (created for you). Simplest.</span>
            </button>
            <button className="setup-option" onClick={() => setMode('link')}>
              <strong>A SharePoint site library</strong>
              <span className="muted">Any document library or folder you can edit, from a link.</span>
            </button>
          </div>
        )}

        {error && <p className="setup-error">{error}</p>}

        <p className="muted small account-line">
          Signed in as {account.username}.{' '}
          <button className="link-btn" onClick={onSignOut}>
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
