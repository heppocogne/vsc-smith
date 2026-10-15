import * as assert from 'assert';
import * as vscode from 'vscode';
import {
	footnoteDefinition,
	formatDateTime,
	markdownLink,
	nextFootnoteLabel,
	toggleTaskLine,
	toggleWrap,
	urlToPaste,
} from '../features/mdEdit/edit';
import { duplicateItem, listRegion, moveItem, renumberList } from '../features/mdEdit/listBlock';
import { activateExtension, closeAllEditors } from './helpers';

/** Applies `toggleWrap` to a string written as `before⟦selection⟧after`. */
function wrap(input: string, marker: string): string {
	const m = /^(.*)⟦(.*)⟧(.*)$/.exec(input);
	assert.ok(m, input);
	const [, before, text, after] = m;
	const edit = toggleWrap(before, text, after, marker);
	return before.slice(0, before.length - edit.removeBefore) + edit.text + after.slice(edit.removeAfter);
}

suite('mdEdit', () => {
	suite('toggleTaskLine', () => {
		test('switches the checkbox', () => {
			assert.strictEqual(toggleTaskLine('- [ ] a'), '- [x] a');
			assert.strictEqual(toggleTaskLine('- [x] a'), '- [ ] a');
			assert.strictEqual(toggleTaskLine('  1. [X] a'), '  1. [ ] a');
		});

		test('turns a list item into a task', () => {
			assert.strictEqual(toggleTaskLine('- a'), '- [ ] a');
			assert.strictEqual(toggleTaskLine('> * a'), '> * [ ] a');
			assert.strictEqual(toggleTaskLine('- '), '- [ ] ');
		});

		test('ignores lines that are not list items', () => {
			assert.strictEqual(toggleTaskLine('a'), null);
			assert.strictEqual(toggleTaskLine('> a'), null);
			assert.strictEqual(toggleTaskLine('---'), null);
			assert.strictEqual(toggleTaskLine(''), null);
		});
	});

	suite('urlToPaste', () => {
		test('accepts a single http(s) URL', () => {
			assert.strictEqual(urlToPaste('https://example.com/a?b=1'), 'https://example.com/a?b=1');
			assert.strictEqual(urlToPaste('  http://example.com\n'), 'http://example.com');
		});

		test('rejects everything else', () => {
			for (const text of [
				'',
				'example.com',
				'ftp://example.com',
				'https://',
				'see https://example.com',
				'https://a b',
			]) {
				assert.strictEqual(urlToPaste(text), undefined, text);
			}
		});
	});

	suite('markdownLink', () => {
		test('builds a link', () => {
			assert.strictEqual(markdownLink('foo', 'https://example.com'), '[foo](https://example.com)');
		});

		test('keeps balanced parentheses and encodes unbalanced ones', () => {
			assert.strictEqual(markdownLink('a', 'https://e.com/a_(b)'), '[a](https://e.com/a_(b))');
			assert.strictEqual(markdownLink('a', 'https://e.com/a)'), '[a](https://e.com/a%29)');
		});
	});

	suite('toggleWrap', () => {
		test('wraps the text', () => {
			assert.strictEqual(wrap('a ⟦b⟧ c', '**'), 'a **b** c');
			assert.strictEqual(wrap('⟦b⟧', '*'), '*b*');
			assert.strictEqual(wrap('⟦b⟧', '`'), '`b`');
		});

		test('removes the marker inside the selection', () => {
			assert.strictEqual(wrap('a ⟦**b**⟧ c', '**'), 'a b c');
			assert.strictEqual(wrap('⟦~~b~~⟧', '~~'), 'b');
		});

		test('removes the marker around the selection', () => {
			assert.strictEqual(wrap('a **⟦b⟧** c', '**'), 'a b c');
			assert.strictEqual(wrap('*⟦b⟧*', '*'), 'b');
		});

		test('tells italic from bold', () => {
			assert.strictEqual(wrap('⟦**b**⟧', '*'), '***b***');
			assert.strictEqual(wrap('⟦***b***⟧', '*'), '**b**');
			assert.strictEqual(wrap('⟦***b***⟧', '**'), '*b*');
			assert.strictEqual(wrap('**⟦b⟧**', '*'), '***b***');
		});

		test('does not treat a lone marker as wrapping', () => {
			assert.strictEqual(wrap('a ** ⟦b⟧', '**'), 'a ** **b**');
		});
	});

	suite('formatDateTime', () => {
		const date = new Date(2026, 0, 5, 9, 7, 3);

		test('formats the tokens', () => {
			assert.strictEqual(formatDateTime(date, 'YYYY-MM-DD HH:mm'), '2026-01-05 09:07');
			assert.strictEqual(formatDateTime(date, 'YY/M/D H:mm:ss'), '26/1/5 9:07:03');
		});

		test('keeps text in brackets and other characters', () => {
			assert.strictEqual(formatDateTime(date, '[YYYY] HH時'), 'YYYY 09時');
		});
	});

	suite('footnotes', () => {
		test('nextFootnoteLabel is the largest number plus one', () => {
			assert.strictEqual(nextFootnoteLabel('no notes'), 1);
			assert.strictEqual(nextFootnoteLabel('a[^1] b[^3]\n\n[^3]: x [^note]'), 4);
		});

		test('footnoteDefinition follows the last definition directly', () => {
			assert.strictEqual(footnoteDefinition('text', 2), '\n\n[^2]: ');
			assert.strictEqual(footnoteDefinition('[^1]: first', 2), '\n[^2]: ');
			assert.strictEqual(footnoteDefinition(undefined, 1), '\n\n[^1]: ');
		});
	});

	suite('list blocks', () => {
		const doc = (...lines: string[]) => lines;

		test('moveItem moves an item with its children', () => {
			const lines = doc('- a', '  - a1', '- b', '  - b1', '- c');
			const up = moveItem(lines, 2, 3, -1, 2);
			assert.deepStrictEqual(up?.lines, ['- b', '  - b1', '- a', '  - a1', '- c']);
			assert.strictEqual(up?.line, 0);
			const down = moveItem(lines, 0, 3, 1, 2);
			assert.deepStrictEqual(down?.lines, ['- b', '  - b1', '- a', '  - a1', '- c']);
			assert.strictEqual(down?.line, 2);
		});

		test('moveItem keeps blank lines between items in place', () => {
			const result = moveItem(doc('- a', '', '- b'), 2, 0, -1, 2);
			assert.deepStrictEqual(result?.lines, ['- b', '', '- a']);
		});

		test('moveItem swaps the numbers of ordered items', () => {
			const result = moveItem(doc('1. a', '2. b'), 1, 4, -1, 2);
			assert.deepStrictEqual(result?.lines, ['1. b', '2. a']);
			assert.strictEqual(result?.character, 4);
		});

		test('moveItem does nothing at the edge, across levels or outside lists', () => {
			assert.strictEqual(moveItem(doc('- a', '- b'), 0, 0, -1, 2), null);
			assert.strictEqual(moveItem(doc('- a', '- b'), 1, 0, 1, 2), null);
			assert.strictEqual(moveItem(doc('- a', '  - a1', '- b'), 1, 0, 1, 2), null);
			assert.strictEqual(moveItem(doc('text', '- a'), 0, 0, 1, 2), null);
		});

		test('duplicateItem copies the item and renumbers', () => {
			const result = duplicateItem(doc('1. a', '  - x', '2. b'), 0, 3, 2);
			assert.deepStrictEqual(result?.lines, ['1. a', '  - x', '2. a', '  - x', '3. b']);
			assert.strictEqual(result?.line, 2);
		});

		test('renumberList counts up from the first number, per level', () => {
			const lines = doc('3. a', '5. b', '  1. c', '  1. d', '9. e', '', '- x', '7. y');
			assert.deepStrictEqual(renumberList(lines, 0, lines.length, 2), [
				'3. a',
				'4. b',
				'  1. c',
				'  2. d',
				'5. e',
				'',
				'- x',
				'7. y',
			]);
		});

		test('renumberList keeps fenced code and the delimiter', () => {
			const lines = doc('1) a', '```', '1. x', '```', '1) b');
			assert.deepStrictEqual(renumberList(lines, 0, lines.length, 2), ['1) a', '```', '1. x', '```', '2) b']);
		});

		test('listRegion finds the list around a line', () => {
			const lines = doc('text', '- a', '', '- b', '  more', 'text');
			assert.deepStrictEqual(listRegion(lines, 3, 2), [1, 5]);
			assert.strictEqual(listRegion(lines, 0, 2), null);
		});
	});

	suite('commands', () => {
		suiteSetup(activateExtension);
		teardown(closeAllEditors);

		async function open(content: string): Promise<vscode.TextEditor> {
			const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content });
			return vscode.window.showTextDocument(doc);
		}

		function eol(editor: vscode.TextEditor): string {
			return editor.document.getText().replace(/\r\n/g, '\n');
		}

		test('toggleTask toggles every selected line', async () => {
			const editor = await open('- [ ] a\n- b\n```\n- c\n```\n- [x] d');
			editor.selection = new vscode.Selection(0, 0, 5, 0);
			await vscode.commands.executeCommand('vsc-smith.mdEdit.toggleTask');
			assert.strictEqual(eol(editor), '- [x] a\n- [ ] b\n```\n- c\n```\n- [x] d');
			await vscode.commands.executeCommand('undo');
			assert.strictEqual(eol(editor), '- [ ] a\n- b\n```\n- c\n```\n- [x] d');
		});

		test('pasteUrl turns the selection into a link', async () => {
			const editor = await open('see docs here');
			editor.selection = new vscode.Selection(0, 4, 0, 8);
			await vscode.env.clipboard.writeText('https://example.com');
			await vscode.commands.executeCommand('vsc-smith.mdEdit.pasteUrl');
			assert.strictEqual(editor.document.getText(), 'see [docs](https://example.com) here');
		});

		test('pasteUrl pastes other text as it is', async () => {
			const editor = await open('see docs here');
			editor.selection = new vscode.Selection(0, 4, 0, 8);
			await vscode.env.clipboard.writeText('foo');
			await vscode.commands.executeCommand('vsc-smith.mdEdit.pasteUrl');
			assert.strictEqual(editor.document.getText(), 'see foo here');
		});

		test('toggleBold wraps the word at the cursor and unwraps it', async () => {
			const editor = await open('a foo b');
			editor.selection = new vscode.Selection(0, 4, 0, 4);
			await vscode.commands.executeCommand('vsc-smith.mdEdit.toggleBold');
			assert.strictEqual(editor.document.getText(), 'a **foo** b');
			await vscode.commands.executeCommand('vsc-smith.mdEdit.toggleBold');
			assert.strictEqual(editor.document.getText(), 'a foo b');
		});

		test('toggleItalic inserts a pair and puts the cursor between', async () => {
			const editor = await open('a  b');
			editor.selection = new vscode.Selection(0, 2, 0, 2);
			await vscode.commands.executeCommand('vsc-smith.mdEdit.toggleItalic');
			assert.strictEqual(editor.document.getText(), 'a ** b');
			assert.strictEqual(editor.selection.active.character, 3);
		});

		test('moveItemDown moves the item and the cursor, and one undo restores it', async () => {
			const editor = await open('- a\n- b\n- c');
			editor.selection = new vscode.Selection(0, 3, 0, 3);
			await vscode.commands.executeCommand('vsc-smith.mdEdit.moveItemDown');
			assert.strictEqual(eol(editor), '- b\n- a\n- c');
			assert.strictEqual(editor.selection.active.line, 1);
			await vscode.commands.executeCommand('undo');
			assert.strictEqual(eol(editor), '- a\n- b\n- c');
		});

		test('duplicateItem copies the item below', async () => {
			const editor = await open('1. a\n2. b');
			editor.selection = new vscode.Selection(0, 0, 0, 0);
			await vscode.commands.executeCommand('vsc-smith.mdEdit.duplicateItem');
			assert.strictEqual(eol(editor), '1. a\n2. a\n3. b');
		});

		test('renumberList fixes the numbers of the list at the cursor', async () => {
			const editor = await open('text\n\n1. a\n1. b\n7. c\n');
			editor.selection = new vscode.Selection(3, 0, 3, 0);
			await vscode.commands.executeCommand('vsc-smith.mdEdit.renumberList');
			assert.strictEqual(eol(editor), 'text\n\n1. a\n2. b\n3. c\n');
		});

		test('insertFootnote adds the reference and the definition', async () => {
			const editor = await open('hello world\n\n[^1]: one\n');
			editor.selection = new vscode.Selection(0, 5, 0, 5);
			await vscode.commands.executeCommand('vsc-smith.mdEdit.insertFootnote');
			assert.strictEqual(eol(editor), 'hello[^2] world\n\n[^1]: one\n[^2]: \n');
			assert.deepStrictEqual([editor.selection.active.line, editor.selection.active.character], [3, 6]);
		});

		test('insertFootnote works at the end of the last line', async () => {
			const editor = await open('hello');
			editor.selection = new vscode.Selection(0, 5, 0, 5);
			await vscode.commands.executeCommand('vsc-smith.mdEdit.insertFootnote');
			assert.strictEqual(eol(editor), 'hello[^1]\n\n[^1]: ');
		});

		test('insertDateTime uses the configured format', async () => {
			const config = vscode.workspace.getConfiguration('vsc-smith.mdEdit');
			try {
				await config.update('dateTimeFormat', '[d:]YYYY', vscode.ConfigurationTarget.Global);
				const editor = await open('x');
				editor.selection = new vscode.Selection(0, 1, 0, 1);
				await vscode.commands.executeCommand('vsc-smith.mdEdit.insertDateTime');
				assert.strictEqual(editor.document.getText(), `xd:${new Date().getFullYear()}`);
			} finally {
				await config.update('dateTimeFormat', undefined, vscode.ConfigurationTarget.Global);
			}
		});
	});
});
