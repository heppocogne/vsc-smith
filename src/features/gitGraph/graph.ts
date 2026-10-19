export interface GraphCommit {
	hash: string;
	parents: string[];
}

/** A line inside one row. `from` / `to` are lane indexes, `fromY` / `toY` are 0 (row top), 0.5 (the node) or 1 (row bottom). */
export interface GraphSegment {
	from: number;
	fromY: 0 | 0.5 | 1;
	to: number;
	toY: 0 | 0.5 | 1;
	color: number;
}

export interface GraphRow {
	lane: number;
	color: number;
	segments: GraphSegment[];
}

export interface GraphLayout {
	rows: GraphRow[];
	/** Number of lanes the widest row needs. */
	laneCount: number;
}

/**
 * Assigns each commit a lane and the lines that connect it to its neighbours. `commits` must be sorted so that
 * children come before their parents (`git log --date-order`). A parent that is not in `commits` (cut off by the
 * log limit) still gets a line, which simply runs off the bottom.
 */
export function layoutGraph(commits: readonly GraphCommit[]): GraphLayout {
	/** The hash each lane is waiting for, or null when the lane is free. */
	const lanes: (string | null)[] = [];
	const laneColors: number[] = [];
	let nextColor = 0;
	let laneCount = 0;

	const allocate = (): number => {
		let index = lanes.indexOf(null);
		if (index < 0) {
			index = lanes.length;
			lanes.push(null);
			laneColors.push(0);
		}
		laneColors[index] = nextColor++;
		return index;
	};

	const rows: GraphRow[] = [];
	for (const commit of commits) {
		const segments: GraphSegment[] = [];
		let lane = lanes.indexOf(commit.hash);
		if (lane < 0) {
			lane = allocate();
		}
		const color = laneColors[lane];

		// Lines arriving from above: the ones heading for this commit join its node, the others pass through.
		const before = lanes.slice();
		before.forEach((expected, index) => {
			if (expected === null) {
				return;
			}
			if (expected === commit.hash) {
				segments.push({ from: index, fromY: 0, to: lane, toY: 0.5, color: laneColors[index] });
			} else {
				segments.push({ from: index, fromY: 0, to: index, toY: 1, color: laneColors[index] });
			}
		});
		for (let i = 0; i < lanes.length; i++) {
			if (lanes[i] === commit.hash) {
				lanes[i] = null;
			}
		}

		// Lines leaving downwards, one per parent. A parent already expected on another lane is joined there.
		commit.parents.forEach((parent, index) => {
			const existing = lanes.indexOf(parent);
			if (existing >= 0) {
				segments.push({ from: lane, fromY: 0.5, to: existing, toY: 1, color: laneColors[existing] });
				return;
			}
			let target: number;
			if (index === 0) {
				target = lane;
				laneColors[target] = color;
			} else {
				target = allocate();
			}
			lanes[target] = parent;
			segments.push({ from: lane, fromY: 0.5, to: target, toY: 1, color: laneColors[target] });
		});

		laneCount = Math.max(laneCount, lane + 1, before.length, lanes.length);
		rows.push({ lane, color, segments });
		while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
			lanes.pop();
			laneColors.pop();
		}
	}
	return { rows, laneCount };
}
