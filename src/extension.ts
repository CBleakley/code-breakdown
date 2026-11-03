import * as vscode from 'vscode';
import { captureSelection, CodeSelection } from './selection';

export const RUN_COMMAND = 'codeBreakdown.run';
export const NO_SELECTION_MESSAGE = 'Select some code to break down.';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand(RUN_COMMAND, (): CodeSelection | undefined => {
			const selection = captureSelection(vscode.window.activeTextEditor);
			if (!selection) {
				vscode.window.showInformationMessage(NO_SELECTION_MESSAGE);
				return undefined;
			}
			return selection;
		}),
	);
}

export function deactivate() {}
