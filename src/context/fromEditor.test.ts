import * as assert from "assert";
import * as vscode from "vscode";
import { contextFromEditor } from "./fromEditor";

suite("contextFromEditor", () => {
  teardown(() =>
    vscode.commands.executeCommand("workbench.action.closeAllEditors"),
  );

  test("returns \\n line endings for CRLF files and uses only the primary selection", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "javascript",
      content: "const a = 1;\r\nconst b = 2;\r\nconst c = 3;\r\n",
    });
    assert.strictEqual(document.eol, vscode.EndOfLine.CRLF);

    const editor = await vscode.window.showTextDocument(document);
    editor.selections = [
      new vscode.Selection(0, 6, 1, 3),
      new vscode.Selection(2, 0, 2, 5),
    ];

    assert.deepStrictEqual(contextFromEditor(editor), {
      ok: true,
      context: {
        code: "const a = 1;\nconst b = 2;",
        languageId: "javascript",
        startLine: 1,
      },
    });
  });
});
