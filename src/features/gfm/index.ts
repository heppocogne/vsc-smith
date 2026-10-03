import type MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import { alertPlugin } from './alert';
import { taskListPlugin } from './taskList';

const SECTION = 'vsc-smith.gfm';

function isEnabled(): boolean {
	return vscode.workspace.getConfiguration(SECTION).get<boolean>('enabled', true);
}

export interface MarkdownItExtension {
	extendMarkdownIt(md: MarkdownIt): MarkdownIt;
}

/**
 * Not a ToggleableFeature: the built-in preview calls `extendMarkdownIt` only once and the rules cannot be removed
 * afterwards, so each rule reads the setting every time it runs instead.
 */
export function registerGfm(context: vscode.ExtensionContext): MarkdownItExtension {
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(SECTION)) {
			// Fails when the built-in Markdown extension is disabled; there is no preview to refresh then.
			vscode.commands.executeCommand('markdown.preview.refresh').then(undefined, () => undefined);
		}
	}));
	return {
		extendMarkdownIt(md) {
			alertPlugin(md, isEnabled);
			taskListPlugin(md, isEnabled);
			return md;
		},
	};
}
