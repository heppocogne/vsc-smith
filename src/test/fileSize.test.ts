import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { FileSizeDecorationProvider, FileSizeStatusBar, statFile } from '../features/fileSize';
import { ToggleableFeature } from '../util/feature';
import { closeAllEditors, makeTempDir, removeTempDir, waitFor } from './helpers';

suite('fileSize', () => {
	let dir: string;
	let file: vscode.Uri;

	suiteSetup(async () => {
		dir = await makeTempDir();
		file = vscode.Uri.file(path.join(dir, 'sample.txt'));
		await fs.writeFile(file.fsPath, 'hello'); // 5 bytes
	});

	suiteTeardown(async () => {
		await closeAllEditors();
		await removeTempDir(dir);
	});

	suite('statFile', () => {
		test('returns the stat of a regular file', async () => {
			assert.strictEqual((await statFile(file))?.size, 5);
		});

		test('ignores directories, missing files and non-file schemes', async () => {
			assert.strictEqual(await statFile(vscode.Uri.file(dir)), undefined);
			assert.strictEqual(await statFile(vscode.Uri.file(path.join(dir, 'missing.txt'))), undefined);
			assert.strictEqual(await statFile(vscode.Uri.parse('untitled:Untitled-1')), undefined);
		});
	});

	suite('FileSizeDecorationProvider', () => {
		let provider: FileSizeDecorationProvider;
		setup(() => { provider = new FileSizeDecorationProvider(); });
		teardown(() => provider.dispose());

		test('puts the size in the tooltip without a badge', async () => {
			const decoration = await provider.provideFileDecoration(file);
			assert.strictEqual(decoration?.tooltip, 'Size: 5 B');
			assert.strictEqual(decoration?.badge, undefined);
			assert.strictEqual(decoration?.color, undefined);
		});

		test('does not decorate directories', async () => {
			assert.strictEqual(await provider.provideFileDecoration(vscode.Uri.file(dir)), undefined);
		});
	});

	suite('FileSizeStatusBar', () => {
		let bar: FileSizeStatusBar;
		setup(async () => {
			await closeAllEditors();
			bar = new FileSizeStatusBar(vscode.StatusBarAlignment.Right);
		});
		teardown(() => bar.dispose());

		test('shows the size of the active file', async () => {
			await vscode.window.showTextDocument(file);
			await waitFor(() => bar.item.text === '$(file) 5 B', 'status bar shows 5 B');
			assert.strictEqual(bar.item.tooltip, '5 bytes');
		});

		test('updates after the file is saved', async () => {
			const editor = await vscode.window.showTextDocument(file);
			await editor.edit(b => b.insert(new vscode.Position(0, 5), ' world'));
			await editor.document.save();
			await waitFor(() => bar.item.text === '$(file) 11 B', 'status bar shows 11 B after save');
			await fs.writeFile(file.fsPath, 'hello');
		});

		test('updates when the file is changed outside the editor', async () => {
			await vscode.window.showTextDocument(file);
			await waitFor(() => bar.item.text === '$(file) 5 B', 'status bar shows 5 B');
			await fs.writeFile(file.fsPath, 'x'.repeat(2048));
			await waitFor(() => bar.item.text === '$(file) 2.00 KB', 'status bar shows 2.00 KB', 10000);
			await fs.writeFile(file.fsPath, 'hello');
		});

		test('follows the active tab', async () => {
			const other = vscode.Uri.file(path.join(dir, 'other.txt'));
			await fs.writeFile(other.fsPath, 'abc');
			await vscode.window.showTextDocument(file);
			await waitFor(() => bar.item.text === '$(file) 5 B', 'status bar shows 5 B');
			await vscode.window.showTextDocument(other);
			await waitFor(() => bar.item.text === '$(file) 3 B', 'status bar shows 3 B');
		});
	});

	suite('ToggleableFeature', () => {
		const section = 'vsc-smith.fileSize';
		const config = () => vscode.workspace.getConfiguration(section);

		teardown(async () => {
			await config().update('enabled', undefined, vscode.ConfigurationTarget.Global);
			await config().update('statusBar', undefined, vscode.ConfigurationTarget.Global);
		});

		test('creates/disposes the instance as `enabled` changes and recreates it on other changes', async () => {
			let created = 0;
			let disposed = 0;
			const feature = new ToggleableFeature(section, () => {
				created++;
				return new vscode.Disposable(() => disposed++);
			});
			try {
				assert.deepStrictEqual([created, disposed], [1, 0]);

				await config().update('enabled', false, vscode.ConfigurationTarget.Global);
				await waitFor(() => disposed === 1, 'disposed when disabled');
				assert.strictEqual(created, 1);

				await config().update('enabled', true, vscode.ConfigurationTarget.Global);
				await waitFor(() => created === 2, 'recreated when enabled');

				await config().update('statusBar', false, vscode.ConfigurationTarget.Global);
				await waitFor(() => created === 3 && disposed === 2, 'recreated on other setting change');
			} finally {
				feature.dispose();
			}
			assert.deepStrictEqual([created, disposed], [3, 3]);
		});
	});
});
