import * as assert from 'assert';
import MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import { alertPlugin } from '../features/gfm/alert';
import { footnotePlugin } from '../features/gfm/footnote';
import { taskListPlugin } from '../features/gfm/taskList';

function render(source: string, enabled = true): string {
	const md = new MarkdownIt();
	alertPlugin(md, () => enabled);
	taskListPlugin(md, () => enabled);
	footnotePlugin(md, () => enabled);
	return md.render(source);
}

const UNCHECKED = '<input class="task-list-item-checkbox" type="checkbox" disabled> ';
const CHECKED = '<input class="task-list-item-checkbox" type="checkbox" disabled checked> ';

suite('gfm task list', () => {
	test('unchecked and checked items', () => {
		assert.strictEqual(render('- [ ] a\n- [x] b\n- [X] c\n'), [
			'<ul class="contains-task-list">',
			`<li class="task-list-item">${UNCHECKED}a</li>`,
			`<li class="task-list-item">${CHECKED}b</li>`,
			`<li class="task-list-item">${CHECKED}c</li>`,
			'</ul>',
			'',
		].join('\n'));
	});

	test('ordered and nested lists', () => {
		const html = render('1. [ ] a\n   - [x] b\n   - c\n');
		assert.ok(html.includes('<ol class="contains-task-list">'));
		assert.ok(html.includes(`<li class="task-list-item">${UNCHECKED}a`));
		assert.ok(html.includes('<ul class="contains-task-list">'));
		assert.ok(html.includes(`<li class="task-list-item">${CHECKED}b</li>`));
		assert.ok(html.includes('<li>c</li>'));
	});

	test('inline markup after the marker', () => {
		assert.ok(render('- [x] **b**\n').includes(`${CHECKED}<strong>b</strong>`));
	});

	test('loose list', () => {
		assert.ok(render('- [ ] a\n\n- [x] b\n').includes(`<p>${UNCHECKED}a</p>`));
	});

	test('not a task item', () => {
		for (const source of ['- [ ]\n', '- [ ]a\n', '- [y] a\n', '- \\[ ] a\n', '- [ ](url) a\n', '[ ] a\n', '- a [ ] b\n']) {
			assert.ok(!render(source).includes('<input'), source);
		}
	});

	test('disabled', () => {
		assert.strictEqual(render('- [ ] a\n', false), '<ul>\n<li>[ ] a</li>\n</ul>\n');
	});
});

suite('gfm alert', () => {
	test('every type', () => {
		for (const [marker, type, title] of [
			['NOTE', 'note', 'Note'],
			['TIP', 'tip', 'Tip'],
			['IMPORTANT', 'important', 'Important'],
			['WARNING', 'warning', 'Warning'],
			['CAUTION', 'caution', 'Caution'],
		]) {
			assert.strictEqual(render(`> [!${marker}]\n> body\n`), [
				`<blockquote class="markdown-alert markdown-alert-${type}">`,
				`<p class="markdown-alert-title">${title}</p>`,
				'<p>body</p>',
				'</blockquote>',
				'',
			].join('\n'));
		}
	});

	test('case-insensitive marker, trailing spaces', () => {
		assert.ok(render('> [!note]  \n> body\n').includes('markdown-alert-note'));
		assert.ok(render('> [!Note] \n> body\n').includes('<p>body</p>'));
	});

	test('body in a separate paragraph', () => {
		assert.strictEqual(render('> [!TIP]\n>\n> body\n'), [
			'<blockquote class="markdown-alert markdown-alert-tip">',
			'<p class="markdown-alert-title">Tip</p>',
			'<p>body</p>',
			'</blockquote>',
			'',
		].join('\n'));
	});

	test('body keeps inline markup and later lines', () => {
		const html = render('> [!WARNING]\n> **a**\n> b\n');
		assert.ok(html.includes('<p><strong>a</strong>\nb</p>'));
	});

	test('several alerts in one document', () => {
		const html = render('> [!NOTE]\n> a\n\ntext\n\n> [!CAUTION]\n> b\n');
		assert.ok(html.includes('markdown-alert-note'));
		assert.ok(html.includes('markdown-alert-caution'));
		assert.ok(html.includes('<p>text</p>'));
	});

	test('inside list items', () => {
		for (const source of [
			'- > [!NOTE]\n  > body\n',
			'* item\n\n     > [!NOTE]\n     > body\n',
			'1. item\n   - nested\n\n     > [!NOTE]\n     > body\n',
		]) {
			const html = render(source);
			assert.ok(html.includes('<blockquote class="markdown-alert markdown-alert-note">\n<p class="markdown-alert-title">Note</p>\n<p>body</p>'), source);
		}
	});

	test('alert after a nested blockquote', () => {
		const html = render('> > quoted\n\n> [!TIP]\n> body\n');
		assert.strictEqual(html.match(/markdown-alert-tip/g)?.length, 1);
	});

	test('not an alert', () => {
		for (const source of [
			'> [!NOTE]\n',
			'> [!NOTE] body\n',
			'> [!UNKNOWN]\n> body\n',
			'> \\[!NOTE]\n> body\n',
			'> text\n> [!NOTE]\n',
			'> > [!NOTE]\n> > body\n',
			'> text\n>\n> > [!NOTE]\n> > body\n',
			'- > > [!NOTE]\n  > > body\n',
			'    > [!NOTE]\n    > body\n',
			'>\n',
			'[!NOTE]\nbody\n',
		]) {
			assert.ok(!render(source).includes('markdown-alert'), source);
		}
	});

	test('disabled', () => {
		assert.strictEqual(render('> [!NOTE]\n> body\n', false), '<blockquote>\n<p>[!NOTE]\nbody</p>\n</blockquote>\n');
	});
});

