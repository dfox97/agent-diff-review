import type { ReviewFile, ReviewFileComparison } from "../types.js";
import {
	isReviewableFilePath,
	mergeChangedPaths,
	parseCommitLogWithNameStatus,
	parseNameStatus,
	parseTrackedPaths,
	parseUntrackedPaths,
	toComparison,
	toDisplayPath,
	uniquePaths,
	type ChangedPath,
} from "./parse.js";
import type { CommitSummary, ReviewGitOutputs } from "./review-types.js";

interface ReviewFileSeed {
	path: string;
	worktreeStatus: ReviewFileComparison["status"] | null;
	hasWorkingTreeFile: boolean;
	inGitDiff: boolean;
	inLastCommit: boolean;
	gitDiff: ReviewFileComparison | null;
	lastCommit: ReviewFileComparison | null;
	commitComparisons: Record<string, ReviewFileComparison>;
}

interface CommitEntry extends CommitSummary {
	changes: ChangedPath[];
}

interface ParsedReviewChanges {
	commits: CommitSummary[];
	commitChanges: Map<string, ChangedPath[]>;
	worktreeChanges: ChangedPath[];
	lastCommitChanges: ChangedPath[];
	currentPaths: string[];
	currentPathSet: Set<string>;
}

export function buildReviewFiles(outputs: ReviewGitOutputs): { files: ReviewFile[]; commits: CommitSummary[] } {
	const changes = parseReviewChanges(outputs);
	const seeds = seedCurrentFiles(changes.currentPaths);

	applyWorktreeChanges(seeds, changes.worktreeChanges);
	applyLastCommitChanges(seeds, changes.lastCommitChanges, changes.currentPathSet);
	applyCommitComparisons(seeds, changes.commitChanges, changes.currentPathSet);

	return {
		files: [...seeds.values()].map(createReviewFile).sort(compareReviewFiles),
		commits: changes.commits,
	};
}

function parseReviewChanges(outputs: ReviewGitOutputs): ParsedReviewChanges {
	const commitEntries = parseCommitEntries(outputs.commitLogOutput);
	const untrackedChanges = parseUntrackedPaths(outputs.untrackedOutput);
	const untrackedPaths = parseTrackedPaths(outputs.untrackedOutput);
	const deletedPaths = new Set(parseTrackedPaths(outputs.deletedFilesOutput));
	const currentPaths = uniquePaths([...parseTrackedPaths(outputs.trackedFilesOutput), ...untrackedPaths])
		.filter((path) => !deletedPaths.has(path))
		.filter(isReviewableFilePath);

	return {
		commits: commitEntries.map(toCommitSummary),
		commitChanges: toCommitChanges(commitEntries),
		worktreeChanges: mergeChangedPaths(parseNameStatus(outputs.trackedDiffOutput), untrackedChanges).filter(isReviewableChange),
		lastCommitChanges: parseNameStatus(outputs.lastCommitOutput).filter(isReviewableChange),
		currentPaths,
		currentPathSet: new Set(currentPaths),
	};
}

function parseCommitEntries(commitLogOutput: string): CommitEntry[] {
	return parseCommitLogWithNameStatus(commitLogOutput).map((entry) => ({
		sha: entry.sha,
		shortSha: entry.shortSha,
		subject: entry.subject,
		changes: entry.changes.filter(isReviewableChange),
	}));
}

function toCommitSummary(entry: CommitEntry): CommitSummary {
	return { sha: entry.sha, shortSha: entry.shortSha, subject: entry.subject };
}

function toCommitChanges(entries: CommitEntry[]): Map<string, ChangedPath[]> {
	const changesByCommit = new Map<string, ChangedPath[]>();
	for (const entry of entries) {
		changesByCommit.set(entry.sha, entry.changes);
	}
	return changesByCommit;
}

function isReviewableChange(change: ChangedPath): boolean {
	return isReviewableFilePath(change.newPath ?? change.oldPath ?? "");
}

function seedCurrentFiles(currentPaths: string[]): Map<string, ReviewFileSeed> {
	const seeds = new Map<string, ReviewFileSeed>();
	for (const path of currentPaths) {
		seeds.set(path, createEmptySeed(path, true));
	}
	return seeds;
}

function applyWorktreeChanges(seeds: Map<string, ReviewFileSeed>, changes: ChangedPath[]): void {
	for (const change of changes) {
		const seed = getOrCreateSeed(seeds, change, change.newPath != null);
		seed.worktreeStatus = change.status;
		seed.hasWorkingTreeFile = change.newPath != null;
		seed.inGitDiff = true;
		seed.gitDiff = toComparison(change);
	}
}

function applyLastCommitChanges(
	seeds: Map<string, ReviewFileSeed>,
	changes: ChangedPath[],
	currentPathSet: Set<string>,
): void {
	for (const change of changes) {
		const seed = getOrCreateSeed(seeds, change, hasCurrentFile(change, currentPathSet));
		seed.inLastCommit = true;
		seed.lastCommit = toComparison(change);
	}
}

function applyCommitComparisons(
	seeds: Map<string, ReviewFileSeed>,
	commitChanges: Map<string, ChangedPath[]>,
	currentPathSet: Set<string>,
): void {
	for (const [commitSha, changes] of commitChanges) {
		for (const change of changes) {
			const seed = getOrCreateSeed(seeds, change, hasCurrentFile(change, currentPathSet));
			seed.commitComparisons[commitSha] = toComparison(change);
		}
	}
}

function getOrCreateSeed(
	seeds: Map<string, ReviewFileSeed>,
	change: ChangedPath,
	hasWorkingTreeFile: boolean,
): ReviewFileSeed {
	const path = change.newPath ?? change.oldPath ?? toDisplayPath(change);
	let seed = seeds.get(path);
	if (seed == null) {
		seed = createEmptySeed(path, hasWorkingTreeFile);
		seeds.set(path, seed);
	}
	return seed;
}

function hasCurrentFile(change: ChangedPath, currentPathSet: Set<string>): boolean {
	return change.newPath != null && currentPathSet.has(change.newPath);
}

function createEmptySeed(path: string, hasWorkingTreeFile: boolean): ReviewFileSeed {
	return {
		path,
		worktreeStatus: null,
		hasWorkingTreeFile,
		inGitDiff: false,
		inLastCommit: false,
		gitDiff: null,
		lastCommit: null,
		commitComparisons: {},
	};
}

function createReviewFile(seed: ReviewFileSeed): ReviewFile {
	return {
		id: buildReviewFileId(seed),
		path: seed.path,
		worktreeStatus: seed.worktreeStatus,
		hasWorkingTreeFile: seed.hasWorkingTreeFile,
		inGitDiff: seed.inGitDiff,
		inLastCommit: seed.inLastCommit,
		gitDiff: seed.gitDiff,
		lastCommit: seed.lastCommit,
		commitComparisons: seed.commitComparisons,
	};
}

function buildReviewFileId(seed: ReviewFileSeed): string {
	return [
		seed.path,
		seed.hasWorkingTreeFile ? "working" : "gone",
		seed.gitDiff?.displayPath ?? "",
		seed.lastCommit?.displayPath ?? "",
	].join("::");
}

function compareReviewFiles(a: ReviewFile, b: ReviewFile): number {
	return a.path.localeCompare(b.path);
}
