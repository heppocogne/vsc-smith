/**
 * Parses tab-separated text as copied from a spreadsheet. Cells containing line breaks, tabs or quotes are wrapped
 * in double quotes (with inner quotes doubled). Returns undefined unless the text has at least two rows and two columns.
 */
export function parseTsv(text: string): string[][] | undefined {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let i = 0;
	const n = text.length;
	while (i < n) {
		if (cell === '' && text[i] === '"') {
			// A quoted cell runs up to the closing quote that is not doubled.
			let j = i + 1;
			let value = '';
			for (; j < n; j++) {
				if (text[j] === '"') {
					if (text[j + 1] === '"') {
						value += '"';
						j++;
					} else {
						break;
					}
				} else {
					value += text[j];
				}
			}
			if (j < n && (j + 1 === n || text[j + 1] === '\t' || text[j + 1] === '\n' || text[j + 1] === '\r')) {
				cell = value;
				i = j + 1;
				continue;
			}
		}
		const c = text[i];
		if (c === '\t') {
			row.push(cell);
			cell = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') {
				i++;
			}
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else {
			cell += c;
		}
		i++;
	}
	if (cell !== '' || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}
	const columns = Math.max(0, ...rows.map(r => r.length));
	if (rows.length < 2 || columns < 2) {
		return undefined;
	}
	return rows.map(r => [...r, ...Array<string>(columns - r.length).fill('')]);
}

function escapeCell(cell: string): string {
	return cell
		.replace(/\\/g, '\\\\')
		.replace(/\|/g, '\\|')
		.replace(/\r\n|\r|\n/g, '<br>')
		.trim();
}

/** Converts rows (the first one being the header) to a GFM table, without a trailing line break. */
export function toMarkdownTable(rows: string[][]): string {
	const line = (cells: string[]) => `| ${cells.map(escapeCell).join(' | ')} |`;
	const separator = `| ${rows[0].map(() => '---').join(' | ')} |`;
	return [line(rows[0]), separator, ...rows.slice(1).map(line)].join('\n');
}

/** Returns the Markdown table for spreadsheet-like clipboard text, or undefined when it is not a table. */
export function tsvToMarkdownTable(text: string): string | undefined {
	if (!text.includes('\t')) {
		return undefined;
	}
	const rows = parseTsv(text);
	return rows && toMarkdownTable(rows);
}
