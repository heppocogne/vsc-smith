import * as vscode from 'vscode';
import { registerCopyPath } from './features/copyPath';
import { registerFileSize } from './features/fileSize';

export function activate(context: vscode.ExtensionContext) {
	registerFileSize(context);
	registerCopyPath(context);
}

export function deactivate() { }
