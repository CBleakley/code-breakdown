import * as vscode from "vscode";

export interface SelectionPosition {
  line: number;
  character: number;
}

export interface CodeSelection {
  text: string;
  range: {
    start: SelectionPosition;
    end: SelectionPosition;
  };
  languageId: string;
  filePath: string;
}

export function captureSelection(
  editor: vscode.TextEditor | undefined,
): CodeSelection | undefined {
  if (!editor || editor.selection.isEmpty) {
    return undefined;
  }

  const { document, selection } = editor;
  return {
    text: document.getText(selection),
    range: {
      start: {
        line: selection.start.line,
        character: selection.start.character,
      },
      end: { line: selection.end.line, character: selection.end.character },
    },
    languageId: document.languageId,
    filePath:
      document.uri.scheme === "file"
        ? document.uri.fsPath
        : document.uri.toString(),
  };
}
