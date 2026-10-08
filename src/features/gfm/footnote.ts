import type MarkdownIt from 'markdown-it';

type Token = MarkdownIt.Token;
type StateBlock = MarkdownIt.StateBlock;
type StateInline = MarkdownIt.StateInline;

interface FootnoteEnv {
	footnotes?: {
		/** `:label` -> index into `list`, or -1 while the definition has not been referenced yet. */
		refs: Record<string, number>;
		list: { label: string; count: number }[];
	};
}

const TAB = 0x09;
const LF = 0x0a;
const SPACE = 0x20;

/** Footnote labels cannot contain whitespace. Returns the position of the closing `]`, or -1. */
function findLabelEnd(src: string, from: number, max: number): number {
	for (let pos = from; pos < max; pos++) {
		const ch = src.charCodeAt(pos);
		if (ch === SPACE || ch === LF || ch === TAB) {
			return -1;
		}
		if (ch === 0x5d /* ] */) {
			return pos === from ? -1 : pos;
		}
	}
	return -1;
}

function anchorId(prefix: string, label: string, subId = 0): string {
	return `${prefix}-${encodeURIComponent(label)}${subId > 0 ? `-${subId + 1}` : ''}`;
}

/** `[^label]: text` with continuation lines indented by 4 spaces. */
function definitionRule(isEnabled: () => boolean) {
	return (state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean => {
		if (!isEnabled() || state.sCount[startLine] - state.blkIndent >= 4) {
			return false;
		}
		const start = state.bMarks[startLine] + state.tShift[startLine];
		const max = state.eMarks[startLine];
		if (state.src.charCodeAt(start) !== 0x5b || state.src.charCodeAt(start + 1) !== 0x5e) {
			return false;
		}
		const end = findLabelEnd(state.src, start + 2, max);
		if (end < 0 || state.src.charCodeAt(end + 1) !== 0x3a /* : */) {
			return false;
		}
		if (silent) {
			return true;
		}
		const label = state.src.slice(start + 2, end);
		let pos = end + 2;

		const env = state.env as FootnoteEnv;
		env.footnotes ??= { refs: {}, list: [] };
		env.footnotes.refs[`:${label}`] ??= -1;

		const open = state.push('footnote_reference_open', '', 1);
		open.meta = { label };
		open.level = state.level++;

		const oldBMark = state.bMarks[startLine];
		const oldTShift = state.tShift[startLine];
		const oldSCount = state.sCount[startLine];
		const oldParentType = state.parentType;

		const posAfterColon = pos;
		const initial = state.sCount[startLine] + pos - (state.bMarks[startLine] + state.tShift[startLine]);
		let offset = initial;
		while (pos < max) {
			const ch = state.src.charCodeAt(pos);
			if (ch === TAB) {
				offset += 4 - (offset % 4);
			} else if (ch === SPACE) {
				offset++;
			} else {
				break;
			}
			pos++;
		}
		state.tShift[startLine] = pos - posAfterColon;
		state.sCount[startLine] = offset - initial;
		state.bMarks[startLine] = posAfterColon;
		state.blkIndent += 4;
		state.parentType = 'footnote' as typeof state.parentType;
		if (state.sCount[startLine] < state.blkIndent) {
			state.sCount[startLine] += state.blkIndent;
		}
		state.md.block.tokenize(state, startLine, endLine);

		state.parentType = oldParentType;
		state.blkIndent -= 4;
		state.tShift[startLine] = oldTShift;
		state.sCount[startLine] = oldSCount;
		state.bMarks[startLine] = oldBMark;

		const close = state.push('footnote_reference_close', '', -1);
		close.level = --state.level;
		return true;
	};
}

/** `[^label]` pointing at a defined footnote. */
function referenceRule(isEnabled: () => boolean) {
	return (state: StateInline, silent: boolean): boolean => {
		const start = state.pos;
		const max = state.posMax;
		if (!isEnabled() || state.src.charCodeAt(start) !== 0x5b || state.src.charCodeAt(start + 1) !== 0x5e) {
			return false;
		}
		const end = findLabelEnd(state.src, start + 2, max);
		if (end < 0) {
			return false;
		}
		const label = state.src.slice(start + 2, end);
		const footnotes = (state.env as FootnoteEnv).footnotes;
		if (!footnotes || footnotes.refs[`:${label}`] === undefined) {
			return false;
		}
		if (!silent) {
			let id = footnotes.refs[`:${label}`];
			if (id < 0) {
				id = footnotes.list.length;
				footnotes.list.push({ label, count: 0 });
				footnotes.refs[`:${label}`] = id;
			}
			const subId = footnotes.list[id].count++;
			const token = state.push('footnote_ref', '', 0);
			token.meta = { id, subId, label };
		}
		state.pos = end + 1;
		return true;
	};
}

/** Pulls the definitions out of the token stream and appends the numbered list of referenced ones. */
function tailRule(isEnabled: () => boolean) {
	return (state: MarkdownIt.StateCore): void => {
		const footnotes = (state.env as FootnoteEnv).footnotes;
		if (!isEnabled() || !footnotes) {
			return;
		}
		// The first definition of a label wins, as on GitHub.
		const bodies = new Map<string, Token[]>();
		let current: Token[] | undefined;
		state.tokens = state.tokens.filter(token => {
			if (token.type === 'footnote_reference_open') {
				const label = token.meta.label as string;
				current = [];
				if (!bodies.has(label)) {
					bodies.set(label, current);
				}
				return false;
			}
			if (token.type === 'footnote_reference_close') {
				current = undefined;
				return false;
			}
			current?.push(token);
			return !current;
		});
		if (footnotes.list.length === 0) {
			return;
		}

		const Token = state.Token;
		state.tokens.push(new Token('footnote_block_open', '', 1));
		footnotes.list.forEach((item, id) => {
			const open = new Token('footnote_open', '', 1);
			open.meta = { id, label: item.label };
			state.tokens.push(open);

			const body = bodies.get(item.label) ?? [];
			const anchors: Token[] = [];
			for (let subId = 0; subId < item.count; subId++) {
				const anchor = new Token('footnote_anchor', '', 0);
				anchor.meta = { id, subId, label: item.label, multiple: item.count > 1 };
				anchors.push(anchor);
			}
			if (body[body.length - 1]?.type === 'paragraph_close') {
				body.splice(body.length - 1, 0, ...anchors);
			} else {
				body.push(...anchors);
			}
			state.tokens.push(...body);
			state.tokens.push(new Token('footnote_close', '', -1));
		});
		state.tokens.push(new Token('footnote_block_close', '', -1));
	};
}

/** GitHub-style footnotes: `[^label]` references and `[^label]: text` definitions. */
export function footnotePlugin(md: MarkdownIt, isEnabled: () => boolean): void {
	md.block.ruler.before('reference', 'vsc_smith_footnote_def', definitionRule(isEnabled), {
		alt: ['paragraph', 'reference'],
	});
	md.inline.ruler.after('image', 'vsc_smith_footnote_ref', referenceRule(isEnabled));
	md.core.ruler.after('inline', 'vsc_smith_footnote_tail', tailRule(isEnabled));

	const { escapeHtml } = md.utils;
	const rules = md.renderer.rules;
	rules['footnote_ref'] = (tokens, i) => {
		const { id, subId, label } = tokens[i].meta as { id: number; subId: number; label: string };
		return `<sup class="footnote-ref"><a href="#${anchorId('fn', label)}" id="${anchorId('fnref', label, subId)}">${id + 1}</a></sup>`;
	};
	rules['footnote_block_open'] = () =>
		'<section class="footnotes">\n<hr class="footnotes-sep">\n<ol class="footnotes-list">\n';
	rules['footnote_block_close'] = () => '</ol>\n</section>\n';
	rules['footnote_open'] = (tokens, i) =>
		`<li id="${escapeHtml(anchorId('fn', tokens[i].meta.label))}" class="footnote-item">`;
	rules['footnote_close'] = () => '</li>\n';
	rules['footnote_anchor'] = (tokens, i) => {
		const { subId, label, multiple } = tokens[i].meta as { subId: number; label: string; multiple: boolean };
		const sup = multiple ? `<sup>${subId + 1}</sup>` : '';
		return ` <a href="#${anchorId('fnref', label, subId)}" class="footnote-backref">↩︎${sup}</a>`;
	};
}
