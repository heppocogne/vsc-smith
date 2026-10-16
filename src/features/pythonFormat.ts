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

/** A 1-based, inclusive range of lines. */
export interface LineRange {
	start: number;
	end: number;
}

/**
 * Runs the bundled formatter (`python/vsc_smith_pyfmt`) on `source` and resolves with the formatted text.
 * With `lines`, only the statements that touch those lines are formatted.
 */
export function formatPython(
	python: string,
	extensionPath: string,
	source: string,
	lines: LineRange[] = [],
): Promise<string> {
	const moduleRoot = path.join(extensionPath, 'python');
	const args = ['-m', 'vsc_smith_pyfmt', ...lines.map(r => `--lines=${r.start}-${r.end}`)];
	return new Promise((resolve, reject) => {
		const child = spawn(python, args, {
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

/**
 * The single replacement that turns `original` into `formatted`, covering only the lines that differ,
 * or `undefined` when they are equal. Offsets are UTF-16 code units, as in `TextDocument.offsetAt`.
 */
export function minimalEdit(
	original: string,
	formatted: string,
): { start: number; end: number; text: string } | undefined {
	if (original === formatted) {
		return undefined;
	}
	// Each element keeps its own line break, so the last line without one is told apart from an empty line.
	const split = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
	const a = split(original);
	const b = split(formatted);
	let head = 0;
	while (head < a.length && head < b.length && a[head] === b[head]) {
		head++;
	}
	let tail = 0;
	while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) {
		tail++;
	}
	const length = (lines: string[]) => lines.reduce((sum, l) => sum + l.length, 0);
	return {
		start: length(a.slice(0, head)),
		end: original.length - length(a.slice(a.length - tail)),
		text: b.slice(head, b.length - tail).join(''),
	};
}

/** The 1-based lines a range touches; a range that ends at column 0 does not include that last line. */
export function touchedLines(range: { start: { line: number }; end: { line: number; character: number } }): LineRange {
	const endLine = range.end.character === 0 && range.end.line > range.start.line ? range.end.line - 1 : range.end.line;
	return { start: range.start.line + 1, end: endLine + 1 };
}

export class PythonFormatProvider
	implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider
{
	constructor(private readonly extensionPath: string) {}

	provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
		return this.format(document, []);
	}

	/** Formats the statements that touch `range` and nothing else, which is what "format modified lines" needs. */
	provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.TextEdit[]> {
		return this.format(document, [touchedLines(range)]);
	}

	private async format(document: vscode.TextDocument, lines: LineRange[]): Promise<vscode.TextEdit[]> {
		const configured = vscode.workspace.getConfiguration(SECTION, document.uri).get<string>('pythonPath', '').trim();
		const original = document.getText();
		const formatted = await formatPython(configured || defaultPython(), this.extensionPath, original, lines);
		const edit = minimalEdit(original, formatted);
		if (!edit) {
			return [];
		}
		const range = new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end));
		return [vscode.TextEdit.replace(range, edit.text)];
	}
}

export function registerPythonFormat(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		new ToggleableFeature(SECTION, () => {
			const selector = [
				{ language: 'python', scheme: 'file' },
				{ language: 'python', scheme: 'untitled' },
			];
			const provider = new PythonFormatProvider(context.extensionPath);
			return vscode.Disposable.from(
				vscode.languages.registerDocumentFormattingEditProvider(selector, provider),
				vscode.languages.registerDocumentRangeFormattingEditProvider(selector, provider),
			);
		}),
	);
}
