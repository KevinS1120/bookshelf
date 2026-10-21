import { isConfigured, signIn, signOut } from '../auth';

export default function Welcome({ error, busy, canSignOut }) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="brand">
          <span className="brand-mark">📚</span>
          <h1>Bookshelf</h1>
        </div>
        {!isConfigured ? (
          <p>
            This copy of Bookshelf isn't connected to Microsoft yet. Add the app's client ID to{' '}
            <code>src/config.js</code> (see the README).
          </p>
        ) : busy ? (
          <p className="setup-busy">{busy}</p>
        ) : (
          <>
            <p className="muted">
              Read and track your PDF, EPUB and Kindle (AZW3, MOBI) books on any device. Your library is kept in a Bookshelf folder in your
              OneDrive.
            </p>
            {!canSignOut && (
              <>
                <button className="btn primary block big" onClick={() => signIn()}>
                  Sign in with Microsoft
                </button>
                <p className="muted small">Use your personal Microsoft account (Outlook, Hotmail, Live…).</p>
              </>
            )}
          </>
        )}
        {error && <p className="setup-error">{error}</p>}
        {canSignOut && (
          <button className="btn" onClick={() => signOut()}>
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
