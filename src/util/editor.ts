import * as vscode from 'vscode';

/** Returns the resource shown in the active tab (the modified side for diff editors). */
export function activeTabUri(): vscode.Uri | undefined {
	const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
	if (input instanceof vscode.TabInputText
		|| input instanceof vscode.TabInputCustom
		|| input instanceof vscode.TabInputNotebook) {
		return input.uri;
	}
	if (input instanceof vscode.TabInputTextDiff || input instanceof vscode.TabInputNotebookDiff) {
		return input.modified;
	}
	return undefined;
}
