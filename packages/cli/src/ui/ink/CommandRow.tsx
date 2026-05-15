/**
 * `<CommandRow>` — a row in the command catalog. The selected row gets
 * the small phosphor `▸` cursor and a bright bold name; unselected rows
 * render faint. Colour is reserved for state, so hierarchy here comes
 * from the cursor and weight.
 */

import { Box, Text } from 'ink';
import { glyph, palette } from '../theme.js';

export interface CommandRowProps {
  readonly active: boolean;
  readonly name: string;
  readonly description: string;
  /** Width of the command-name column (default: 26). */
  readonly nameWidth?: number;
}

export function CommandRow({ active, name, description, nameWidth = 26 }: CommandRowProps) {
  return (
    <Box>
      <Box width={2} flexShrink={0}>
        {active ? <Text color={palette.phosphor}>{glyph.cursor}</Text> : null}
      </Box>
      <Box width={nameWidth} flexShrink={0}>
        {active ? <Text bold>{name}</Text> : <Text dimColor>{name}</Text>}
      </Box>
      {/* Truncate (not wrap) so a long description never breaks the row's height / alignment. */}
      <Box flexGrow={1}>
        {active ? (
          <Text dimColor wrap="truncate">
            {description}
          </Text>
        ) : (
          <Text color={palette.inkFar} wrap="truncate">
            {description}
          </Text>
        )}
      </Box>
    </Box>
  );
}
