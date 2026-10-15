import * as vscode from 'vscode';
import { ToggleableFeature } from '../../util/feature';
import { MaioYield } from '../../util/maioYield';
import { tsvToMarkdownTable } from './pasteTable';
import {
	changedPart,
	enterEdit,
	IndentOptions,
	indentEdit,
	isInFencedCodeBlock,
	LineEdit,
	outdentEdit,
} from './listEdit';

const SECTION = 'vsc-smith.markdown';
/** Context key used by the keybindings in package.json to leave the keys to Markdown All in One. */
const YIELD_CONTEXT = 'vsc-smith.markdown.yieldToMaio';

type ComputeEdit = (line: string, cursor: number, options: IndentOptions) => LineEdit | null;

/**
 * Enter, Tab and Shift+Tab are bound to these commands in package.json. Each command falls back to the default
 * behavior of the key when the edit does not apply, so that other `type` hooks and indentation keep working.
 */
export const COMMANDS: { id: string; compute: ComputeEdit; fallback: () => Thenable<unknown> }[] = [
	{
		id: 'vsc-smith.markdown.onEnter',
		compute: enterEdit,
		fallback: () => vscode.commands.executeCommand('type', { source: 'keyboard', text: '\n' }),
	},
	{ id: 'vsc-smith.markdown.onTab', compute: indentEdit, fallback: () => vscode.commands.executeCommand('tab') },
	{
		id: 'vsc-smith.markdown.onShiftTab',
		compute: outdentEdit,
		fallback: () => vscode.commands.executeCommand('outdent'),
	},
];

export function registerMarkdown(context: vscode.ExtensionContext): void {
	// Keys are handled one at a time: a key pressed while the previous edit is still being applied (e.g. a held
	// Enter key) would otherwise be computed from the document and cursor of before that edit.
	let queue: Promise<unknown> = Promise.resolve();
	context.subscriptions.push(
		new ToggleableFeature(SECTION, () =>
			vscode.Disposable.from(
				new MaioYield(SECTION, YIELD_CONTEXT),
				vscode.commands.registerCommand(PREVIEW, openPreview),
				vscode.workspace.getConfiguration(SECTION).get<boolean>('pasteTable.enabled', true)
					? registerPasteTable()
					: new vscode.Disposable(() => undefined),
				...COMMANDS.map(({ id, compute, fallback }) =>
					vscode.commands.registerCommand(id, () => {
						const run = queue.then(async () => {
							if (!(await applyEdit(compute))) {
								await fallback();
							}
						});
						queue = run.catch(() => undefined);
						return run;
					}),
				),
			),
		),
	);
}

/**
 * The command runs in the extension host, so keys typed right after the bound key can reach the document first.
 * The editor then rejects the edit, which was computed for an older version, and it is retried this many times.
 */
const MAX_ATTEMPTS = 5;

/** Applies the edit to the active editor and returns false when it does not apply. */
async function applyEdit(compute: ComputeEdit): Promise<boolean> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.selections.length > 1 || !editor.selection.isEmpty) {
		return false;
	}
	const doc = editor.document;
	// The edit always applies to where the key was pressed, also when text has been typed after it since then.
	const pos = editor.selection.active;
	if (isInFencedCodeBlock(i => doc.lineAt(i).text, pos.line)) {
		return false;
	}
	const before = doc.lineAt(pos.line).text.slice(0, pos.character);
	const options: IndentOptions = {
		insertSpaces: editor.options.insertSpaces === true,
		tabSize: Number(editor.options.tabSize),
	};
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		if (pos.line >= doc.lineCount) {
			return false;
		}
		const text = doc.lineAt(pos.line).text;
		if (!text.startsWith(before)) {
			return false;
		}
		const edit = compute(text, pos.character, options);
		if (!edit) {
			return false;
		}
		// Only the changed part of the line is replaced: the editor then moves the cursor along with the text
		// around it, so that the cursor does not have to be set afterwards, when more keys may have been typed.
		const change = changedPart(text, edit.text);
		const range = new vscode.Range(pos.line, change.start, pos.line, change.end);
		const version = doc.version;
		if (!(await editor.edit(b => b.replace(range, change.text), { undoStopBefore: true, undoStopAfter: true }))) {
			continue;
		}
		const cursor = new vscode.Position(pos.line + edit.line, edit.character);
		// An insertion at the cursor can leave the inserted text selected, so the selection is reset even when it
		// is not empty. This only happens while no other edit has been applied in between.
		if (
			attempt === 0 &&
			doc.version === version + 1 &&
			!(editor.selection.isEmpty && editor.selection.active.isEqual(cursor))
		) {
			editor.selection = new vscode.Selection(cursor, cursor);
		}
		editor.revealRange(editor.selection);
		return true;
	}
	return false;
}

const PREVIEW = 'vsc-smith.markdown.openPreview';

/**
 * Opens the built-in preview as a tab of the current group (not beside it, unlike "Open Preview to the Side"),
 * so that it fills the editor area.
 */
async function openPreview(): Promise<void> {
	await vscode.commands.executeCommand('markdown.showPreview');
}

const PASTE_AS_TABLE = 'vsc-smith.markdown.pasteAsTable';

/**
 * Pasting tab-separated text (from a spreadsheet) as a table. Both ways are registered: the paste widget exists
 * from VS Code 1.87 on, and the command works with any version.
 */
function registerPasteTable(): vscode.Disposable {
	return vscode.Disposable.from(vscode.commands.registerCommand(PASTE_AS_TABLE, pasteAsTable), registerPasteWidget());
}

/** Pastes the clipboard as a table, or as it is when it does not hold a table. */
async function pasteAsTable(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	const table = editor && tsvToMarkdownTable(await vscode.env.clipboard.readText());
	if (!editor || table === undefined) {
		await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
		return;
	}
	await editor.edit(b => editor.selections.forEach(selection => b.replace(selection, table)));
}

/**
 * Offers the table in the paste widget of the editor, which lets the user switch between the table and the text as
 * copied; `pasteTable.default` chooses which one is inserted first. Does nothing before VS Code 1.87.
 */
function registerPasteWidget(): vscode.Disposable {
	if (typeof vscode.languages.registerDocumentPasteEditProvider !== 'function' || !vscode.DocumentDropOrPasteEditKind) {
		return new vscode.Disposable(() => undefined);
	}
	const tableKind = vscode.DocumentDropOrPasteEditKind.Empty.append('markdown', 'table');
	return vscode.languages.registerDocumentPasteEditProvider(
		{ language: 'markdown' },
		{
			async provideDocumentPasteEdits(document, ranges, dataTransfer, _context, token) {
				const text = await dataTransfer.get('text/plain')?.asString();
				if (
					!text ||
					token.isCancellationRequested ||
					isInFencedCodeBlock(i => document.lineAt(i).text, ranges[0].start.line)
				) {
					return undefined;
				}
				const table = tsvToMarkdownTable(text);
				if (table === undefined) {
					return undefined;
				}
				const asTable = new vscode.DocumentPasteEdit(table, 'Paste as Markdown Table', tableKind);
				const asText = new vscode.DocumentPasteEdit(
					text,
					'Paste as Tab-Separated Text',
					vscode.DocumentDropOrPasteEditKind.Text,
				);
				return vscode.workspace.getConfiguration(SECTION).get<string>('pasteTable.default', 'text') === 'table'
					? [asTable, asText]
					: [asText, asTable];
			},
		},
		{
			providedPasteEditKinds: [tableKind, vscode.DocumentDropOrPasteEditKind.Text],
			pasteMimeTypes: ['text/plain'],
		},
	);
}
