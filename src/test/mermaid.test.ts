import * as assert from 'assert';
import MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import { mermaidPlugin } from '../features/mermaid/plugin';

function render(source: string, enabled = true): string {
	const md = new MarkdownIt();
	mermaidPlugin(md, () => enabled);
	return md.render(source);
}

suite('mermaid plugin', () => {
	test('mermaid fence', () => {
		assert.strictEqual(render('```mermaid\ngraph TD\n  A --> B\n```\n'), '<pre class="vsc-smith-mermaid">graph TD\n  A --&gt; B\n</pre>\n');
	});

	test('tilde fence, case-insensitive language, text after the language', () => {
		for (const source of ['~~~mermaid\ngraph TD\n~~~\n', '```Mermaid\ngraph TD\n```\n', '``` mermaid title\ngraph TD\n```\n']) {
			assert.strictEqual(render(source), '<pre class="vsc-smith-mermaid">graph TD\n</pre>\n', source);
		}
	});

	test('source is escaped', () => {
		const html = render('```mermaid\nA["<script>alert(1)</script>"] & B\n```\n');
		assert.ok(html.includes('A[&quot;&lt;script&gt;alert(1)&lt;/script&gt;&quot;] &amp; B'));
		assert.ok(!html.includes('<script>'));
	});

	test('inside a list item and a blockquote', () => {
		for (const source of ['- item\n\n  ```mermaid\n  graph TD\n  ```\n', '> ```mermaid\n> graph TD\n> ```\n']) {
			assert.ok(render(source).includes('<pre class="vsc-smith-mermaid">graph TD\n</pre>'), source);
		}
	});

	test('not a mermaid fence', () => {
		for (const source of ['```js\ngraph TD\n```\n', '```\nmermaid\n```\n', '```mermaidjs\ngraph TD\n```\n', '    mermaid\n', '`mermaid`\n']) {
			assert.ok(!render(source).includes('vsc-smith-mermaid'), source);
		}
	});

	test('other fences go through the previous rule', () => {
		const md = new MarkdownIt();
		md.renderer.rules.fence = () => 'previous';
		mermaidPlugin(md, () => true);
		assert.strictEqual(md.render('```js\na\n```\n'), 'previous');
		assert.ok(md.render('```mermaid\na\n```\n').includes('vsc-smith-mermaid'));
	});

	test('keeps the attributes for scroll sync and leaves the token as it was', () => {
		const md = new MarkdownIt();
		mermaidPlugin(md, () => true);
		const tokens = md.parse('```mermaid\ngraph TD\n```\n', {});
		tokens[0].attrSet('data-line', '0');
		tokens[0].attrJoin('class', 'code-line');
		tokens[0].attrJoin('class', 'hljs');
		const expected = '<pre data-line="0" class="code-line vsc-smith-mermaid">graph TD\n</pre>\n';
		assert.strictEqual(md.renderer.render(tokens, md.options, {}), expected);
		assert.strictEqual(md.renderer.render(tokens, md.options, {}), expected);
	});

	test('disabled', () => {
		assert.strictEqual(render('```mermaid\ngraph TD\n```\n', false), '<pre><code class="language-mermaid">graph TD\n</code></pre>\n');
	});
});

suite('mermaid extension', () => {
	test('activate returns a markdown-it extension that follows the setting', async () => {
		const ext = vscode.extensions.all.find(e => e.packageJSON.name === 'vsc-smith');
		assert.ok(ext);
		const api = await ext.activate();
		const md = api.extendMarkdownIt(new MarkdownIt());
		const config = vscode.workspace.getConfiguration('vsc-smith.mermaid');
		const source = '```mermaid\ngraph TD\n```\n\n- [ ] a\n';
		try {
			// The GFM rules are part of the same extension.
			assert.ok(md.render(source).includes('vsc-smith-mermaid'));
			assert.ok(md.render(source).includes('<input'));
			await config.update('enabled', false, vscode.ConfigurationTarget.Global);
			assert.ok(!md.render(source).includes('vsc-smith-mermaid'));
		} finally {
			await config.update('enabled', undefined, vscode.ConfigurationTarget.Global);
		}
	});

	test('the preview script and the library it loads are in place', async () => {
		const ext = vscode.extensions.all.find(e => e.packageJSON.name === 'vsc-smith');
		assert.ok(ext);
		assert.ok(ext.packageJSON.contributes['markdown.previewScripts'].includes('./media/mermaid.js'));
		// The path media/mermaid.js resolves against its own location.
		for (const file of ['media/mermaid.js', 'node_modules/mermaid/dist/mermaid.min.js']) {
			const stat = await vscode.workspace.fs.stat(vscode.Uri.joinPath(ext.extensionUri, file));
			assert.strictEqual(stat.type, vscode.FileType.File, file);
		}
	});
});
