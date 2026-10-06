import * as vscode from 'vscode';
import { MarkdownItExtension, refreshPreview } from '../../util/markdownPreview';
import { COPY_BUTTON_POSITIONS, CopyButtonPosition, copyButtonPlugin } from './plugin';

const SECTION = 'vsc-smith.copyButton';

function position(): CopyButtonPosition | undefined {
	const config = vscode.workspace.getConfiguration(SECTION);
	if (!config.get<boolean>('enabled', true)) {
		return undefined;
	}
	const value = config.get<string>('position', 'top-right');
	return COPY_BUTTON_POSITIONS.find(p => p === value) ?? 'top-right';
}

/**
 * Not a ToggleableFeature, for the same reason as GFM: the rule cannot be removed once added, so it checks the
 * setting every time it runs. When disabled nothing is marked and the preview script (`media/copyButton.js`) has
 * nothing to do.
 */
export function registerCopyButton(context: vscode.ExtensionContext): MarkdownItExtension {
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(SECTION)) {
			refreshPreview();
		}
	}));
	return {
		extendMarkdownIt(md) {
			copyButtonPlugin(md, position);
			return md;
		},
	};
}
