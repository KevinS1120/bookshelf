import { isConfigured, signIn } from '../auth';

export default function Welcome({ error }) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="brand">
          <span className="brand-mark">📚</span>
          <h1>Bookshelf</h1>
        </div>
        {isConfigured ? (
          <>
            <p className="muted">
              Read and track your PDF and EPUB books on any device. Your library is kept in Microsoft 365 (SharePoint).
            </p>
            <button className="btn primary block big" onClick={() => signIn()}>
              Sign in with Microsoft
            </button>
            <p className="muted small">Use your Georgia Tech account.</p>
          </>
        ) : (
          <p>
            This copy of Bookshelf isn't connected to Microsoft 365 yet. Add the app's client ID to{' '}
            <code>src/config.js</code> (see the README).
          </p>
        )}
        {error && <p className="setup-error">{error}</p>}
      </div>
    </div>
  );
}
