import type MarkdownIt from 'markdown-it';

export const COPY_BUTTON_POSITIONS = ['top-right', 'bottom-right'] as const;
export type CopyButtonPosition = (typeof COPY_BUTTON_POSITIONS)[number];

/** Attribute that `media/copyButton.js` looks for; its value is the position of the button. */
export const COPY_BUTTON_ATTRIBUTE = 'data-vsc-smith-copy';

/**
 * Marks the `<pre>` of code blocks (fenced and indented) for the preview script to add a copy button to. `position`
 * returns undefined while the feature is disabled. Wrap the rules of other plugins by registering this one last.
 */
export function copyButtonPlugin(md: MarkdownIt, position: () => CopyButtonPosition | undefined): void {
	for (const name of ['fence', 'code_block']) {
		const fallback = md.renderer.rules[name];
		md.renderer.rules[name] = (tokens, idx, options, env, self) => {
			const html = fallback ? fallback(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
			const where = position();
			// Only the first `<pre` (the opening tag): the highlighter's output may contain more of them in the code.
			return where ? html.replace(/^(\s*)<pre(?=[\s>])/, `$1<pre ${COPY_BUTTON_ATTRIBUTE}="${where}"`) : html;
		};
	}
}
