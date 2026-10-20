import * as assert from 'assert';
import * as vscode from 'vscode';
import { TerminalTracker, cleanEnv, isRestorable } from '../features/terminalRestore';

class MemoryMemento implements vscode.Memento {
	private readonly data = new Map<string, unknown>();
	keys(): readonly string[] {
		return [...this.data.keys()];
	}
	get<T>(key: string, defaultValue?: T): T | undefined {
		return (this.data.has(key) ? this.data.get(key) : defaultValue) as T | undefined;
	}
	async update(key: string, value: unknown): Promise<void> {
		this.data.set(key, value);
	}
}

suite('terminalRestore', () => {
	test('cleanEnv drops null / undefined values and returns undefined when nothing is left', () => {
		assert.deepStrictEqual(cleanEnv({ A: '1', B: null, C: undefined }), { A: '1' });
		assert.strictEqual(cleanEnv({ B: null }), undefined);
		assert.strictEqual(cleanEnv(undefined), undefined);
	});

	test('isRestorable rejects pseudoterminals, hidden and transient terminals', () => {
		assert.strictEqual(isRestorable({ name: 'a' }), true);
		assert.strictEqual(isRestorable({ name: 'a', hideFromUser: true }), false);
		assert.strictEqual(isRestorable({ name: 'a', isTransient: true }), false);
		assert.strictEqual(
			isRestorable({
				name: 'a',
				pty: {} as vscode.Pseudoterminal,
			}),
			false,
		);
	});

	suite('snapshot', () => {
		let terminal: vscode.Terminal;
		let tracker: TerminalTracker;
		const cwd = vscode.Uri.file(process.cwd());

		setup(() => {
			terminal = vscode.window.createTerminal({ name: 'smith-test', cwd, env: { SMITH: '1' } });
			tracker = new TerminalTracker(new MemoryMemento(), true);
		});
		teardown(() => {
			tracker.dispose();
			terminal.dispose();
		});

		test('records the name, cwd and env the terminal was created with', () => {
			const entry = tracker.snapshot().find(t => t.name === 'smith-test');
			assert.ok(entry);
			assert.strictEqual(entry.cwd, cwd.toString());
			assert.deepStrictEqual(entry.env, { SMITH: '1' });
		});

		test('omits env when restoreEnv is off', () => {
			const noEnv = new TerminalTracker(new MemoryMemento(), false);
			try {
				assert.strictEqual(noEnv.snapshot().find(t => t.name === 'smith-test')?.env, undefined);
			} finally {
				noEnv.dispose();
			}
		});
	});
});
