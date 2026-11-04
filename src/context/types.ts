export interface BreakdownContext {
  code: string;
  languageId: string;
  startLine: number;
}

export type ContextErrorKind =
  "empty_selection" | "unsupported_language" | "too_large";

export type ContextResult =
  | { ok: true; context: BreakdownContext }
  | { ok: false; error: { kind: ContextErrorKind; message: string } };
