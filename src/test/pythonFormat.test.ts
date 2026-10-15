import * as assert from 'assert';
import * as path from 'path';
import { defaultPython, formatPython } from '../features/pythonFormat';

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
});
