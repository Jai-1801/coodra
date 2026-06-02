# Coodra — Full Coordination Demo (Team mode + Graphify + Jira)

> A single end-to-end walkthrough that exercises **every coordination surface**:
> team bootstrap → project init with both integrations → build a codebase graph →
> run an agent against a Jira ticket → policy enforcement → decision records →
> context packs → write back to Jira → inspect the trail.
>
> **Two steps are yours to do in a browser (they cannot be automated):**
> 1. **Clerk sign-in** (`coodra login`) — proves your team identity.
> 2. **Atlassian OAuth** (`/mcp` in the agent) — authorises the Jira (Rovo) MCP.
>
> Everything else is copy-paste. Commands assume macOS/zsh and the paths on
> this machine; substitute your own where noted.

---

## 0 · Prerequisites (gather once)

| Need | Why | How to get it |
|---|---|---|
| **Node ≥ 22**, **pnpm** | Run the CLI + services | `node -v` |
| **uv** + `graphifyy[mcp]` | Build + serve the codebase graph | `uv tool install "graphifyy[mcp]"` |
| **Claude Code** | The agent that calls Coodra's tools | already installed |
| **Supabase Postgres URL** | Team cloud store (`DATABASE_URL`) | Supabase → Settings → Database → Connection string → URI |
| **Clerk Secret + Publishable keys** | Team identity | dashboard.clerk.com → API keys (`sk_…`, `pk_…`) |
| **Atlassian Jira cloud + a ticket** *(live Jira half only)* | Pull an issue / write back | a project key like `PROJ` and an issue `PROJ-123` |

Find your graphify interpreter (used to serve the graph):

```bash
echo "$(dirname "$(dirname "$(readlink -f "$(which graphify)")")")"   # parent of bin/
# On this machine the working one is:
#   /Users/abishaikc/.local/share/uv/tools/graphifyy/bin/python
```

---

## 1 · Install the `coodra` CLI

**Today (from this repo — not yet on npm):**

```bash
cd ~/Coodra
pnpm install
pnpm --filter @coodra/cli build          # tsc + bundle (mcp-server, hooks-bridge, sync-daemon, web)
cd packages/cli && npm i -g --force .     # the `install:global` script
coodra -v                                 # → 0.2.0-beta.15
```

**Once published (the real "just installed" path):**

```bash
npm i -g @coodra/cli@beta
coodra -v
```

---

## 2 · Bootstrap the TEAM (admin, once per team)

This flips the machine from solo → team, provisions the cloud, and binds your
Clerk org. We split login out so the browser handoff hits a *running* web.

```bash
# Step A — provision cloud + write team config, but DON'T auto-open the browser yet.
coodra team init --no-login
```

`team init` walks three steps and prints a ✓ for each:

1. **Postgres** — paste your Supabase `DATABASE_URL` → connects → `CREATE EXTENSION vector` → **applies every Drizzle migration** (this is where the cloud schema, incl. the knowledge-sync tables, lands).
2. **Clerk** — paste your **Secret Key** then **Publishable Key** → pick your org → it auto-creates the `coodra_cli` JWT template (idempotent).
3. **Local** — generates hook + invite secrets → writes `~/.coodra/config.json` + `~/.coodra/.env` (team mode).

```bash
# Step B — start services so the web dashboard is live on :3001.
coodra start

# Step C — NOW do the browser sign-in (web is up to receive the handoff).
coodra login            # 🔐 USER GATE #1 — browser opens, sign in to Clerk
```

> If you run a **deployed** team web (Railway/Vercel), you can skip the split and
> let `coodra team init` chain login inline — just point it at the deployment:
> `COODRA_WEB_URL=https://your-team.example coodra team init`.

Verify the machine is now a team machine:

```bash
coodra status          # mode: team · org: <your-org> · services: mcp/hooks/web/sync up
coodra org status      # active Clerk org bound to this laptop
```

**What just got coordinated:** this laptop now writes locally *and* syncs runs,
decisions, context packs, and policies to the team cloud via the sync-daemon.

---

## 3 · Create the demo PROJECT with both integrations wired

Pick a real (small) codebase so the graph and the agent have something to chew
on. `graphify clone` is a handy way to grab one:

