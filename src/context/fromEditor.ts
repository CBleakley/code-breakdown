import type * as vscode from "vscode";
import { buildContext } from "./buildContext";
import type { ContextResult } from "./types";

/**
 * Builds the breakdown context from the editor's primary selection.
 * Extra cursors are ignored. `lineAt().text` excludes line endings, so CRLF
 * files produce `\n`-joined output.
 */
export function contextFromEditor(editor: vscode.TextEditor): ContextResult {
  const { document, selection } = editor;
  return buildContext({
    languageId: document.languageId,
    selection,
    lineCount: document.lineCount,
    getLine: (line) => document.lineAt(line).text,
  });
}
