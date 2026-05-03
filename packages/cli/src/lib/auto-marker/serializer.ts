import { parseAutoSections } from './parser.js';
import type { SerializeOptions, SerializeReplacement, SerializeResult } from './types.js';

/**
 * `lib/auto-marker/serializer` — replaces inner content of existing
 * auto sections; optionally appends new sections at file end. Module
 * 08b S14.
 *
 * Pure: no I/O. Operates on strings.
 *
 * Roundtrip property: `serialize(parse(x)) === x` when no replacements
 * are applied (proven via the corresponding unit test).
 *
 * Replacement semantics (per spec.md §8):
 *   1. Read all auto sections in the input.
 *   2. For each section in `replacements`:
 *      - If the section EXISTS in the input → replace its inner content.
 *      - If it doesn't exist AND `appendNewSections` is true → append
 *        at file end under a `## Auto-generated (<date>)` heading.
 *   3. For each section that EXISTS in the input but has NO replacement
 *      → leave the section as-is and report it in `orphans`.
 *
 * Open-tag and close-tag are never modified; only the inner content
 * between them is replaced.
 */

export function replaceAutoSections(
  markdown: string,
  replacements: Readonly<Record<string, SerializeReplacement>>,
  options: SerializeOptions = {},
): SerializeResult {
  const { sections } = parseAutoSections(markdown);
  const lines = markdown.split('\n');
  const out: string[] = [];
  const orphans: string[] = [];
  const handledNames = new Set<string>();

  // Walk the input line by line, replacing inner content when we hit an
  // open-tag for a section we have a replacement for.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Are we at the open-tag of a known section?
    const sectionStartingHere = sections.find((s) => s.openLine === i + 1);
    if (sectionStartingHere !== undefined) {
      out.push(line); // open tag
      const replacement = replacements[sectionStartingHere.name];
      if (replacement !== undefined) {
        // Emit replacement inner content (split on \n, strip a single
        // trailing newline so the close-tag's leading blank-line spacing
        // matches the input).
        const replaced = replacement.content.endsWith('\n') ? replacement.content.slice(0, -1) : replacement.content;
        for (const r of replaced.split('\n')) out.push(r);
        handledNames.add(sectionStartingHere.name);
      } else {
        // Keep original inner content verbatim; the section becomes an
        // orphan unless something else replaces it later.
        for (const r of sectionStartingHere.innerLines) out.push(r);
        orphans.push(sectionStartingHere.name);
      }
      // Skip to the close tag.
      // We have to advance i to closeLine - 1 (so the loop's i++ lands on closeLine - 1 + 1 = closeLine).
      i = sectionStartingHere.closeLine - 1;
      // Push the close tag.
      out.push(lines[i] ?? '');
      continue;
    }
    out.push(line);
  }

  // Append new sections (replacements that weren't seen in the input).
  const appended: string[] = [];
  if (options.appendNewSections === true) {
    const date = options.appendDate ?? new Date().toISOString().slice(0, 10);
    const newOnes = Object.keys(replacements).filter((name) => !handledNames.has(name) && !orphans.includes(name));
    if (newOnes.length > 0) {
      // Make sure the existing output ends with a blank line.
      while (out.length > 0 && out[out.length - 1] === '') out.pop();
      out.push('');
      out.push(`## Auto-generated (${date})`);
      out.push('');
      for (const name of newOnes) {
        const r = replacements[name];
        if (r === undefined) continue;
        out.push(`<!-- @auto:${name} -->`);
        const inner = r.content.endsWith('\n') ? r.content.slice(0, -1) : r.content;
        for (const line of inner.split('\n')) out.push(line);
        out.push('<!-- /@auto -->');
        out.push('');
        appended.push(name);
      }
    }
  }

  return {
    markdown: out.join('\n'),
    orphans,
    appended,
  };
}
