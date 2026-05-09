# taskforge — Spec

> A small, opinionated, single-user task manager that lives in your terminal.

## What taskforge is

A Node.js CLI that lets one person manage a list of todos from the shell. No accounts, no cloud sync, no calendar, no priorities, no tags. The minimum thing that's actually useful: add a task, list tasks, mark a task done, remove a task.

Tasks are stored as a single JSON file at `$TASKFORGE_HOME/tasks.json` (defaults to `~/.taskforge/tasks.json`). The CLI is the only writer.

## Why these choices

- **JSON over SQLite.** The dataset is tiny (typically < 100 tasks per user). A JSON file is trivially diffable, version-controllable, and human-editable when something goes wrong. SQLite earns its place when concurrent writers exist or the dataset crosses ~10k rows. Neither is true here.
- **No daemon, no background sync, no IPC.** Each invocation reads the file, mutates, writes, exits. Concurrency is one user typing one command at a time. Worry about real concurrency when there's a real second writer.
- **Commander over yargs.** Commander's API is smaller and the help-text generation is nicer for a 4-command CLI. Yargs earns its keep at 20+ commands with deep nesting.
- **No external deps beyond `commander`.** Every dep is a future security incident; a CLI this size has no excuse for a dependency tree.

## Acceptance criteria

A build of `taskforge` is "complete" when **every** item below holds:

1. `taskforge add "buy milk"` adds a task and prints its assigned ID.
2. `taskforge list` prints all tasks with their ID, status checkbox, and title.
3. `taskforge done <id>` marks the task complete; subsequent `list` shows it checked.
4. `taskforge remove <id>` deletes the task; subsequent `list` no longer shows it.
5. `taskforge --help` and `taskforge <command> --help` both print useful help.
6. The tasks file at `$TASKFORGE_HOME/tasks.json` is created on first write if absent (parent directory too).
7. Every command prints a friendly error message — never a raw stack trace — when the user does something wrong (unknown command, bad ID, etc.).
8. Every command exits with code 0 on success, 1 on user error, 2 on system error (file unreadable, etc.).
9. `pnpm test` passes. Coverage on `src/` is ≥ 80%.

## Non-goals

These are **deliberately out of scope** for this build:

- Multi-user. Tasks are per-user-per-machine.
- Cloud sync, accounts, login.
- Tags, priorities, due dates, recurring tasks, reminders.
- A TUI (text user interface). It's a one-shot CLI.
- A GUI, a web UI, or a desktop app.
- Plugins or extensibility.
- Bash/zsh completion (later, if there's demand).
- Database backends. JSON file, full stop.

## Storage contract

`$TASKFORGE_HOME/tasks.json` is the only persisted state. Schema:

```json
{
  "version": 1,
  "tasks": [
    { "id": 1, "title": "buy milk", "completed": false, "createdAt": "2026-05-02T10:30:00.000Z" },
    { "id": 2, "title": "write report", "completed": true, "createdAt": "2026-05-02T11:00:00.000Z" }
  ]
}
```

- `id`: monotonically incrementing integer; never reused after `remove`.
- `version`: schema version. Hardcoded `1` for now. Future migrations key off this.
- `createdAt`: ISO 8601 UTC.
- The file is rewritten in full on every write. Atomic-rename pattern (`write to tasks.json.tmp`, `rename to tasks.json`) so a crash mid-write doesn't corrupt.

## CLI surface

| Command | Behavior |
|---|---|
| `taskforge add "<title>"` | Append a task; print the assigned ID. Title is required. |
| `taskforge list` | Print every task. Format: `[ ] 1  buy milk` / `[x] 2  write report`. |
| `taskforge done <id>` | Mark task `<id>` as completed. Error if ID doesn't exist. |
| `taskforge remove <id>` | Delete task `<id>`. Error if ID doesn't exist. |
| `taskforge --help` | Top-level help. |
| `taskforge --version` | Print version from `package.json`. |

## What "done" looks like

When taskforge is built per this spec, a user can:

```bash
$ taskforge add "buy milk"
✓ Added task #1

$ taskforge add "write report"
✓ Added task #2

$ taskforge list
[ ] 1  buy milk
[ ] 2  write report

$ taskforge done 1
✓ Marked task #1 as done

$ taskforge list
[x] 1  buy milk
[ ] 2  write report

$ taskforge remove 1
✓ Removed task #1

$ taskforge list
[ ] 2  write report
```

That's the whole product.
