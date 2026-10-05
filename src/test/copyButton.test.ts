import * as assert from 'assert';
import MarkdownIt from 'markdown-it';
import { CopyButtonPosition, copyButtonPlugin } from '../features/copyButton/plugin';

function render(source: string, position: CopyButtonPosition | undefined = 'top-right'): string {
	const md = new MarkdownIt();
	copyButtonPlugin(md, () => position);
	return md.render(source);
}

suite('copyButton plugin', () => {
	test('fenced and indented code blocks are marked', () => {
		assert.strictEqual(render('```js\na\n```\n'), '<pre data-vsc-smith-copy="top-right"><code class="language-js">a\n</code></pre>\n');
		assert.strictEqual(render('    a\n', 'bottom-right'), '<pre data-vsc-smith-copy="bottom-right"><code>a\n</code></pre>\n');
	});

	test('inline code is not marked', () => {
		assert.ok(!render('`a`\n').includes('data-vsc-smith-copy'));
	});

	test('disabled', () => {
		assert.strictEqual(render('```\na\n```\n', undefined), '<pre><code>a\n</code></pre>\n');
	});

	test('only the opening tag of a highlighted block is marked', () => {
		const md = new MarkdownIt({ highlight: () => '<pre class="hljs"><code><pre>x</pre></code></pre>' });
		copyButtonPlugin(md, () => 'top-left');
		const html = md.render('```js\nx\n```\n');
		assert.strictEqual(html, '<pre data-vsc-smith-copy="top-left" class="hljs"><code><pre>x</pre></code></pre>');
	});
});
