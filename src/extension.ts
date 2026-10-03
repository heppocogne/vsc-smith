import * as vscode from 'vscode';
import { registerFileSize } from './features/fileSize';

export function activate(context: vscode.ExtensionContext) {
	registerFileSize(context);
}

export function deactivate() { }
