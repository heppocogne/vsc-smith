import * as vscode from 'vscode';
import { ToggleableFeature } from '../../util/feature';
import { MaioYield } from '../../util/maioYield';
import { changedPart, isInFencedCodeBlock } from '../markdown/listEdit';
import {
	footnoteDefinition,
	formatDateTime,
	markdownLink,
	nextFootnoteLabel,
	toggleTaskLine,
	toggleWrap,
	urlToPaste,
} from './edit';
import { duplicateItem, listRegion, moveItem, MoveResult, renumberList } from './listBlock';

const SECTION = 'vsc-smith.mdEdit';
/** Context key used by the keybindings in package.json to leave the keys to Markdown All in One. */
const YIELD_CONTEXT = 'vsc-smith.mdEdit.yieldToMaio';
const DEFAULT_DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm';

const MOVE_COMMANDS: [id: string, direction: -1 | 1, fallback: string][] = [
	['vsc-smith.mdEdit.moveItemUp', -1, 'editor.action.moveLinesUpAction'],
	['vsc-smith.mdEdit.moveItemDown', 1, 'editor.action.moveLinesDownAction'],
];

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
				vscode.commands.registerCommand('vsc-smith.mdEdit.insertFootnote', insertFootnote),
				vscode.commands.registerCommand('vsc-smith.mdEdit.renumberList', renumber),
				vscode.commands.registerCommand('vsc-smith.mdEdit.duplicateItem', () =>
					editLines(
						(lines, pos, tabSize) => duplicateItem(lines, pos.line, pos.character, tabSize),
						'editor.action.copyLinesDownAction',
					),
				),
				...MOVE_COMMANDS.map(([id, direction, fallback]) =>
					vscode.commands.registerCommand(id, () =>
						editLines((lines, pos, tabSize) => moveItem(lines, pos.line, pos.character, direction, tabSize), fallback),
					),
				),
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

/**
 * Applies a whole-document line edit at the cursor. When it does not apply (several or multi-line selections, code
 * blocks, or `compute` returning null), the standard command `fallback` runs instead.
 */
async function editLines(
	compute: (lines: string[], cursor: vscode.Position, tabSize: number) => MoveResult | null,
	fallback: string,
): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	const selection = editor?.selection;
	if (!editor || editor.selections.length > 1 || !selection?.isSingleLine) {
		await vscode.commands.executeCommand(fallback);
		return;
	}
	const doc = editor.document;
	const lineAt = (i: number) => doc.lineAt(i).text;
	const lines = Array.from({ length: doc.lineCount }, (_, i) => lineAt(i));
	const result = isInFencedCodeBlock(lineAt, selection.active.line)
		? null
		: compute(lines, selection.active, Number(editor.options.tabSize) || 4);
	if (!result) {
		await vscode.commands.executeCommand(fallback);
		return;
	}
	if (!(await replaceChangedLines(editor, lines, result.lines))) {
		return;
	}
	const cursor = new vscode.Position(result.line, result.character);
	editor.selection = new vscode.Selection(cursor, cursor);
	editor.revealRange(new vscode.Range(cursor, cursor));
}

/** Replaces the lines between the common head and tail of `before` and `after`. */
function replaceChangedLines(editor: vscode.TextEditor, before: string[], after: string[]): Thenable<boolean> {
	let head = 0;
	while (head < before.length && head < after.length && before[head] === after[head]) {
		head++;
	}
	let tail = 0;
	while (
		tail < before.length - head &&
		tail < after.length - head &&
		before[before.length - 1 - tail] === after[after.length - 1 - tail]
	) {
		tail++;
	}
	const eol = editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
	const text = after.slice(head, after.length - tail).join(eol);
	const lastLine = before.length - tail - 1;
	// Whole lines are replaced, or inserted/removed when one side is empty.
	const range =
		lastLine >= head
			? new vscode.Range(head, 0, lastLine, before[lastLine].length)
			: new vscode.Range(head, 0, head, 0);
	return editor.edit(builder => {
		if (lastLine < head) {
			builder.insert(range.start, text + eol);
		} else if (after.length - tail <= head) {
			// The lines are removed together with one line break.
			builder.delete(
				lastLine + 1 < before.length
					? new vscode.Range(head, 0, lastLine + 1, 0)
					: new vscode.Range(
							Math.max(head - 1, 0),
							head > 0 ? before[head - 1].length : 0,
							lastLine,
							before[lastLine].length,
						),
			);
		} else {
			builder.replace(range, text);
		}
	}, UNDO_STOPS);
}

/** Renumbers the ordered lists in the selected lines, or the list at the cursor. */
async function renumber(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const doc = editor.document;
	const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
	const tabSize = Number(editor.options.tabSize) || 4;
	const regions: [number, number][] = [];
	for (const s of editor.selections) {
		const region = s.isSingleLine ? listRegion(lines, s.active.line, tabSize) : [s.start.line, s.end.line + 1];
		if (region) {
			regions.push(region as [number, number]);
		}
	}
	let result = lines;
	for (const [from, to] of regions) {
		result = renumberList(result, from, to, tabSize);
	}
	await editor.edit(builder => {
		result.forEach((text, i) => {
			if (text !== lines[i]) {
				const change = changedPart(lines[i], text);
				builder.replace(new vscode.Range(i, change.start, i, change.end), change.text);
			}
		});
	}, UNDO_STOPS);
}

/** Inserts `[^n]` at the cursor and the definition `[^n]: ` at the end of the document, where the cursor goes. */
async function insertFootnote(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const doc = editor.document;
	const label = nextFootnoteLabel(doc.getText());
	let last = doc.lineCount - 1;
	while (last >= 0 && doc.lineAt(last).isEmptyOrWhitespace) {
		last--;
	}
	const definition = footnoteDefinition(last >= 0 ? doc.lineAt(last).text : undefined, label);
	const at = editor.selection.end;
	const end = last >= 0 ? doc.lineAt(last).range.end : at;
	const reference = `[^${label}]`;
	const applied = await editor.edit(builder => {
		if (at.isEqual(end)) {
			builder.insert(at, reference + definition);
		} else {
			builder.insert(at, reference);
			builder.insert(end, definition);
		}
	}, UNDO_STOPS);
	if (applied) {
		const line = Math.max(last, 0) + definition.split('\n').length - 1;
		const cursor = doc.lineAt(Math.min(line, doc.lineCount - 1)).range.end;
		editor.selection = new vscode.Selection(cursor, cursor);
		editor.revealRange(new vscode.Range(cursor, cursor));
	}
}
