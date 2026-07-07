import { join } from "node:path";

const UNSAFE_REPO_PATH = /(^\/)|(^~)|(^|\/)\.\.(\/|$)|\0/;

/** Normalize a repo-relative path and reject anything that can escape the repo. */
export function requireSafeRepoRelativePath(path: string): string {
	const safePath = path.replace(/\\/g, "/").trim();
	if (!safePath) throw new Error("Path is required.");
	if (UNSAFE_REPO_PATH.test(safePath)) throw new Error(`Refusing to operate on unsafe path: ${path}`);
	return safePath;
}

export function joinRepoPath(repoRoot: string, path: string): string {
	return join(repoRoot, requireSafeRepoRelativePath(path));
}
