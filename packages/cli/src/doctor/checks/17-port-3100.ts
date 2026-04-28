import { probePort } from '../../lib/probe-port.js';
import type { Check, CheckResult } from '../types.js';

/**
 * Module 04a finding #4 fix: when port 3100 is in use AND /healthz on
 * that port answers 200 OK, the daemon is healthy and the warning is
 * misleading. Upgrade to GREEN. The fallback (port in use without a
 * working /healthz) stays yellow.
 */
export const port3100Check: Check = {
  id: 17,
  name: 'MCP server port 3100 availability',
  severity: 'yellow',
  async run(ctx): Promise<CheckResult> {
    const probe = await probePort(ctx.mcpPort, 'MCP server');
    if (probe.status === 'green') return probe;
    if (await healthzOk(`http://127.0.0.1:${ctx.mcpPort}/healthz`, ctx.timeoutMs)) {
      return { status: 'green', detail: `port ${ctx.mcpPort} in use by healthy MCP server (/healthz returned ok)` };
    }
    return probe;
  },
};

async function healthzOk(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 1500));
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}