```bash
graphify clone https://github.com/<owner>/<small-repo>    # prints the local path
cd <that-path>
#   …or just:  mkdir -p ~/coodra-demo && cd ~/coodra-demo  (init scaffolds a starter)
```

Initialise Coodra here — team-registered, with **Graphify** and **Jira** wired
into Claude Code in one shot:

```bash
coodra init --team --graphify --jira --ide claude
```

This writes, in the project root:

- `.mcp.json` — three MCP servers: **`coodra`**, **`graphify`**, **`atlassian`** (Rovo).
- `.coodra.json` — binds the project to your team org (so it syncs).
- `docs/feature-packs/<slug>/` — the project Feature Pack scaffold (spec / implementation / techstack).
- project-level `.env`.

`init --graphify` (beta.16+) **auto-detects and verifies** a `graphifyy[mcp]`
interpreter that can `import graphify.serve, mcp` (active venv → `./.venv` → the
`graphify` install on PATH → uv tool → `python3`) and wires *that* one — so the
old bare-`python3` "failed server" trap no longer happens. Just confirm:

```bash
coodra graphify status     # ✓ graphify entry present (verified interpreter)
coodra jira status         # ✓ atlassian (Rovo) entry present
```

> If it reports **"No working interpreter found yet"**, install Graphify and
> re-run — auto-detect picks it up, or pin one explicitly:
> ```bash
> uv tool install "graphifyy[mcp]"
> coodra graphify enable --force      # auto-detects; or add --python <path>
> ```

Your project slug (used below) is `path.basename(cwd)` — confirm it:

```bash
coodra project list        # find <slug> for the demo project
```

---

## 4 · Build the codebase graph

```bash
graphify update .          # extracts code → graphify-out/graph.json (no LLM)
graphify explain "<a function or class in the repo>"   # sanity-check it parsed
```

The wired `graphify` MCP server will serve `graphify-out/graph.json` to the agent
on demand (`python -m graphify.serve graphify-out/graph.json`).

---

## 5 · (Optional, recommended) Add a policy so the demo SHOWS enforcement

Make the Policy Engine visibly do its job — deny the agent any write to `.env`:

```bash
coodra policy add \
  --project <slug> \
  --tool Write --decision deny \
  --path-glob "**/.env" \
  --reason "demo: agent must never touch secrets"
coodra policy list --project <slug>
```

---

## 6 · The agent loop — where coordination becomes visible

Open **Claude Code** in the project directory. Then complete the Jira auth gate:

```
/mcp        →  authorise the `atlassian` server   🔐 USER GATE #2 (Atlassian OAuth)
```

> **No live Jira?** Skip the OAuth and run the "staged" variant noted at each
> Jira step — you still see `link_run_to_issue` and `prepare_jira_comment` work
> against a sample key like `DEMO-1`; you just don't pull/post a real ticket.

Now drive the session with plain-English prompts. Each prompt triggers specific
Coodra tools (the agent calls them — you just talk). Suggested script:

**① Session start (automatic).** When the session opens, the hooks-bridge injects
the project **Feature Pack** via `additionalContext`, and the agent calls
`get_run_id`, `list_features`, `query_run_history`, and `search_packs_nl`. You'll
see it acknowledge the project's conventions before doing anything.

**② Pull the ticket + bind the run:**

> *"We're picking up **PROJ-123** this session. Pull the ticket and summarise the
> acceptance criteria before we touch code."*

→ Agent calls Rovo's `getJiraIssue { issueIdOrKey: "PROJ-123" }`, then Coodra's
`link_run_to_issue { runId, issueRef: "PROJ-123" }` (binds `runs.issueRef`).
*(Staged: "Link this run to DEMO-1" → just `link_run_to_issue`.)*

**③ Use Graphify for blast radius (before editing):**

> *"Before changing anything, use the codebase graph: what depends on the auth
> handler, and what's the shortest path from the request entrypoint to it?"*

→ Agent calls Graphify's `query_graph` / `get_neighbors` / `shortest_path`.

**④ Do the work — policy fires on every write:**

> *"Implement the validation the ticket asks for."*

