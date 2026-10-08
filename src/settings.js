// Reader appearance settings. These are kept per device (a phone and an iPad
// usually want different text sizes), in localStorage.
import { usePref } from './util';

export const THEMES = [
  { id: 'light', label: 'Light', bg: '#ffffff', fg: '#1f1f1f', link: '#1a5fb4' },
  { id: 'sepia', label: 'Sepia', bg: '#f4ecd8', fg: '#433422', link: '#8a5a1f' },
  { id: 'sage', label: 'Sage', bg: '#e3eadd', fg: '#2c3a2a', link: '#3b6b35' },
  { id: 'dark', label: 'Dark', bg: '#1c1c1e', fg: '#d6d3cd', link: '#8ab4f8' },
  { id: 'black', label: 'Black', bg: '#000000', fg: '#bdbab4', link: '#8ab4f8' },
  { id: 'custom', label: 'Custom' },
];

export const FONTS = [
  { id: 'publisher', label: 'Original', stack: null },
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
  theme: 'light',
  customBg: '#fdf6e3',
  customFg: '#2b2b2b',
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
  if (s.theme === 'custom') {
    const dark = luminance(s.customBg) < 0.25;
    return { bg: s.customBg, fg: s.customFg, link: dark ? '#8ab4f8' : '#1a5fb4', dark };
  }
  const t = THEMES.find((x) => x.id === s.theme) ?? THEMES[0];
  return { bg: t.bg, fg: t.fg, link: t.link, dark: luminance(t.bg) < 0.25 };
}

// CSS injected into each EPUB chapter.
export function epubCss(s) {
  const c = themeColors(s);
  const recolor = s.theme !== 'light';
  let css = `html, body { background: ${c.bg} !important; ${recolor ? `color: ${c.fg} !important;` : ''} }\n`;
  if (recolor) {
    css += `body * { color: inherit !important; background-color: transparent !important; }
      a, a * { color: ${c.link} !important; }\n`;
  }
  if (c.dark) css += 'img, svg { filter: brightness(0.85); }\n';
  if (s.fontSize !== 100) css += `body { font-size: ${s.fontSize}% !important; }
`;
  const font = FONTS.find((f) => f.id === s.font)?.stack;
  if (font) css += `body, body *:not(pre):not(code):not(kbd):not(samp) { font-family: ${font} !important; }\n`;
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
