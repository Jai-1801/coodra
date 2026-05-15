/**
 * `<TopBar>` — the persistent TUI nav bar: brand mark, wordmark,
 * version, the `/NN` tab strip, and a live state indicator. The active
 * tab takes a phosphor underline; inactive tabs render faint.
 *
 * The bar is **responsive**: it measures the terminal and progressively
 * drops the least-essential elements (version → full tab labels →
 * wordmark → state) so it always fits on one line. Without this it
 * overflowed and Ink wrapped `coodra` and the version onto a second
 * line, mangling the chrome on anything narrower than ~92 columns.
 */

import { Box, Spacer, Text } from 'ink';
import { palette, type Verdict } from '../theme.js';
import { BrandMark } from './BrandMark.js';
import { useTerminalSize } from './hooks.js';
import { StatusDot } from './StatusDot.js';

export interface TopBarTab {
  /** Stable identifier used to match `activeKey`. */
  readonly key: string;
  /** `/NN` number shown before the label. */
  readonly num: string;
  readonly label: string;
}

export interface TopBarProps {
  readonly tabs: readonly TopBarTab[];
  readonly activeKey: string;
  readonly version: string;
  /** Right-side state text, e.g. `solo · my-awesome-app`. */
  readonly stateLabel: string;
  /** Verdict colour for the state dot (default: `ok`). */
  readonly stateVerdict?: Verdict;
}

export function TopBar({ tabs, activeKey, version, stateLabel, stateVerdict = 'ok' }: TopBarProps) {
  const { columns } = useTerminalSize();
  // Progressive disclosure — widest-first. Each breakpoint is the
  // minimum column count at which the element still fits comfortably.
  const showVersion = columns >= 92;
  const fullTabLabels = columns >= 78;
  const showWordmark = columns >= 50;
  const showState = columns >= 40;

  return (
    <Box
      paddingX={1}
      borderStyle="single"
      borderColor={palette.inkFar}
      borderTop={false}
      borderLeft={false}
      borderRight={false}
    >
      <BrandMark variant="inline" />
      {showWordmark ? (
        <Text color={palette.phosphor} bold>
          {' coodra'}
        </Text>
      ) : null}
      {showVersion ? <Text color={palette.inkFar}>{` v${version}`}</Text> : null}

      <Spacer />

      {tabs.map((tab, index) => {
        const isActive = tab.key === activeKey;
        return (
          <Box key={tab.key} marginLeft={index === 0 ? 0 : 2}>
            <Text color={isActive ? palette.phosphor : palette.inkFar}>{`/${tab.num}`}</Text>
            {fullTabLabels ? (
              <Text {...(isActive ? {} : { dimColor: true as const })} underline={isActive}>
                {` ${tab.label}`}
              </Text>
            ) : null}
          </Box>
        );
      })}

      <Spacer />

      {showState ? (
        <Box flexShrink={0}>
          <StatusDot verdict={stateVerdict} />
          <Text dimColor wrap="truncate">
            {` ${stateLabel}`}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
