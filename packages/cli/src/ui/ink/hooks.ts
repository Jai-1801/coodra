/**
 * `src/ui/ink/hooks.ts` — shared hooks for the Ink component library.
 */

import { useStdout } from 'ink';
import { useCallback, useSyncExternalStore } from 'react';

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

// One store per output stream — keyed in a WeakMap so a single `resize`
// listener backs every `useTerminalSize()` caller for that stream
// (dozens of width-aware components must not each add a listener — that
// trips the EventEmitter cap). Keying on the stream rather than
// hard-coding `process.stdout` keeps it correct for Ink's managed
// stdout in production *and* the mock stream used under test.
interface StreamStore {
  size: TerminalSize;
  readonly listeners: Set<() => void>;
}

const stores = new WeakMap<NodeJS.WriteStream, StreamStore>();

function readSize(stream: NodeJS.WriteStream): TerminalSize {
  return { columns: stream.columns ?? 80, rows: stream.rows ?? 24 };
}

function storeFor(stream: NodeJS.WriteStream): StreamStore {
  const existing = stores.get(stream);
  if (existing !== undefined) return existing;

  const store: StreamStore = { size: readSize(stream), listeners: new Set() };
  stream.on('resize', () => {
    store.size = readSize(stream);
    for (const notify of store.listeners) notify();
  });
  stores.set(stream, store);
  return store;
}

/**
 * Live terminal dimensions. Seeds from Ink's stdout and re-renders on
 * SIGWINCH so width-aware components (section rules, dividers, the
 * responsive top bar, the banner) reflow when the pane resizes.
 */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const store = storeFor(stdout);

  const subscribe = useCallback(
    (onChange: () => void): (() => void) => {
      store.listeners.add(onChange);
      return () => {
        store.listeners.delete(onChange);
      };
    },
    [store],
  );

  // `store.size` is a stable reference between resizes, so this does not loop.
  return useSyncExternalStore(
    subscribe,
    () => store.size,
    () => store.size,
  );
}
