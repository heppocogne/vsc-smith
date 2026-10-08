import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/** Polls `condition` until it returns true or `timeoutMs` elapses. */
export async function waitFor(
	condition: () => boolean | Promise<boolean>,
	message: string,
	timeoutMs = 5000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await condition()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	throw new Error(`Timed out waiting for: ${message}`);
}

export async function activateExtension(): Promise<void> {
	const ext = vscode.extensions.all.find(e => e.packageJSON.name === 'vsc-smith');
	if (!ext) {
		throw new Error('vsc-smith extension not found');
	}
	await ext.activate();
}

/** Creates a fresh temporary directory; remove it with `removeTempDir`. */
export function makeTempDir(): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), 'vsc-smith-test-'));
}

/**
 * Removes a directory made by `makeTempDir`. On Windows the file watcher of the test instance can keep a handle on it
 * for a moment after the test, which makes `rmdir` fail with EBUSY, so busy errors are retried.
 */
export function removeTempDir(dir: string): Promise<void> {
	return fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

export async function closeAllEditors(): Promise<void> {
	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
