import type MarkdownIt from 'markdown-it';

const TITLES: Record<string, string> = {
	note: 'Note',
	tip: 'Tip',
	important: 'Important',
	warning: 'Warning',
	caution: 'Caution',
};

/** The marker has to be alone on the first line of the blockquote, as on GitHub. */
const MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*(\n|$)/i;

/** Renders blockquotes starting with `[!NOTE]` and the like as GitHub alerts. */
export function alertPlugin(md: MarkdownIt, isEnabled: () => boolean): void {
	md.core.ruler.push('vsc_smith_alert', state => {
		if (!isEnabled()) {
			return;
		}
		const tokens = state.tokens;
		// Backwards, so that the tokens inserted and removed below do not shift the ones still to be visited.
		for (let i = tokens.length - 5; i >= 0; i--) {
			const quote = tokens[i];
			const inline = tokens[i + 2];
			// GitHub does not render alerts nested in lists or other blockquotes.
			if (quote.type !== 'blockquote_open' || quote.level !== 0
				|| tokens[i + 1].type !== 'paragraph_open' || inline.type !== 'inline') {
				continue;
			}
			const match = MARKER.exec(inline.content);
			if (!match) {
				continue;
			}
			const children = inline.children ?? [];
			if (match[0].length === inline.content.length) {
				// The marker is the whole paragraph: an alert needs a body after it.
				if (tokens[i + 4].type === 'blockquote_close') {
					continue;
				}
				tokens.splice(i + 1, 3);
			} else if (children[0]?.type === 'text' && ['softbreak', 'hardbreak'].includes(children[1]?.type)) {
				children.splice(0, 2);
				inline.content = inline.content.slice(match[0].length);
			} else {
				continue;
			}

			const type = match[1].toLowerCase();
			quote.attrJoin('class', `markdown-alert markdown-alert-${type}`);
			const title = new state.Token('html_block', '', 0);
			title.content = `<p class="markdown-alert-title">${TITLES[type]}</p>\n`;
			title.block = true;
			title.level = quote.level + 1;
			tokens.splice(i + 1, 0, title);
		}
	});
}
