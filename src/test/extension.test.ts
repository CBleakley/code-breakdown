import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  API_KEY_CLEARED_MESSAGE,
  API_KEY_EMPTY_MESSAGE,
  API_KEY_REQUIRED_MESSAGE,
  API_KEY_SAVED_MESSAGE,
  CLEAR_API_KEY_COMMAND,
  NO_SELECTION_MESSAGE,
  RUN_COMMAND,
  SET_API_KEY_COMMAND,
} from "../constants";
import { CodeSelection } from "../selection";

const TEST_KEY = "sk-ant-test-SENTINEL-0123456789";

interface Stubs {
  /** Options passed to each `showInputBox` call. */
  inputBoxes: vscode.InputBoxOptions[];
  /** Messages passed to `showInformationMessage`. */
  messages: string[];
  /** Everything written to the console. */
  logs: string[];
}

/**
 * Runs `fn` with `showInputBox`, `showInformationMessage` and the console stubbed.
 * Each `showInputBox` call returns the next value in `inputs` (`undefined` = cancelled).
 */
async function withStubs<T>(
  inputs: (string | undefined)[],
  fn: () => Thenable<T>,
): Promise<Stubs & { result: T }> {
  const stubs: Stubs = { inputBoxes: [], messages: [], logs: [] };
  const window = vscode.window as Record<string, unknown>;
  const originalInputBox = window.showInputBox;
  const originalInfo = window.showInformationMessage;
  const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;
  const originalConsole = consoleMethods.map((m) => console[m]);

  const queue = [...inputs];
  window.showInputBox = (options: vscode.InputBoxOptions) => {
    stubs.inputBoxes.push(options);
    return Promise.resolve(queue.shift());
  };
  window.showInformationMessage = (message: string) => {
    stubs.messages.push(message);
    return Promise.resolve(undefined);
  };
  for (const m of consoleMethods) {
    console[m] = (...args: unknown[]) => {
      stubs.logs.push(args.map(String).join(" "));
    };
  }

  try {
    const result = await fn();
    return { ...stubs, result };
  } finally {
    window.showInputBox = originalInputBox;
    window.showInformationMessage = originalInfo;
    consoleMethods.forEach((m, i) => (console[m] = originalConsole[i]));
  }
}

function setKey(key = TEST_KEY) {
  return withStubs([key], () =>
    vscode.commands.executeCommand(SET_API_KEY_COMMAND),
  );
}

function clearKey() {
  return withStubs([], () =>
    vscode.commands.executeCommand(CLEAR_API_KEY_COMMAND),
  );
}

async function openSelection(): Promise<vscode.TextDocument> {
  const content = "const a = 1;\nfunction add(x, y) {\n  return x + y;\n}\n";
  const document = await vscode.workspace.openTextDocument({
    language: "typescript",
    content,
  });
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(1, 9, 2, 15);
  return document;
}

function expectedSelection(document: vscode.TextDocument): CodeSelection {
  return {
    text: "add(x, y) {\n  return x + y;",
    range: {
      start: { line: 1, character: 9 },
      end: { line: 2, character: 15 },
    },
    languageId: "typescript",
    filePath: document.uri.toString(),
  };
}

function readManifest() {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"),
  );
}

