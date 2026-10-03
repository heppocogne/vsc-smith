import * as vscode from 'vscode';
import { registerCopyPath } from './features/copyPath';
import { registerFileSize } from './features/fileSize';
import { registerGfm } from './features/gfm';
import { registerMarkdown } from './features/markdown';

export function activate(context: vscode.ExtensionContext) {
	registerFileSize(context);
	registerCopyPath(context);
	registerMarkdown(context);
	return registerGfm(context);
}

export function deactivate() { }
