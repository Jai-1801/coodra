/**
 * `App` — the TUI root. Persistent chrome (top bar + footer hint strip)
 * around three tab views: terminal, commands, status. `tab` /
 * `shift+tab` cycle views; each view owns its own keys while active.
 *
 * All three views stay mounted (their `<Box>` toggles `display`) so
 * state — half-typed commands, the last result, fetched dashboard
 * data — survives a tab switch. Each view gates its own input handling
 * on an `active` prop so a hidden view never steals a keystroke.
 */

import { Box, useInput } from 'ink';
import { useCallback, useState } from 'react';
import { Footer, type FooterHint, TopBar, type TopBarTab } from '../ui/ink/index.js';
import { stateLabel, type TuiContext } from './context.js';
import { CommandsView } from './views/CommandsView.js';
import { StatusView } from './views/StatusView.js';
import { TerminalView } from './views/TerminalView.js';

type TabKey = 'terminal' | 'commands' | 'status';

const TABS: readonly TopBarTab[] = [
  { key: 'terminal', num: '01', label: 'terminal' },
  { key: 'commands', num: '02', label: 'commands' },
  { key: 'status', num: '03', label: 'status' },
];

const HINTS: Record<TabKey, readonly FooterHint[]> = {
  terminal: [
    { keys: 'tab', label: 'switch views' },
    { keys: '↑↓', label: 'history' },
    { keys: '⏎', label: 'run' },
    { keys: 'ctrl+c', label: 'quit' },
  ],
  commands: [
    { keys: '↑↓', label: 'navigate' },
    { keys: '⏎', label: 'insert in terminal' },
    { keys: 'tab', label: 'switch views' },
    { keys: 'q', label: 'quit' },
  ],
  status: [
    { keys: 'tab', label: 'switch views' },
    { keys: 'r', label: 'refresh' },
    { keys: 'q', label: 'quit' },
  ],
};

export interface AppProps {
  readonly ctx: TuiContext;
}

export function App({ ctx }: AppProps) {
  const [tab, setTab] = useState<TabKey>('terminal');
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);

  useInput((_char, key) => {
    if (!key.tab) return;
    setTab((current) => {
      const index = TABS.findIndex((t) => t.key === current);
      const nextIndex = key.shift ? (index - 1 + TABS.length) % TABS.length : (index + 1) % TABS.length;
      const next = TABS[nextIndex];
      return next !== undefined ? (next.key as TabKey) : current;
    });
  });

  const handleSelectCommand = useCallback((command: string) => {
    setPendingCommand(command);
    setTab('terminal');
  }, []);

  const clearPending = useCallback(() => {
    setPendingCommand(null);
  }, []);

  return (
    <Box flexDirection="column">
      <TopBar tabs={TABS} activeKey={tab} version={ctx.version} stateLabel={stateLabel(ctx)} stateVerdict="ok" />

      <Box flexGrow={1} flexDirection="column">
        <Box display={tab === 'terminal' ? 'flex' : 'none'} flexDirection="column">
          <TerminalView
            ctx={ctx}
            active={tab === 'terminal'}
            pendingCommand={pendingCommand}
            onPendingConsumed={clearPending}
          />
        </Box>
        <Box display={tab === 'commands' ? 'flex' : 'none'} flexDirection="column">
          <CommandsView active={tab === 'commands'} onSelect={handleSelectCommand} />
        </Box>
        <Box display={tab === 'status' ? 'flex' : 'none'} flexDirection="column">
          <StatusView ctx={ctx} active={tab === 'status'} />
        </Box>
      </Box>

      <Footer hints={HINTS[tab]} />
    </Box>
  );
}
