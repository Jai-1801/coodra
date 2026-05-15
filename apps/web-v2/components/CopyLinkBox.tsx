'use client';

import { useState } from 'react';

/**
 * `apps/web-v2/components/CopyLinkBox.tsx` — one-line URL display with
 * a real Copy-to-clipboard button.
 *
 * Used on `/settings/team` to display the freshly-minted invite link
 * after an admin generates an invitation. The token-bearing URL is
 * sensitive (single-use credential for the bundle) and shown to the
 * admin exactly ONCE — making it easy to capture without typos or
 * accidental truncation is the right UX.
 *
 * Falls back gracefully if `navigator.clipboard` is unavailable
 * (e.g., http://localhost in some browsers without HTTPS-only
 * clipboard access). The button text reflects state: "Copy" →
 * "Copied ✓" for 2 seconds → "Copy".
 *
 * The URL itself remains selectable/highlightable in the `<code>` for
 * users who prefer manual copy.
 */
export function CopyLinkBox({ url }: { readonly url: string }) {
  const [copied, setCopied] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);

  async function handleCopy() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText !== undefined) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setFallbackError(null);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
      // Fallback: select the text via a hidden textarea + execCommand.
      // navigator.clipboard isn't always available on http:// origins
      // (Chrome restricts to secure contexts).
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        setCopied(true);
        setFallbackError(null);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setFallbackError('Copy failed. Highlight the URL above and use ⌘C / Ctrl-C.');
      }
    } catch (err) {
      setFallbackError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 8,
          marginTop: 8,
        }}
      >
        <code
          style={{
            flex: 1,
            display: 'block',
            padding: '8px 10px',
            background: 'var(--bg)',
            border: '1px solid var(--rule)',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--ink)',
            wordBreak: 'break-all',
            userSelect: 'all',
          }}
        >
          {url}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="btn btn--sm"
          style={{ flex: '0 0 auto', alignSelf: 'flex-start' }}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      {fallbackError !== null ? (
        <div
          style={{
            marginTop: 6,
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--warn)',
          }}
        >
          {fallbackError}
        </div>
      ) : null}
    </>
  );
}
