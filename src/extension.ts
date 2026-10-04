import * as vscode from 'vscode';
import { registerCopyPath } from './features/copyPath';
import { registerFileSize } from './features/fileSize';
import { registerGfm } from './features/gfm';
import { registerMarkdown } from './features/markdown';
import { registerMermaid } from './features/mermaid';
import { MarkdownItExtension } from './util/markdownPreview';

export function activate(context: vscode.ExtensionContext): MarkdownItExtension {
	registerFileSize(context);
	registerCopyPath(context);
	registerMarkdown(context);
	const plugins = [registerGfm(context), registerMermaid(context)];
	return {
		extendMarkdownIt: md => plugins.reduce((result, plugin) => plugin.extendMarkdownIt(result), md),
	};
}

export function deactivate() { }
