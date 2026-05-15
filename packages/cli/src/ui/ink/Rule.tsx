/**
 * `<Rule>` — a faint horizontal rule. Fills `width` columns (or the
 * remaining terminal width minus `inset`) with the rule glyph.
 */

import { Text } from 'ink';
import { glyph, palette } from '../theme.js';
import { useTerminalSize } from './hooks.js';

export interface RuleProps {
  /** Explicit visible width. When omitted, fills the terminal less `inset`. */
  readonly width?: number;
  /** Columns to subtract from the terminal width when `width` is omitted. */
  readonly inset?: number;
  readonly color?: string;
}

export function Rule({ width, inset = 0, color = palette.inkFar }: RuleProps) {
  const { columns } = useTerminalSize();
  const len = Math.max(0, width ?? columns - inset);
  return <Text color={color}>{glyph.rule.repeat(len)}</Text>;
}
