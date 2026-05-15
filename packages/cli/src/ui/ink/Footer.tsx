/**
 * `<Footer>` — the keybinding hint strip pinned to the bottom of the
 * TUI. A faint top rule, then `keys label` pairs separated by spacing.
 */

import { Box, Text } from 'ink';
import { palette } from '../theme.js';

export interface FooterHint {
  /** Key chord, e.g. `tab` or `↑↓`. */
  readonly keys: string;
  readonly label: string;
}

export interface FooterProps {
  readonly hints: readonly FooterHint[];
}

export function Footer({ hints }: FooterProps) {
  return (
    <Box
      paddingX={1}
      borderStyle="single"
      borderColor={palette.inkFar}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
    >
      {hints.map((hint, index) => (
        <Box key={hint.keys} marginLeft={index === 0 ? 0 : 3}>
          <Text dimColor>{hint.keys}</Text>
          <Text color={palette.inkFar}> {hint.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
