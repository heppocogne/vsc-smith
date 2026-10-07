import * as vscode from 'vscode';
import { MarkdownItExtension, refreshPreview } from '../../util/markdownPreview';
import { alertPlugin } from './alert';
import { footnotePlugin } from './footnote';
import { taskListPlugin } from './taskList';

const SECTION = 'vsc-smith.gfm';

function isEnabled(): boolean {
	return vscode.workspace.getConfiguration(SECTION).get<boolean>('enabled', true);
}

/**
 * Not a ToggleableFeature: the built-in preview calls `extendMarkdownIt` only once and the rules cannot be removed
 * afterwards, so each rule reads the setting every time it runs instead.
 */
export function registerGfm(context: vscode.ExtensionContext): MarkdownItExtension {
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(SECTION)) {
			refreshPreview();
		}
	}));
	return {
		extendMarkdownIt(md) {
			alertPlugin(md, isEnabled);
			taskListPlugin(md, isEnabled);
			footnotePlugin(md, isEnabled);
			return md;
		},
	};
}
