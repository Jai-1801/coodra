/**
 * `<SummaryBar>` — a tally line: segments joined by a faint `·`
 * separator. Used to close the Status view and command-output blocks
 * (`42 total runs · 47 allow · 2 deny · 0 ask`).
 */

import { Box, Text } from 'ink';
import { palette } from '../theme.js';

export interface SummarySegment {
  readonly text: string;
  /** Accent colour for the segment (a hex). Takes precedence over `tone`. */
  readonly color?: string;
  /** Semantic ink tone when the segment isn't an accent (default: `dim`). */
  readonly tone?: 'primary' | 'dim';
  readonly bold?: boolean;
}

export interface SummaryBarProps {
  readonly segments: readonly SummarySegment[];
}

/** `<Text>` colour/dim props for a segment — accent hex wins, else the semantic tone. */
function segmentProps(seg: SummarySegment): { readonly color?: string; readonly dimColor?: true } {
  if (seg.color !== undefined) return { color: seg.color };
  if (seg.tone === 'primary') return {};
  return { dimColor: true };
}

export function SummaryBar({ segments }: SummaryBarProps) {
  return (
    <Box>
      {segments.map((seg, index) => (
        // Segment texts are distinct stats (`42 total runs`, `47 allow`, …) — text is a stable key.
        <Box key={seg.text}>
          {index > 0 ? <Text color={palette.inkFar}>{'  ·  '}</Text> : null}
          <Text {...segmentProps(seg)} bold={seg.bold ?? false}>
            {seg.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
