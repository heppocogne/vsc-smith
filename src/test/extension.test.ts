import * as assert from 'assert';
import { formatExactBytes, formatFileSize } from '../util/format';

suite('formatFileSize', () => {
	test('bytes', () => {
		assert.strictEqual(formatFileSize(0), '0 B');
		assert.strictEqual(formatFileSize(1023), '1023 B');
	});

	test('larger units', () => {
		assert.strictEqual(formatFileSize(1024), '1.00 KB');
		assert.strictEqual(formatFileSize(1536), '1.50 KB');
		assert.strictEqual(formatFileSize(50 * 1024), '50.0 KB');
		assert.strictEqual(formatFileSize(500 * 1024), '500 KB');
		assert.strictEqual(formatFileSize(3 * 1024 ** 3), '3.00 GB');
	});

	test('exact bytes', () => {
		assert.strictEqual(formatExactBytes(1234567), '1,234,567 bytes');
	});
});
