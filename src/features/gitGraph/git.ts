import { execFile } from 'child_process';

export type RefKind = 'local' | 'remote' | 'tag';

export interface GitRef {
	/** Short name such as `main`, `origin/main` or `v1.0`. */
	name: string;
	kind: RefKind;
	/** True for the checked-out local branch. */
	current: boolean;
}

export interface LogEntry {
	hash: string;
	parents: string[];
	author: string;
	/** Author date in seconds since the epoch. */
	time: number;
	subject: string;
	refs: GitRef[];
	/** True when HEAD is detached at this commit. */
	head: boolean;
}

export interface ChangedFile {
	/** A, M, D, R, C, T. */
	status: string;
	path: string;
	/** Path in the parent for renames and copies. */
	oldPath?: string;
}

const FIELD = '\x1f';
const RECORD = '\x1e';
export const LOG_FORMAT = ['%H', '%P', '%an', '%at', '%D', '%s'].join(FIELD) + RECORD;

export class GitError extends Error {}

export function git(cwd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			'git',
			args,
			{
				cwd,
				maxBuffer: 64 * 1024 * 1024,
				// GIT_EDITOR=true keeps merges and rebases from waiting for an editor nobody can see.
				env: { ...process.env, GIT_EDITOR: 'true', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
			},
			(err, stdout, stderr) => {
				if (!err) {
					resolve(stdout);
					return;
				}
				const message = `${stderr}${stdout}`.trim() || err.message;
				reject(new GitError((err as NodeJS.ErrnoException).code === 'ENOENT' ? 'git not found' : message));
			},
		);
	});
}

/** Parses the `%D` decoration of `git log --decorate=full`, e.g. `HEAD -> refs/heads/main, tag: refs/tags/v1`. */
export function parseDecoration(decoration: string): { refs: GitRef[]; head: boolean } {
	const refs: GitRef[] = [];
	let head = false;
	for (const raw of decoration.split(', ')) {
		let item = raw.trim();
		if (!item) {
			continue;
		}
		let current = false;
		if (item === 'HEAD') {
			head = true;
			continue;
		}
		if (item.startsWith('HEAD -> ')) {
			current = true;
			item = item.slice('HEAD -> '.length);
		}
		if (item.startsWith('tag: refs/tags/')) {
			refs.push({ name: item.slice('tag: refs/tags/'.length), kind: 'tag', current: false });
		} else if (item.startsWith('refs/heads/')) {
			refs.push({ name: item.slice('refs/heads/'.length), kind: 'local', current });
		} else if (item.startsWith('refs/remotes/')) {
			const name = item.slice('refs/remotes/'.length);
			// `origin/HEAD` is a pointer, not a branch.
			if (!name.endsWith('/HEAD')) {
				refs.push({ name, kind: 'remote', current: false });
			}
		}
	}
	return { refs, head };
}

export function parseLog(output: string): LogEntry[] {
	const entries: LogEntry[] = [];
	for (const record of output.split(RECORD)) {
		const text = record.replace(/^\n/, '');
		if (!text) {
			continue;
		}
		const [hash, parents, author, time, decoration, ...subject] = text.split(FIELD);
		const { refs, head } = parseDecoration(decoration ?? '');
		entries.push({
			hash,
			parents: parents ? parents.split(' ') : [],
			author: author ?? '',
			time: Number(time) || 0,
			subject: subject.join(FIELD),
			refs,
			head,
		});
	}
	return entries;
}

/** Parses `git diff-tree -r --name-status -M -z` output. */
export function parseNameStatus(output: string): ChangedFile[] {
	const parts = output.split('\0');
	const files: ChangedFile[] = [];
	for (let i = 0; i < parts.length; i++) {
		const status = parts[i];
		if (!status) {
			continue;
		}
		if (status[0] === 'R' || status[0] === 'C') {
			files.push({ status: status[0], oldPath: parts[i + 1], path: parts[i + 2] });
			i += 2;
		} else {
			files.push({ status: status[0], path: parts[i + 1] });
			i += 1;
		}
	}
	return files;
}

export async function findRepoRoot(cwd: string): Promise<string | undefined> {
	try {
		return (await git(cwd, ['rev-parse', '--show-toplevel'])).trim();
	} catch {
		return undefined;
	}
}

export async function readLog(repo: string, maxCount: number): Promise<LogEntry[]> {
	try {
		const output = await git(repo, [
			'log',
			'--exclude=refs/stash',
			'--all',
			'--date-order',
			'--decorate=full',
			`--max-count=${maxCount}`,
			`--format=${LOG_FORMAT}`,
		]);
		return parseLog(output);
	} catch (err) {
		// A repository without commits has nothing to show.
		if (
			err instanceof GitError &&
			/does not have any commits|bad default revision|unknown revision/.test(err.message)
		) {
			return [];
		}
		throw err;
	}
}

/** Files a commit changed relative to its first parent (all files for a root commit). */
export async function readChangedFiles(repo: string, hash: string, parent: string | undefined): Promise<ChangedFile[]> {
	const range = parent ? [parent, hash] : ['--root', hash];
	const output = await git(repo, ['diff-tree', '-r', '-M', '--no-commit-id', '--name-status', '-z', ...range]);
	return parseNameStatus(output);
}

/** Reads a file at a revision; resolves with an empty string when `ref` is empty (the side that does not exist). */
export async function readFileAt(repo: string, ref: string, filePath: string): Promise<string> {
	if (!ref) {
		return '';
	}
	return git(repo, ['show', `${ref}:${filePath}`]);
}

export async function isValidBranchName(repo: string, name: string): Promise<boolean> {
	try {
		await git(repo, ['check-ref-format', '--branch', name]);
		return true;
	} catch {
		return false;
	}
}
