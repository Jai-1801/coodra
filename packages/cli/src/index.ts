#!/usr/bin/env node
// MUST be the first import — sets CONTEXTOS_LOG_DESTINATION=stderr before
// any module that constructs a @coodra/contextos-shared logger. See
// `lib/log-destination-shim.ts` for the rationale.
import './lib/log-destination-shim.js';
// MUST be imported AFTER the log shim and BEFORE `buildProgram` — layers
// `<CONTEXTOS_HOME>/.env` and `<cwd>/.env` into `process.env` so doctor /
// start / status all see the same env. Closes Finding A from the
// 2026-04-28 functest. See `lib/env-bootstrap-shim.ts`.
import './lib/env-bootstrap-shim.js';
import { buildProgram } from './program.js';

const program = buildProgram();
await program.parseAsync(process.argv);
