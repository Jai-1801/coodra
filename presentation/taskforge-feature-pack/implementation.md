# taskforge — Implementation Plan

> Read `spec.md` first. This file is the build order; spec is what + why.

The plan splits taskforge into 7 small slices. Each slice is one commit. The order is deliberate: foundation → storage → commands top-to-bottom → tests last so we can write tests against real code, not stubs.

## S1 — Package scaffold

Create the workspace:

- `package.json` — `name: "taskforge"`, `bin: { "taskforge": "./dist/index.js" }`, `type: "module"`, `engines.node: ">=20.0.0"`.
- `tsconfig.json` — strict, ESM (`module: nodenext`), `outDir: dist`, `rootDir: src`.
- `vitest.config.ts` — v8 coverage, 80% line threshold.
- `src/index.ts` — `#!/usr/bin/env node` shebang, top-level commander program with empty subcommand stubs that exit 99.
- `.gitignore` — `node_modules/`, `dist/`, `tasks.json` (the runtime data file should never be committed).

Install: `commander@^13.1.0`, dev: `typescript@^5.7.2`, `vitest@^4.1.5`, `@types/node@^22`.

**Commit:** `feat: scaffold taskforge — package.json, tsconfig, commander surface`.

## S2 — Storage layer (`src/storage.ts`)

Pure functions for reading and writing the tasks file. No commander dependencies. No process.exit calls.

Exports:
- `getTasksFilePath(): string` — resolves `$TASKFORGE_HOME` env var, falls back to `~/.taskforge/`. Returns the full file path.
- `readTasks(): TaskFile` — reads the file. Returns `{ version: 1, tasks: [] }` if the file doesn't exist.
- `writeTasks(file: TaskFile): void` — atomic-rename pattern. Writes to `tasks.json.tmp`, then renames. Creates parent directory if missing.
- `nextId(file: TaskFile): number` — returns `max(task.id for task in tasks) + 1`, or `1` if empty.

Types:
```typescript
export interface Task {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
}

export interface TaskFile {
  version: 1;
  tasks: Task[];
}
```

**Commit:** `feat: storage — JSON file read/write with atomic-rename`.

## S3 — `add` command

Implement `taskforge add "<title>"` in `src/commands/add.ts`. Uses `storage.ts`. Title argument is required; print friendly error if missing.

```bash
$ taskforge add "buy milk"
✓ Added task #1
```

Wire into `src/index.ts`. Remove the exit-99 stub for this command.

**Commit:** `feat: add command`.

## S4 — `list` command

Implement `taskforge list` in `src/commands/list.ts`. Reads tasks, prints in the format from `spec.md` §"What done looks like". If zero tasks, print `(no tasks)`.

```bash
$ taskforge list
[ ] 1  buy milk
[x] 2  write report
```

**Commit:** `feat: list command`.

## S5 — `done` command

Implement `taskforge done <id>` in `src/commands/done.ts`. ID argument is required and must parse as a positive integer. If the ID doesn't exist in the file, print `error: no task with id <id>` and exit 1.

```bash
$ taskforge done 1
✓ Marked task #1 as done

$ taskforge done 99
error: no task with id 99
```

**Commit:** `feat: done command`.

## S6 — `remove` command

Implement `taskforge remove <id>` in `src/commands/remove.ts`. Same validation as `done`. Removes the task from the array and writes.

```bash
$ taskforge remove 1
✓ Removed task #1
```

**Commit:** `feat: remove command`.

## S7 — Tests + CI

Add `__tests__/` with one file per command:
- `__tests__/storage.test.ts` — pure function tests against a tmpdir. Cover: empty file, existing file, atomic rename, parent-dir creation, nextId logic.
- `__tests__/commands/add.test.ts`, `list.test.ts`, `done.test.ts`, `remove.test.ts` — invoke each command with mocked storage, assert stdout + exit code.

Each test file uses tmpdir for $TASKFORGE_HOME so tests don't touch the real `~/.taskforge/`.

Coverage target: 80% lines, gated in `vitest.config.ts`.

**Commit:** `test: storage + each command + 80% coverage gate`.

## What "done" hands off

A working `taskforge` CLI. Run `npm i -g .` from the repo and `taskforge add "hello"` works on PATH.

The `tasks.json` file format is stable — future `taskforge` versions read this exact shape. Migrations key off `version: 1`.

## Things deliberately NOT in scope

- No `update` command. Use `remove` + `add`.
- No `clear-all` command. Too footgun-y for a v1.
- No completion-shell scripts.
- No alternative output formats (JSON, CSV). `list` is human-readable only.
- No tests for the commander wiring itself; commander is library code.
