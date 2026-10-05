import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	version: '1.87.0',
	mocha: {
		timeout: 10000,
	},
});
