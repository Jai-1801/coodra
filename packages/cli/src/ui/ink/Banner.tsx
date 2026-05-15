/**
 * `<Banner>` — the splash hero: the Coodra logo mark (a circle
 * observing a node on a dotted axis), the `coodra` wordmark in figlet
 * block art, an italic tagline, and a meta line. Centred on the
 * terminal width; the block wordmark falls back to the plain word on
 * terminals too narrow to hold it.
 */

import { Box, Text } from 'ink';
import { palette } from '../theme.js';
import { WORDMARK_LINES, WORDMARK_WIDTH, wordmarkLineColor } from '../wordmark.js';
import { BrandMark } from './BrandMark.js';
import { useTerminalSize } from './hooks.js';

export interface BannerProps {
  readonly version: string;
  /** Italic tagline under the wordmark. */
  readonly tagline?: string;
  /** Plain-text wordmark fallback for narrow terminals (default: `coodra`). */
  readonly wordmark?: string;
  /** Trailing meta segment after `Coodra · vX`. */
  readonly metaSuffix?: string;
}

export function Banner({
  version,
  tagline = 'Master the context.',
  wordmark = 'coodra',
  metaSuffix = 'local-first by design',
}: BannerProps) {
  const { columns } = useTerminalSize();
  // The block wordmark needs room; below that, fall back to the word.
  const showBlockWordmark = columns >= WORDMARK_WIDTH + 4;

  return (
    <Box flexDirection="column" alignItems="center">
      <BrandMark variant="block" />
      <Box height={1} />
      {showBlockWordmark ? (
        <Box flexDirection="column">
          {WORDMARK_LINES.map((line, index) => (
            // Wordmark lines are positional and never reorder — index keys are correct here.
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed, ordered figlet art.
            <Text key={index} color={wordmarkLineColor(index)}>
              {line}
            </Text>
          ))}
        </Box>
      ) : (
        <Text color={palette.phosphor} bold>
          {wordmark}
        </Text>
      )}
      <Box height={1} />
      <Text color={palette.phosphor} italic>
        {tagline}
      </Text>
      <Box height={1} />
      <Box>
        <Text dimColor>Coodra</Text>
        <Text color={palette.inkFar}> · </Text>
        <Text dimColor>v{version}</Text>
        <Text color={palette.inkFar}> · </Text>
        <Text dimColor>{metaSuffix}</Text>
      </Box>
    </Box>
  );
}
