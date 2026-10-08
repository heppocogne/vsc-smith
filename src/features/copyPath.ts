import * as os from 'os';
import * as vscode from 'vscode';
import { activeTabUri } from '../util/editor';
import { ToggleableFeature } from '../util/feature';

const SECTION = 'vsc-smith.copyPath';

export type Separator = '/' | '\\';

/**
 * Rewrites the path separators of `p` to `sep`.
 * Converting to `/` only touches `\` on Windows, because elsewhere `\` is a valid file name character.
 */
export function convertSeparators(p: string, sep: Separator, platform: NodeJS.Platform = process.platform): string {
	if (sep === '/') {
		return platform === 'win32' ? p.replace(/\\/g, '/') : p;
	}
	return p.replace(/\//g, '\\');
}

/**
 * Resolves the resources a copy command acts on, in the same way as the built-in "Copy Path":
 * the explorer passes the clicked resource and the whole selection, the command palette passes nothing.
 */
export function targetUris(uri: unknown, uris: unknown): vscode.Uri[] {
	if (uri instanceof vscode.Uri) {
		if (Array.isArray(uris) && uris.some(u => u instanceof vscode.Uri && u.toString() === uri.toString())) {
			return uris.filter((u): u is vscode.Uri => u instanceof vscode.Uri);
		}
		return [uri];
	}
	const active = activeTabUri();
	return active ? [active] : [];
}

/** Returns the text the copy command puts on the clipboard, or `undefined` when there is nothing to copy. */
export function relativePathsText(uris: vscode.Uri[], sep: Separator): string | undefined {
	if (uris.length === 0) {
		return undefined;
	}
	// asRelativePath falls back to the full path for resources outside the workspace, like the built-in command.
	return uris.map(uri => convertSeparators(vscode.workspace.asRelativePath(uri), sep)).join(os.EOL);
}

export const COMMANDS: { id: string; sep: Separator }[] = [
	{ id: 'vsc-smith.copyRelativePath.slash', sep: '/' },
	{ id: 'vsc-smith.copyRelativePath.backslash', sep: '\\' },
];

// Which of the two commands is shown depends on `explorer.copyRelativePathSeparator` and is decided by the `when`
// clauses in package.json, which also hide both while the feature is disabled.
export function registerCopyPath(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		new ToggleableFeature(SECTION, () =>
			vscode.Disposable.from(
				...COMMANDS.map(({ id, sep }) =>
					vscode.commands.registerCommand(id, async (uri?: unknown, uris?: unknown) => {
						const text = relativePathsText(targetUris(uri, uris), sep);
						if (text !== undefined) {
							await vscode.env.clipboard.writeText(text);
						}
					}),
				),
			),
		),
	);
}
