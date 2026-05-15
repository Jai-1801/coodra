/**
 * `src/ui/brand.ts` — the context-axis vocabulary.
 *
 * The Coodra logo proper (the circle observing a node) lives in
 * `logo.ts`. This module is the *axis* half of the system metaphor: the
 * `·──●` node and the full-width axis used for timelines, dividers, and
 * the prompt indicator. Every run is a node observed on this axis; the
 * logo is that idea crystallised into a single mark.
 *
 * Pure string renderers — consumed by `format.ts` for one-shot output.
 */

import { glyph, paint, style, VERDICT_GLYPH, VERDICT_PAINT, type Verdict } from './theme.js';

/** The left arm of a small axis node — a faint two-dash run leading into the node. */
const NODE_ARM = '·──';

/**
 * A verdict node on the axis — `·──●` where the dot's glyph and colour
 * encode the outcome. Used literally to annotate state: every run is a
 * node, every service is a node, every policy decision is a node.
 */
export function axisNode(verdict: Verdict): string {
  return paint.inkFar(NODE_ARM) + style.bold(VERDICT_PAINT[verdict](VERDICT_GLYPH[verdict]));
}

/**
 * Build the context axis at an approximate target width, returning both
 * the plain string (for width measurement / centring) and the painted
 * string (for output). Two equal arms flank the centre node, so the
 * actual visible width is `2 * floor((target - 3) / 2) + 3`.
 */
export function axisParts(targetWidth: number = 60): { readonly plain: string; readonly painted: string } {
  const inner = Math.max(2, targetWidth - 3);
  const armLen = Math.floor(inner / 2);
  const arm = glyph.rule.repeat(armLen);
  const plain = `·${arm}${glyph.node.ok}${arm}·`;
  const painted = paint.inkFar(`·${arm}`) + style.bold(paint.phosphor(glyph.node.ok)) + paint.inkFar(`${arm}·`);
  return { plain, painted };
}

/**
 * The full-width divider between major sections — the context axis with
 * a single observed node at its centre.
 */
export function axisDivider(width: number = 60): string {
  return axisParts(width).painted;
}
