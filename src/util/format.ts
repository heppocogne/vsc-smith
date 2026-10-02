const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Formats a byte count as a human readable string using 1024-based units (e.g. "1.23 MB"). */
export function formatFileSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit++;
	}
	const digits = value < 10 ? 2 : value < 100 ? 1 : 0;
	return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

/** Formats an exact byte count with thousands separators (e.g. "1,234,567 bytes"). */
export function formatExactBytes(bytes: number): string {
	return `${bytes.toLocaleString('en-US')} bytes`;
}
