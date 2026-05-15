# Goal W4 — Cross-machine via Cloudflare Tunnel (`contextos start --tunnel`)

> Paste the block below into Claude Code after W3 is green:
>
>     /goal <PASTE THE CONDITION>

---

Web Bundle slice W4 — wire Cloudflare Tunnel for cross-machine invite URLs. Assumes W1+W2+W3 done (web bundled, beta.2 published, fresh install boots web). Plan: /Users/abishaikc/Coodra/web-bundle-plan.md.

Implementation:
(1) Add `--tunnel` flag to `contextos start` (Commander option + StartOptions field).
(2) New helper `packages/cli/src/lib/tunnel.ts`:
    - `detectCloudflared(): { path: string } | null` — uses `which cloudflared` via execa.
    - `startQuickTunnel({ localPort: 3001 }): Promise<{ url: string, child: ChildProcess }>` — spawns `cloudflared tunnel --url http://localhost:<port> --no-autoupdate`, parses the printed `https://*.trycloudflare.com` URL from stderr (cloudflared prints to stderr, not stdout). 60s timeout for the URL to appear.
    - `writeTunnelUrlToHomeEnv(url)` — atomic-rename writes CONTEXTOS_PUBLIC_URL=<url> to ~/.contextos/.env via the existing upsertEnvKey helper (or equivalent — Phase H.6 added one in finalize-config.ts; reuse).
(3) `contextos start` orchestration: AFTER all 4 daemons are healthy, if `--tunnel` set:
    - If cloudflared missing → print install instructions (brew install cloudflared / apt / curl-from-github) + EXIT 0 with a warning. Local web still up; just no public URL.
    - If cloudflared present → start tunnel, parse URL, write CONTEXTOS_PUBLIC_URL, print:
      `✓ Public tunnel: https://abcd.trycloudflare.com → http://localhost:3001`
      `  Invite URLs now use this host. Quick-tunnels expire when 'contextos stop' runs.`
(4) `contextos stop` orchestration: kill the tunnel child, remove CONTEXTOS_PUBLIC_URL from ~/.contextos/.env (revert to default localhost:3001).
(5) Doctor check 31 (new) — when CONTEXTOS_PUBLIC_URL is set, verify the URL is reachable via fetch from the agent's machine; report TUNNEL_UNREACHABLE soft-failure if not.

Acceptance:
(A) `which cloudflared` resolves. If not, run `brew install cloudflared` (macOS) or `curl -L ... -o /usr/local/bin/cloudflared && chmod +x` (Linux). Paste install confirmation.
(B) `contextos start --tunnel` on this laptop. Agent terminal output shows a `https://*.trycloudflare.com` URL printed by ContextOS. Paste verbatim.
(C) `curl -sSf https://<the-tunnel-url>/api/healthz` from the agent's terminal returns ok. This proves cross-machine reachability — the tunnel is publicly resolvable.
(D) `/usr/bin/grep CONTEXTOS_PUBLIC_URL ~/.contextos/.env` shows the tunnel URL (NOT localhost:3001).
(E) `contextos invite test-user@example.com` → printed URL contains the tunnel hostname.
(F) `contextos stop` → tunnel child terminated; `/usr/bin/grep CONTEXTOS_PUBLIC_URL ~/.contextos/.env` returns either localhost or nothing.
(G) Steps B-F twice from clean state (`contextos stop` + delete any leftover tunnel state between runs).

Then bump to 0.1.0-beta.3, rebuild, repack, isolated-verify, print the publish command, wait for user to publish (same pattern as W3), verify from public registry, twice clean.

Boundaries: tunnel is OPT-IN via `--tunnel` flag — `contextos start` without it must remain identical to today's behavior. cloudflared install is the user's action; agent only detects + instructs. Do NOT make the tunnel persistent across reboots (quick-tunnels expire — that's the design). Do NOT touch Phase G/H invariants.

Stop after 30 turns; report the failing step + tunnel-child stderr output.
