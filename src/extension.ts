import * as vscode from 'vscode';
import { registerBinaryBlocker } from './features/binaryBlocker';
import { registerFileSize } from './features/fileSize';

export function activate(context: vscode.ExtensionContext) {
	registerFileSize(context);
	registerBinaryBlocker(context);
}

export function deactivate() { }
