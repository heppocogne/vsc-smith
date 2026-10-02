import * as vscode from 'vscode';
import { formatExactBytes, formatFileSize } from '../util/format';

const SECTION = 'vsc-smith.binaryBlocker';
export const VIEW_TYPE = 'vsc-smith.binaryBlocker';
/** globalState key holding the `workbench.editorAssociations` patterns this extension added. */
const OWNED_ASSOCIATIONS_KEY = 'binaryBlocker.ownedAssociations';

/**
 * Files matching the configured extensions are routed to a placeholder custom editor through
 * `workbench.editorAssociations`. The placeholder never reads the file; the real editor is opened
 * only when the user presses "Open Anyway".
 */
export function registerBinaryBlocker(context: vscode.ExtensionContext): void {
	// The provider is always registered: associations may outlive a disabled feature until they are synced.
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(VIEW_TYPE, new BinaryBlockerProvider()),
	);

	let pending = Promise.resolve();
	const sync = () => {
		pending = pending
			.then(() => syncAssociations(context))
			.catch(err => {
				vscode.window.showErrorMessage(`vsc-smith: failed to update editor associations: ${err}`);
			});
	};
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(SECTION)) {
			sync();
		}
	}));
	sync();
}

export function toPattern(extension: string): string | undefined {
	const ext = extension.trim().replace(/^\*?\./, '');
	return ext ? `*.${ext}` : undefined;
}

/** Adds/removes our entries in the user's `workbench.editorAssociations`, never touching entries the user owns. */
async function syncAssociations(context: vscode.ExtensionContext): Promise<void> {
	const config = vscode.workspace.getConfiguration(SECTION);
	const desired = new Set<string>();
	if (config.get<boolean>('enabled', true)) {
		for (const ext of config.get<string[]>('extensions', [])) {
			const pattern = toPattern(ext);
			if (pattern) {
				desired.add(pattern);
			}
		}
	}

	const owned = new Set(context.globalState.get<string[]>(OWNED_ASSOCIATIONS_KEY, []));
	const workbench = vscode.workspace.getConfiguration('workbench');
	const associations = { ...workbench.inspect<Record<string, string>>('editorAssociations')?.globalValue };
	let changed = false;

	for (const pattern of owned) {
		if (!desired.has(pattern)) {
			if (associations[pattern] === VIEW_TYPE) {
				delete associations[pattern];
				changed = true;
			}
			owned.delete(pattern);
		}
	}
	for (const pattern of desired) {
		if (associations[pattern] === undefined) {
			associations[pattern] = VIEW_TYPE;
			owned.add(pattern);
			changed = true;
		} else if (associations[pattern] !== VIEW_TYPE) {
			owned.delete(pattern); // the user associated it with another editor; leave it alone
		}
	}

	if (changed) {
		await workbench.update('editorAssociations', associations, vscode.ConfigurationTarget.Global);
	}
	await context.globalState.update(OWNED_ASSOCIATIONS_KEY, [...owned]);
}

class BinaryBlockerProvider implements vscode.CustomReadonlyEditorProvider {
	openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
		return { uri, dispose: () => { } };
	}

	async resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): Promise<void> {
		const uri = document.uri;
		panel.webview.options = { enableScripts: true, localResourceRoots: [] };
		panel.webview.onDidReceiveMessage(async (message: { type?: string }) => {
			if (message.type === 'openAnyway') {
				await openAnyway(uri, panel);
			}
		});

		let size: number | undefined;
		try {
			size = (await vscode.workspace.fs.stat(uri)).size;
		} catch {
			size = undefined;
		}
		panel.webview.html = renderHtml(panel.webview, uri, size);
	}
}

export async function openAnyway(uri: vscode.Uri, panel: vscode.WebviewPanel): Promise<void> {
	const viewColumn = panel.viewColumn;
	await vscode.commands.executeCommand('vscode.openWith', uri, 'default', viewColumn);
	for (const group of vscode.window.tabGroups.all) {
		for (const tab of group.tabs) {
			if (tab.input instanceof vscode.TabInputCustom
				&& tab.input.viewType === VIEW_TYPE
				&& tab.input.uri.toString() === uri.toString()
				&& group.viewColumn === viewColumn) {
				await vscode.window.tabGroups.close(tab);
				return;
			}
		}
	}
}

function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

function renderHtml(webview: vscode.Webview, uri: vscode.Uri, size: number | undefined): string {
	const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
	const name = uri.path.substring(uri.path.lastIndexOf('/') + 1);
	const sizeText = size === undefined ? 'unknown' : `${formatFileSize(size)} (${formatExactBytes(size)})`;
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
	body {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		margin: 0;
		font-family: var(--vscode-font-family);
		color: var(--vscode-foreground);
		text-align: center;
	}
	p { margin: 4px 0; }
	.meta { color: var(--vscode-descriptionForeground); }
	button {
		margin-top: 16px;
		padding: 6px 14px;
		border: none;
		border-radius: 2px;
		color: var(--vscode-button-foreground);
		background: var(--vscode-button-background);
		cursor: pointer;
		font: inherit;
	}
	button:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
	<p>This file is assumed to be binary and was not loaded.</p>
	<p class="meta">${escapeHtml(name)} &mdash; ${escapeHtml(sizeText)}</p>
	<button id="open">Open Anyway</button>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		document.getElementById('open').addEventListener('click', () => vscode.postMessage({ type: 'openAnyway' }));
	</script>
</body>
</html>`;
}
