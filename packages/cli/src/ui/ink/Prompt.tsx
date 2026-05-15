/**
 * `<Prompt>` — the command prompt line: `·──●  you ›`. Every command
 * typed is a literal observation on the context axis. Pass `command`
 * to echo a previously-run command, or `children` for the live input
 * slot (an `<TextInput>` from the Terminal view).
 */

import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import { glyph, palette } from '../theme.js';
import { AxisNode } from './AxisNode.js';

export interface PromptProps {
  readonly role?: string;
  /** Static command echo (mutually exclusive with `children` in practice). */
  readonly command?: string;
  /** Live input slot — typically an `<TextInput>`. */
  readonly children?: ReactNode;
}

export function Prompt({ role = 'you', command, children }: PromptProps) {
  return (
    <Box>
      <AxisNode verdict="ok" />
      <Text>{'  '}</Text>
      <Text color={palette.phosphor} bold>
        {role}
      </Text>
      <Text color={palette.inkFar}>{` ${glyph.promptSep} `}</Text>
      {command !== undefined ? <Text>{command}</Text> : null}
      {children}
    </Box>
  );
}
