import type MarkdownIt from 'markdown-it';

/**
 * Class of the element that `media/mermaid.js` turns into a diagram. Not `mermaid`, which the preview scripts of
 * other Mermaid extensions look for.
 */
export const MERMAID_CLASS = 'vsc-smith-mermaid';

/** The language of a fence is the first word of its info string. */
function isMermaid(info: string): boolean {
	return info.trim().split(/\s+/, 1)[0].toLowerCase() === 'mermaid';
}

/** Renders ` ```mermaid ` fences as an element holding the diagram source, for the preview script to draw. */
export function mermaidPlugin(md: MarkdownIt, isEnabled: () => boolean): void {
	const fallback = md.renderer.rules.fence;
	md.renderer.rules.fence = (tokens, idx, options, env, self) => {
		const token = tokens[idx];
		if (!isEnabled() || !isMermaid(token.info)) {
			return fallback ? fallback(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
		}
		// The attributes the preview has put on the token (`data-line` and `code-line`, for scroll sync) are kept.
		// The token is not modified: the preview renders the same tokens more than once.
		const attrs = (token.attrs ?? []).filter(([name]) => name !== 'class');
		const classes = [...(token.attrGet('class')?.split(/\s+/) ?? []).filter(c => c === 'code-line'), MERMAID_CLASS];
		attrs.push(['class', classes.join(' ')]);
		return `<pre${self.renderAttrs({ attrs } as MarkdownIt.Token)}>${md.utils.escapeHtml(token.content)}</pre>\n`;
	};
}
