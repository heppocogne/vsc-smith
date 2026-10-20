import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ToggleableFeature } from '../../util/feature';
import {
	ChangedFile,
	findRepoRoot,
	git,
	isValidBranchName,
	LogEntry,
	readChangedFiles,
	readFileAt,
	readLog,
	setGitPath,
} from './git';
import { layoutGraph } from './graph';

const SECTION = 'vsc-smith.gitGraph';
const VIEW_ID = 'vsc-smith.gitGraph';
const ACTIVE_KEY = 'vsc-smith.gitGraph.active';
const CONTENT_SCHEME = 'vsc-smith-git';
const PAGE_SIZE = 300;
/** Extensions that already draw a commit graph: Git Graph and GitLens. */
const OTHER_EXTENSIONS = ['mhutchie.git-graph', 'eamodio.gitlens'];

/** What a command receives from a right click in the webview (`data-vscode-context`). */
interface CommitTarget {
	hash?: string;
}
interface BranchTarget extends CommitTarget {
	branch?: string;
	branchKind?: 'local' | 'remote';
	isCurrent?: boolean;
}

/** Whether to show the graph: enabled, and no other extension with a commit graph to yield to. */
function isActive(): boolean {
	const config = vscode.workspace.getConfiguration(SECTION);
	if (!config.get<boolean>('enabled', true)) {
		return false;
	}
	// `getExtension` does not return disabled extensions.
	return (
		!config.get<boolean>('yieldToOtherExtensions', true) ||
		!OTHER_EXTENSIONS.some(id => vscode.extensions.getExtension(id))
	);
}

function updateActiveKey(): void {
	void vscode.commands.executeCommand('setContext', ACTIVE_KEY, isActive());
}

interface GitExtensionExports {
	getAPI(version: 1): { git: { path: string } };
}

/**
 * Points the git helpers at the git VS Code uses: the one the built-in Git extension found or `git.path` named,
 * then the `git.path` setting itself (the extension may be disabled), then `git` on PATH.
 */
async function useConfiguredGit(): Promise<void> {
	try {
		const extension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
		if (extension) {
			const exports = extension.isActive ? extension.exports : await extension.activate();
			const found = exports.getAPI(1).git.path;
			if (found) {
				setGitPath(found);
				return;
			}
		}
	} catch {
		// The Git extension is disabled or its API is unavailable: fall through to the setting.
	}
	const configured = vscode.workspace.getConfiguration('git').get<string | string[]>('path');
	setGitPath((Array.isArray(configured) ? configured[0] : configured)?.trim());
}

/** Serves `git show <ref>:<path>` as a document, for the two sides of a commit diff. */
class GitContentProvider implements vscode.TextDocumentContentProvider {
	static uri(repo: string, ref: string, filePath: string): vscode.Uri {
		return vscode.Uri.from({
			scheme: CONTENT_SCHEME,
			path: '/' + filePath,
			query: JSON.stringify({ repo, ref }),
		});
	}

	async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		const { repo, ref } = JSON.parse(uri.query) as { repo: string; ref: string };
		return readFileAt(repo, ref, uri.path.slice(1));
	}
}

export function shortHash(hash: string): string {
	return hash.slice(0, 7);
}

function describeFile(file: ChangedFile): string {
	return file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
}

