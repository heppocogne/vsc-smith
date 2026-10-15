import { spawn } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { ToggleableFeature } from '../util/feature';

const SECTION = 'vsc-smith.pythonFormat';

/** Exit code of the formatter when it refuses to touch the source (syntax error, unsupported construct). */
const EXIT_REFUSED = 123;

/** Interpreter to run when `pythonPath` is empty: `python` is the usual name on Windows, `python3` elsewhere. */
export function defaultPython(platform: NodeJS.Platform = process.platform): string {
	return platform === 'win32' ? 'python' : 'python3';
}

/** Runs the bundled formatter (`python/vsc_smith_pyfmt`) on `source` and resolves with the formatted text. */
export function formatPython(python: string, extensionPath: string, source: string): Promise<string> {
	const moduleRoot = path.join(extensionPath, 'python');
	return new Promise((resolve, reject) => {
		const child = spawn(python, ['-m', 'vsc_smith_pyfmt'], {
			cwd: moduleRoot,
			env: { ...process.env, PYTHONPATH: moduleRoot, PYTHONIOENCODING: 'utf-8' },
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
		child.on('error', err => {
			const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
			reject(new Error(missing ? `Python interpreter not found: ${python}` : err.message));
		});
		child.on('close', code => {
			if (code === 0) {
				resolve(Buffer.concat(stdout).toString('utf8'));
				return;
			}
			const message = Buffer.concat(stderr).toString('utf8').trim();
			reject(new Error(code === EXIT_REFUSED ? message : `Python formatter failed (exit ${code}): ${message}`));
		});
		// An interpreter that exits early closes the pipe, which is reported through 'close' and not here.
		child.stdin.on('error', () => undefined);
		child.stdin.end(source, 'utf8');
	});
}

export class PythonFormatProvider implements vscode.DocumentFormattingEditProvider {
	constructor(private readonly extensionPath: string) {}

	async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
		const configured = vscode.workspace.getConfiguration(SECTION, document.uri).get<string>('pythonPath', '').trim();
		const original = document.getText();
		const formatted = await formatPython(configured || defaultPython(), this.extensionPath, original);
		if (formatted === original) {
			return [];
		}
		const whole = new vscode.Range(document.positionAt(0), document.positionAt(original.length));
		return [vscode.TextEdit.replace(whole, formatted)];
	}
}

export function registerPythonFormat(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		new ToggleableFeature(SECTION, () =>
			vscode.languages.registerDocumentFormattingEditProvider(
				[
					{ language: 'python', scheme: 'file' },
					{ language: 'python', scheme: 'untitled' },
				],
				new PythonFormatProvider(context.extensionPath),
			),
		),
	);
}
