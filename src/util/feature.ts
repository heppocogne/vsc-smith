import * as vscode from 'vscode';

/**
 * Creates the feature instance while `<section>.enabled` is true and disposes it when it becomes false.
 * Any other change under `section` recreates the instance so that it picks up the new settings.
 */
export class ToggleableFeature implements vscode.Disposable {
	private instance: vscode.Disposable | undefined;
	private readonly configListener: vscode.Disposable;

	constructor(
		private readonly section: string,
		private readonly create: () => vscode.Disposable,
	) {
		this.configListener = vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(this.section)) {
				this.instance?.dispose();
				this.instance = undefined;
				this.refresh();
			}
		});
		this.refresh();
	}

	private refresh(): void {
		const enabled = vscode.workspace.getConfiguration(this.section).get<boolean>('enabled', true);
		if (enabled && !this.instance) {
			this.instance = this.create();
		} else if (!enabled && this.instance) {
			this.instance.dispose();
			this.instance = undefined;
		}
	}

	dispose(): void {
		this.configListener.dispose();
		this.instance?.dispose();
		this.instance = undefined;
	}
}