class GitGraphView implements vscode.WebviewViewProvider, vscode.Disposable {
	private view: vscode.WebviewView | undefined;
	private repo: string | undefined;
	private maxCount = PAGE_SIZE;
	private commits: LogEntry[] = [];
	private refreshTimer: NodeJS.Timeout | undefined;
	private watcher: vscode.Disposable | undefined;
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly extensionUri: vscode.Uri) {
		this.disposables.push(
			vscode.workspace.registerTextDocumentContentProvider(CONTENT_SCHEME, new GitContentProvider()),
			vscode.window.registerWebviewViewProvider(VIEW_ID, this),
			vscode.workspace.onDidChangeWorkspaceFolders(() => {
				this.repo = undefined;
				this.scheduleRefresh();
			}),
			vscode.commands.registerCommand('vsc-smith.gitGraph.show', () =>
				vscode.commands.executeCommand(`${VIEW_ID}.focus`),
			),
			vscode.commands.registerCommand('vsc-smith.gitGraph.refresh', () => this.refresh()),
			vscode.commands.registerCommand('vsc-smith.gitGraph.openDiff', (target?: CommitTarget) =>
				this.run(() => this.openDiff(target?.hash)),
			),
			vscode.commands.registerCommand('vsc-smith.gitGraph.createBranch', (target?: CommitTarget) =>
				this.run(() => this.createBranch(target?.hash)),
			),
			vscode.commands.registerCommand('vsc-smith.gitGraph.renameBranch', (target?: BranchTarget) =>
				this.run(() => this.renameBranch(target)),
			),
			vscode.commands.registerCommand('vsc-smith.gitGraph.deleteBranch', (target?: BranchTarget) =>
				this.run(() => this.deleteBranch(target)),
			),
			vscode.commands.registerCommand('vsc-smith.gitGraph.mergeBranch', (target?: BranchTarget) =>
				this.run(() => this.mergeBranch(target)),
			),
			vscode.commands.registerCommand('vsc-smith.gitGraph.rebaseBranch', (target?: BranchTarget) =>
				this.run(() => this.rebaseBranch(target)),
			),
		);
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		const media = vscode.Uri.joinPath(this.extensionUri, 'media');
		view.webview.options = { enableScripts: true, localResourceRoots: [media] };
		view.webview.html = this.html(view.webview, media);
		view.webview.onDidReceiveMessage((message: { type: string; hash?: string }) => {
			switch (message.type) {
				case 'ready':
					void this.refresh();
					break;
				case 'loadMore':
					this.maxCount += PAGE_SIZE;
					void this.refresh();
					break;
				case 'openDiff':
					void this.run(() => this.openDiff(message.hash));
					break;
			}
		});
		view.onDidChangeVisibility(() => {
			if (view.visible) {
				void this.refresh();
			}
		});
		view.onDidDispose(() => {
			this.view = undefined;
			this.watcher?.dispose();
			this.watcher = undefined;
		});
	}

	private html(webview: vscode.Webview, media: vscode.Uri): string {
		const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
		const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'gitGraph.css'));
		const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'gitGraph.js'));
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}">
</head>
<body>
<div id="message"></div>
<div id="list"></div>
<button id="more" hidden>Load more</button>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
	}

	private scheduleRefresh(): void {
		clearTimeout(this.refreshTimer);
		this.refreshTimer = setTimeout(() => void this.refresh(), 300);
	}

	/** The first workspace folder that is inside a git repository. */
	private async findRepo(): Promise<string | undefined> {
		for (const folder of vscode.workspace.workspaceFolders ?? []) {
			if (folder.uri.scheme !== 'file') {
				continue;
			}
			const root = await findRepoRoot(folder.uri.fsPath);
			if (root) {
				return root;
			}
		}
		return undefined;
	}

	private watch(repo: string): void {
		this.watcher?.dispose();
		const gitDir = path.join(repo, '.git');
		if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
			return;
		}
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(vscode.Uri.file(gitDir), '{HEAD,packed-refs,refs/**}'),
		);
		const onChange = () => this.scheduleRefresh();
		this.watcher = vscode.Disposable.from(
			watcher,
			watcher.onDidChange(onChange),
			watcher.onDidCreate(onChange),
			watcher.onDidDelete(onChange),
		);
	}

	async refresh(): Promise<void> {
		const view = this.view;
		if (!view) {
			return;
		}
		await useConfiguredGit();
		const post = (data: object) => void view.webview.postMessage({ type: 'data', ...data });
		const empty = { commits: [], layout: { rows: [], laneCount: 0 }, hasMore: false };
		try {
			if (!this.repo) {
				this.repo = await this.findRepo();
				if (this.repo) {
					this.watch(this.repo);
				}
			}
			if (!this.repo) {
				post({ ...empty, message: 'No git repository in the workspace.' });
				return;
			}
			this.commits = await readLog(this.repo, this.maxCount);
			post({
				commits: this.commits,
				layout: layoutGraph(this.commits),
				hasMore: this.commits.length >= this.maxCount,
				message: this.commits.length === 0 ? 'No commits yet.' : '',
			});
		} catch (err) {
			post({ ...empty, message: err instanceof Error ? err.message : String(err) });
		}
	}

	/** Runs a command, reporting a failure as an error message, then refreshes the graph. */
	private async run(action: () => Promise<void>): Promise<void> {
		try {
			await useConfiguredGit();
			await action();
		} catch (err) {
			void vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
		}
		await this.refresh();
	}

	private requireRepo(): string {
		if (!this.repo) {
			throw new Error('No git repository in the workspace.');
		}
		return this.repo;
	}

	private async openDiff(hash: string | undefined): Promise<void> {
		if (!hash) {
			return;
		}
		const repo = this.requireRepo();
		const parent = this.commits.find(c => c.hash === hash)?.parents[0];
		const files = await readChangedFiles(repo, hash, parent);
		if (files.length === 0) {
			void vscode.window.showInformationMessage(`${shortHash(hash)} has no file changes.`);
			return;
		}
		const picked = await vscode.window.showQuickPick(
			files.map(file => ({ label: `${file.status}  ${describeFile(file)}`, file })),
			{ title: `Changes in ${shortHash(hash)}`, placeHolder: 'Select a file to compare with its parent' },
		);
		if (!picked) {
			return;
		}
		const { file } = picked;
		const added = file.status === 'A';
		const deleted = file.status === 'D';
		const left = GitContentProvider.uri(repo, added || !parent ? '' : parent, file.oldPath ?? file.path);
		const right = GitContentProvider.uri(repo, deleted ? '' : hash, file.path);
		await vscode.commands.executeCommand(
			'vscode.diff',
			left,
			right,
			`${path.basename(file.path)} (${parent ? shortHash(parent) : 'empty'} ↔ ${shortHash(hash)})`,
		);
	}

	private async createBranch(hash: string | undefined): Promise<void> {
		if (!hash) {
			return;
		}
		const repo = this.requireRepo();
		const name = await vscode.window.showInputBox({
			title: `Create branch at ${shortHash(hash)}`,
			prompt: 'Branch name',
			validateInput: value => (value.trim() ? undefined : 'Enter a branch name'),
		});
		if (!name) {
			return;
		}
		const trimmed = name.trim();
		if (!(await isValidBranchName(repo, trimmed))) {
			throw new Error(`"${trimmed}" is not a valid branch name.`);
		}
		await git(repo, ['branch', trimmed, hash]);
		const checkout = 'Checkout';
		const answer = await vscode.window.showInformationMessage(`Created branch ${trimmed}.`, checkout);
		if (answer === checkout) {
			await git(repo, ['checkout', trimmed]);
		}
	}

	private async renameBranch(target: BranchTarget | undefined): Promise<void> {
		if (!target?.branch || target.branchKind !== 'local') {
			return;
		}
		const repo = this.requireRepo();
		const name = await vscode.window.showInputBox({
			title: `Rename branch ${target.branch}`,
			prompt: 'New branch name',
			value: target.branch,
			validateInput: value => (value.trim() ? undefined : 'Enter a branch name'),
		});
		const trimmed = name?.trim();
		if (!trimmed || trimmed === target.branch) {
			return;
		}
		if (!(await isValidBranchName(repo, trimmed))) {
			throw new Error(`"${trimmed}" is not a valid branch name.`);
		}
		await git(repo, ['branch', '-m', target.branch, trimmed]);
	}

	private async deleteBranch(target: BranchTarget | undefined): Promise<void> {
		if (!target?.branch || target.branchKind !== 'local') {
			return;
		}
		const repo = this.requireRepo();
		const del = 'Delete';
		const answer = await vscode.window.showWarningMessage(`Delete branch ${target.branch}?`, { modal: true }, del);
		if (answer !== del) {
			return;
		}
		try {
			await git(repo, ['branch', '-d', target.branch]);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (!/not fully merged/.test(message)) {
				throw err;
			}
			const force = 'Force Delete';
			const forced = await vscode.window.showWarningMessage(
				`${target.branch} has commits that are not merged. Delete it anyway?`,
				{ modal: true },
				force,
			);
			if (forced === force) {
				await git(repo, ['branch', '-D', target.branch]);
			}
		}
	}

	private async mergeBranch(target: BranchTarget | undefined): Promise<void> {
		if (!target?.branch) {
			return;
		}
		const repo = this.requireRepo();
		const current = await this.currentBranch(repo);
		const merge = 'Merge';
		const answer = await vscode.window.showWarningMessage(
			`Merge ${target.branch} into ${current}?`,
			{ modal: true },
			merge,
		);
		if (answer !== merge) {
			return;
		}
		await this.runIntegration(repo, ['merge', '--no-edit', target.branch], 'merge');
	}

	private async rebaseBranch(target: BranchTarget | undefined): Promise<void> {
		if (!target?.branch) {
			return;
		}
		const repo = this.requireRepo();
		const current = await this.currentBranch(repo);
		const rebase = 'Rebase';
		const answer = await vscode.window.showWarningMessage(
			`Rebase ${current} onto ${target.branch}? This rewrites the commits of ${current}.`,
			{ modal: true },
			rebase,
		);
		if (answer !== rebase) {
			return;
		}
		await this.runIntegration(repo, ['rebase', target.branch], 'rebase');
	}

	private async currentBranch(repo: string): Promise<string> {
		const name = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
		if (name === 'HEAD') {
			throw new Error('HEAD is detached. Check out a branch first.');
		}
		return name;
	}

	/** Runs a merge or rebase; on a conflict, tells the user where to resolve it. */
	private async runIntegration(repo: string, args: string[], name: string): Promise<void> {
		try {
			await git(repo, args);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (/conflict/i.test(message)) {
				void vscode.window.showWarningMessage(
					`The ${name} stopped because of conflicts. Resolve them in Source Control, then continue or abort with git ${name}.`,
				);
				return;
			}
			throw err;
		}
	}

	dispose(): void {
		clearTimeout(this.refreshTimer);
		this.watcher?.dispose();
		vscode.Disposable.from(...this.disposables).dispose();
	}
}

export function registerGitGraph(context: vscode.ExtensionContext): void {
	updateActiveKey();
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SECTION)) {
				updateActiveKey();
			}
		}),
		vscode.extensions.onDidChange(updateActiveKey),
		new ToggleableFeature(SECTION, () => new GitGraphView(context.extensionUri)),
	);
}
