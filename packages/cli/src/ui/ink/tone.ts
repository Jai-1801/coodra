/**
 * `src/ui/ink/tone.ts` — semantic ink tones for the Ink TUI.
 *
 * The design system's three "ink" levels are background-adaptive by
 * construction (see `theme.ts`): `primary` rides the terminal's own
 * foreground, `dim` uses Ink's `dimColor` (which blends toward the
 * background on light *and* dark terminals), and `far` is the fixed
 * structural mid-grey. None of them is a fixed light-on-dark hex, so
 * none can go invisible on a light terminal.
 *
 * `inkText(tone)` returns the matching `<Text>` prop fragment; spread it:
 *   `<Text {...inkText('dim')} bold>…</Text>`
 */

import { palette } from '../theme.js';

export type InkTone = 'primary' | 'dim' | 'far';

/** `<Text>` prop fragment for a semantic ink tone. */
export function inkText(tone: InkTone): { readonly dimColor?: true; readonly color?: string } {
  switch (tone) {
    case 'dim':
      return { dimColor: true };
    case 'far':
      return { color: palette.inkFar };
    default:
      // `primary` — no colour prop, so the terminal's own foreground shows.
      return {};
  }
}
