// Pure functions behind the markdown list continuation commands. They take the current line and the cursor
// position and return the new content of that line, or `null` when the key should keep its default behavior.

/** A list item or blockquote line split into its parts. Concatenating all parts gives back the line. */
export interface ListLine {
	/** Blockquote markers including the whitespace around them (e.g. `> > `), or an empty string. */
	quote: string;
	/** Whitespace between the quote markers and the list marker. */
	indent: string;
	/** `-`, `*`, `+`, `1.` or `1)`; empty for a blockquote line without a list marker. */
	marker: string;
	/** Whitespace after the list marker. */
	space: string;
	/** Task list checkbox including the whitespace after it (e.g. `[x] `), or an empty string. */
	task: string;
	body: string;
}

/** Result of an edit: the replacement for the current line, and the cursor position relative to that line. */
export interface LineEdit {
	text: string;
	/** Line of the cursor, counted from the edited line. */
	line: number;
	character: number;
}

export interface IndentOptions {
	insertSpaces: boolean;
	tabSize: number;
}

// The whitespace after the marker is required so that thematic breaks (`---`) and setext underlines are not lists.
const LIST_LINE = /^((?:[ \t]*>[ \t]?)*)([ \t]*)(?:([-*+]|\d{1,9}[.)])([ \t]+)(\[[ xX]\](?:[ \t]+|$))?)?(.*)$/;
const THEMATIC_BREAK = /^(?:[ \t]*>[ \t]?)*[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const FENCE = /^(?:[ \t]*>)*[ \t]*(`{3,}|~{3,})(.*)$/;

export function parseListLine(line: string): ListLine | undefined {
	const m = LIST_LINE.exec(line);
	if (!m) {
		return undefined;
	}
	const [, quote, indent, marker = '', space = '', task = '', body] = m;
	// `* * *` and `- - -` look like list items but are thematic breaks.
	if ((!marker && !quote) || (marker && THEMATIC_BREAK.test(line))) {
		return undefined;
	}
	// Without a list marker the indentation belongs to the body of the quote.
	return marker
		? { quote, indent, marker, space, task, body }
		: { quote, indent: '', marker, space, task, body: indent + body };
}

function markerStart(item: ListLine): number {
	return item.quote.length + item.indent.length;
}

function contentStart(item: ListLine): number {
	return markerStart(item) + item.marker.length + item.space.length + item.task.length;
}

function join(item: ListLine): string {
	return item.quote + item.indent + item.marker + item.space + item.task + item.body;
}

function indentUnit(options: IndentOptions): string {
	return options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
}

/** Removes one level from the end of `indent`: a tab, or up to `tabSize` spaces. */
function outdentIndent(indent: string, tabSize: number): string {
	if (indent.endsWith('\t')) {
		return indent.slice(0, -1);
	}
	const spaces = indent.length - indent.trimEnd().length;
	return indent.slice(0, indent.length - Math.min(spaces, tabSize));
}

/** Returns the marker of the next item: the number is incremented and the delimiter (`.` or `)`) kept. */
function nextMarker(marker: string): string {
	const m = /^(\d+)([.)])$/.exec(marker);
	return m ? `${Number(m[1]) + 1}${m[2]}` : marker;
}

/** Replaces `item` by `next` on the line, keeping the cursor at the same place in the body. */
function replaceItem(item: ListLine, next: ListLine, cursor: number): LineEdit {
	const offset = Math.max(cursor - contentStart(item), 0);
	return { text: join(next), line: 0, character: contentStart(next) + offset };
}

/**
 * Enter: continues the list item or blockquote, splitting the body at the cursor.
 * On an empty item a nested list item is outdented, and otherwise the innermost marker is removed.
 */
export function enterEdit(line: string, cursor: number, options: IndentOptions): LineEdit | null {
	const item = parseListLine(line);
	if (!item || cursor < contentStart(item)) {
		return null;
	}

	if (item.body.trim() === '') {
		if (item.marker && item.indent) {
			return replaceItem(item, { ...item, indent: outdentIndent(item.indent, options.tabSize), body: '' }, cursor);
		}
		const text = item.marker
			? item.quote
			: item.quote.replace(/>[ \t]?$/, '').replace(/^[ \t]+$/, ''); // removes the innermost `>`
		return { text, line: 0, character: text.length };
	}

	const prefix = item.quote + item.indent + nextMarker(item.marker) + item.space + (item.task ? '[ ] ' : '');
	const start = contentStart(item);
	const head = line.slice(0, start) + line.slice(start, cursor).trimEnd();
	const rest = line.slice(cursor).trimStart();
	return { text: `${head}\n${prefix}${rest}`, line: 1, character: prefix.length };
}

/** Tab: indents the whole list item by one level. A nested ordered item restarts from 1. */
export function indentEdit(line: string, cursor: number, options: IndentOptions): LineEdit | null {
	const item = parseListLine(line);
	if (!item?.marker || cursor <= markerStart(item)) {
		return null;
	}
	const marker = item.marker.replace(/^\d+/, '1');
	return replaceItem(item, { ...item, indent: item.indent + indentUnit(options), marker }, cursor);
}

/** Shift+Tab: outdents the whole list item by one level. */
export function outdentEdit(line: string, cursor: number, options: IndentOptions): LineEdit | null {
	const item = parseListLine(line);
	if (!item?.marker || !item.indent || cursor <= markerStart(item)) {
		return null;
	}
	return replaceItem(item, { ...item, indent: outdentIndent(item.indent, options.tabSize) }, cursor);
}

/** Returns true when line `lineNo` is inside a fenced code block (``` or ~~~), scanning from the top. */
export function isInFencedCodeBlock(lineAt: (line: number) => string, lineNo: number): boolean {
	let open: string | undefined;
	for (let i = 0; i < lineNo; i++) {
		const m = FENCE.exec(lineAt(i));
		if (!m) {
			continue;
		}
		const [, fence, rest] = m;
		if (open === undefined) {
			// The info string of a backtick fence cannot contain backticks.
			if (!(fence[0] === '`' && rest.includes('`'))) {
				open = fence;
			}
		} else if (fence[0] === open[0] && fence.length >= open.length && rest.trim() === '') {
			open = undefined;
		}
	}
	return open !== undefined;
}
