import * as vscode from 'vscode';
import { activeTabUri } from '../util/editor';
import { ToggleableFeature } from '../util/feature';
import { formatExactBytes, formatFileSize } from '../util/format';

const SECTION = 'vsc-smith.fileSize';

export function registerFileSize(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		new ToggleableFeature(SECTION, () => {
			const config = vscode.workspace.getConfiguration(SECTION);
			const parts: vscode.Disposable[] = [];
			if (config.get<boolean>('statusBar', true)) {
				const alignment =
					config.get<string>('statusBarAlignment', 'left') === 'left'
						? vscode.StatusBarAlignment.Left
						: vscode.StatusBarAlignment.Right;
				parts.push(new FileSizeStatusBar(alignment));
			}
			if (config.get<boolean>('explorerTooltip', true)) {
				parts.push(new FileSizeDecorationProvider());
			}
			return vscode.Disposable.from(...parts);
		}),
	);
}

/** Returns true when a file system provider is registered for the uri's scheme (excludes untitled:, output:, etc.). */
function hasFileSystem(uri: vscode.Uri): boolean {
	return vscode.workspace.fs.isWritableFileSystem(uri.scheme) !== undefined;
}

export async function statFile(uri: vscode.Uri): Promise<vscode.FileStat | undefined> {
	if (!hasFileSystem(uri)) {
		return undefined;
	}
	try {
		const stat = await vscode.workspace.fs.stat(uri);
		return stat.type & vscode.FileType.File ? stat : undefined;
	} catch {
		return undefined;
	}
}

export class FileSizeStatusBar implements vscode.Disposable {
	readonly item: vscode.StatusBarItem;
	private readonly disposables: vscode.Disposable[] = [];
	private watcher: vscode.FileSystemWatcher | undefined;
	private currentUri: vscode.Uri | undefined;
	private updateSeq = 0;

	constructor(alignment: vscode.StatusBarAlignment) {
		this.item = vscode.window.createStatusBarItem('vsc-smith.fileSize', alignment, 100);
		this.item.name = 'File Size';
		this.disposables.push(
			this.item,
			vscode.window.tabGroups.onDidChangeTabGroups(() => this.update()),
			vscode.window.tabGroups.onDidChangeTabs(() => this.update()),
			vscode.workspace.onDidSaveTextDocument(doc => {
				if (doc.uri.toString() === this.currentUri?.toString()) {
					this.update();
				}
			}),
		);
		this.update();
	}

	async update(): Promise<void> {
		const uri = activeTabUri();
		if (uri?.toString() !== this.currentUri?.toString()) {
			this.currentUri = uri;
			this.watchFile(uri);
		}

		const seq = ++this.updateSeq;
		const stat = uri ? await statFile(uri) : undefined;
		if (seq !== this.updateSeq) {
			return; // a newer update has started
		}
		if (!stat) {
			this.item.hide();
			return;
		}
		this.item.text = `$(file) ${formatFileSize(stat.size)}`;
		this.item.tooltip = formatExactBytes(stat.size);
		this.item.show();
	}

	/** Watches the active file so that changes made outside the editor are reflected. */
	private watchFile(uri: vscode.Uri | undefined): void {
		this.watcher?.dispose();
		this.watcher = undefined;
		if (uri?.scheme !== 'file') {
			return;
		}
		const dir = vscode.Uri.joinPath(uri, '..');
		const name = uri.path.substring(uri.path.lastIndexOf('/') + 1);
		this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(dir, name));
		this.watcher.onDidChange(() => this.update());
		this.watcher.onDidCreate(() => this.update());
		this.watcher.onDidDelete(() => this.update());
	}

	dispose(): void {
		this.watcher?.dispose();
		this.disposables.forEach(d => d.dispose());
	}
}

/** Adds the file size to the hover tooltip of files in the explorer (and editor tabs). */
export class FileSizeDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
	private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
	private readonly disposables: vscode.Disposable[] = [];
	readonly onDidChangeFileDecorations = this.emitter.event;

	constructor() {
		const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, true);
		this.disposables.push(
			this.emitter,
			watcher,
			watcher.onDidChange(uri => this.emitter.fire(uri)),
			watcher.onDidCreate(uri => this.emitter.fire(uri)),
			vscode.window.registerFileDecorationProvider(this),
		);
	}

	async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> {
		const stat = await statFile(uri);
		if (!stat) {
			return undefined;
		}
		return new vscode.FileDecoration(undefined, `Size: ${formatFileSize(stat.size)}`);
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
