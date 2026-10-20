import * as assert from 'assert';
import * as path from 'path';
import { defaultPython, formatPython, minimalEdit, touchedLines } from '../features/pythonFormat';

// `out/test` -> repository root, where the bundled `python` directory lives.
const extensionPath = path.resolve(__dirname, '..', '..');

suite('pythonFormat', () => {
	test('defaultPython depends on the platform', () => {
		assert.strictEqual(defaultPython('win32'), 'python');
		assert.strictEqual(defaultPython('linux'), 'python3');
		assert.strictEqual(defaultPython('darwin'), 'python3');
	});

	test('formats source through the bundled formatter', async function () {
		this.timeout(20000);
		const result = await formatPython(defaultPython(), extensionPath, "x=1;y = {'a':1}\n");
		assert.strictEqual(result, 'x = 1\ny = {"a": 1}\n');
	});

	test('formats only the statements on the given lines', async function () {
		this.timeout(20000);
		const result = await formatPython(defaultPython(), extensionPath, 'a=1\nb=2\nc=3\n', [{ start: 2, end: 2 }]);
		assert.strictEqual(result, 'a=1\nb = 2\nc=3\n');
	});

	test('rejects with the formatter message for a syntax error', async function () {
		this.timeout(20000);
		await assert.rejects(formatPython(defaultPython(), extensionPath, 'def f(:\n'), /cannot parse/);
	});

	test('rejects when the interpreter does not exist', async () => {
		await assert.rejects(
			formatPython('vsc-smith-no-such-python', extensionPath, 'x = 1\n'),
			/Python interpreter not found/,
		);
	});

	suite('minimalEdit', () => {
		const apply = (original: string, formatted: string) => {
			const edit = minimalEdit(original, formatted);
			return edit ? original.slice(0, edit.start) + edit.text + original.slice(edit.end) : original;
		};

		test('is undefined for equal text', () => {
			assert.strictEqual(minimalEdit('a\n', 'a\n'), undefined);
		});

		test('covers only the lines that differ', () => {
			assert.deepStrictEqual(minimalEdit('a=1\nb=2\nc=3\n', 'a=1\nb = 2\nc=3\n'), {
				start: 4,
				end: 8,
				text: 'b = 2\n',
			});
		});

		test('reproduces the formatted text for replacement, insertion, deletion and the last line', () => {
			const cases: [string, string][] = [
				['a\nb\nc\n', 'a\nB\nc\n'],
				['a\nb\nc\n', 'a\nx\ny\nb\nc\n'],
				['a\nb\nc\n', 'a\nc\n'],
				['a\nb\nc', 'a\nb\nd'],
				['a\nb\n', 'a\nb\nc\n'],
				['a\nb\nc\n', ''],
				['', 'a\n'],
				['a\n', 'a\n\n\n'],
			];
			for (const [original, formatted] of cases) {
				assert.strictEqual(apply(original, formatted), formatted, JSON.stringify([original, formatted]));
			}
		});
	});

	test('touchedLines is 1-based and ignores a range that only reaches column 0 of its last line', () => {
		assert.deepStrictEqual(touchedLines({ start: { line: 2 }, end: { line: 4, character: 0 } }), { start: 3, end: 4 });
		assert.deepStrictEqual(touchedLines({ start: { line: 2 }, end: { line: 4, character: 3 } }), { start: 3, end: 5 });
		assert.deepStrictEqual(touchedLines({ start: { line: 2 }, end: { line: 2, character: 0 } }), { start: 3, end: 3 });
	});
});
