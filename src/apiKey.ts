import * as vscode from "vscode";
import { API_KEY_EMPTY_MESSAGE, API_KEY_SECRET } from "./constants";

export function getApiKey(
  secrets: vscode.SecretStorage,
): Thenable<string | undefined> {
  return secrets.get(API_KEY_SECRET);
}

export async function promptForApiKey(
  secrets: vscode.SecretStorage,
): Promise<string | undefined> {
  const input = await vscode.window.showInputBox({
    title: "Anthropic API key",
    prompt: "Enter your Anthropic API key",
    placeHolder: "sk-ant-...",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() ? undefined : API_KEY_EMPTY_MESSAGE,
  });
  const key = input?.trim();
  if (!key) {
    return undefined;
  }
  await secrets.store(API_KEY_SECRET, key);
  return key;
}

export async function ensureApiKey(
  secrets: vscode.SecretStorage,
): Promise<string | undefined> {
  return (await getApiKey(secrets)) ?? promptForApiKey(secrets);
}

export function clearApiKey(secrets: vscode.SecretStorage): Thenable<void> {
  return secrets.delete(API_KEY_SECRET);
}