→ Before each file write the agent calls `check_policy { PreToolUse, Write, … }`.
Allowed writes proceed; the `.env` rule from step 5 returns **deny** and the agent
stops and reports it (try: *"Now also put the API key in .env"* to see the denial).

**⑤ Record a decision:**

> *"We're using Zod for the validation instead of hand-rolled checks — record that
> decision and why."*

→ Agent calls `record_decision { runId, description, rationale, alternatives }`.

**⑥ Close out the session:**

> *"We're done. Save a context pack summarising what we built, the decisions, and
> the files touched."*

→ Agent calls `save_context_pack { runId, title, content }`. (The bridge also
auto-saves a structured pack at SessionEnd as a safety net.)

**⑦ Write back to Jira:**

> *"Post a summary of this session back to PROJ-123."*

→ Agent calls Coodra's `prepare_jira_comment { runId }` (assembles `{ issueRef,
body }` from the context pack + top decisions), then posts it via Rovo's
`addCommentToJiraIssue { issueIdOrKey: "PROJ-123", body }`. **Open the ticket — the
comment is there.** *(Staged: the agent shows you the prepared body and the exact
`addCommentToJiraIssue` call it would make.)*

**⑧ Jira-aware history (proves traceability):**

> *"What work has touched PROJ-123, and what did we decide for it?"*

→ Agent calls `query_run_history { issueRef: "PROJ-123" }` and
`query_decisions { issueRef: "PROJ-123" }`.

---

## 7 · Inspect the coordination trail (CLI + web)

```bash
coodra run list --project <slug>            # the session shows up as a run
coodra run show <runId>                      # events + policy_decisions + decisions + context pack + issueRef
coodra pack list                             # the project Feature Pack
ls docs/context-packs/                       # the narrative context pack(s) from this session
coodra export <runId> --format markdown      # a shareable record of the whole run
```

Open the **web dashboard** for the same data, team-wide:

```
http://localhost:3001/
  /runs                     → the run, its events, policy decisions
  /packs                    → feature + context packs (synced across the team)
  /settings/policies        → the deny rule you added
  /settings/integrations    → Graphify + Jira wiring status
