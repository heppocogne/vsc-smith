import * as assert from 'assert';
import * as vscode from 'vscode';
import { tsvToMarkdownTable } from '../features/markdown/pasteTable';
import { enterEdit, IndentOptions, indentEdit, isInFencedCodeBlock, LineEdit, outdentEdit, parseListLine } from '../features/markdown/listEdit';
import { activateExtension, closeAllEditors, waitFor } from './helpers';

const SPACES: IndentOptions = { insertSpaces: true, tabSize: 2 };
const TABS: IndentOptions = { insertSpaces: false, tabSize: 4 };

/** Builds the expected edit from a string where `|` marks the cursor. */
function expected(textWithCursor: string): LineEdit {
	const before = textWithCursor.slice(0, textWithCursor.indexOf('|')).split('\n');
	return { text: textWithCursor.replace('|', ''), line: before.length - 1, character: before[before.length - 1].length };
}

/** Runs `fn` on a line where `|` marks the cursor. */
function run(fn: typeof enterEdit, lineWithCursor: string, options = SPACES): LineEdit | null {
	return fn(lineWithCursor.replace('|', ''), lineWithCursor.indexOf('|'), options);
}

suite('markdown', () => {
	suite('parseListLine', () => {
		test('splits a list item into its parts', () => {
			assert.deepStrictEqual(parseListLine('> \t- [x] foo'), {
				quote: '> ', indent: '\t', marker: '-', space: ' ', task: '[x] ', body: 'foo',
			});
			assert.deepStrictEqual(parseListLine('12) foo'), {
				quote: '', indent: '', marker: '12)', space: ' ', task: '', body: 'foo',
			});
		});

		test('blockquote without a list marker', () => {
			assert.deepStrictEqual(parseListLine('> >   foo'), {
				quote: '> > ', indent: '', marker: '', space: '', task: '', body: '  foo',
			});
		});

		test('not a list', () => {
			assert.strictEqual(parseListLine('foo'), undefined);
			assert.strictEqual(parseListLine('  foo'), undefined);
			assert.strictEqual(parseListLine('---'), undefined);
			assert.strictEqual(parseListLine('-foo'), undefined);
			assert.strictEqual(parseListLine('1.foo'), undefined);
			assert.strictEqual(parseListLine('-'), undefined);
			assert.strictEqual(parseListLine('* * *'), undefined);
			assert.strictEqual(parseListLine('> - - -'), undefined);
		});
	});

	suite('enterEdit', () => {
		test('continues bullets, keeping indentation and the marker', () => {
			assert.deepStrictEqual(run(enterEdit, '- foo|'), expected('- foo\n- |'));
			assert.deepStrictEqual(run(enterEdit, '  * foo|'), expected('  * foo\n  * |'));
			assert.deepStrictEqual(run(enterEdit, '+   foo|'), expected('+   foo\n+   |'));
		});

		test('increments the number of ordered items', () => {
			assert.deepStrictEqual(run(enterEdit, '9. foo|'), expected('9. foo\n10. |'));
			assert.deepStrictEqual(run(enterEdit, '1) foo|'), expected('1) foo\n2) |'));
		});

		test('continues task lists with an unchecked box', () => {
			assert.deepStrictEqual(run(enterEdit, '- [x] foo|'), expected('- [x] foo\n- [ ] |'));
			assert.deepStrictEqual(run(enterEdit, '1. [ ] foo|'), expected('1. [ ] foo\n2. [ ] |'));
		});

		test('continues blockquotes', () => {
			assert.deepStrictEqual(run(enterEdit, '> foo|'), expected('> foo\n> |'));
			assert.deepStrictEqual(run(enterEdit, '> > foo|'), expected('> > foo\n> > |'));
			assert.deepStrictEqual(run(enterEdit, '> - foo|'), expected('> - foo\n> - |'));
		});

		test('splits the body at the cursor', () => {
			assert.deepStrictEqual(run(enterEdit, '- foo |bar'), expected('- foo\n- |bar'));
			assert.deepStrictEqual(run(enterEdit, '- |foo'), expected('- \n- |foo'));
		});

		test('removes the marker of an empty top-level item', () => {
			assert.deepStrictEqual(run(enterEdit, '- |'), expected('|'));
			assert.deepStrictEqual(run(enterEdit, '1. |'), expected('|'));
			assert.deepStrictEqual(run(enterEdit, '- [ ] |'), expected('|'));
			assert.deepStrictEqual(run(enterEdit, '- [ ]|'), expected('|'));
			assert.deepStrictEqual(run(enterEdit, '> - |'), expected('> |'));
		});

		test('removes the innermost quote marker of an empty blockquote line', () => {
			assert.deepStrictEqual(run(enterEdit, '> |'), expected('|'));
			assert.deepStrictEqual(run(enterEdit, '>|'), expected('|'));
			assert.deepStrictEqual(run(enterEdit, '> > |'), expected('> |'));
		});

		test('outdents an empty nested item', () => {
			assert.deepStrictEqual(run(enterEdit, '    - |'), expected('  - |'));
			assert.deepStrictEqual(run(enterEdit, '\t\t- [ ] |', TABS), expected('\t- [ ] |'));
			assert.deepStrictEqual(run(enterEdit, '>   1. |'), expected('> 1. |'));
		});

		test('does nothing before the item content or outside lists', () => {
			assert.strictEqual(run(enterEdit, '|- foo'), null);
			assert.strictEqual(run(enterEdit, '-| foo'), null);
			assert.strictEqual(run(enterEdit, 'foo|'), null);
			assert.strictEqual(run(enterEdit, '|'), null);
		});
	});

	suite('indentEdit', () => {
		test('indents the whole item with the editor indentation', () => {
			assert.deepStrictEqual(run(indentEdit, '- fo|o'), expected('  - fo|o'));
			assert.deepStrictEqual(run(indentEdit, '- |', TABS), expected('\t- |'));
			assert.deepStrictEqual(run(indentEdit, '> - [ ] foo|'), expected('>   - [ ] foo|'));
		});

		test('restarts a nested ordered item from 1', () => {
			assert.deepStrictEqual(run(indentEdit, '10. foo|'), expected('  1. foo|'));
			assert.deepStrictEqual(run(indentEdit, '3) |'), expected('  1) |'));
		});

		test('moves a cursor inside the marker to the start of the content', () => {
			assert.deepStrictEqual(run(indentEdit, '1|0. foo'), expected('  1. |foo'));
		});

		test('does nothing before the marker or outside lists', () => {
			assert.strictEqual(run(indentEdit, '|- foo'), null);
			assert.strictEqual(run(indentEdit, '> foo|'), null);
			assert.strictEqual(run(indentEdit, 'foo|'), null);
		});
	});

	suite('outdentEdit', () => {
		test('outdents the whole item by one level', () => {
			assert.deepStrictEqual(run(outdentEdit, '    - fo|o'), expected('  - fo|o'));
			assert.deepStrictEqual(run(outdentEdit, ' - foo|'), expected('- foo|'));
			assert.deepStrictEqual(run(outdentEdit, '\t\t3. foo|', TABS), expected('\t3. foo|'));
			assert.deepStrictEqual(run(outdentEdit, '>   - foo|'), expected('> - foo|'));
		});

		test('does nothing for top-level items', () => {
			assert.strictEqual(run(outdentEdit, '- foo|'), null);
			assert.strictEqual(run(outdentEdit, '> - foo|'), null);
		});
	});

	suite('isInFencedCodeBlock', () => {
		const check = (text: string, line: number) => {
			const lines = text.split('\n');
			return isInFencedCodeBlock(i => lines[i], line);
		};

		test('detects lines between fences', () => {
			const text = ['- a', '```js', '- b', '```', '- c'].join('\n');
			assert.deepStrictEqual([0, 2, 4].map(l => check(text, l)), [false, true, false]);
		});

		test('closes only with the same character and at least the same length', () => {
			const text = ['````', '```', '~~~', '- a', '````', '- b'].join('\n');
			assert.deepStrictEqual([3, 5].map(l => check(text, l)), [true, false]);
		});

		test('handles tilde fences, fences in lists and in blockquotes', () => {
			assert.strictEqual(check(['~~~', '- a'].join('\n'), 1), true);
			assert.strictEqual(check(['- x', '  ```', '  - a'].join('\n'), 2), true);
			assert.strictEqual(check(['> ```', '> - a'].join('\n'), 1), true);
		});

		test('ignores inline code at the start of a line', () => {
			assert.strictEqual(check(['```foo```', '- a'].join('\n'), 1), false);
		});
	});

	suite('commands', () => {
		suiteSetup(activateExtension);
		teardown(closeAllEditors);

		/** Opens a markdown document where `|` marks the cursor. */
		async function open(textWithCursor: string): Promise<vscode.TextEditor> {
			const offset = textWithCursor.indexOf('|');
			const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: textWithCursor.replace('|', '') });
			const editor = await vscode.window.showTextDocument(doc);
			editor.options = { insertSpaces: true, tabSize: 2 };
			const pos = doc.positionAt(offset);
			editor.selection = new vscode.Selection(pos, pos);
			return editor;
		}

		function textWithCursor(editor: vscode.TextEditor): string {
			const offset = editor.document.offsetAt(editor.selection.active);
			const text = editor.document.getText();
			// A document without line breaks gets the platform's default EOL.
			return (text.slice(0, offset) + '|' + text.slice(offset)).replace(/\r\n/g, '\n');
		}

		test('pasteAsTable pastes spreadsheet text as a table', async () => {
			const editor = await open('|');
			await vscode.env.clipboard.writeText('a\tb\n1\t2');
			await vscode.commands.executeCommand('vsc-smith.markdown.pasteAsTable');
			assert.strictEqual(editor.document.getText().replace(/\r\n/g, '\n'), '| a | b |\n| --- | --- |\n| 1 | 2 |');
		});

		test('pasteAsTable pastes other text as it is', async () => {
			const editor = await open('x|');
			await vscode.env.clipboard.writeText('foo');
			await vscode.commands.executeCommand('vsc-smith.markdown.pasteAsTable');
			assert.strictEqual(editor.document.getText(), 'xfoo');
		});

		const cases: [string, string, string][] = [
			['vsc-smith.markdown.onEnter', 'a\n- foo|', 'a\n- foo\n- |'],
			['vsc-smith.markdown.onEnter', 'foo|', 'foo\n|'],
			['vsc-smith.markdown.onEnter', '```\n- foo|', '```\n- foo\n|'],
			['vsc-smith.markdown.onTab', '1. a\n2. b|', '1. a\n  1. b|'],
			['vsc-smith.markdown.onShiftTab', '- a\n  - b|', '- a\n- b|'],
		];
		for (const [id, before, after] of cases) {
			test(`${id}: ${JSON.stringify(before)}`, async () => {
				const editor = await open(before);
				await vscode.commands.executeCommand(id);
				await waitFor(() => textWithCursor(editor) === after, `${JSON.stringify(after)}, got ${JSON.stringify(textWithCursor(editor))}`);
			});
		}

		test('inserts the line break of the document', async () => {
			const editor = await open('a\r\n- foo|');
			await vscode.commands.executeCommand('vsc-smith.markdown.onEnter');
			assert.strictEqual(editor.document.getText(), 'a\r\n- foo\r\n- ');
		});

		test('the edit is undone at once', async () => {
			const editor = await open('- foo|');
			await vscode.commands.executeCommand('vsc-smith.markdown.onEnter');
			await vscode.commands.executeCommand('undo');
			assert.strictEqual(editor.document.getText(), '- foo');
		});

		test('commands are unregistered while disabled', async () => {
			const config = vscode.workspace.getConfiguration('vsc-smith.markdown');
			const registered = async () => (await vscode.commands.getCommands(true)).includes('vsc-smith.markdown.onEnter');
			try {
				await config.update('enabled', false, vscode.ConfigurationTarget.Global);
				await waitFor(async () => !await registered(), 'commands to be unregistered');
			} finally {
				await config.update('enabled', undefined, vscode.ConfigurationTarget.Global);
			}
			await waitFor(registered, 'commands to be registered again');
		});
	});
});

