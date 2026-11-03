import type { ContextErrorKind, ContextResult } from "./types";

/** 0-based, as in the VS Code API. */
export interface Position {
  line: number;
  character: number;
}

export interface BuildContextInput {
  languageId: string;
  selection: { start: Position; end: Position };
  lineCount: number;
  /** 0-based; returns the line without its line ending. */
  getLine: (line: number) => string;
}

export const SUPPORTED_LANGUAGES = [
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
  "python",
] as const;

export const MAX_SELECTION_LINES = 200;
export const MAX_SELECTION_CHARS = 20_000;

export const UNSUPPORTED_LANGUAGE_MESSAGE =
  "Code breakdown supports TypeScript, JavaScript (including React) and Python.";
export const EMPTY_SELECTION_MESSAGE = "Select some code first.";
export const TOO_LARGE_MESSAGE = "Select up to 200 lines at a time.";

function failure(kind: ContextErrorKind, message: string): ContextResult {
  return { ok: false, error: { kind, message } };
}

export function buildContext(input: BuildContextInput): ContextResult {
  const { languageId, selection, lineCount, getLine } = input;
  const { start, end } = selection;

  if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(languageId)) {
    return failure("unsupported_language", UNSUPPORTED_LANGUAGE_MESSAGE);
  }

  // An empty selection is a bare cursor; expanding it would pick up its line.
  if (start.line === end.line && start.character === end.character) {
    return failure("empty_selection", EMPTY_SELECTION_MESSAGE);
  }

  const first = start.line;
  let last = end.line;
  if (end.character === 0 && end.line > start.line) {
    last--;
  }
  last = Math.min(last, lineCount - 1);

  const lines: string[] = [];
  for (let i = first; i <= last; i++) {
    lines.push(getLine(i));
  }

  if (lines.every((line) => line.trim() === "")) {
    return failure("empty_selection", EMPTY_SELECTION_MESSAGE);
  }

  const code = lines.join("\n");
  if (lines.length > MAX_SELECTION_LINES || code.length > MAX_SELECTION_CHARS) {
    return failure("too_large", TOO_LARGE_MESSAGE);
  }

  return { ok: true, context: { code, languageId, startLine: first + 1 } };
}
