import type { AutoSection, ParseError, ParseResult } from './types.js';

/**
 * `lib/auto-marker/parser` — parses `<!-- @auto:<name> -->` ... `<!-- /@auto -->`
 * sections out of a markdown string. Module 08b S14.
 *
 * Grammar (per spec.md §10):
 *
 *   auto-section := open-tag inner-content close-tag
 *   open-tag     := "<!-- @auto:" section-name " -->"
 *   close-tag    := "<!-- /@auto -->"
 *   section-name := [a-z0-9][a-z0-9-]{0,63}
 *   inner-content := any markdown EXCEPT another open-tag (nesting forbidden)
 *
 * Parser semantics:
 *   - Tags must be on their own line (no inline auto sections in M08b)
 *   - Whitespace inside the tag is normalised — `<!-- @auto: foo  -->` works
 *   - `<!-- @auto:foo -->` inside a fenced ``` ``` code block is NOT parsed
 *   - Two sections with the same name → duplicate_section_name error
 *   - Nested open-tag inside an active section → nested_open_tag error
 *   - Open without matching close → missing_close_tag error
 *   - Close without preceding open → unmatched_close_tag error
 *
 * Errors are collected (not thrown) so consumers can decide whether
 * to surface a partial parse or refuse the file.
 */

const OPEN_PATTERN = /^<!--\s*@auto:\s*([a-z0-9-]+)\s*-->$/;
// Matches an `<!-- /@auto -->` close tag (whitespace flex).
const CLOSE_PATTERN = /^<!--\s*\/@auto\s*-->$/;
const VALID_SECTION_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

interface OpenState {
  readonly name: string;
  readonly openLine: number;
  readonly innerLines: string[];
}

export function parseAutoSections(markdown: string): ParseResult {
  const lines = markdown.split('\n');
  const sections: AutoSection[] = [];
  const errors: ParseError[] = [];
  const seenNames = new Map<string, number>(); // name → first-seen line
  let active: OpenState | null = null;
  let inFencedCode = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    // Fenced code-block tracking — toggle on every line starting with ```.
    if (trimmed.startsWith('```')) {
      inFencedCode = !inFencedCode;
      if (active !== null) active.innerLines.push(line);
      continue;
    }
    if (inFencedCode) {
      if (active !== null) active.innerLines.push(line);
      continue;
    }

    const openMatch = trimmed.match(OPEN_PATTERN);
    const closeMatch = trimmed.match(CLOSE_PATTERN);

    if (openMatch !== null) {
      const name = openMatch[1] ?? '';
      if (!VALID_SECTION_NAME.test(name)) {
        errors.push({
          code: 'invalid_section_name',
          line: i + 1,
          message: `section name "${name}" does not match grammar [a-z0-9][a-z0-9-]{0,63}`,
        });
        continue;
      }
      if (active !== null) {
        errors.push({
          code: 'nested_open_tag',
          line: i + 1,
          message: `nested <!-- @auto:${name} --> inside active section "${active.name}" (opened at line ${active.openLine})`,
        });
        // Don't open the nested section; treat as part of inner content.
        active.innerLines.push(line);
        continue;
      }
      const previousLine = seenNames.get(name);
      if (previousLine !== undefined) {
        errors.push({
          code: 'duplicate_section_name',
          line: i + 1,
          message: `section "${name}" already opened at line ${previousLine}`,
        });
        continue;
      }
      active = { name, openLine: i + 1, innerLines: [] };
      seenNames.set(name, i + 1);
      continue;
    }

    if (closeMatch !== null) {
      if (active === null) {
        errors.push({
          code: 'unmatched_close_tag',
          line: i + 1,
          message: 'close tag without preceding open',
        });
        continue;
      }
      sections.push({
        name: active.name,
        openLine: active.openLine,
        closeLine: i + 1,
        innerLines: [...active.innerLines],
      });
      active = null;
      continue;
    }

    if (active !== null) {
      active.innerLines.push(line);
    }
  }

  if (active !== null) {
    errors.push({
      code: 'missing_close_tag',
      line: active.openLine,
      message: `open tag for "${active.name}" at line ${active.openLine} has no matching <!-- /@auto -->`,
    });
  }

  return { sections, errors };
}
