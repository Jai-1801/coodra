/**
 * `<Divider>` — the axis divider between major TUI blocks: a faint
 * context axis with a single observed phosphor node at its centre.
 */

import { Box, Text } from 'ink';
import { glyph, palette } from '../theme.js';
import { useTerminalSize } from './hooks.js';

export interface DividerProps {
  /** Explicit visible width. When omitted, fills the terminal less `inset`. */
  readonly width?: number;
  /** Columns to subtract from the terminal width when `width` is omitted. */
  readonly inset?: number;
}

export function Divider({ width, inset = 0 }: DividerProps) {
  const { columns } = useTerminalSize();
  const total = Math.max(8, width ?? columns - inset);
  const armLen = Math.floor(Math.max(2, total - 3) / 2);
  const arm = glyph.rule.repeat(armLen);
  return (
    <Box>
      <Text color={palette.inkFar}>{`·${arm}`}</Text>
      <Text color={palette.phosphor} bold>
        {glyph.node.ok}
      </Text>
      <Text color={palette.inkFar}>{`${arm}·`}</Text>
    </Box>
  );
}
