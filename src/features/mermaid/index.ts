import * as vscode from 'vscode';
import { MarkdownItExtension, refreshPreview } from '../../util/markdownPreview';
import { mermaidPlugin } from './plugin';

const SECTION = 'vsc-smith.mermaid';
/** Extensions that draw Mermaid diagrams in the preview themselves: the one built into VS Code 1.121+ and its predecessor. */
const OTHER_EXTENSIONS = ['vscode.mermaid-markdown-features', 'bierner.markdown-mermaid'];

function isEnabled(): boolean {
	const config = vscode.workspace.getConfiguration(SECTION);
	if (!config.get<boolean>('enabled', true)) {
		return false;
	}
	// `getExtension` does not return disabled extensions.
	return !config.get<boolean>('yieldToOtherExtensions', true) || !OTHER_EXTENSIONS.some(id => vscode.extensions.getExtension(id));
}

/**
 * Not a ToggleableFeature, for the same reason as GFM: the rule cannot be removed once added, so it checks every
 * time it runs whether to draw. When it does not, the fence is left to the other extension (or stays a code block)
 * and the preview script (`media/mermaid.js`) finds nothing to do.
 */
export function registerMermaid(context: vscode.ExtensionContext): MarkdownItExtension {
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SECTION)) {
				refreshPreview();
			}
		}),
		vscode.extensions.onDidChange(refreshPreview),
	);
	return {
		extendMarkdownIt(md) {
			mermaidPlugin(md, isEnabled);
			return md;
		},
	};
}
