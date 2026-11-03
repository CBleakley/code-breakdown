import * as vscode from "vscode";
import { clearApiKey, ensureApiKey, promptForApiKey } from "./apiKey";
import {
  API_KEY_CLEARED_MESSAGE,
  API_KEY_REQUIRED_MESSAGE,
  API_KEY_SAVED_MESSAGE,
  CLEAR_API_KEY_COMMAND,
  NO_SELECTION_MESSAGE,
  RUN_COMMAND,
  SET_API_KEY_COMMAND,
} from "./constants";
import { captureSelection, CodeSelection } from "./selection";

export function activate(context: vscode.ExtensionContext) {
  const { secrets } = context;

  context.subscriptions.push(
    vscode.commands.registerCommand(
      RUN_COMMAND,
      async (): Promise<CodeSelection | undefined> => {
        const selection = captureSelection(vscode.window.activeTextEditor);
        if (!selection) {
          vscode.window.showInformationMessage(NO_SELECTION_MESSAGE);
          return undefined;
        }

        const apiKey = await ensureApiKey(secrets);
        if (!apiKey) {
          vscode.window.showInformationMessage(API_KEY_REQUIRED_MESSAGE);
          return undefined;
        }

        return selection;
      },
    ),
    vscode.commands.registerCommand(SET_API_KEY_COMMAND, async () => {
      if (await promptForApiKey(secrets)) {
        vscode.window.showInformationMessage(API_KEY_SAVED_MESSAGE);
      }
    }),
    vscode.commands.registerCommand(CLEAR_API_KEY_COMMAND, async () => {
      await clearApiKey(secrets);
      vscode.window.showInformationMessage(API_KEY_CLEARED_MESSAGE);
    }),
  );
}

export function deactivate() {}
