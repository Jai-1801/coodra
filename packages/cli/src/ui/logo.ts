/**
 * `src/ui/logo.ts` — the Coodra mark, rendered for the terminal.
 *
 * The brand mark is a circle observing a single node on a dotted
 * horizontal axis: the circle is the observation boundary, the dotted
 * axis is the run/timeline, and the solid centre node is "now". Nothing
 * decorative — every stroke is part of the system metaphor.
 *
 * A terminal can't draw a true circle at small sizes, so the mark is
 * expressed in box-drawing at three scales:
 *
 *   - `inline` — `┄(●)┄`: the node inside a circle, on a dotted axis.
 *     One cell-row; used in the top bar.
 *   - `block`  — a 3-row rounded mark with the axis poking through.
 *   - `hero`   — a 5-row splash-scale mark.
 *
 * Colour follows the design system: the circle + axis are faint
 * structural ink (`inkFar`), the node is phosphor — the one
 * load-bearing colour, reserved for "now" / live / system state.
 */

import { paint, style } from './theme.js';

/** Inline mark — a node inside a circle, on a dotted context axis. */
export const LOGO_INLINE_PLAIN = '┄(●)┄';

/** Block mark — a rounded circle with the dotted axis through it (3 rows × 7 cols). */
export const LOGO_BLOCK: readonly string[] = [' ╭───╮ ', '┄┤ ● ├┄', ' ╰───╯ '];

/** Hero mark — the splash-scale circle (5 rows × 11 cols). */
export const LOGO_HERO: readonly string[] = ['  ╭─────╮  ', '  │     │  ', '┄┄┤  ●  ├┄┄', '  │     │  ', '  ╰─────╯  '];

export const LOGO_BLOCK_WIDTH = 7;
export const LOGO_HERO_WIDTH = 11;

/** The centre node glyph — the "now" on the context axis. */
export const LOGO_NODE = '●';

/**
 * Paint one line of the mark: the centre node renders phosphor + bold
 * ("now"), everything else (circle strokes, dotted axis) renders in the
 * faint structural mid-grey. Lines without a node paint entirely faint.
 */
export function paintLogoLine(line: string): string {
  const at = line.indexOf(LOGO_NODE);
  if (at < 0) return paint.inkFar(line);
  return paint.inkFar(line.slice(0, at)) + style.bold(paint.phosphor(LOGO_NODE)) + paint.inkFar(line.slice(at + 1));
}

/** The inline mark, painted — for one-shot output. */
export function renderLogoInline(): string {
  return paintLogoLine(LOGO_INLINE_PLAIN);
}

/** The block mark as a painted multi-line string. */
export function renderLogoBlock(): string {
  return LOGO_BLOCK.map(paintLogoLine).join('\n');
}

/** The hero mark as a painted multi-line string. */
export function renderLogoHero(): string {
  return LOGO_HERO.map(paintLogoLine).join('\n');
}
