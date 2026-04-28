import { probePort } from '../../lib/probe-port.js';
import type { Check, CheckResult } from '../types.js';

/**
 * Module 04a finding #4 fix: when port 3101 is in use AND /healthz on
 * that port answers 200 OK, the bridge daemon is healthy. Upgrade to
 * GREEN. The fallback (port in use without working /healthz) stays
 * yellow.
 */
export const port3101Check: Check = {
  id: 18,
  name: 'Hooks Bridge port 3101 availability',
  severity: 'yellow',
  async run(ctx): Promise<CheckResult> {
    const probe = await probePort(ctx.bridgePort, 'Hooks Bridge');
    if (probe.status === 'green') return probe;
    if (await healthzOk(`http://127.0.0.1:${ctx.bridgePort}/healthz`, ctx.timeoutMs)) {
      return {
        status: 'green',
        detail: `port ${ctx.bridgePort} in use by healthy Hooks Bridge (/healthz returned ok)`,
      };
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
