/**
 * `<BrandMark>` — the Coodra logo for the Ink TUI.
 *
 * A circle observing a node on a dotted context axis. Three variants:
 *   - `inline` — `┄(●)┄`, a single row for the top bar.
 *   - `block`  — a 3-row rounded mark.
 *   - `hero`   — the 5-row splash-scale mark.
 *
 * The centre node renders phosphor + bold ("now"); the circle strokes
 * and dotted axis render in the faint structural ink (`inkFar`).
 */

import { Box, Text } from 'ink';
import { LOGO_BLOCK, LOGO_HERO, LOGO_INLINE_PLAIN, LOGO_NODE } from '../logo.js';
import { palette } from '../theme.js';

export type BrandVariant = 'inline' | 'block' | 'hero';

export interface BrandMarkProps {
  readonly variant?: BrandVariant;
}

/** One line of the mark — the centre node carries the eye, strokes recede. */
function LogoLine({ line }: { line: string }) {
  const at = line.indexOf(LOGO_NODE);
  if (at < 0) return <Text color={palette.inkFar}>{line}</Text>;
  return (
    <Text>
      <Text color={palette.inkFar}>{line.slice(0, at)}</Text>
      <Text color={palette.phosphor} bold>
        {LOGO_NODE}
      </Text>
      <Text color={palette.inkFar}>{line.slice(at + 1)}</Text>
    </Text>
  );
}

export function BrandMark({ variant = 'inline' }: BrandMarkProps) {
  if (variant === 'inline') {
    return <LogoLine line={LOGO_INLINE_PLAIN} />;
  }
  const lines = variant === 'hero' ? LOGO_HERO : LOGO_BLOCK;
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        // Mark lines are positional and fixed (and hero has two identical side rows) — index keys are correct.
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed, ordered logo art.
        <LogoLine key={index} line={line} />
      ))}
    </Box>
  );
}
