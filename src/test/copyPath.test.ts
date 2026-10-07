import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { COMMANDS, convertSeparators, targetUris } from '../features/copyPath';
import { activateExtension, closeAllEditors, makeTempDir, removeTempDir } from './helpers';

suite('copyPath', () => {
	suite('convertSeparators', () => {
		test('to slash on Windows', () => {
			assert.strictEqual(convertSeparators('C:\\work\\src\\a.ts', '/', 'win32'), 'C:/work/src/a.ts');
			assert.strictEqual(convertSeparators('src\\sub/a.ts', '/', 'win32'), 'src/sub/a.ts');
		});

		test('to slash elsewhere keeps backslashes, which are valid file name characters', () => {
			assert.strictEqual(convertSeparators('/work/a\\b.ts', '/', 'linux'), '/work/a\\b.ts');
		});

		test('to backslash', () => {
			assert.strictEqual(convertSeparators('/work/src/a.ts', '\\', 'linux'), '\\work\\src\\a.ts');
			assert.strictEqual(convertSeparators('src/a.ts', '\\', 'darwin'), 'src\\a.ts');
			assert.strictEqual(convertSeparators('C:\\work/a.ts', '\\', 'win32'), 'C:\\work\\a.ts');
		});
	});

	suite('targetUris', () => {
		const a = vscode.Uri.file(path.join(os.tmpdir(), 'a.txt'));
		const b = vscode.Uri.file(path.join(os.tmpdir(), 'b.txt'));

		test('uses the explorer selection when it contains the clicked resource', () => {
			assert.deepStrictEqual(targetUris(a, [a, b]).map(String), [a, b].map(String));
		});

		test('uses only the clicked resource when it is outside the selection', () => {
			assert.deepStrictEqual(targetUris(a, [b]).map(String), [a].map(String));
			assert.deepStrictEqual(targetUris(a, undefined).map(String), [a].map(String));
		});
	});

	suite('commands', () => {
		let dir: string;
		let file: vscode.Uri;

		suiteSetup(async () => {
			await activateExtension();
			dir = await makeTempDir();
			file = vscode.Uri.file(path.join(dir, 'sub', 'sample.txt'));
			await fs.mkdir(path.dirname(file.fsPath));
			await fs.writeFile(file.fsPath, 'hello');
		});

		suiteTeardown(async () => {
			await closeAllEditors();
			await removeTempDir(dir);
		});

		const expected = (sep: '/' | '\\') => convertSeparators(file.fsPath, sep);

		for (const { id, sep } of COMMANDS) {
			// No workspace folder is open in the test instance, so the relative path falls back to the full path.
			test(`${id} copies the given resource`, async () => {
				await vscode.commands.executeCommand(id, file, [file]);
				assert.strictEqual(await vscode.env.clipboard.readText(), expected(sep));
			});
		}

		test('copies the active editor when invoked without arguments', async () => {
			await vscode.window.showTextDocument(file);
			await vscode.commands.executeCommand('vsc-smith.copyRelativePath.slash');
			assert.strictEqual(await vscode.env.clipboard.readText(), expected('/'));
		});

		test('joins multiple selected resources with line breaks', async () => {
			const other = vscode.Uri.file(path.join(dir, 'other.txt'));
			await vscode.commands.executeCommand('vsc-smith.copyRelativePath.backslash', file, [file, other]);
			assert.strictEqual(
				await vscode.env.clipboard.readText(),
				[expected('\\'), convertSeparators(other.fsPath, '\\')].join(os.EOL),
			);
		});
	});
});
