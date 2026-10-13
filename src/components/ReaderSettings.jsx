import { useRef } from 'react';
import { useDragToClose } from '../native';
import { FONTS, LINE_HEIGHTS, PAGE_WIDTH_MAX, TEXT_COLORS, THEMES, contrast, themeColors } from '../settings';

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

function Segmented({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.id} className={value === o.id ? 'active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, value, children }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <span>{label}</span>
        {value != null && <span className="set-value">{value}</span>}
      </div>
      {children}
    </div>
  );
}

export default function ReaderSettings({ settings: s, onChange, onReset, format, onClose }) {
  const epub = format === 'epub';
  // Pinch-zoom can land between the preset steps; use the nearest one.
  const zoomIdx = ZOOMS.reduce((best, z, i) => (Math.abs(z - s.pdfZoom) < Math.abs(ZOOMS[best] - s.pdfZoom) ? i : best), 0);
  const sheetRef = useRef(null);
  useDragToClose(sheetRef, onClose);

  return (
    <div ref={sheetRef} className="sheet settings-sheet" role="dialog" aria-label="Display settings">
      <div className="sheet-handle" data-drag-handle />
      <div className="sheet-head" data-drag-handle>
        <strong>Display</strong>
      </div>
      <div className="sheet-body">
        <Row label="Theme">
          <div className="theme-grid">
            {THEMES.map((t) => {
              const bg = t.id === 'custom' ? s.customBg : t.bg;
              const fg = s.textColor || (t.id === 'custom' ? s.customFg : t.fg);
              return (
                <button
                  key={t.id}
                  className={`theme-chip${s.theme === t.id ? ' active' : ''}`}
                  style={{ background: bg, color: fg }}
                  onClick={() => onChange({ theme: t.id })}
                >
                  <span className="theme-aa">Aa</span>
                  <span className="theme-name">{t.label}</span>
                </button>
              );
            })}
          </div>
          {s.theme === 'custom' && (
            <div className="color-row">
              <label>
                <input type="color" value={s.customBg} onChange={(e) => onChange({ customBg: e.target.value })} />
                Page color
              </label>
            </div>
          )}
        </Row>

        {epub && (
          <Row label="Text color" value={s.textColor ? null : 'Auto'}>
            <TextColor settings={s} onChange={onChange} />
          </Row>
        )}

        <Row label="Brightness" value={`${100 - s.dim}%`}>
          <input
            type="range"
            min="30"
            max="100"
            value={100 - s.dim}
            onChange={(e) => onChange({ dim: 100 - Number(e.target.value) })}
          />
        </Row>

        {epub ? (
          <>
            <Row label="Text size" value={`${s.fontSize}%`}>
              <div className="stepper">
                <button onClick={() => onChange({ fontSize: Math.max(60, s.fontSize - 10) })} aria-label="Smaller text">
                  <small>A</small>
                </button>
                <input
                  type="range"
                  min="60"
                  max="240"
                  step="5"
                  value={s.fontSize}
                  onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
                />
                <button onClick={() => onChange({ fontSize: Math.min(240, s.fontSize + 10) })} aria-label="Larger text">
                  <big>A</big>
                </button>
              </div>
            </Row>

            <Row label="Font">
              <div className="font-grid">
                {FONTS.map((f) => (
                  <button
                    key={f.id}
                    className={s.font === f.id ? 'active' : ''}
                    style={f.stack ? { fontFamily: f.stack } : undefined}
                    onClick={() => onChange({ font: f.id })}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </Row>

            <Row label="Line spacing">
              <Segmented value={s.lineHeight} options={LINE_HEIGHTS} onChange={(lineHeight) => onChange({ lineHeight })} />
            </Row>

            <Row label="Alignment">
              <Segmented
                value={s.align}
                options={[
                  { id: 'publisher', label: 'Original' },
                  { id: 'left', label: 'Left' },
                  { id: 'justify', label: 'Justified' },
                ]}
                onChange={(align) => onChange({ align })}
              />
            </Row>

            <Row label="Margins" value={`${s.margin}px`}>
              <input
                type="range"
                min="0"
                max="160"
                step="4"
                value={s.margin}
                onChange={(e) => onChange({ margin: Number(e.target.value) })}
              />
            </Row>

            <Row label="Page width" value={s.pageWidth >= PAGE_WIDTH_MAX ? 'Full' : `${s.pageWidth}px`}>
              <input
                type="range"
                min="400"
                max={PAGE_WIDTH_MAX}
                step="20"
                value={s.pageWidth}
                onChange={(e) => onChange({ pageWidth: Number(e.target.value) })}
              />
            </Row>

            <Row label="Layout">
              <Segmented
                value={s.layout}
                options={[
                  { id: 'auto', label: 'Auto' },
                  { id: 'single', label: 'One page' },
                  { id: 'scroll', label: 'Scroll' },
                ]}
                onChange={(layout) => onChange({ layout })}
              />
              <p className="set-hint">Auto shows two pages side by side on wide screens.</p>
            </Row>
          </>
        ) : (
          <>
            <Row label="Page size">
              <Segmented
                value={s.pdfFit}
                options={[
                  { id: 'page', label: 'Fit page' },
                  { id: 'width', label: 'Fit width' },
                ]}
                onChange={(pdfFit) => onChange({ pdfFit })}
              />
            </Row>
            <Row label="Zoom" value={`${Math.round(s.pdfZoom * 100)}%`}>
              <div className="stepper">
                <button
                  onClick={() => onChange({ pdfZoom: ZOOMS[Math.max(0, zoomIdx - (ZOOMS[zoomIdx] < s.pdfZoom ? 0 : 1))] })}
                  disabled={s.pdfZoom <= ZOOMS[0]}
                  aria-label="Zoom out"
                >
                  −
                </button>
                <input
                  type="range"
                  min="0"
                  max={ZOOMS.length - 1}
                  value={zoomIdx}
                  onChange={(e) => onChange({ pdfZoom: ZOOMS[Number(e.target.value)] })}
                />
                <button
                  onClick={() => onChange({ pdfZoom: ZOOMS[Math.min(ZOOMS.length - 1, zoomIdx + (ZOOMS[zoomIdx] > s.pdfZoom ? 0 : 1))] })}
                  disabled={s.pdfZoom >= ZOOMS[ZOOMS.length - 1]}
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>
            </Row>
            <label className="toggle-row">
              <input type="checkbox" role="switch" className="switch" checked={s.pdfRecolor} onChange={(e) => onChange({ pdfRecolor: e.target.checked })} />
              Tint pages to match the theme
            </label>
            <p className="set-hint">Pinch to zoom, or double-tap the middle of the page. PDFs have fixed layouts, so font and spacing options only apply to EPUBs.</p>
          </>
        )}

        <div className="sheet-foot">
          <span className="set-hint">Saved on this device</span>
          <button className="btn ghost" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function TextColor({ settings: s, onChange }) {
  const themeText = themeColors({ ...s, textColor: null }).fg;
  const page = themeColors(s).bg;
  const custom = s.textColor && !TEXT_COLORS.some((c) => c.color === s.textColor);
  return (
    <>
      <div className="text-colors" role="radiogroup" aria-label="Text color">
        <button
          role="radio"
          aria-checked={!s.textColor}
          className={`text-color auto${!s.textColor ? ' active' : ''}`}
          style={{ background: page, color: themeText }}
          onClick={() => onChange({ textColor: null })}
          title="Use the theme's text color"
        >
          Aa
        </button>
        {TEXT_COLORS.map((c) => (
          <button
            key={c.color}
            role="radio"
            aria-checked={s.textColor === c.color}
            aria-label={c.label}
            title={c.label}
            className={`text-color${s.textColor === c.color ? ' active' : ''}`}
            style={{ background: c.color }}
            onClick={() => onChange({ textColor: c.color })}
          />
        ))}
        <label
          className={`text-color custom${custom ? ' active' : ''}`}
          style={custom ? { background: s.textColor } : undefined}
          title="Pick any color"
        >
          <input
            type="color"
            value={s.textColor || themeText}
            onChange={(e) => onChange({ textColor: e.target.value })}
            aria-label="Pick any text color"
          />
        </label>
      </div>
      {s.textColor && contrast(s.textColor, page) < 3 && (
        <p className="set-hint warn">This color is hard to read on this page color.</p>
      )}
    </>
  );
}
