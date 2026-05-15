/**
 * `<SectionHead>` — a `/NN` section head: phosphor number, bold
 * uppercase title, a faint rule filling the rest of the line.
 * Hierarchy through numbering, not chrome.
 */

import { Box, Text } from 'ink';
import { glyph, palette } from '../theme.js';
import { useTerminalSize } from './hooks.js';

export interface SectionHeadProps {
  /** Two-digit-ish section number, e.g. `01`. */
  readonly num: string;
  readonly title: string;
  /** Explicit visible width. When omitted, fills the terminal less `inset`. */
  readonly width?: number;
  /** Columns to subtract from the terminal width when `width` is omitted. */
  readonly inset?: number;
}

export function SectionHead({ num, title, width, inset = 2 }: SectionHeadProps) {
  const { columns } = useTerminalSize();
  const total = width ?? columns - inset;
  const numTok = `/${num}`;
  const titleUpper = title.toUpperCase();
  // columns consumed before the rule: "/NN" + 2 + title + 2
  const consumed = numTok.length + 2 + titleUpper.length + 2;
  const ruleLen = Math.max(3, total - consumed);

  return (
    <Box>
      <Text color={palette.phosphor}>{numTok}</Text>
      <Text>{'  '}</Text>
      <Text bold>{titleUpper}</Text>
      <Text>{'  '}</Text>
      <Text color={palette.inkFar}>{glyph.rule.repeat(ruleLen)}</Text>
    </Box>
  );
}
