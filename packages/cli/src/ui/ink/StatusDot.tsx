/**
 * `<StatusDot>` — a single verdict-coloured node glyph.
 *
 * The same dot vocabulary as the axis: `●` live, `✕` failed, `○` idle,
 * `!` degraded. Used inline in the top-bar state indicator and in
 * service-status rows.
 */

import { Text } from 'ink';
import { VERDICT_COLOR, VERDICT_GLYPH, type Verdict } from '../theme.js';

export interface StatusDotProps {
  readonly verdict: Verdict;
}

export function StatusDot({ verdict }: StatusDotProps) {
  return (
    <Text color={VERDICT_COLOR[verdict]} bold>
      {VERDICT_GLYPH[verdict]}
    </Text>
  );
}
