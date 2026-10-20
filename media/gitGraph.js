// @ts-check
/* global acquireVsCodeApi */
(function () {
	const vscode = acquireVsCodeApi();
	const ROW_HEIGHT = 24;
	const LANE_WIDTH = 16;
	const COLORS = ['#4e9fe5', '#e5894e', '#6cc06c', '#c26be0', '#e5c94e', '#e55e7e', '#4ec9b0', '#9a9a9a'];
	const SVG_NS = 'http://www.w3.org/2000/svg';

	const list = /** @type {HTMLElement} */ (document.getElementById('list'));
	const message = /** @type {HTMLElement} */ (document.getElementById('message'));
	const moreButton = /** @type {HTMLButtonElement} */ (document.getElementById('more'));

	moreButton.addEventListener('click', () => vscode.postMessage({ type: 'loadMore' }));
	list.addEventListener('mousedown', event => {
		const row = /** @type {HTMLElement} */ (event.target).closest('.row');
		if (row) {
			select(row);
		}
	});
	list.addEventListener('dblclick', event => {
		const row = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('.row'));
		if (row) {
			vscode.postMessage({ type: 'openDiff', hash: row.dataset.hash });
		}
	});

	/** @param {Element} row */
	function select(row) {
		for (const old of list.querySelectorAll('.selected')) {
			old.classList.remove('selected');
		}
		row.classList.add('selected');
	}

	/**
	 * @param {string} tag
	 * @param {Record<string, string | number>} attrs
	 */
	function svg(tag, attrs) {
		const element = document.createElementNS(SVG_NS, tag);
		for (const [key, value] of Object.entries(attrs)) {
			element.setAttribute(key, String(value));
		}
		return element;
	}

	const color = (/** @type {number} */ index) => COLORS[index % COLORS.length];
	const x = (/** @type {number} */ lane) => lane * LANE_WIDTH + LANE_WIDTH / 2;
	const y = (/** @type {number} */ fraction) => fraction * ROW_HEIGHT;

	function drawGraph(row, laneCount, head) {
		const width = Math.max(laneCount, 1) * LANE_WIDTH;
		const el = svg('svg', { width, height: ROW_HEIGHT, viewBox: `0 0 ${width} ${ROW_HEIGHT}` });
		for (const s of row.segments) {
			const x1 = x(s.from);
			const x2 = x(s.to);
			const y1 = y(s.fromY);
			const y2 = y(s.toY);
			const d =
				x1 === x2
					? `M${x1} ${y1} L${x2} ${y2}`
					: `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;
			el.appendChild(svg('path', { d, stroke: color(s.color), 'stroke-width': 2, fill: 'none' }));
		}
		el.appendChild(
			svg('circle', {
				cx: x(row.lane),
				cy: y(0.5),
				r: head ? 5 : 4,
				fill: head ? 'var(--vscode-editor-background)' : color(row.color),
				stroke: color(row.color),
				'stroke-width': 2,
			}),
		);
		return el;
	}

	/** @param {Record<string, unknown>} context */
	function setContext(element, context) {
		element.setAttribute('data-vscode-context', JSON.stringify({ preventDefaultContextMenuItems: true, ...context }));
	}

	function render(data) {
		const selected = list.querySelector('.selected');
		const selectedHash = selected ? /** @type {HTMLElement} */ (selected).dataset.hash : undefined;
		list.textContent = '';
		message.textContent = data.message || '';
		moreButton.hidden = !data.hasMore;
		const fragment = document.createDocumentFragment();
		data.commits.forEach((commit, index) => {
			const row = document.createElement('div');
			row.className = 'row' + (commit.hash === selectedHash ? ' selected' : '');
			row.dataset.hash = commit.hash;
			setContext(row, { webviewSection: 'commit', hash: commit.hash });
			row.title = `${commit.hash}\n${commit.author}\n${commit.subject}`;

			row.appendChild(drawGraph(data.layout.rows[index], data.layout.laneCount, commit.head));

			const summary = document.createElement('div');
			summary.className = 'summary';
			for (const ref of commit.refs) {
				const label = document.createElement('span');
				label.className = `ref ${ref.kind}` + (ref.current ? ' current' : '');
				label.textContent = ref.name;
				if (ref.kind !== 'tag') {
					setContext(label, {
						webviewSection: 'branch',
						hash: commit.hash,
						branch: ref.name,
						branchKind: ref.kind,
						isCurrent: ref.current,
					});
				}
				summary.appendChild(label);
			}
			const subject = document.createElement('span');
			subject.className = 'subject';
			subject.textContent = commit.subject;
			summary.appendChild(subject);
			row.appendChild(summary);

			const meta = document.createElement('div');
			meta.className = 'meta';
			for (const [name, text] of [
				['author', commit.author],
				['date', new Date(commit.time * 1000).toLocaleString()],
				['hash', commit.hash.slice(0, 7)],
			]) {
				const cell = document.createElement('span');
				cell.className = name;
				cell.textContent = text;
				meta.appendChild(cell);
			}
			row.appendChild(meta);
			fragment.appendChild(row);
		});
		list.appendChild(fragment);
	}

	window.addEventListener('message', event => {
		if (event.data.type === 'data') {
			render(event.data);
		}
	});
	vscode.postMessage({ type: 'ready' });
})();
