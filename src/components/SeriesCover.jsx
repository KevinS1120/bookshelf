import { useEffect, useMemo, useRef, useState } from 'react';
import { useBackClose, useDragToClose } from '../native';

// A designed series cover: a cloth-bound look in a color you pick, with a
// gold-stamped icon in the middle and the series name beneath it.
// cover: { type: 'design', bg, foil, icon, paths: [svg path data] }

export const COVER_COLORS = [
  { color: '#6e1f1f', label: 'Oxblood' },
  { color: '#5a1630', label: 'Burgundy' },
  { color: '#3d1f3d', label: 'Plum' },
  { color: '#1b2a4a', label: 'Navy' },
  { color: '#11152b', label: 'Midnight' },
  { color: '#134a4a', label: 'Teal' },
  { color: '#1f3d2b', label: 'Forest' },
  { color: '#134a3c', label: 'Emerald' },
  { color: '#4a4a1f', label: 'Olive' },
  { color: '#8a6a1a', label: 'Mustard' },
  { color: '#7a4a22', label: 'Cognac' },
  { color: '#3b2a1c', label: 'Walnut' },
  { color: '#34404a', label: 'Slate' },
  { color: '#232323', label: 'Charcoal' },
  { color: '#e8dcc0', label: 'Ivory' },
];

export const FOILS = [
  { id: 'gold', label: 'Gold', color: '#d9b45f' },
  { id: 'silver', label: 'Silver', color: '#cdd2d8' },
  { id: 'copper', label: 'Copper', color: '#cf8a57' },
  { id: 'ivory', label: 'Ivory', color: '#efe6cf' },
  { id: 'ink', label: 'Ink', color: '#1b1410' },
];
const foilColor = (id) => (FOILS.find((f) => f.id === id) ?? FOILS[0]).color;

// Only plain path data is kept from an icon (safe to store in the shared library).
export function iconPaths(body) {
  return [...body.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
}

function Icon({ paths, className }) {
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="currentColor" />
      ))}
    </svg>
  );
}

const longestWord = (name) => Math.max(6, ...name.split(/\s+/).map((w) => w.length));

export function SeriesDesignCover({ cover, name, className = '' }) {
  return (
    <div className={`cover series-design ${className}`} style={{ '--bg': cover.bg, '--foil': foilColor(cover.foil) }}>
      <div className="sd-frame">
        {cover.paths?.length > 0 && <Icon paths={cover.paths} className="sd-icon" />}
        <span className="sd-title" style={{ '--word': longestWord(name) }}>
          {name}
        </span>
      </div>
    </div>
  );
}

// Build-your-own cover: background color, foil, and an icon from the collection.
export function SeriesCoverDialog({ series, onSave, onClose }) {
  const start = series.cover?.type === 'design' ? series.cover : null;
  const [bg, setBg] = useState(start?.bg ?? COVER_COLORS[0].color);
  const [foil, setFoil] = useState(start?.foil ?? 'gold');
  const [icon, setIcon] = useState(start ? { name: start.icon, paths: start.paths } : null);
  const [lib, setLib] = useState(null); // { ICON_CATEGORIES, ICONS }
  const [category, setCategory] = useState('magic');
  const [query, setQuery] = useState('');
  const sheetRef = useRef(null);
  useBackClose(onClose);
  useDragToClose(sheetRef, onClose);

  // The icon collection is large, so it's only loaded here.
  useEffect(() => {
    import('../seriesIcons').then(setLib, () => setLib({ ICON_CATEGORIES: [], ICONS: {} }));
  }, []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !e.target.closest?.('input') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    if (!lib) return [];
    const q = query.trim().toLowerCase().replace(/\s+/g, '-');
    if (q) return Object.keys(lib.ICONS).filter((n) => n.includes(q));
    return lib.ICON_CATEGORIES.find((c) => c.id === category)?.icons ?? [];
  }, [lib, category, query]);

  const pickIcon = (name) => setIcon({ name, paths: iconPaths(lib.ICONS[name]) });
  const preview = { type: 'design', bg, foil, icon: icon?.name ?? null, paths: icon?.paths ?? [] };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={sheetRef} className="modal cover-designer" role="dialog" aria-modal="true" aria-label="Design a series cover">
        <div className="sheet-handle" data-drag-handle />
        <h2>Series cover</h2>

        <div className="designer-top">
          <SeriesDesignCover cover={preview} name={series.name} className="designer-preview" />
          <div className="designer-controls">
            <span className="field-label">Cover color</span>
            <div className="cover-colors" role="radiogroup" aria-label="Cover color">
              {COVER_COLORS.map((c) => (
                <button
                  key={c.color}
                  role="radio"
                  aria-checked={bg === c.color}
                  aria-label={c.label}
                  title={c.label}
                  className={`text-color${bg === c.color ? ' active' : ''}`}
                  style={{ background: c.color }}
                  onClick={() => setBg(c.color)}
                />
              ))}
              <label className={`text-color custom${COVER_COLORS.some((c) => c.color === bg) ? '' : ' active'}`} title="Any color">
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} aria-label="Any cover color" />
              </label>
            </div>
            <span className="field-label">Stamp</span>
            <div className="seg foils">
              {FOILS.map((f) => (
                <button key={f.id} className={foil === f.id ? 'active' : ''} onClick={() => setFoil(f.id)}>
                  <span className="foil-dot" style={{ background: f.color }} />
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="icon-head">
          <span className="field-label">Icon</span>
          <input
            className="text-input icon-search"
            type="search"
            placeholder="Search icons, e.g. dragon, ship, rose"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {!query && lib && (
          <div className="collections icon-cats" role="tablist">
            {lib.ICON_CATEGORIES.map((c) => (
              <button key={c.id} className={category === c.id ? 'active' : ''} onClick={() => setCategory(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        <div className="icon-grid" style={{ '--bg': bg, '--foil': foilColor(foil) }}>
          {!lib && <p className="muted">Loading icons…</p>}
          {lib && shown.length === 0 && <p className="muted">No icons match “{query}”.</p>}
          {shown.map((n) => (
            <button
              key={n}
              className={`icon-choice${icon?.name === n ? ' active' : ''}`}
              onClick={() => pickIcon(n)}
              title={n.replace(/-/g, ' ')}
              aria-label={n.replace(/-/g, ' ')}
              aria-pressed={icon?.name === n}
            >
              <Icon paths={iconPaths(lib.ICONS[n])} />
            </button>
          ))}
        </div>
        <p className="muted small credit">
          Icons by <a href="https://game-icons.net" target="_blank" rel="noreferrer">game-icons.net</a>, CC BY 3.0.
        </p>

        <div className="row-gap designer-actions">
          {series.cover && (
            <button className="btn ghost" onClick={() => onSave(null)}>
              Use stacked covers
            </button>
          )}
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onSave(preview)}>
            Save cover
          </button>
        </div>
      </div>
    </div>
  );
}
