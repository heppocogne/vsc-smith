import type MarkdownIt from 'markdown-it';

type Token = MarkdownIt.Token;

const MARKER = /^\[([ xX])\]\s+/;

function parentList(tokens: Token[], itemIndex: number): Token | undefined {
	const level = tokens[itemIndex].level - 1;
	for (let i = itemIndex - 1; i >= 0; i--) {
		if (tokens[i].level === level) {
			return tokens[i];
		}
	}
	return undefined;
}

/** Renders `- [ ]` / `- [x]` list items as disabled checkboxes. */
export function taskListPlugin(md: MarkdownIt, isEnabled: () => boolean): void {
	md.core.ruler.push('vsc_smith_task_list', state => {
		if (!isEnabled()) {
			return;
		}
		const tokens = state.tokens;
		for (let i = 2; i < tokens.length; i++) {
			const inline = tokens[i];
			if (
				inline.type !== 'inline' ||
				tokens[i - 1].type !== 'paragraph_open' ||
				tokens[i - 2].type !== 'list_item_open'
			) {
				continue;
			}
			// The raw source is checked as well, so that an escaped `\[ ]` stays as text.
			const text = inline.children?.[0];
			const match = MARKER.exec(inline.content);
			if (!match || text?.type !== 'text' || !text.content.startsWith(match[0])) {
				continue;
			}
			text.content = text.content.slice(match[0].length);
			const checkbox = new state.Token('html_inline', '', 0);
			const checked = match[1] === ' ' ? '' : ' checked';
			checkbox.content = `<input class="task-list-item-checkbox" type="checkbox" disabled${checked}> `;
			inline.children!.unshift(checkbox);

			tokens[i - 2].attrJoin('class', 'task-list-item');
			const list = parentList(tokens, i - 2);
			if (list && !list.attrGet('class')?.split(' ').includes('contains-task-list')) {
				list.attrJoin('class', 'contains-task-list');
			}
		}
	});
}
