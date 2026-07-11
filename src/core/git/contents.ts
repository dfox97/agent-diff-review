import { lstat, readFile } from "node:fs/promises";
import { joinRepoPath, requireSafeRepoRelativePath } from "../path-safety.js";
import type { Exec } from "./types.js";
import type { ReviewFile, ReviewFileContents, ReviewScope } from "../types.js";

const MAX_REVIEW_FILE_BYTES = 1_000_000;

function omitted(path: string, reason: string): string {
	return `[${path} omitted from review: ${reason}]`;
}

function tooLarge(path: string): string {
	return omitted(path, `file is larger than ${MAX_REVIEW_FILE_BYTES} bytes`);
}

function isTooLarge(size: number): boolean {
	return Number.isFinite(size) && size > MAX_REVIEW_FILE_BYTES;
}

async function getRevisionContent(exec: Exec, repoRoot: string, revision: string, path: string): Promise<string> {
	const safePath = requireSafeRepoRelativePath(path);
	const spec = `${revision}:${safePath}`;
	const sizeResult = await exec("git", ["cat-file", "-s", spec], { cwd: repoRoot });
	if (sizeResult.code !== 0) return "";
	if (isTooLarge(Number(sizeResult.stdout.trim()))) return tooLarge(safePath);

	const result = await exec("git", ["show", spec], { cwd: repoRoot });
	return result.code === 0 ? result.stdout : "";
}

async function getWorkingTreeContent(repoRoot: string, path: string): Promise<string> {
	try {
		const safePath = requireSafeRepoRelativePath(path);
		const fullPath = joinRepoPath(repoRoot, safePath);
		const stat = await lstat(fullPath);
		if (stat.isSymbolicLink()) return omitted(safePath, "symlink");
		if (!stat.isFile()) return omitted(safePath, "not a regular file");
		return isTooLarge(stat.size) ? tooLarge(safePath) : readFile(fullPath, "utf8");
	} catch {
		return "";
	}
}

/**
 * Load the original/modified contents for a file under a given scope. Keeps the
 * existing two-`git show` strategy (Q5-A): one show for the original revision
 * and either a show or a working-tree read for the modified side.
 */
export async function loadReviewFileContents(
	exec: Exec,
	repoRoot: string,
	file: ReviewFile,
	scope: ReviewScope,
	commitSha?: string,
	mergeBase?: string,
): Promise<ReviewFileContents> {
	if (scope === "all-files") {
		const content = file.hasWorkingTreeFile ? await getWorkingTreeContent(repoRoot, file.path) : "";
		return { originalContent: content, modifiedContent: content };
	}

	const comparison =
		scope === "git-diff"
			? file.gitDiff
			: scope === "commit" && commitSha
				? file.commitComparisons[commitSha]
				: file.lastCommit;
	if (comparison == null) {
		return { originalContent: "", modifiedContent: "" };
	}

	const originalRevision =
		scope === "git-diff" && mergeBase != null
			? mergeBase
			: scope === "git-diff"
				? "HEAD"
				: scope === "commit" && commitSha
					? `${commitSha}^`
					: "HEAD^";
	const modifiedRevision = scope === "git-diff" ? null : scope === "commit" && commitSha ? commitSha : "HEAD";

	const originalContent =
		comparison.oldPath == null ? "" : await getRevisionContent(exec, repoRoot, originalRevision, comparison.oldPath);
	const modifiedContent =
		comparison.newPath == null
			? ""
			: modifiedRevision == null
				? await getWorkingTreeContent(repoRoot, comparison.newPath)
				: await getRevisionContent(exec, repoRoot, modifiedRevision, comparison.newPath);

	return { originalContent, modifiedContent };
}

function cacheKey(scope: ReviewScope, commitSha: string | undefined, fileId: string): string {
	return `${scope}:${commitSha ?? ""}:${fileId}`;
}

/**
 * Bounded LRU cache of in-flight + settled file-content loads. Keyed by
 * `scope:commitSha:fileId`. Capped at `cap` entries (default 40); the oldest
 * entry is evicted when the cap is exceeded. Prefetch is just `get` without
 * awaiting - the cache keeps the promise so a subsequent real request reuses
 * it.
 */
export class ReviewFileContentCache {
	private readonly entries = new Map<string, Promise<ReviewFileContents>>();
	private readonly exec: Exec;
	private readonly repoRoot: string;
	private readonly mergeBase: string | undefined;
	private readonly cap: number;

	constructor(exec: Exec, repoRoot: string, mergeBase: string | undefined, cap = 40) {
		this.exec = exec;
		this.repoRoot = repoRoot;
		this.mergeBase = mergeBase;
		this.cap = cap;
	}

	get(file: ReviewFile, scope: ReviewScope, commitSha?: string): Promise<ReviewFileContents> {
		const key = cacheKey(scope, commitSha, file.id);
		const existing = this.entries.get(key);
		if (existing != null) {
			// Move to most-recently-used.
			this.entries.delete(key);
			this.entries.set(key, existing);
			return existing;
		}
		const pending = loadReviewFileContents(this.exec, this.repoRoot, file, scope, commitSha, this.mergeBase);
		this.entries.set(key, pending);
		// Failed reads must be retryable. Only remove this exact promise: a newer
		// request may already have replaced it by the time the rejection runs.
		void pending.catch(() => {
			if (this.entries.get(key) === pending) this.entries.delete(key);
		});
		this.evictIfNeeded();
		return pending;
	}

	/** Opportunistic prefetch - primes the cache without awaiting. */
	prefetch(file: ReviewFile, scope: ReviewScope, commitSha?: string): void {
		const key = cacheKey(scope, commitSha, file.id);
		if (this.entries.has(key)) return;
		// Promise rejections are asynchronous, so a synchronous try/catch cannot
		// make prefetch best-effort. Attach an explicit rejection handler.
		void this.get(file, scope, commitSha).catch(() => {});
	}

	private evictIfNeeded(): void {
		while (this.entries.size > this.cap) {
			const oldest = this.entries.keys().next();
			if (oldest.done === true) break;
			this.entries.delete(oldest.value as string);
		}
	}
}
