import { extname } from "node:path";
import type { ChangeStatus, ReviewFileComparison } from "../types.js";

export interface ChangedPath {
	status: ChangeStatus;
	oldPath: string | null;
	newPath: string | null;
}

/** Parse `git diff --name-status` / `git diff-tree --name-status` output. */
export function parseNameStatus(output: string): ChangedPath[] {
	const lines = output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const changes: ChangedPath[] = [];

	for (const line of lines) {
		const parts = line.split("\t");
		const rawStatus = parts[0] ?? "";
		const code = rawStatus[0];

		if (code === "R" || code === "C") {
			const oldPath = parts[1] ?? null;
			const newPath = parts[2] ?? null;
			if (oldPath != null && newPath != null) {
				changes.push({ status: code === "R" ? "renamed" : "modified", oldPath, newPath });
			}
			continue;
		}

		if (code === "M") {
			const path = parts[1] ?? null;
			if (path != null) changes.push({ status: "modified", oldPath: path, newPath: path });
			continue;
		}

		if (code === "A") {
			const path = parts[1] ?? null;
			if (path != null) changes.push({ status: "added", oldPath: null, newPath: path });
			continue;
		}

		if (code === "D") {
			const path = parts[1] ?? null;
			if (path != null) changes.push({ status: "deleted", oldPath: path, newPath: null });
		}
	}

	return changes;
}

/** Parse `git ls-files --others --exclude-standard` (one path per line). */
export function parseUntrackedPaths(output: string): ChangedPath[] {
	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((path) => ({ status: "added" as const, oldPath: null, newPath: path }));
}

/** Parse one-path-per-line output (ls-files --cached / --deleted). */
export function parseTrackedPaths(output: string): string[] {
	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

export interface CommitLogEntry {
	sha: string;
	shortSha: string;
	subject: string;
}

/** Parse `git log --format=%H%x09%h%x09%s` output (no name-status). */
export function parseCommitLog(output: string): CommitLogEntry[] {
	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [sha = "", shortSha = "", ...subjectParts] = line.split("\t");
			return { sha, shortSha, subject: subjectParts.join("\t") };
		})
		.filter((commit) => commit.sha.length > 0);
}

export interface CommitLogWithNameStatusEntry extends CommitLogEntry {
	changes: ChangedPath[];
}

/**
 * Parse the combined `git log --name-status --format=%H%x09%h%x09%s` output.
 *
 * Each commit is a header line (`40-hex-sha\tshortsha\tsubject`) followed by a
 * blank line and then its name-status block, e.g.:
 *
 *   <sha>\t<short>\t<subject>
 *   <blank>
 *   M\tpath/a
 *   A\tpath/b
 *   <sha>\t...
 *
 * Header lines are detected by `^[0-9a-f]{40}\t`; blank lines and anything else
 * are skipped or appended to the current commit's changes.
 */
export function parseCommitLogWithNameStatus(output: string): CommitLogWithNameStatusEntry[] {
	const lines = output.split(/\r?\n/);
	const entries: CommitLogWithNameStatusEntry[] = [];
	let current: CommitLogWithNameStatusEntry | null = null;
	const headerRe = /^[0-9a-f]{40}\t/;

	for (const raw of lines) {
		const line = raw.trim();
		if (line.length === 0) continue;

		if (headerRe.test(line)) {
			const [sha = "", shortSha = "", ...subjectParts] = line.split("\t");
			current = { sha, shortSha, subject: subjectParts.join("\t"), changes: [] };
			entries.push(current);
			continue;
		}

		if (current == null) continue;
		const parts = line.split("\t");
		const code = (parts[0] ?? "")[0];

		if (code === "R" || code === "C") {
			const oldPath = parts[1] ?? null;
			const newPath = parts[2] ?? null;
			if (oldPath != null && newPath != null) {
				current.changes.push({ status: code === "R" ? "renamed" : "modified", oldPath, newPath });
			}
			continue;
		}
		if (code === "M") {
			const path = parts[1] ?? null;
			if (path != null) current.changes.push({ status: "modified", oldPath: path, newPath: path });
			continue;
		}
		if (code === "A") {
			const path = parts[1] ?? null;
			if (path != null) current.changes.push({ status: "added", oldPath: null, newPath: path });
			continue;
		}
		if (code === "D") {
			const path = parts[1] ?? null;
			if (path != null) current.changes.push({ status: "deleted", oldPath: path, newPath: null });
		}
	}

	return entries.filter((entry) => entry.sha.length > 0);
}

// ---- Pure path/comparison helpers ----------------------------------------

const BINARY_EXTENSIONS = new Set([
	".7z", ".a", ".avi", ".avif", ".bin", ".bmp", ".class", ".dll", ".dylib",
	".eot", ".exe", ".gif", ".gz", ".ico", ".jar", ".jpeg", ".jpg", ".lockb",
	".map", ".mov", ".mp3", ".mp4", ".o", ".otf", ".pdf", ".png", ".pyc", ".so",
	".svgz", ".tar", ".ttf", ".wasm", ".webm", ".webp", ".woff", ".woff2", ".zip",
]);

export function isReviewableFilePath(path: string): boolean {
	const lowerPath = path.toLowerCase();
	const fileName = lowerPath.split("/").pop() ?? lowerPath;
	const extension = extname(fileName);
	if (fileName.length === 0) return false;
	if (BINARY_EXTENSIONS.has(extension)) return false;
	if (fileName.endsWith(".min.js") || fileName.endsWith(".min.css")) return false;
	return true;
}

export function toDisplayPath(change: ChangedPath): string {
	if (change.status === "renamed") {
		return `${change.oldPath ?? ""} -> ${change.newPath ?? ""}`;
	}
	return change.newPath ?? change.oldPath ?? "(unknown)";
}

export function toComparison(change: ChangedPath): ReviewFileComparison {
	return {
		status: change.status,
		oldPath: change.oldPath,
		newPath: change.newPath,
		displayPath: toDisplayPath(change),
		hasOriginal: change.oldPath != null,
		hasModified: change.newPath != null,
	};
}

export function mergeChangedPaths(tracked: ChangedPath[], untracked: ChangedPath[]): ChangedPath[] {
	const seen = new Set(tracked.map((change) => `${change.status}:${change.oldPath ?? ""}:${change.newPath ?? ""}`));
	const merged = [...tracked];
	for (const change of untracked) {
		const key = `${change.status}:${change.oldPath ?? ""}:${change.newPath ?? ""}`;
		if (seen.has(key)) continue;
		merged.push(change);
		seen.add(key);
	}
	return merged;
}

export function uniquePaths(paths: string[]): string[] {
	return [...new Set(paths)];
}
