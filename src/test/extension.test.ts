import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { CodeSelection } from "../selection";

const COMMAND = "codeBreakdown.run";

/** Runs `fn` with `showInformationMessage` stubbed, returning the messages it received. */
async function withInfoMessageStub(
  fn: () => Thenable<unknown>,
): Promise<{ result: unknown; messages: string[] }> {
  const messages: string[] = [];
  const window = vscode.window as { showInformationMessage: unknown };
  const original = window.showInformationMessage;
  window.showInformationMessage = (message: string) => {
    messages.push(message);
    return Promise.resolve(undefined);
  };
  try {
    const result = await fn();
    return { result, messages };
  } finally {
    window.showInformationMessage = original;
  }
}

suite("Code breakdown command", () => {
  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("is contributed to the editor context menu when text is selected", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"),
    );
    const command = manifest.contributes.commands.find(
      (c: { command: string }) => c.command === COMMAND,
    );
    assert.strictEqual(command?.title, "Code breakdown");

    const contextEntry = manifest.contributes.menus["editor/context"].find(
      (m: { command: string }) => m.command === COMMAND,
    );
    assert.strictEqual(contextEntry?.when, "editorHasSelection");

    const hiddenFromPalette = (
      manifest.contributes.menus.commandPalette ?? []
    ).some(
      (m: { command: string; when?: string }) =>
        m.command === COMMAND && m.when === "false",
    );
    assert.strictEqual(hiddenFromPalette, false);
  });

  test("captures the selected text, range, language and file path", async () => {
    const content = "const a = 1;\nfunction add(x, y) {\n  return x + y;\n}\n";
    const document = await vscode.workspace.openTextDocument({
      language: "typescript",
      content,
    });
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(1, 9, 2, 15);

    const result = await vscode.commands.executeCommand<CodeSelection>(COMMAND);

    assert.deepStrictEqual(result, {
      text: "add(x, y) {\n  return x + y;",
      range: {
        start: { line: 1, character: 9 },
        end: { line: 2, character: 15 },
      },
      languageId: "typescript",
      filePath: document.uri.toString(),
    });
  });
});
