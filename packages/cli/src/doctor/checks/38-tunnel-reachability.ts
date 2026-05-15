import type { Check } from '../types.js';

/**
 * W4 (2026-05-13) — when `CONTEXTOS_PUBLIC_URL` is set (the admin ran
 * `contextos start --tunnel` and a Cloudflare quick-tunnel banner was
 * written to `~/.contextos/.env`), verify the URL is publicly
 * reachable by fetching `/api/healthz`.
 *
 * Why it matters: quick-tunnels expire on `contextos stop` and on
 * cloudflared crashes. A stale CONTEXTOS_PUBLIC_URL silently makes
 * every minted invite URL 404 the moment a teammate clicks it. This
 * check turns that silent failure into a YELLOW signal pointing at
 * `contextos stop && contextos start --tunnel` as the recovery.
 *
 * SKIPPED when:
 *   - CONTEXTOS_PUBLIC_URL is unset (no tunnel intended).
 *   - URL starts with `http://localhost` or `http://127.0.0.1` (the
 *     non-tunnel default; reachability of the local server is already
 *     covered by checks 10/11/37).
 */
export const tunnelReachabilityCheck: Check = {
  id: 38,
  name: 'Cloudflare tunnel URL reachable (CONTEXTOS_PUBLIC_URL)',
  severity: 'red',
  async run(ctx) {
    const url = ctx.env.CONTEXTOS_PUBLIC_URL;
    if (typeof url !== 'string' || url.length === 0) {
      return { status: 'skipped' as const, detail: 'CONTEXTOS_PUBLIC_URL not set (no tunnel intended).' };
    }
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      return {
        status: 'skipped' as const,
        detail: `CONTEXTOS_PUBLIC_URL is local (${url}); tunnel reachability check applies only to public hostnames.`,
      };
    }
    const probeUrl = `${url.replace(/\/$/, '')}/api/healthz`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(ctx.timeoutMs - 200, 500));
    try {
      const response = await fetch(probeUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) {
        return { status: 'green' as const, detail: `Tunnel 200 OK at ${probeUrl}` };
      }
      return {
        status: 'yellow' as const,
        detail: `Tunnel returned ${response.status} at ${probeUrl}`,
        remediation:
          'The local web is up but the tunnel is degraded. Re-run `contextos stop && contextos start --tunnel` to rotate the quick-tunnel.',
      };
    } catch (err) {
      clearTimeout(timer);
      return {
        status: 'red' as const,
        detail: `TUNNEL_UNREACHABLE: ${probeUrl} — ${(err as Error).message}`,
        remediation:
          'The Cloudflare quick-tunnel has likely expired (they only live for the lifetime of the cloudflared process). ' +
          'Run `contextos stop && contextos start --tunnel` to rotate, OR unset CONTEXTOS_PUBLIC_URL if you no longer need cross-machine reachability.',
      };
    }
  },
};
