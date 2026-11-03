export interface BreakdownContext {
  code: string; // the selected lines, exactly as in the file, with \n line endings
  languageId: string; // VS Code language ID, e.g. "typescriptreact"
  startLine: number; // 1-based file line number of the first selected line
}

export type ContextErrorKind =
  "empty_selection" | "unsupported_language" | "too_large";

export type ContextResult =
  | { ok: true; context: BreakdownContext }
  | { ok: false; error: { kind: ContextErrorKind; message: string } };
