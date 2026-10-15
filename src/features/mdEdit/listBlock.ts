// Pure functions that move, duplicate and renumber list items. They work on the lines of the whole document and
// return the new lines, so that the command can replace only what changed.
import { ListLine, parseListLine } from '../markdown/listEdit';

const QUOTE_PREFIX = /^((?:[ \t]*>[ \t]?)*)([ \t]*)/;
const FENCE = /^(?:[ \t]*>)*[ \t]*(`{3,}|~{3,})/;
const ORDERED = /^(\d+)([.)])$/;

interface LineInfo {
	quote: string;
	/** Width of the indentation after the quote markers; a tab counts as `tabSize`. */
	width: number;
	blank: boolean;
	item: ListLine | undefined;
}

function info(line: string, tabSize: number): LineInfo {
	const m = QUOTE_PREFIX.exec(line) as RegExpExecArray;
	let width = 0;
	for (const c of m[2]) {
		width += c === '\t' ? tabSize : 1;
	}
	const item = parseListLine(line);
	return { quote: m[1], width, blank: line.slice(m[0].length).trim() === '', item: item?.marker ? item : undefined };
}

function joinItem(item: ListLine): string {
	return item.quote + item.indent + item.marker + item.space + item.task + item.body;
}

/** Returns the end (exclusive) of the list item starting at line `start`: its more indented lines are its children. */
function blockEnd(lines: string[], start: number, tabSize: number): number {
	const base = info(lines[start], tabSize);
	let end = start + 1;
	for (let i = start + 1; i < lines.length; i++) {
		const li = info(lines[i], tabSize);
		if (li.blank) {
			continue;
		}
		if (li.quote !== base.quote || li.width <= base.width) {
			break;
		}
		end = i + 1;
	}
	return end;
}

export interface MoveResult {
	lines: string[];
	/** The line and character the cursor had, after the move. */
	line: number;
	character: number;
}

/**
 * Moves the list item at `line` (with its children) above or below the neighbouring item of the same level. Returns
 * `null` when there is no such item, so that the caller can use the default behavior of the key. Ordered markers
 * stay in sequence: the two items swap their numbers.
 */
export function moveItem(
	lines: string[],
	line: number,
	character: number,
	direction: -1 | 1,
	tabSize: number,
): MoveResult | null {
	const base = info(lines[line], tabSize);
	if (!base.item) {
		return null;
	}
	const end = blockEnd(lines, line, tabSize);
	const sameLevel = (i: number) => {
		const li = info(lines[i], tabSize);
		return li.item !== undefined && li.quote === base.quote && li.width === base.width;
	};
	// The two items and the blank lines between them: `first`, `gap`, `second` in the order of the document.
	let first: [number, number];
	let second: [number, number];
	let gap: [number, number];
	if (direction === -1) {
		let i = line - 1;
		while (i >= 0) {
			const li = info(lines[i], tabSize);
			if (!li.blank && !(li.quote === base.quote && li.width > base.width)) {
				break;
			}
			i--;
		}
		if (i < 0 || !sameLevel(i)) {
			return null;
		}
		// The neighbour ends before the blank lines that separate it from the item.
		let gapStart = line;
		while (gapStart > i + 1 && info(lines[gapStart - 1], tabSize).blank) {
			gapStart--;
		}
		first = [i, gapStart];
		gap = [gapStart, line];
		second = [line, end];
	} else {
		let next = end;
		while (next < lines.length && info(lines[next], tabSize).blank) {
			next++;
		}
		if (next >= lines.length || !sameLevel(next)) {
			return null;
		}
		first = [line, end];
		gap = [end, next];
		second = [next, blockEnd(lines, next, tabSize)];
	}

	let upper = lines.slice(second[0], second[1]);
	let lower = lines.slice(first[0], first[1]);
	// The marker of the moved item (`first` when moving down, `second` when moving up).
	let shift = 0;
	const a = info(lower[0], tabSize).item;
	const b = info(upper[0], tabSize).item;
	if (a && b && ORDERED.test(a.marker) && ORDERED.test(b.marker)) {
		lower = [joinItem({ ...a, marker: b.marker }), ...lower.slice(1)];
		upper = [joinItem({ ...b, marker: a.marker }), ...upper.slice(1)];
		shift = direction === 1 ? b.marker.length - a.marker.length : a.marker.length - b.marker.length;
	}
	const result = [
		...lines.slice(0, first[0]),
		...upper,
		...lines.slice(gap[0], gap[1]),
		...lower,
		...lines.slice(second[1]),
	];
	const movedStart = direction === -1 ? first[0] : first[0] + upper.length + (gap[1] - gap[0]);
	const onFirstLine = character > 0 && line === (direction === -1 ? second[0] : first[0]);
	return {
		lines: result,
		line: movedStart + (line - (direction === -1 ? second[0] : first[0])),
		character: onFirstLine ? Math.max(character + shift, 0) : character,
	};
}

/**
 * Copies the list item at `line` (with its children) below itself. The numbers of an ordered list are renumbered.
 * Returns `null` when the line is not a list item.
 */
export function duplicateItem(lines: string[], line: number, character: number, tabSize: number): MoveResult | null {
	if (!info(lines[line], tabSize).item) {
		return null;
	}
	const end = blockEnd(lines, line, tabSize);
	let result = [...lines.slice(0, end), ...lines.slice(line, end), ...lines.slice(end)];
	const region = listRegion(result, line, tabSize);
	if (region) {
		result = renumberList(result, region[0], region[1], tabSize);
	}
	const newLine = end;
	return { lines: result, line: newLine, character: Math.min(character, result[newLine].length) };
}

/** Returns the lines [from, to) of the list that contains `line` (blank lines between items included), or null. */
export function listRegion(lines: string[], line: number, tabSize: number): [number, number] | null {
	const part = (i: number) => {
		const li = info(lines[i], tabSize);
		return !li.blank && (li.item !== undefined || li.width > 0);
	};
	const blank = (i: number) => info(lines[i], tabSize).blank;
	if (!part(line)) {
		return null;
	}
	let from = line;
	while (from > 0) {
		if (part(from - 1)) {
			from--;
		} else if (blank(from - 1) && from > 1 && part(from - 2)) {
			from -= 2;
		} else {
			break;
		}
	}
	let to = line + 1;
	while (to < lines.length) {
		if (part(to)) {
			to++;
		} else if (blank(to) && to + 1 < lines.length && part(to + 1)) {
			to += 2;
		} else {
			break;
		}
	}
	return [from, to];
}

/**
 * Renumbers the ordered items in lines [from, to): every list (one per level) keeps the number of its first item
 * and counts up from it. Fenced code is left as it is. Returns a new array of the same length.
 */
export function renumberList(lines: string[], from: number, to: number, tabSize: number): string[] {
	const result = [...lines];
	const stack: { width: number; next: number }[] = [];
	let fence: string | undefined;
	for (let i = from; i < to; i++) {
		const fenceMatch = FENCE.exec(lines[i]);
		if (fenceMatch) {
			if (fence === undefined) {
				fence = fenceMatch[1][0];
			} else if (fenceMatch[1][0] === fence) {
				fence = undefined;
			}
			continue;
		}
		const li = info(lines[i], tabSize);
		if (fence !== undefined || li.blank) {
			continue;
		}
		const top = () => stack[stack.length - 1];
		if (!li.item) {
			while (stack.length && top().width >= li.width) {
				stack.pop();
			}
			continue;
		}
		while (stack.length && top().width > li.width) {
			stack.pop();
		}
		const ordered = ORDERED.exec(li.item.marker);
		if (!ordered) {
			while (stack.length && top().width >= li.width) {
				stack.pop();
			}
		} else if (stack.length && top().width === li.width) {
			result[i] = joinItem({ ...li.item, marker: `${top().next++}${ordered[2]}` });
		} else {
			stack.push({ width: li.width, next: Number(ordered[1]) + 1 });
		}
	}
	return result;
}
