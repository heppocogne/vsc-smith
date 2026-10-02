import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { openAnyway, toPattern, VIEW_TYPE } from '../features/binaryBlocker';
import { activateExtension, closeAllEditors, makeTempDir, waitFor } from './helpers';

const blockerConfig = () => vscode.workspace.getConfiguration('vsc-smith.binaryBlocker');
const workbenchConfig = () => vscode.workspace.getConfiguration('workbench');

function userAssociations(): Record<string, string> {
	return { ...workbenchConfig().inspect<Record<string, string>>('editorAssociations')?.globalValue };
}

function activeCustomViewType(): string | undefined {
	const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
	return input instanceof vscode.TabInputCustom ? input.viewType : undefined;
}

suite('binaryBlocker', () => {
	suite('toPattern', () => {
		test('normalizes extensions into glob patterns', () => {
			assert.strictEqual(toPattern('.exe'), '*.exe');
			assert.strictEqual(toPattern('exe'), '*.exe');
			assert.strictEqual(toPattern('*.exe'), '*.exe');
			assert.strictEqual(toPattern('  .tar.gz '), '*.tar.gz');
		});

		test('rejects empty entries', () => {
			assert.strictEqual(toPattern(''), undefined);
			assert.strictEqual(toPattern('.'), undefined);
			assert.strictEqual(toPattern('   '), undefined);
		});
	});

	suite('integration', () => {
		let dir: string;

		suiteSetup(async () => {
			await activateExtension();
			dir = await makeTempDir();
		});

		teardown(async () => {
			await closeAllEditors();
			await blockerConfig().update('enabled', undefined, vscode.ConfigurationTarget.Global);
			await blockerConfig().update('extensions', undefined, vscode.ConfigurationTarget.Global);
		});

		suiteTeardown(async () => {
			await workbenchConfig().update('editorAssociations', undefined, vscode.ConfigurationTarget.Global);
			await fs.rm(dir, { recursive: true, force: true });
		});

		test('registers the default extensions in workbench.editorAssociations', async () => {
			await waitFor(() => userAssociations()['*.exe'] === VIEW_TYPE, '*.exe associated');
			assert.strictEqual(userAssociations()['*.zip'], VIEW_TYPE);
		});

		test('opens matching files in the placeholder editor', async () => {
			await waitFor(() => userAssociations()['*.exe'] === VIEW_TYPE, '*.exe associated');
			const file = vscode.Uri.file(path.join(dir, 'app.exe'));
			await fs.writeFile(file.fsPath, Buffer.from([0x4d, 0x5a, 0x00, 0xff]));
			await vscode.commands.executeCommand('vscode.open', file);
			await waitFor(() => activeCustomViewType() === VIEW_TYPE, 'placeholder editor active');
		});

		test('Open Anyway replaces the placeholder with the default editor', async () => {
			await waitFor(() => userAssociations()['*.exe'] === VIEW_TYPE, '*.exe associated');
			const file = vscode.Uri.file(path.join(dir, 'text.exe'));
			await fs.writeFile(file.fsPath, 'plain text');
			await vscode.commands.executeCommand('vscode.open', file);
			await waitFor(() => activeCustomViewType() === VIEW_TYPE, 'placeholder editor active');

			const panel = { viewColumn: vscode.window.tabGroups.activeTabGroup.viewColumn } as vscode.WebviewPanel;
			await openAnyway(file, panel);
			await waitFor(() => vscode.window.activeTextEditor?.document.uri.fsPath === file.fsPath, 'text editor active');
			const placeholders = vscode.window.tabGroups.all.flatMap(g => g.tabs)
				.filter(t => t.input instanceof vscode.TabInputCustom && t.input.viewType === VIEW_TYPE);
			assert.strictEqual(placeholders.length, 0);
		});

		// Documents a VS Code limitation: after "Open Anyway" a file with real binary content still lands on
		// VS Code's own "binary file" placeholder, because extensions cannot force it to open as text.
		test('VS Code refuses to open binary content as text', async () => {
			const file = vscode.Uri.file(path.join(dir, 'real.exe'));
			await fs.writeFile(file.fsPath, Buffer.from([0x4d, 0x5a, 0x00, 0x00, 0xff, 0x00]));
			await assert.rejects(Promise.resolve(vscode.workspace.openTextDocument(file)), /binary/);
		});

		test('matches extensions case-insensitively', async () => {
			await waitFor(() => userAssociations()['*.exe'] === VIEW_TYPE, '*.exe associated');
			const file = vscode.Uri.file(path.join(dir, 'UPPER.EXE'));
			await fs.writeFile(file.fsPath, Buffer.from([0x4d, 0x5a]));
			await vscode.commands.executeCommand('vscode.open', file);
			await waitFor(() => vscode.window.tabGroups.activeTabGroup.activeTab !== undefined, 'tab opened');
			assert.strictEqual(activeCustomViewType(), VIEW_TYPE);
		});

		test('does not affect other files', async () => {
			const file = vscode.Uri.file(path.join(dir, 'notes.txt'));
			await fs.writeFile(file.fsPath, 'text');
			await vscode.commands.executeCommand('vscode.open', file);
			await waitFor(() => vscode.window.activeTextEditor?.document.uri.fsPath === file.fsPath, 'text editor active');
		});

		test('follows changes to the extension list', async () => {
			await blockerConfig().update('extensions', ['.foo'], vscode.ConfigurationTarget.Global);
			await waitFor(() => userAssociations()['*.foo'] === VIEW_TYPE && !('*.exe' in userAssociations()),
				'*.foo added and *.exe removed');
		});

		test('removes its entries when disabled', async () => {
			await blockerConfig().update('enabled', false, vscode.ConfigurationTarget.Global);
			await waitFor(() => !Object.values(userAssociations()).includes(VIEW_TYPE), 'all entries removed');

			await blockerConfig().update('enabled', true, vscode.ConfigurationTarget.Global);
			await waitFor(() => userAssociations()['*.exe'] === VIEW_TYPE, 'entries restored');
		});

		test('leaves associations owned by the user untouched', async () => {
			await workbenchConfig().update('editorAssociations',
				{ ...userAssociations(), '*.bar': 'default' }, vscode.ConfigurationTarget.Global);

			await blockerConfig().update('extensions', ['.exe', '.bar'], vscode.ConfigurationTarget.Global);
			await waitFor(() => !('*.zip' in userAssociations()), 'list applied');
			assert.strictEqual(userAssociations()['*.bar'], 'default');

			await blockerConfig().update('extensions', ['.exe'], vscode.ConfigurationTarget.Global);
			await blockerConfig().update('enabled', false, vscode.ConfigurationTarget.Global);
			await waitFor(() => !('*.exe' in userAssociations()), 'own entries removed');
			assert.strictEqual(userAssociations()['*.bar'], 'default');
		});
	});
});
