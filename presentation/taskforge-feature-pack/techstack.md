# taskforge — Tech Stack

> Read `spec.md` and `implementation.md` first. Pinned versions here are exact (no caret) for the production deps so the security surface is reproducible.

## Runtime

| Choice | Pin | Rationale |
|---|---|---|
| Node.js | `>=20.0.0` (engines.node) | Universal LTS floor. ES2023 syntax + native fetch + native test runner all available. |
| Module system | ESM (`"type": "module"`) | Modern default. No CJS interop pain because no CJS deps. |
| Language | TypeScript | Strict mode. Catches the only category of bugs a 5-command CLI is likely to ship: typos. |

## Direct dependencies (production)

| Library | Pin | Why this one |
|---|---|---|
| `commander` | `13.1.0` | The de facto Node CLI framework. Smaller than `yargs`, more ergonomic than `meow` for nested commands. Handles `--help` text generation and argument parsing without ceremony. |

That's the entire production dep tree. One library. Anything more is a future security incident not justified by the scope.

## Direct dependencies (dev)

| Library | Pin | Why |
|---|---|---|
| `typescript` | `^5.7.2` | Compiler. Caret because we want patch updates. |
| `vitest` | `^4.1.5` | Test runner. Native ESM, fast, snapshot-friendly. |
| `@vitest/coverage-v8` | `^4.1.5` | Line coverage reporter, gated at 80%. |
| `@types/node` | `^22.0.0` | Node API types. |

## File layout

```
taskforge/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── README.md                  (written manually after S7 — not in the slice plan)
├── src/
│   ├── index.ts               (commander program; wires subcommands)
│   ├── storage.ts             (pure: read/write tasks.json)
│   ├── types.ts               (Task + TaskFile interfaces)
│   └── commands/
│       ├── add.ts
│       ├── list.ts
│       ├── done.ts
│       └── remove.ts
└── __tests__/
    ├── storage.test.ts
    └── commands/
        ├── add.test.ts
        ├── list.test.ts
        ├── done.test.ts
        └── remove.test.ts
```

## Conventions

- **No process.exit() inside command modules.** Throw or return; `index.ts` is the only place that calls `process.exit()`. Makes the commands testable.
- **No console.log inside storage.** `storage.ts` is silent — it returns data or throws. Logging is the caller's job.
- **All file I/O is synchronous.** A CLI that runs once and exits doesn't benefit from async I/O complexity. `fs.readFileSync` + `fs.writeFileSync`.
- **Errors thrown by storage carry user-friendly messages.** `throw new Error('cannot read tasks file: <reason>')` not `throw new Error('ENOENT: no such file or directory ...')`. The CLI surfaces these messages directly.
- **Atomic writes.** Always write to `tasks.json.tmp` first, then `fs.renameSync`. Crash mid-write leaves the old file intact.

## Configuration

One env var:

| Var | Default | Purpose |
|---|---|---|
| `TASKFORGE_HOME` | `~/.taskforge/` | Directory containing `tasks.json`. Set this to put the file elsewhere. |

That's the entire configuration surface for the application itself. A `.env` file at the repo root is fine for developer convenience (test-time API keys, local dev defaults, things picked up by your shell or your editor) — the taskforge code itself reads `process.env` directly, not via a dotenv loader.

## What's NOT in the stack

These are deliberately absent:

- **No `chalk` / `picocolors` / colored output.** Plain text. Pipes cleanly into `grep` and `awk`. Color is noise in a 5-command CLI.
- **No `ora` / spinners.** Operations complete in milliseconds. A spinner would flash and disappear.
- **No `inquirer` / `prompts`.** Zero interactive prompts. Every command's input comes from argv.
- **No `dotenv` library at runtime.** The application reads `process.env` directly. A `.env` file at the repo root is fine for developer-side use (shell convenience, editor pickup), just not parsed by the app.
- **No DB drivers.** JSON file, full stop.
- **No HTTP client.** No network.
- **No logging library.** `console.log` and `console.error` are sufficient.

## Gotchas

- **Atomic rename across filesystems.** `fs.renameSync` fails with `EXDEV` when source and destination are on different filesystems. The `.tmp` file must be in the same directory as the target. Always write `tasks.json.tmp` next to `tasks.json`, never to `/tmp`.
- **`~` expansion.** `process.env.HOME` returns `/Users/abishaikc` (no trailing slash on macOS); paths must be joined with `path.join`, not string-concatenated. `~` is a shell expansion, not a Node API.
- **Empty file vs missing file.** A `tasks.json` that exists but contains `""` or `{}` is corrupt, not empty. Distinguish with explicit JSON.parse error handling.
