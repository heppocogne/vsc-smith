import type MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';

/** What `activate` returns to the built-in Markdown extension (`markdown.markdownItPlugins`). */
export interface MarkdownItExtension {
	extendMarkdownIt(md: MarkdownIt): MarkdownIt;
}

/** Re-renders the open Markdown previews, so that they pick up a change in what the markdown-it rules do. */
export function refreshPreview(): void {
	// Fails when the built-in Markdown extension is disabled; there is no preview to refresh then.
	vscode.commands.executeCommand('markdown.preview.refresh').then(undefined, () => undefined);
}
