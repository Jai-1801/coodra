/**
 * `<TimelineRow>` — a run (or any observed event) rendered as a node on
 * the context axis: `·──●  12m ago  run_a8f3…  completed  47 events`.
 * The axis node's colour and the status word share the verdict colour.
 */

import { Box, Text } from 'ink';
import { palette, VERDICT_COLOR, type Verdict } from '../theme.js';
import { AxisNode } from './AxisNode.js';

export interface TimelineRowProps {
  readonly verdict: Verdict;
  /** Relative time, e.g. `12m ago`. */
  readonly when: string;
  /** Entity id, e.g. `run_a8f3…`. */
  readonly id: string;
  /** Status word, coloured by verdict. */
  readonly status: string;
  /** Trailing meta, e.g. `47 events`. */
  readonly meta?: string;
  readonly whenWidth?: number;
  readonly idWidth?: number;
  readonly statusWidth?: number;
}

export function TimelineRow({
  verdict,
  when,
  id,
  status,
  meta,
  whenWidth = 12,
  idWidth = 20,
  statusWidth = 12,
}: TimelineRowProps) {
  return (
    <Box>
      <AxisNode verdict={verdict} />
      <Text>{'  '}</Text>
      <Box width={whenWidth}>
        <Text dimColor>{when}</Text>
      </Box>
      <Box width={idWidth}>
        <Text>{id}</Text>
      </Box>
      <Box width={statusWidth}>
        <Text color={VERDICT_COLOR[verdict]}>{status}</Text>
      </Box>
      {meta !== undefined ? <Text color={palette.inkFar}>{meta}</Text> : null}
    </Box>
  );
}
