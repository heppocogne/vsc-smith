import * as vscode from 'vscode';
import { ToggleableFeature } from '../util/feature';

const SECTION = 'vsc-smith.terminalRestore';
const STATE_KEY = 'vsc-smith.terminalRestore.terminals';
/** How long to wait for VS Code's own terminal revival before deciding whether to restore. */
const STARTUP_DELAY_MS = 1500;
/** Closing the window disposes every terminal; writing late keeps that from emptying the saved list. */
const SAVE_DELAY_MS = 1000;

export interface SavedTerminal {
	name?: string;
	/** Uri string */
	cwd?: string;
	env?: Record<string, string>;
}

export function registerTerminalRestore(context: vscode.ExtensionContext): void {
	let restored = false;
	context.subscriptions.push(
		new ToggleableFeature(SECTION, () => {
			const config = vscode.workspace.getConfiguration(SECTION);
			const tracker = new TerminalTracker(context.workspaceState, config.get<boolean>('restoreEnv', true));
			if (!restored) {
				restored = true;
				void tracker.restoreSaved(config.get<boolean>('skipIfRestoredByVSCode', true));
			} else {
				tracker.start();
			}
			return tracker;
		}),
	);
}

/** Terminals backed by an extension pseudoterminal or hidden/transient ones cannot be recreated from options. */
export function isRestorable(
	options: vscode.TerminalOptions | vscode.ExtensionTerminalOptions,
): options is vscode.TerminalOptions {
	return !('pty' in options) && !options.hideFromUser && !options.isTransient;
}

function cwdToString(cwd: string | vscode.Uri | undefined): string | undefined {
	if (cwd === undefined) {
		return undefined;
	}
	return typeof cwd === 'string' ? vscode.Uri.file(cwd).toString() : cwd.toString();
}

export function cleanEnv(
	env: { [key: string]: string | null | undefined } | undefined,
): Record<string, string> | undefined {
	if (!env) {
		return undefined;
	}
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		if (typeof value === 'string') {
			result[key] = value;
		}
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Remembers the terminals of the workspace (user-defined name, cwd, env) in workspaceState and recreates them on
 * the next start. Processes and scrollback are not restored.
 */
export class TerminalTracker implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	/** Name each terminal had when first seen; a different name later means it was renamed (or its title changed). */
	private readonly initialNames = new WeakMap<vscode.Terminal, string>();
	private timer: NodeJS.Timeout | undefined;
	private started = false;
	private disposed = false;

	constructor(
		private readonly state: vscode.Memento,
		private readonly restoreEnv: boolean,
	) {}

	/** Restores the saved terminals, then starts tracking. Tracking starts afterwards so the saved list is not overwritten. */
	async restoreSaved(skipIfRestoredByVSCode: boolean): Promise<void> {
		await new Promise(resolve => setTimeout(resolve, STARTUP_DELAY_MS));
		if (this.disposed) {
			return;
		}
		const saved = this.state.get<SavedTerminal[]>(STATE_KEY, []);
		if (saved.length > 0 && !(skipIfRestoredByVSCode && vscode.window.terminals.length > 0)) {
			for (const entry of saved) {
				const terminal = vscode.window.createTerminal({
					name: entry.name,
					cwd: entry.cwd ? vscode.Uri.parse(entry.cwd) : undefined,
					env: this.restoreEnv ? entry.env : undefined,
				});
				if (entry.name) {
					this.initialNames.set(terminal, entry.name);
				}
			}
		}
		this.start();
	}

	start(): void {
		if (this.started || this.disposed) {
			return;
		}
		this.started = true;
		const schedule = () => this.scheduleSave();
		this.disposables.push(
			vscode.window.onDidOpenTerminal(schedule),
			vscode.window.onDidCloseTerminal(schedule),
			vscode.window.onDidChangeActiveTerminal(schedule),
		);
		// Neither renaming nor `cd` fires an event, so also look for changes periodically.
		const interval = setInterval(schedule, 5000);
		this.disposables.push({ dispose: () => clearInterval(interval) });
		this.scheduleSave();
	}

	private scheduleSave(): void {
		clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.save(), SAVE_DELAY_MS);
	}

	snapshot(): SavedTerminal[] {
		const result: SavedTerminal[] = [];
		for (const terminal of vscode.window.terminals) {
			const options = terminal.creationOptions;
			if (!isRestorable(options)) {
				continue;
			}
			const initial = this.initialNames.get(terminal) ?? terminal.name;
			this.initialNames.set(terminal, initial);
			const name = options.name !== undefined || terminal.name !== initial ? terminal.name : undefined;
			// `shellIntegration` (VS Code 1.93+) follows `cd`; fall back to where the terminal was created.
			const live = (terminal as { shellIntegration?: { cwd?: vscode.Uri } }).shellIntegration?.cwd;
			const cwd = live?.toString() ?? cwdToString(options.cwd);
			const env = this.restoreEnv ? cleanEnv(options.env) : undefined;
			result.push({ name, cwd, env });
		}
		return result;
	}

	private async save(): Promise<void> {
		const snapshot = this.snapshot();
		if (JSON.stringify(snapshot) !== JSON.stringify(this.state.get(STATE_KEY, []))) {
			await this.state.update(STATE_KEY, snapshot);
		}
	}

	dispose(): void {
		this.disposed = true;
		clearTimeout(this.timer);
		this.disposables.forEach(d => d.dispose());
		this.disposables.length = 0;
	}
}
