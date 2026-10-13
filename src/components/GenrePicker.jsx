import { useState } from 'react';
import { GENRES } from '../genres';

// Tap a genre to add it to the book, tap again to remove it. Tags of your own
// (and ones used on other books) appear alongside the standard genres.
export default function GenrePicker({ tags, suggestions = [], onChange }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const has = (t) => tags.some((x) => x.toLowerCase() === t.toLowerCase());
  const toggle = (t) => onChange(has(t) ? tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...tags, t]);

  const extras = [...new Set([...tags, ...suggestions])].filter((t) => !GENRES.some((g) => g.toLowerCase() === t.toLowerCase()));
  const options = [...GENRES, ...extras.sort((a, b) => a.localeCompare(b))];

  const addOwn = () => {
    const t = draft.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (t && !has(t)) onChange([...tags, t]);
    setDraft('');
    setAdding(false);
  };

  return (
    <div className="genres" role="group" aria-label="Genres">
      {options.map((g) => (
        <button
          key={g}
          type="button"
          className={`genre${has(g) ? ' on' : ''}`}
          aria-pressed={has(g)}
          onClick={() => toggle(g)}
        >
          {g}
        </button>
      ))}
      {adding ? (
        <input
          className="genre-input"
          autoFocus
          value={draft}
          placeholder="Your own tag"
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addOwn();
            } else if (e.key === 'Escape') {
              setDraft('');
              setAdding(false);
            }
          }}
          onBlur={addOwn}
        />
      ) : (
        <button type="button" className="genre add" onClick={() => setAdding(true)}>
          + Your own
        </button>
      )}
    </div>
  );
}
