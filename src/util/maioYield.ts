import * as vscode from 'vscode';

const MAIO_ID = 'yzhang.markdown-all-in-one';

/**
 * Sets the context key that disables the keybindings of a feature while Markdown All in One, which has its own
 * equivalent, is enabled. `<section>.yieldToMarkdownAllInOne: false` keeps the keybindings.
 */
export class MaioYield implements vscode.Disposable {
	private readonly listener: vscode.Disposable;

	constructor(
		private readonly section: string,
		private readonly contextKey: string,
	) {
		this.listener = vscode.extensions.onDidChange(() => this.update());
		this.update();
	}

	private update(): void {
		const enabled =
			vscode.workspace.getConfiguration(this.section).get<boolean>('yieldToMarkdownAllInOne', true) &&
			vscode.extensions.getExtension(MAIO_ID) !== undefined;
		void vscode.commands.executeCommand('setContext', this.contextKey, enabled);
	}

	dispose(): void {
		this.listener.dispose();
		void vscode.commands.executeCommand('setContext', this.contextKey, false);
	}
}
