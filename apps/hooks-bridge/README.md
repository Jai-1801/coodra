# @coodra/contextos-hooks-bridge

ContextOS Hooks Bridge — the **write surface** of the system. Hono
service on `127.0.0.1:3101` that ingests Claude Code, Windsurf, and
Cursor hook events, normalizes them through per-agent adapters into the
canonical `HookEvent` shape, runs pre-tool policy enforcement, and
appends to `runs` + `run_events`.

Pairs with `apps/mcp-server` (the read surface) per `system-architecture.md` §16 pattern 1 (CQRS).

## Routes

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/v1/hooks/claude-code` | Claude Code hook ingress (HTTP-native) | three-layer chain |
| `POST` | `/v1/hooks/windsurf` | Windsurf shell-adapter ingress | three-layer chain |
| `POST` | `/v1/hooks/cursor` | Cursor shell-adapter ingress | three-layer chain |
| `GET` | `/healthz` | Health check | none |

## Auth chain

Mirrors mcp-server's chain, sourced from `@coodra/contextos-shared/auth`:

1. **Solo bypass** — `CLERK_SECRET_KEY === 'sk_test_replace_me'` → request proceeds with `SOLO_IDENTITY`.
2. **`X-Local-Hook-Secret`** header equals `LOCAL_HOOK_SECRET` (timing-safe compare) → request proceeds.
3. **Clerk JWT** Bearer token → `verifyClerkJwt(token, env)` → request proceeds with the Clerk-derived identity.

First match wins. No match → `401 Unauthorized` JSON.

## Latency budgets

Per `system-architecture.md` §8 (solo mode):

- `POST /v1/hooks/{agent}` for `pre_*` events: **p95 < 50ms**.
- `POST /v1/hooks/{agent}` for `post_*` events: **p95 < 10ms** (the audit write is dispatched via `setImmediate`, not awaited inline).

## Fail-open posture

Per §7. Every error path returns `permissionDecision: 'allow'` with a structured `reason`:

- Zod parse failure → `'invalid_hook_payload'` + log at WARN.
- Policy DB unreachable / breaker open → `'policy_check_unavailable'`.
- ProjectSlug not registered → `'project_not_registered'`.
- Handler throws → `'policy_check_unavailable'`.

The only intentional block is an explicit `deny` from a matched policy rule.

## Local dev

```bash
pnpm install
pnpm --filter @coodra/contextos-hooks-bridge dev
# In another terminal:
curl http://127.0.0.1:3101/healthz
```

## Tests

```bash
pnpm --filter @coodra/contextos-hooks-bridge test:unit
pnpm --filter @coodra/contextos-hooks-bridge test:integration
```

Integration tests use Hono's `app.request()` fixture — no real port-listen needed for most cases. Cross-process tests at the repo-root e2e suite spawn the dist binary against a fresh SQLite path.

## Critical invariants

- **Hooks Bridge writes to local SQLite** in BOTH solo and team mode, per `system-architecture.md` §1 — local services always run on local SQLite. Cloud Postgres is reached only by future cloud-side processes.
- **Pre-tool latency is the single hardest budget** in this service. The policy module's cache + breaker (in `@coodra/contextos-policy`) is the load-bearing piece; do not bypass it.
- **Post-tool writes are async + idempotent.** The HTTP response returns within 10ms regardless of DB latency. Failures are WARN-logged with full decision context.
- **No new MCP tools.** Hooks Bridge is HTTP-only, off the MCP surface. Module 02's eight `contextos__*` tools are unchanged.