suite("Code breakdown command", () => {
  teardown(async () => {
    await clearKey();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("is contributed to the editor context menu when text is selected", () => {
    const manifest = readManifest();
    const command = manifest.contributes.commands.find(
      (c: { command: string }) => c.command === RUN_COMMAND,
    );
    assert.strictEqual(command?.title, "Code breakdown");

    const contextEntry = manifest.contributes.menus["editor/context"].find(
      (m: { command: string }) => m.command === RUN_COMMAND,
    );
    assert.strictEqual(contextEntry?.when, "editorHasSelection");

    const hiddenFromPalette = (
      manifest.contributes.menus.commandPalette ?? []
    ).some(
      (m: { command: string; when?: string }) =>
        m.command === RUN_COMMAND && m.when === "false",
    );
    assert.strictEqual(hiddenFromPalette, false);
  });

  test("captures the selected text, range, language and file path", async () => {
    await setKey();
    const document = await openSelection();

    const { result, inputBoxes } = await withStubs([], () =>
      vscode.commands.executeCommand<CodeSelection>(RUN_COMMAND),
    );

    assert.strictEqual(inputBoxes.length, 0);
    assert.deepStrictEqual(result, expectedSelection(document));
  });

  test("prompts for an API key when none is stored, then continues", async () => {
    const document = await openSelection();

    const { result, inputBoxes } = await withStubs([TEST_KEY], () =>
      vscode.commands.executeCommand<CodeSelection>(RUN_COMMAND),
    );

    assert.strictEqual(inputBoxes.length, 1);
    assert.strictEqual(inputBoxes[0].password, true);
    assert.deepStrictEqual(result, expectedSelection(document));

    const second = await withStubs([], () =>
      vscode.commands.executeCommand(RUN_COMMAND),
    );
    assert.strictEqual(second.inputBoxes.length, 0, "key should be stored");
  });

  test("stops when the API key prompt is cancelled", async () => {
    await openSelection();

    const { result, messages } = await withStubs([undefined], () =>
      vscode.commands.executeCommand(RUN_COMMAND),
    );

    assert.strictEqual(result, undefined);
    assert.deepStrictEqual(messages, [API_KEY_REQUIRED_MESSAGE]);
  });

  test("does not prompt for an API key when nothing is selected", async () => {
    const { result, inputBoxes, messages } = await withStubs([], () =>
      vscode.commands.executeCommand(RUN_COMMAND),
    );

    assert.strictEqual(result, undefined);
    assert.strictEqual(inputBoxes.length, 0);
    assert.deepStrictEqual(messages, [NO_SELECTION_MESSAGE]);
  });
});

suite("API key commands", () => {
  teardown(async () => {
    await clearKey();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  test("are contributed under the Code Breakdown category", () => {
    const commands: { command: string; title: string; category?: string }[] =
      readManifest().contributes.commands;
    const titles = commands
      .filter((c) =>
        [SET_API_KEY_COMMAND, CLEAR_API_KEY_COMMAND].includes(c.command),
      )
      .map((c) => `${c.category}: ${c.title}`);

    assert.deepStrictEqual(titles, [
      "Code Breakdown: Set API key",
      "Code Breakdown: Clear API key",
    ]);
  });

  test("does not expose the key as a setting", () => {
    const configuration = JSON.stringify(
      readManifest().contributes.configuration ?? {},
    );
    assert.ok(!/api.?key/i.test(configuration));
  });

  test("Set API key uses a masked input box and stores the key", async () => {
    const { inputBoxes, messages } = await setKey();

    assert.strictEqual(inputBoxes.length, 1);
    assert.strictEqual(inputBoxes[0].password, true);
    assert.strictEqual(
      inputBoxes[0].validateInput?.("   "),
      API_KEY_EMPTY_MESSAGE,
    );
    assert.strictEqual(inputBoxes[0].validateInput?.(TEST_KEY), undefined);
    assert.deepStrictEqual(messages, [API_KEY_SAVED_MESSAGE]);

    await openSelection();
    const run = await withStubs([], () =>
      vscode.commands.executeCommand(RUN_COMMAND),
    );
    assert.strictEqual(run.inputBoxes.length, 0);
  });

  test("Clear API key removes the stored key", async () => {
    await setKey();

    const { messages } = await clearKey();
    assert.deepStrictEqual(messages, [API_KEY_CLEARED_MESSAGE]);

    await openSelection();
    const run = await withStubs([undefined], () =>
      vscode.commands.executeCommand(RUN_COMMAND),
    );
    assert.strictEqual(run.inputBoxes.length, 1, "should prompt again");
  });

  test("never writes the key to logs or messages", async () => {
    const set = await setKey();
    await openSelection();
    const run = await withStubs([], () =>
      vscode.commands.executeCommand(RUN_COMMAND),
    );
    const clear = await clearKey();

    const output = [set, run, clear].flatMap((s) => [...s.logs, ...s.messages]);
    assert.ok(
      output.every((line) => !line.includes(TEST_KEY)),
      "API key leaked into output",
    );
  });
});
