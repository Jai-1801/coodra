/**
 * `<Spinner>` — a phosphor activity spinner with an optional label.
 * Wraps `ink-spinner` so the rest of the TUI imports one component and
 * the spinner colour stays on-brand.
 */

import { Text } from 'ink';
import InkSpinner from 'ink-spinner';
import { palette } from '../theme.js';

export interface SpinnerProps {
  readonly label?: string;
}

export function Spinner({ label }: SpinnerProps) {
  return (
    <Text>
      <Text color={palette.phosphor}>
        <InkSpinner type="dots" />
      </Text>
      {label !== undefined ? <Text dimColor>{` ${label}`}</Text> : null}
    </Text>
  );
}
