/**
 * `<KeyValueRow>` — an aligned key-value row, optionally prefixed by a
 * diagnostic glyph and suffixed by faint meta. The workhorse of the
 * Status view and any command-output detail block.
 */

import { Box, Text } from 'ink';
import { type CheckTone, palette, TONE_COLOR, TONE_GLYPH } from '../theme.js';
import { type InkTone, inkText } from './tone.js';

export interface KeyValueRowProps {
  /** Optional diagnostic prefix glyph (`✓ ⚠ ✗ ⏱ ·`), coloured by tone. */
  readonly tone?: CheckTone;
  readonly label: string;
  readonly value?: string;
  /** Accent colour for the value (a hex). Takes precedence over `valueTone`. */
  readonly valueColor?: string;
  /** Semantic ink tone for the value when it isn't an accent (default: `primary`). */
  readonly valueTone?: InkTone;
  /** Trailing meta, rendered faint after the value. */
  readonly meta?: string;
  /** Width of the label column (default: 22). */
  readonly labelWidth?: number;
}

export function KeyValueRow({
  tone,
  label,
  value,
  valueColor,
  valueTone = 'primary',
  meta,
  labelWidth = 22,
}: KeyValueRowProps) {
  // An explicit accent hex wins; otherwise fall back to the semantic ink tone.
  const valueProps = valueColor !== undefined ? { color: valueColor } : inkText(valueTone);
  return (
    <Box>
      <Box width={3}>{tone !== undefined ? <Text color={TONE_COLOR[tone]}>{TONE_GLYPH[tone]}</Text> : null}</Box>
      <Box width={labelWidth}>
        <Text dimColor>{label}</Text>
      </Box>
      {value !== undefined ? <Text {...valueProps}>{value}</Text> : null}
      {meta !== undefined ? <Text color={palette.inkFar}>{`  ${meta}`}</Text> : null}
    </Box>
  );
}