suite('pasteTable', () => {
	test('converts tab-separated text to a table', () => {
		assert.strictEqual(tsvToMarkdownTable('a\tb\n1\t2\n'), '| a | b |\n| --- | --- |\n| 1 | 2 |');
		assert.strictEqual(tsvToMarkdownTable('a\tb\r\n1\t2'), '| a | b |\n| --- | --- |\n| 1 | 2 |');
	});

	test('pads short rows and keeps empty cells', () => {
		assert.strictEqual(tsvToMarkdownTable('a\tb\tc\n1\t\t3\n4'), '| a | b | c |\n| --- | --- | --- |\n| 1 |  | 3 |\n| 4 |  |  |');
	});

	test('handles quoted cells and escapes pipes', () => {
		assert.strictEqual(
			tsvToMarkdownTable('a\tb\n"x\ny"\t"say ""hi"""\n1|2\t3'),
			'| a | b |\n| --- | --- |\n| x<br>y | say "hi" |\n| 1\\|2 | 3 |',
		);
	});

	test('leaves text that is not a table', () => {
		assert.strictEqual(tsvToMarkdownTable('foo'), undefined);
		assert.strictEqual(tsvToMarkdownTable('a\tb'), undefined);
		assert.strictEqual(tsvToMarkdownTable('a\nb\nc'), undefined);
	});
});