suite('gfm extension', () => {
	test('activate returns a markdown-it extension that follows the setting', async () => {
		const ext = vscode.extensions.all.find(e => e.packageJSON.name === 'vsc-smith');
		assert.ok(ext);
		const api = await ext.activate();
		const md = api.extendMarkdownIt(new MarkdownIt());
		const config = vscode.workspace.getConfiguration('vsc-smith.gfm');
		try {
			assert.ok(md.render('- [ ] a\n').includes('<input'));
			await config.update('enabled', false, vscode.ConfigurationTarget.Global);
			assert.ok(!md.render('- [ ] a\n').includes('<input'));
		} finally {
			await config.update('enabled', undefined, vscode.ConfigurationTarget.Global);
		}
	});
});

suite('gfm footnote', () => {
	test('reference and definition', () => {
		const html = render('a[^1]\n\n[^1]: note\n');
		assert.ok(html.includes('<p>a<sup class="footnote-ref"><a href="#fn-1" id="fnref-1">1</a></sup></p>'));
		assert.ok(html.includes('<li id="fn-1" class="footnote-item"><p>note <a href="#fnref-1" class="footnote-backref">\u21a9\uFE0E</a></p>\n</li>'));
	});

	test('numbered by first reference, repeated references get back links', () => {
		const html = render('a[^b] c[^a] d[^b]\n\n[^a]: A\n[^b]: B\n');
		assert.ok(html.includes('>1</a></sup> c<sup class="footnote-ref"><a href="#fn-a" id="fnref-a">2</a>'));
		assert.ok(html.includes('id="fnref-b-2">1</a>'));
		assert.ok(html.includes('class="footnote-backref">\u21a9\uFE0E<sup>2</sup></a>'));
	});

	test('multi-paragraph definition', () => {
		const html = render('a[^1]\n\n[^1]: first\n\n    second\n');
		assert.ok(html.includes('<p>first</p>\n<p>second <a'));
	});

	test('undefined reference and unreferenced definition', () => {
		assert.strictEqual(render('a[^x]\n'), '<p>a[^x]</p>\n');
		assert.ok(!render('[^x]: unused\n').includes('footnote'));
	});

	test('inline markup in definition', () => {
		assert.ok(render('a[^1]\n\n[^1]: **b**\n').includes('<strong>b</strong>'));
	});

	test('disabled', () => {
		assert.ok(!render('a[^1]\n\n[^1]: note\n', false).includes('footnote'));
	});
});