```

---

## 8 · "Use Graphify when needed" — on-demand navigation

Any later prompt that needs structure pulls the graph again, no rebuild:

> *"Where is `<symbol>` defined and what would break if I rename it?"*

→ `query_graph` + `get_neighbors`. This is the day-2 value: the agent navigates
the real dependency graph instead of grepping blindly.

---

## Coordination map — what fired, and what it produced

| Demo moment | Coordination surface | Durable artifact |
|---|---|---|
| Session opens | Hooks-bridge SessionStart → Feature Pack inject (Pattern 20) | agent sees project conventions |
| `get_run_id` | MCP binds the session | `runs` row (team-synced) |
| Pull ticket | Rovo `getJiraIssue` | (read) live ticket context |
| Link run | `link_run_to_issue` | `runs.issueRef = PROJ-123` |
| Blast radius | Graphify `query_graph` | (read) dependency subgraph |
| Each write | `check_policy` (PreToolUse) | `policy_decisions` audit rows |
| `.env` write | Policy **deny** | blocked + audited |
| Design choice | `record_decision` | `decisions` row (team-synced) |
| Session end | `save_context_pack` + bridge auto-pack | `docs/context-packs/*` + DB row |
| Write back | `prepare_jira_comment` → Rovo `addCommentToJiraIssue` | comment on the ticket |
| "What touched PROJ-123?" | `query_run_history` / `query_decisions` (issueRef filter) | Jira-aware history |

**The point of the demo:** the agent never works blind. It receives project
context *before* coding, is *governed* while coding, and leaves a *traceable,
team-synced, Jira-linked record* after coding — context in, policy during,
record back. That's the coordination layer.

---

## The two gates + the staged fallback (recap)

- 🔐 **Clerk sign-in** — `coodra login` (after `coodra start`). One browser round-trip.
- 🔐 **Atlassian OAuth** — `/mcp` in Claude Code authorises the `atlassian` server.
- **No live Jira?** Everything except *pulling/posting a real ticket* still runs;
  `link_run_to_issue` + `prepare_jira_comment` demonstrate against `DEMO-1`.

---

# Part B · Invite a teammate + prove the sync (cross-machine)

The payoff: a **second person on a different laptop** joins the team and sees
*everything you did* — runs, decisions, context packs, the Jira link — pulled
down through **Supabase**. This is where the Cloudflare tunnel comes in.

**Why a tunnel?** The invite handshake (`/auth/cli-login` + `/api/install`) is
served by *your* web on `localhost:3001`, which a teammate on another machine
can't reach. `coodra start --tunnel` exposes it via an ephemeral
`https://*.trycloudflare.com` URL (no Cloudflare account needed). The tunnel is
**only** for the one-time join handshake — the teammate's ongoing data sync goes
straight to Supabase.

## 9 · Admin machine — open a tunnel + mint the invite

```bash
brew install cloudflared                 # one-time; quick-tunnels need no Cloudflare account

coodra start --tunnel                    # prints https://<random>.trycloudflare.com
                                         # and writes COODRA_PUBLIC_URL into ~/.coodra/.env

# (optional) push any PRE-team solo data up so the teammate sees it too:
coodra team migrate --yes

coodra invite teammate@example.com --role member
#   ✓ Invite minted … Send them this link:
#       https://<random>.trycloudflare.com/install/<token>
```

- `invite` **auto-uses the tunnel URL** (via `COODRA_PUBLIC_URL`) — no `--web-url`.
- Requires you to be **admin** in the Clerk org and to have run `coodra login`.
- Quick-tunnels rotate on every `start`, so **mint the invite after starting the
  tunnel** and have the teammate join **while it's up**.

## 10 · Teammate machine (a different laptop) — join

The teammate needs only the CLI + a browser. **No Supabase/Clerk keys, no
cloudflared** — the install bundle delivers everything.

```bash
npm i -g @coodra/cli@beta                # just the CLI

coodra team join "https://<random>.trycloudflare.com/install/<token>"
#   → browser opens: sign in to Clerk (email MUST match the invite)   🔐 teammate gate
#   → redeems the invite (single-use), fetches the bundle (DATABASE_URL + keys),
#     writes ~/.coodra/{config.json,.env,clerk-token.json} → team mode, SAME Supabase

coodra status                            # mode: team · same org
coodra start                             # sync-daemon spawns → pulls cloud→local every ~10s
```

## 11 · Teammate verifies your work arrived (through Supabase)

```bash
sleep 15                                 # let the puller tick at least once
coodra project list                      # the team-registered demo project appears
coodra run list                          # YOUR runs — including the PROJ-123-linked one
coodra run show <runId>                   # events + decisions + context pack + issueRef — authored on the admin's laptop
coodra pack list                          # feature + context packs synced from cloud
```

Web: the teammate opens **their own** `http://localhost:3001/` → `/runs`,
`/packs`, `/settings/policies` — all your team-synced data is there.

**The cross-developer proof.** In the teammate's Claude Code (after `/mcp`
Atlassian auth, if they want Jira too):

> *"What work has touched PROJ-123, and what did we decide for it?"*

→ `query_run_history` / `query_decisions` return **the admin's** run + decisions.
Work done on one laptop — governed and recorded — shows up Jira-linked on a
teammate's laptop, through Supabase. That's the team coordination loop.

## What syncs — and what doesn't

| | |
|---|---|
| **Auto-synced** (team-mode work) | `runs`, `run_events`, `decisions`, `context_packs`, `feature_packs`, `features`, policies / kill-switches — pulled every ~10s (ADR-014). |
| **NOT auto-synced** | Anything created in **solo** mode before you went team. Run `coodra team migrate` once on the admin to push it up. |
| **Tunnel lifetime** | Needed only during `coodra team join`. After that the teammate's sync-daemon talks to Supabase directly — tear it down. |

## Teardown

```bash
coodra stop        # admin: also kills the cloudflared tunnel + clears COODRA_PUBLIC_URL
```

---

## Reset / re-run

```bash
coodra run list --project <slug>        # find runs to inspect or clean
coodra project reset <slug> --force     # wipe per-run audit rows for a clean re-demo (keeps policies)
coodra stop                              # stop all daemons when done
```
