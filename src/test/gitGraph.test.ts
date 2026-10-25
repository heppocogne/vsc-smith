import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
	git,
	setGitPath,
	parseDecoration,
	parseLog,
	parseNameStatus,
	readChangedFiles,
	readLog,
} from '../features/gitGraph/git';
import { layoutGraph } from '../features/gitGraph/graph';
import { makeTempDir, removeTempDir } from './helpers';

suite('gitGraph', () => {
	test('setGitPath selects the executable', async () => {
		try {
			setGitPath('/nonexistent/git');
			await assert.rejects(git(process.cwd(), ['--version']), /git not found: \/nonexistent\/git/);
		} finally {
			setGitPath(undefined);
		}
		assert.match(await git(process.cwd(), ['--version']), /^git version/);
	});

	suite('parseDecoration', () => {
		test('current branch, other refs and tags', () => {
			assert.deepStrictEqual(
				parseDecoration(
					'HEAD -> refs/heads/main, tag: refs/tags/v1, refs/remotes/origin/main, refs/remotes/origin/HEAD',
				),
				{
					head: false,
					refs: [
						{ name: 'main', kind: 'local', current: true },
						{ name: 'v1', kind: 'tag', current: false },
						{ name: 'origin/main', kind: 'remote', current: false },
					],
				},
			);
		});

		test('detached HEAD and empty', () => {
			assert.deepStrictEqual(parseDecoration('HEAD, refs/heads/x'), {
				head: true,
				refs: [{ name: 'x', kind: 'local', current: false }],
			});
			assert.deepStrictEqual(parseDecoration(''), { head: false, refs: [] });
		});
	});

	test('parseLog', () => {
		const out =
			'aaa\x1fbbb ccc\x1fAlice\x1f100\x1fHEAD -> refs/heads/main\x1fMerge\x1fFirst\n\nSecond\n\x1e\n' +
			'bbb\x1f\x1fBob\x1f50\x1f\x1fRoot\x1f\x1e\n';
		const entries = parseLog(out);
		assert.strictEqual(entries.length, 2);
		assert.deepStrictEqual(entries[0].parents, ['bbb', 'ccc']);
		assert.strictEqual(entries[0].subject, 'Merge');
		assert.strictEqual(entries[0].body, 'First\n\nSecond');
		assert.strictEqual(entries[1].body, '');
		assert.strictEqual(entries[0].refs[0].current, true);
		assert.deepStrictEqual(entries[1].parents, []);
		assert.strictEqual(entries[1].time, 50);
	});

	test('parseNameStatus', () => {
		assert.deepStrictEqual(parseNameStatus('M\0a.txt\0R100\0old.txt\0new.txt\0D\0gone.txt\0'), [
			{ status: 'M', path: 'a.txt' },
			{ status: 'R', oldPath: 'old.txt', path: 'new.txt' },
			{ status: 'D', path: 'gone.txt' },
		]);
	});

	suite('layoutGraph', () => {
		test('linear history stays on one lane', () => {
			const layout = layoutGraph([
				{ hash: 'c', parents: ['b'] },
				{ hash: 'b', parents: ['a'] },
				{ hash: 'a', parents: [] },
			]);
			assert.strictEqual(layout.laneCount, 1);
			assert.deepStrictEqual(
				layout.rows.map(r => r.lane),
				[0, 0, 0],
			);
		});

		test('branch and merge', () => {
			// m merges x into main; both come from a.
			const layout = layoutGraph([
				{ hash: 'm', parents: ['b', 'x'] },
				{ hash: 'x', parents: ['a'] },
				{ hash: 'b', parents: ['a'] },
				{ hash: 'a', parents: [] },
			]);
			assert.deepStrictEqual(
				layout.rows.map(r => r.lane),
				[0, 1, 0, 1],
			);
			assert.strictEqual(layout.laneCount, 2);
			// m forks to lane 0 (b) and lane 1 (x).
			assert.deepStrictEqual(
				layout.rows[0].segments.map(s => [s.from, s.to]),
				[
					[0, 0],
					[0, 1],
				],
			);
			// b joins the lane that x already waits on, so a ends up on that lane.
			assert.deepStrictEqual(
				layout.rows[2].segments.map(s => [s.from, s.fromY, s.to, s.toY]),
				[
					[0, 0, 0, 0.5],
					[1, 0, 1, 1],
					[0, 0.5, 1, 1],
				],
			);
		});

		test('a parent outside the log still gets a line', () => {
			const layout = layoutGraph([{ hash: 'b', parents: ['a'] }]);
			assert.strictEqual(layout.rows[0].segments.length, 1);
			assert.strictEqual(layout.rows[0].segments[0].toY, 1);
		});

		test('the current branch keeps one color even when another branch tip comes first in the log', () => {
			// f (feature tip, based on m2) is listed before main's own tip m3.
			const layout = layoutGraph([
				{ hash: 'f', parents: ['m2'] },
				{ hash: 'm3', parents: ['m2'], refs: [{ kind: 'local', current: true }] },
				{ hash: 'm2', parents: ['m1'] },
				{ hash: 'm1', parents: [] },
			]);
			const colors = layout.rows.slice(1).map(r => r.color);
			assert.strictEqual(new Set(colors).size, 1);
			assert.notStrictEqual(layout.rows[0].color, colors[0]);
		});

		test('independent roots', () => {
			const layout = layoutGraph([
				{ hash: 'a', parents: [] },
				{ hash: 'b', parents: [] },
			]);
			assert.strictEqual(layout.laneCount, 1);
		});
	});

	suite('against a real repository', () => {
		let dir: string;
		const run = (...args: string[]) => git(dir, args);

		suiteSetup(async () => {
			dir = await makeTempDir();
			execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
			await run('config', 'user.email', 't@example.com');
			await run('config', 'user.name', 'T');
			await run('config', 'commit.gpgsign', 'false');
			await fs.writeFile(path.join(dir, 'a.txt'), '1\n');
			await run('add', '.');
			await run('commit', '-q', '-m', 'first');
			await run('checkout', '-q', '-b', 'feature');
			await fs.writeFile(path.join(dir, 'b.txt'), 'b\n');
			await run('add', '.');
			await run('commit', '-q', '-m', 'on feature');
			await run('checkout', '-q', 'main');
			await fs.writeFile(path.join(dir, 'a.txt'), '2\n');
			await run('commit', '-q', '-am', 'on main');
			await run('merge', '-q', '--no-edit', 'feature');
		});

		suiteTeardown(() => removeTempDir(dir));

		test('log, merge diff and root diff', async () => {
			const log = await readLog(dir, 50);
			assert.deepStrictEqual(log.map(c => c.subject).slice(0, 1), ["Merge branch 'feature'"]);
			assert.strictEqual(log.length, 4);
			assert.ok(log[0].refs.some(r => r.name === 'main' && r.current));
			assert.ok(log.some(c => c.refs.some(r => r.name === 'feature')));
			const layout = layoutGraph(log);
			assert.strictEqual(layout.rows.length, 4);

			// The merge compared with its first parent contains what feature brought in.
			assert.deepStrictEqual(await readChangedFiles(dir, log[0].hash, log[0].parents[0]), [
				{ status: 'A', path: 'b.txt' },
			]);
			const root = log[log.length - 1];
			assert.deepStrictEqual(await readChangedFiles(dir, root.hash, undefined), [{ status: 'A', path: 'a.txt' }]);
		});

		test('ignores commits reachable only from non-branch refs such as refs/jj/keep', async () => {
			const tree = (await run('rev-parse', 'HEAD^{tree}')).trim();
			const orphan = (await run('commit-tree', tree, '-m', 'jj orphan')).trim();
			await run('update-ref', 'refs/jj/keep/orphan', orphan);
			const log = await readLog(dir, 50);
			assert.ok(!log.some(c => c.hash === orphan));
			assert.strictEqual(log.length, 4);
		});
	});
});
