// Reader appearance settings. These are kept per device (a phone and an iPad
// usually want different text sizes), in localStorage.
import { usePref } from './util';

export const THEMES = [
  { id: 'light', label: 'Light', bg: '#ffffff', fg: '#1f1f1f', link: '#1a5fb4' },
  { id: 'sepia', label: 'Sepia', bg: '#f4ecd8', fg: '#433422', link: '#8a5a1f' },
  { id: 'sage', label: 'Sage', bg: '#e3eadd', fg: '#2c3a2a', link: '#3b6b35' },
  { id: 'forest', label: 'Forest', bg: '#10271d', fg: '#dfe8dc', link: '#e0bb6a' },
  { id: 'library', label: 'Library', bg: '#1c1510', fg: '#e6d9bf', link: '#d4ae66' },
  { id: 'parchment', label: 'Parchment', bg: '#f1e6cc', fg: '#2e2418', link: '#7c2d2d' },
  { id: 'dark', label: 'Dark', bg: '#1c1c1e', fg: '#d6d3cd', link: '#8ab4f8' },
  { id: 'black', label: 'Black', bg: '#000000', fg: '#bdbab4', link: '#8ab4f8' },
  { id: 'custom', label: 'Custom' },
];

export const FONTS = [
  { id: 'publisher', label: 'Original', stack: null },
  { id: 'garamond', label: 'Garamond', stack: '"EB Garamond", Garamond, Georgia, serif', webFont: 'EB+Garamond:ital,wght@0,400;0,600;1,400' },
  { id: 'serif', label: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'palatino', label: 'Palatino', stack: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
  { id: 'sans', label: 'Sans', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  { id: 'verdana', label: 'Verdana', stack: 'Verdana, Tahoma, Geneva, sans-serif' },
  { id: 'mono', label: 'Mono', stack: 'ui-monospace, Menlo, Consolas, "Courier New", monospace' },
];

export const LINE_HEIGHTS = [
  { id: 'publisher', label: 'Original', value: null },
  { id: 'tight', label: 'Tight', value: 1.3 },
  { id: 'normal', label: 'Normal', value: 1.55 },
  { id: 'relaxed', label: 'Relaxed', value: 1.8 },
  { id: 'loose', label: 'Loose', value: 2.1 },
];

export const PAGE_WIDTH_MAX = 1600; // slider maximum, meaning "no limit"

export const DEFAULT_SETTINGS = {
  theme: 'library',
  customBg: '#fdf6e3',
  customFg: '#2b2b2b',
  textColor: null, // overrides the theme's text color (EPUB)
  font: 'publisher',
  fontSize: 100,
  lineHeight: 'publisher',
  align: 'publisher',
  margin: 40,
  pageWidth: 1200,
  layout: 'auto', // auto (two pages on wide screens) | single | scroll
  dim: 0,
  pdfFit: 'page',
  pdfZoom: 1,
  pdfRecolor: true,
};

export function useReaderSettings() {
  const [stored, setStored] = usePref('reader-settings', DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  const update = (patch) => setStored((s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch }));
  const reset = () => setStored(DEFAULT_SETTINGS);
  return [settings, update, reset];
}

function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function themeColors(s) {
  let c;
  if (s.theme === 'custom') {
    const dark = luminance(s.customBg) < 0.25;
    c = { bg: s.customBg, fg: s.customFg, link: dark ? '#8ab4f8' : '#1a5fb4', dark };
  } else {
    const t = THEMES.find((x) => x.id === s.theme) ?? THEMES[0];
    c = { bg: t.bg, fg: t.fg, link: t.link, dark: luminance(t.bg) < 0.25 };
  }
  return s.textColor ? { ...c, fg: s.textColor } : c;
}

// Ready-made text colors that read well on light or dark pages.
export const TEXT_COLORS = [
  { color: '#111111', label: 'Black' },
  { color: '#3d3d3d', label: 'Charcoal' },
  { color: '#5b4636', label: 'Brown' },
  { color: '#1f3a5f', label: 'Navy' },
  { color: '#ffffff', label: 'White' },
  { color: '#e8e2d0', label: 'Cream' },
  { color: '#c9c4ba', label: 'Soft gray' },
  { color: '#e6c27a', label: 'Gold' },
  { color: '#b9e0c2', label: 'Mint' },
  { color: '#b8d4f0', label: 'Sky' },
];

// WCAG contrast ratio between two colors (1 to 21).
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// CSS injected into each EPUB chapter.
export function epubCss(s) {
  const c = themeColors(s);
  const recolor = s.theme !== 'light' || !!s.textColor;
  let css = `html, body { background: ${c.bg} !important; ${recolor ? `color: ${c.fg} !important;` : ''} }\n`;
  // Sideways drags turn pages (handled by the app); the browser only scrolls up/down.
  css += 'html, body { touch-action: pan-y; overscroll-behavior: none; }\n';
  if (recolor) {
    css += `body * { color: inherit !important; background-color: transparent !important; }
      a, a * { color: ${c.link} !important; }\n`;
  }
  if (c.dark) css += 'img, svg { filter: brightness(0.85); }\n';
  if (s.fontSize !== 100) css += `body { font-size: ${s.fontSize}% !important; }
`;
  const fontDef = FONTS.find((f) => f.id === s.font);
  const font = fontDef?.stack;
  // Web fonts have to be loaded inside the book's own pages too (must come first).
  if (fontDef?.webFont) css = `@import url('https://fonts.googleapis.com/css2?family=${fontDef.webFont}&display=swap');\n${css}`;
  if (font) css +=`body, body *:not(pre):not(code):not(kbd):not(samp) { font-family: ${font} !important; }\n`;
  const lh = LINE_HEIGHTS.find((l) => l.id === s.lineHeight)?.value;
  if (lh) css += `body, body * { line-height: ${lh} !important; }\n`;
  if (s.align !== 'publisher') {
    const hy = s.align === 'justify' ? 'auto' : 'manual';
    css += `p, li, blockquote, dd { text-align: ${s.align} !important; -webkit-hyphens: ${hy}; hyphens: ${hy}; }\n`;
  }
  return css;
}

// CSS variables for the reader's own toolbars and background, derived from the page colors.
export function chromeVars(s) {
  const { bg, fg } = themeColors(s);
  return {
    '--r-page': bg,
    '--r-fg': fg,
    '--r-bg': `color-mix(in srgb, ${bg} 90%, ${fg})`,
    '--r-bar': `color-mix(in srgb, ${bg} 95%, ${fg})`,
    '--r-border': `color-mix(in srgb, ${bg} 82%, ${fg})`,
    '--r-muted': `color-mix(in srgb, ${fg} 62%, ${bg})`,
  };
}
