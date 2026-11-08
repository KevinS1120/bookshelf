import { useEffect } from 'react';
import { newerVersionAvailable } from '../native';
import { choresFor, toDate } from '../chores/schedule';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const ICONS = {
  chores: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="10" y="8" width="28" height="34" rx="2" />
      <path d="M18 8V5h12v3" />
      <path d="M16 19l3 3 5-6M16 30l3 3 5-6" />
      <path d="M28 20h5M28 31h5" />
    </svg>
  ),
  money: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <ellipse cx="20" cy="14" rx="11" ry="4" />
      <path d="M9 14v6c0 2.2 4.9 4 11 4s11-1.8 11-4v-6" />
      <path d="M9 20v6c0 2.2 4.9 4 11 4 1.5 0 2.9-.1 4.2-.3" />
      <path d="M9 26v6c0 2.2 4.9 4 11 4 1.5 0 2.9-.1 4.2-.3" />
      <circle cx="33" cy="32" r="9" />
      <path d="M33 27v10M30.5 29.5c0-1 1.1-1.6 2.5-1.6s2.5.6 2.5 1.6-1 1.4-2.5 1.7-2.5.8-2.5 1.8 1.1 1.6 2.5 1.6 2.5-.6 2.5-1.6" />
    </svg>
  ),
  books: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 13c-4-3-9.5-3.8-15-3v25c5.5-.8 11 0 15 3 4-3 9.5-3.8 15-3V10c-5.5-.8-11 0-15 3z" />
      <path d="M24 13v25" />
      <path d="M13 16.5c2.7 0 5.3.5 7.5 1.6M13 22c2.7 0 5.3.5 7.5 1.6M27.5 18.1c2.2-1.1 4.8-1.6 7.5-1.6M27.5 23.6c2.2-1.1 4.8-1.6 7.5-1.6" />
    </svg>
  ),
};

export default function Home({ account, chores, onOpen }) {
  // Reload into a newer version of the app if one has been published.
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState === 'visible' && (await newerVersionAvailable())) window.location.reload();
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);

  const { doc, today } = chores;
  let choresNote = 'Loading…';
  if (doc) {
    const items = choresFor(doc, today, today);
    const left = items.filter((i) => !i.done).length;
    choresNote = !Object.keys(doc.chores).length
      ? doc.people.length < 2
        ? 'Set up your chore list'
        : 'No chores yet'
      : left === 0
        ? 'All done today'
        : `${left} left today`;
  }
  const firstName = (account?.name ?? '').split(/\s+/)[0];

  const cards = [
    { id: 'chores', title: 'Chores', note: choresNote, icon: ICONS.chores },
    { id: 'money', title: 'Financial Planning', note: 'Coming soon', icon: ICONS.money, soon: true },
    { id: 'books', title: 'Bookshelf', note: 'Your library', icon: ICONS.books },
  ];

  return (
    <div className="home-page">
      <header className="home-head">
        <span className="field-label">{toDate(today).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        <h1>
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </h1>
      </header>
      <nav className="home-cards">
        {cards.map((c) => (
          <button key={c.id} className={`home-card${c.soon ? ' soon' : ''}`} onClick={() => !c.soon && onOpen(c.id)} aria-disabled={c.soon}>
            <span className="home-icon">{c.icon}</span>
            <span className="home-text">
              <span className="home-title">{c.title}</span>
              <span className="home-note">{c.note}</span>
            </span>
            {!c.soon && <span className="home-arrow" aria-hidden="true">›</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
