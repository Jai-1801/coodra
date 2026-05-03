/**
 * `lib/auto-marker/types` — public types shared between parser and
 * serializer. Module 08b S14.
 */

export interface AutoSection {
  /** Section name from `<!-- @auto:<name> -->`. lowercase + hyphen-separated. */
  readonly name: string;
  /** 1-based line number of the open tag. */
  readonly openLine: number;
  /** 1-based line number of the close tag. */
  readonly closeLine: number;
  /** Inner content lines (verbatim, no normalisation). */
  readonly innerLines: ReadonlyArray<string>;
}

export interface ParseError {
  readonly code:
    | 'missing_close_tag'
    | 'unmatched_close_tag'
    | 'nested_open_tag'
    | 'duplicate_section_name'
    | 'invalid_section_name';
  readonly line: number;
  readonly message: string;
}

export interface ParseResult {
  readonly sections: ReadonlyArray<AutoSection>;
  readonly errors: ReadonlyArray<ParseError>;
}

export interface SerializeReplacement {
  /** New inner content for the section. Single string; gets line-split. */
  readonly content: string;
}

export interface SerializeOptions {
  /**
   * If true, sections present in `replacements` but absent from the
   * source markdown get appended to the file end under a
   * `## Auto-generated (<date>)` heading. Defaults to false.
   */
  readonly appendNewSections?: boolean;
  /** Date string for the appended heading. Defaults to `new Date().toISOString().slice(0,10)`. */
  readonly appendDate?: string;
}

export interface SerializeResult {
  readonly markdown: string;
  /** Section names that existed in the source but had no replacement (left as-is). */
  readonly orphans: ReadonlyArray<string>;
  /** Section names that didn't exist in the source AND were appended (only when appendNewSections=true). */
  readonly appended: ReadonlyArray<string>;
}
