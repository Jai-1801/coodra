/**
 * `src/ui/wordmark.ts` — the `coodra` wordmark as figlet block art.
 *
 * The design reference set `coodra` in an editorial serif; a terminal
 * can't do serif, so the splash uses the modern CLI convention instead
 * (the look Gemini CLI / Claude Code popularised): pre-rendered figlet
 * block art in the "ANSI Shadow" font, washed with a vertical phosphor
 * gradient. The art is hard-coded — the wordmark never changes, so
 * there is no reason to ship a figlet runtime or font files.
 *
 * The gradient is **scheme-adaptive**: it interpolates between two
 * phosphor stops chosen for the active background (`theme.ts`), so it
 * stays vivid on a dark terminal and deep on a light one. When colour
 * is unavailable it degrades to the plain block art.
 *
 * Two consumers: the Ink `<Banner>` (one `<Text>` per line) and the
 * one-shot `banner()` formatter (`renderWordmark()` → a coloured
 * multi-line string). Narrow terminals fall back to the plain `coodra`
 * word — the caller decides, using {@link WORDMARK_WIDTH}.
 */

import { activeColorScheme, type ColorScheme, colorEnabled } from './theme.js';

/** The `coodra` wordmark — "ANSI Shadow" figlet art. Every line is {@link WORDMARK_WIDTH} columns. */
export const WORDMARK_LINES: readonly string[] = [
  ' ██████╗ ██████╗  ██████╗ ██████╗ ██████╗  █████╗ ',
  '██╔════╝██╔═══██╗██╔═══██╗██╔══██╗██╔══██╗██╔══██╗',
  '██║     ██║   ██║██║   ██║██║  ██║██████╔╝███████║',
  '██║     ██║   ██║██║   ██║██║  ██║██╔══██╗██╔══██║',
  '╚██████╗╚██████╔╝╚██████╔╝██████╔╝██║  ██║██║  ██║',
  ' ╚═════╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝',
];

/** Visible width of every wordmark line. Callers gate on this to fall back to the plain word. */
export const WORDMARK_WIDTH = 50;
export const WORDMARK_HEIGHT = WORDMARK_LINES.length;

/**
 * Vertical gradient stops `[top, bottom]` per scheme — both phosphor,
 * to keep the wordmark in the brand's one load-bearing hue.
 *   - `dark`    — bright phosphor, fading to the soft phosphor.
 *   - `light`   — deep greens, crisp on a white terminal.
 *   - `unknown` — mid greens that read on either background.
 */
const GRADIENT: Record<ColorScheme, readonly [string, string]> = {
  dark: ['#a7e8a7', '#3f9d3f'],
  light: ['#43853f', '#1b5e20'],
  unknown: ['#5cb85c', '#2f7d32'],
};

function hexToRgb(hex: string): readonly [number, number, number] {
  const v = hex.replace('#', '');
  return [Number.parseInt(v.slice(0, 2), 16), Number.parseInt(v.slice(2, 4), 16), Number.parseInt(v.slice(4, 6), 16)];
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

/**
 * The interpolated gradient hex for wordmark line `lineIndex` under the
 * given (or active) scheme. Line 0 is the top stop, the last line the
 * bottom stop.
 */
export function wordmarkLineColor(lineIndex: number, scheme: ColorScheme = activeColorScheme): string {
  const [top, bottom] = GRADIENT[scheme];
  const [tr, tg, tb] = hexToRgb(top);
  const [br, bg, bb] = hexToRgb(bottom);
  const t = WORDMARK_HEIGHT > 1 ? lineIndex / (WORDMARK_HEIGHT - 1) : 0;
  return `#${toHex(tr + (br - tr) * t)}${toHex(tg + (bg - tg) * t)}${toHex(tb + (bb - tb) * t)}`;
}

/**
 * The wordmark as a single coloured multi-line string for one-shot
 * output. Each line carries its gradient stop; falls back to the plain
 * block art when colour is unavailable.
 */
export function renderWordmark(scheme: ColorScheme = activeColorScheme): string {
  if (!colorEnabled) return WORDMARK_LINES.join('\n');
  return WORDMARK_LINES.map((line, index) => {
    const [r, g, b] = hexToRgb(wordmarkLineColor(index, scheme));
    return `\x1b[38;2;${r};${g};${b}m${line}\x1b[39m`;
  }).join('\n');
}
