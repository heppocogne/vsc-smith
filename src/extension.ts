import * as vscode from 'vscode';
import { registerCopyButton } from './features/copyButton';
import { registerCopyPath } from './features/copyPath';
import { registerFileSize } from './features/fileSize';
import { registerGfm } from './features/gfm';
import { registerGitGraph } from './features/gitGraph';
import { registerMarkdown } from './features/markdown';
import { registerMdEdit } from './features/mdEdit';
import { registerMermaid } from './features/mermaid';
import { registerPythonFormat } from './features/pythonFormat';
import { registerTerminalRestore } from './features/terminalRestore';
import { MarkdownItExtension } from './util/markdownPreview';

export function activate(context: vscode.ExtensionContext): MarkdownItExtension {
	registerFileSize(context);
	registerCopyPath(context);
	registerMarkdown(context);
	registerMdEdit(context);
	registerPythonFormat(context);
	registerGitGraph(context);
	registerTerminalRestore(context);
	const plugins = [registerGfm(context), registerMermaid(context), registerCopyButton(context)];
	return {
		extendMarkdownIt: md => plugins.reduce((result, plugin) => plugin.extendMarkdownIt(result), md),
	};
}

export function deactivate() {}
