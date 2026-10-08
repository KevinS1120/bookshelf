import { useState } from 'react';

// Clicking the current rating again clears it.
export default function Stars({ value, onChange, size = 'md' }) {
  const [hover, setHover] = useState(0);
  const readOnly = !onChange;
  const shown = hover || value;

  return (
    <span
      className={`stars stars-${size}${readOnly ? ' readonly' : ''}`}
      onMouseLeave={() => setHover(0)}
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={`${value || 'No'} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) =>
        readOnly ? (
          <span key={n} className={n <= shown ? 'on' : ''}>★</span>
        ) : (
          <button
            key={n}
            type="button"
            className={n <= shown ? 'on' : ''}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n === value ? 0 : n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-checked={n === value}
            role="radio"
          >
            ★
          </button>
        ),
      )}
    </span>
  );
}
