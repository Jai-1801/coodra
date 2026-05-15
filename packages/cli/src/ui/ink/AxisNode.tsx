/**
 * `<AxisNode>` — a verdict node on the context axis (`·──●`).
 *
 * The brand mark used literally to annotate state: a run, a service, a
 * policy decision. The dot's glyph and colour encode the outcome.
 */

import { Text } from 'ink';
import { palette, VERDICT_COLOR, VERDICT_GLYPH, type Verdict } from '../theme.js';

export interface AxisNodeProps {
  readonly verdict: Verdict;
}

export function AxisNode({ verdict }: AxisNodeProps) {
  return (
    <Text>
      <Text color={palette.inkFar}>·──</Text>
      <Text color={VERDICT_COLOR[verdict]} bold>
        {VERDICT_GLYPH[verdict]}
      </Text>
    </Text>
  );
}
