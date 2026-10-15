import * as vscode from 'vscode';
import { ToggleableFeature } from '../../util/feature';
import { MaioYield } from '../../util/maioYield';
import { changedPart, isInFencedCodeBlock } from '../markdown/listEdit';
import { formatDateTime, markdownLink, toggleTaskLine, toggleWrap, urlToPaste } from './edit';

const SECTION = 'vsc-smith.mdEdit';
/** Context key used by the keybindings in package.json to leave the keys to Markdown All in One. */
const YIELD_CONTEXT = 'vsc-smith.mdEdit.yieldToMaio';
const DEFAULT_DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm';

const WRAP_COMMANDS: [id: string, marker: string][] = [
	['vsc-smith.mdEdit.toggleBold', '**'],
	['vsc-smith.mdEdit.toggleItalic', '*'],
	['vsc-smith.mdEdit.toggleStrikethrough', '~~'],
	['vsc-smith.mdEdit.toggleCode', '`'],
];

export function registerMdEdit(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		new ToggleableFeature(SECTION, () =>
			vscode.Disposable.from(
				new MaioYield(SECTION, YIELD_CONTEXT),
				vscode.commands.registerCommand('vsc-smith.mdEdit.toggleTask', toggleTask),
				vscode.commands.registerCommand('vsc-smith.mdEdit.pasteUrl', pasteUrl),
				vscode.commands.registerCommand('vsc-smith.mdEdit.insertDateTime', insertDateTime),
				...WRAP_COMMANDS.map(([id, marker]) => vscode.commands.registerCommand(id, () => toggleMarker(marker))),
			),
		),
	);
}

const UNDO_STOPS = { undoStopBefore: true, undoStopAfter: true };

/** Toggles the checkbox of the list items on the selected lines (list items without one become tasks). */
async function toggleTask(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const doc = editor.document;
	const lines = new Set<number>();
	for (const selection of editor.selections) {
		// A selection that ends at the start of a line does not include that line.
		const excludeLast = selection.end.character === 0 && selection.end.line > selection.start.line;
		const last = excludeLast ? selection.end.line - 1 : selection.end.line;
		for (let i = selection.start.line; i <= last; i++) {
			lines.add(i);
		}
	}
	const lineAt = (i: number) => doc.lineAt(i).text;
	await editor.edit(builder => {
		for (const i of lines) {
			const text = lineAt(i);
			const next = isInFencedCodeBlock(lineAt, i) ? null : toggleTaskLine(text);
			if (next !== null) {
				// Only the changed part is replaced, so that the cursors stay where they are.
				const change = changedPart(text, next);
				builder.replace(new vscode.Range(i, change.start, i, change.end), change.text);
			}
		}
	}, UNDO_STOPS);
}

/** Pastes the clipboard URL as a link over the selected text, or pastes as usual when that does not apply. */
async function pasteUrl(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	const url = urlToPaste(await vscode.env.clipboard.readText());
	const lineAt = (i: number) => editor?.document.lineAt(i).text ?? '';
	if (
		!editor ||
		!url ||
		!editor.selections.every(s => !s.isEmpty && s.isSingleLine && !isInFencedCodeBlock(lineAt, s.start.line))
	) {
		await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
		return;
	}
	const doc = editor.document;
	await editor.edit(builder => {
		editor.selections.forEach(s => builder.replace(s, markdownLink(doc.getText(s), url)));
	}, UNDO_STOPS);
}

async function insertDateTime(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const format = vscode.workspace.getConfiguration(SECTION).get<string>('dateTimeFormat') || DEFAULT_DATE_TIME_FORMAT;
	const text = formatDateTime(new Date(), format);
	await editor.edit(builder => editor.selections.forEach(s => builder.replace(s, text)), UNDO_STOPS);
}

/**
 * Wraps the selections in `marker`, or removes it when it is already there. An empty selection uses the word at the
 * cursor, and between two markers when there is none.
 */
async function toggleMarker(marker: string): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const doc = editor.document;
	const pairs = new Set<number>();
	const applied = await editor.edit(builder => {
		editor.selections.forEach((selection, index) => {
			let range: vscode.Range = selection;
			if (selection.isEmpty) {
				const word = doc.getWordRangeAtPosition(selection.active);
				if (!word) {
					builder.insert(selection.active, marker + marker);
					pairs.add(index);
					return;
				}
				range = word;
			}
			const before = doc.lineAt(range.start.line).text.slice(0, range.start.character);
			const after = doc.lineAt(range.end.line).text.slice(range.end.character);
			const edit = toggleWrap(before, doc.getText(range), after, marker);
			builder.replace(
				new vscode.Range(range.start.translate(0, -edit.removeBefore), range.end.translate(0, edit.removeAfter)),
				edit.text,
			);
		});
	}, UNDO_STOPS);
	if (applied && pairs.size > 0) {
		editor.selections = editor.selections.map((s, i) => {
			if (!pairs.has(i)) {
				return s;
			}
			const p = s.active.translate(0, -marker.length);
			return new vscode.Selection(p, p);
		});
	}
}
