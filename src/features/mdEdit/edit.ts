// Pure functions behind the Markdown editing commands: they take text and return the new text, or `null` /
// `undefined` when the command does not apply.
import { parseListLine } from '../markdown/listEdit';

/**
 * Toggles the task list checkbox of a line: `- [ ]` and `- [x]` switch, and a list item without a checkbox becomes
 * an unchecked task. Returns `null` for a line that is not a list item.
 */
export function toggleTaskLine(line: string): string | null {
	const item = parseListLine(line);
	if (!item?.marker) {
		return null;
	}
	const head = item.quote + item.indent + item.marker + item.space;
	if (!item.task) {
		return `${head}[ ] ${item.body}`;
	}
	const checked = /\[[xX]\]/.test(item.task);
	return head + item.task.replace(/\[[ xX]\]/, checked ? '[ ]' : '[x]') + item.body;
}

/** Returns the URL when the clipboard text is just one `http(s)` URL, and `undefined` otherwise. */
export function urlToPaste(clipboard: string): string | undefined {
	const text = clipboard.trim();
	return /^https?:\/\/[^\s<>]+$/i.test(text) ? text : undefined;
}

/** Builds `[text](url)`. Parentheses of the URL are encoded when they are not balanced. */
export function markdownLink(text: string, url: string): string {
	let depth = 0;
	let balanced = true;
	for (const c of url) {
		depth += c === '(' ? 1 : c === ')' ? -1 : 0;
		if (depth < 0) {
			balanced = false;
			break;
		}
	}
	const target = balanced && depth === 0 ? url : url.replace(/\(/g, '%28').replace(/\)/g, '%29');
	return `[${text}](${target})`;
}

export interface WrapEdit {
	/** Characters to remove from the end of the text before the selection. */
	removeBefore: number;
	/** Replacement for the selected text. */
	text: string;
	/** Characters to remove from the start of the text after the selection. */
	removeAfter: number;
}

function leadingRun(s: string, ch: string): number {
	let n = 0;
	while (n < s.length && s[n] === ch) {
		n++;
	}
	return n;
}

function trailingRun(s: string, ch: string): number {
	let n = 0;
	while (n < s.length && s[s.length - 1 - n] === ch) {
		n++;
	}
	return n;
}

/**
 * Wraps `text` in `marker` (`**`, `*`, `~~`, `` ` ``), or removes the marker when it is already there, either inside
 * the selection or around it (`before` and `after` are the rest of the line). Markers are runs of one character, so
 * `***x***` is bold and italic: a single `*` is taken as present when the run is odd, and `**` when it has two or more.
 */
export function toggleWrap(before: string, text: string, after: string, marker: string): WrapEdit {
	const ch = marker[0];
	const onlyMarkers = text.length > 0 && text.split('').every(c => c === ch);
	const textLead = onlyMarkers ? 0 : leadingRun(text, ch);
	const textTrail = onlyMarkers ? 0 : trailingRun(text, ch);
	const run = Math.min(textLead + trailingRun(before, ch), textTrail + leadingRun(after, ch));
	const present = marker.length === 1 ? run % 2 === 1 : run >= marker.length;
	if (!present) {
		return { removeBefore: 0, text: marker + text + marker, removeAfter: 0 };
	}
	// The marker is taken from the selection first and from the text around it for the rest.
	const fromLead = Math.min(textLead, marker.length);
	const fromTrail = Math.min(textTrail, marker.length);
	return {
		removeBefore: marker.length - fromLead,
		text: text.slice(fromLead, text.length - fromTrail),
		removeAfter: marker.length - fromTrail,
	};
}

/** Returns the next number for a footnote label: the largest numeric label in the text plus one. */
export function nextFootnoteLabel(text: string): number {
	let max = 0;
	for (const m of text.matchAll(/\[\^(\d+)\]/g)) {
		max = Math.max(max, Number(m[1]));
	}
	return max + 1;
}

const FOOTNOTE_DEFINITION = /^\[\^[^\]\s]+\]:/;

/**
 * Returns the text that adds the definition of footnote `label` after the last non-blank line `lastLine` of the
 * document: right below the previous definition, or after a blank line otherwise.
 */
export function footnoteDefinition(lastLine: string | undefined, label: number): string {
	const separator = lastLine !== undefined && FOOTNOTE_DEFINITION.test(lastLine) ? '\n' : '\n\n';
	return `${separator}[^${label}]: `;
}

const DATE_TOKEN = /\[([^\]]*)\]|YYYY|YY|MM|M|DD|D|HH|H|mm|ss/g;

/**
 * Formats a date with `YYYY YY MM M DD D HH H mm ss` (local time). Text in square brackets is kept as it is, so
 * `[at] HH:mm` gives `at 09:05`.
 */
export function formatDateTime(date: Date, format: string): string {
	const pad = (n: number, width = 2) => String(n).padStart(width, '0');
	return format.replace(DATE_TOKEN, (token, literal?: string) => {
		switch (token) {
			case 'YYYY':
				return pad(date.getFullYear(), 4);
			case 'YY':
				return pad(date.getFullYear() % 100);
			case 'MM':
				return pad(date.getMonth() + 1);
			case 'M':
				return String(date.getMonth() + 1);
			case 'DD':
				return pad(date.getDate());
			case 'D':
				return String(date.getDate());
			case 'HH':
				return pad(date.getHours());
			case 'H':
				return String(date.getHours());
			case 'mm':
				return pad(date.getMinutes());
			case 'ss':
				return pad(date.getSeconds());
			default:
				return literal ?? token;
		}
	});
}
