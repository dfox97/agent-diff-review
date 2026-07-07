import { getMergeBase, runGit, runGitAllowFailure } from "./repo.js";
import type { Exec } from "./types.js";

export interface BranchInfo {
	name: string;
	current: boolean;
	remote: boolean;
	sha: string;
	subject: string;
}

export interface RepoActionResult {
	ok: true;
	message: string;
}

export interface DestructiveActionOptions {
	/**
	 * Required for actions that discard or replace local work. This keeps the
	 * core API honest when the UI grows buttons for these operations.
	 */
	confirmed: true;
}

function requireSafeRelativePath(path: string): string {
	const normalized = path.replace(/\\/g, "/").trim();
	if (normalized.length === 0) throw new Error("Path is required.");
	if (normalized.startsWith("/") || normalized.includes("..")) {
		throw new Error(`Refusing to operate on unsafe path: ${path}`);
	}
	return normalized;
}

function requireSafeBranchName(branch: string): string {
	const normalized = branch.trim();
	if (normalized.length === 0) throw new Error("Branch is required.");
	if (normalized.startsWith("-") || normalized.includes("..") || normalized.includes("\n")) {
		throw new Error(`Refusing to switch to unsafe branch name: ${branch}`);
	}
	return normalized;
}

async function hasDirtyWorkingTree(exec: Exec, repoRoot: string): Promise<boolean> {
	const status = await runGitAllowFailure(exec, repoRoot, ["status", "--porcelain"]);
	return status.trim().length > 0;
}

async function isTrackedPath(exec: Exec, repoRoot: string, path: string): Promise<boolean> {
	const result = await exec("git", ["ls-files", "--error-unmatch", "--", path], { cwd: repoRoot });
	return result.code === 0;
}

function parseBranchLine(line: string): BranchInfo | null {
	const [current = "", refName = "", objectName = "", subject = ""] = line.split("\t");
	if (refName.length === 0) return null;
	const remotePrefix = "refs/remotes/";
	const localPrefix = "refs/heads/";
	const remote = refName.startsWith(remotePrefix);
	const name = remote
		? refName.slice(remotePrefix.length)
		: refName.startsWith(localPrefix)
			? refName.slice(localPrefix.length)
			: refName;
	if (name === "origin/HEAD") return null;
	return {
		name,
		current: current === "*",
		remote,
		sha: objectName,
		subject,
	};
}

export async function listBranches(exec: Exec, repoRoot: string): Promise<BranchInfo[]> {
	const output = await runGit(exec, repoRoot, [
		"for-each-ref",
		"--format=%(HEAD)%09%(refname)%09%(objectname:short)%09%(subject)",
		"refs/heads",
		"refs/remotes",
	]);
	return output
		.split(/\r?\n/)
		.filter((line) => line.trim().length > 0)
		.map(parseBranchLine)
		.filter((branch): branch is BranchInfo => branch != null)
		.sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name));
}

export async function switchBranch(
	exec: Exec,
	repoRoot: string,
	branch: string,
	options: { allowDirty?: boolean } = {},
): Promise<RepoActionResult> {
	if (!options.allowDirty && await hasDirtyWorkingTree(exec, repoRoot)) {
		throw new Error("Working tree has local changes. Commit, stash, or pass allowDirty to switch anyway.");
	}
	const safeBranch = requireSafeBranchName(branch);
	await runGit(exec, repoRoot, ["switch", safeBranch]);
	return { ok: true, message: `Switched to ${safeBranch}.` };
}

export async function discardFileChanges(
	exec: Exec,
	repoRoot: string,
	path: string,
	options: DestructiveActionOptions,
): Promise<RepoActionResult> {
	if (options.confirmed !== true) throw new Error("Discard requires explicit confirmation.");
	const safePath = requireSafeRelativePath(path);
	await runGitAllowFailure(exec, repoRoot, ["restore", "--staged", "--", safePath]);
	if (await isTrackedPath(exec, repoRoot, safePath)) {
		await runGit(exec, repoRoot, ["restore", "--", safePath]);
	} else {
		await runGit(exec, repoRoot, ["clean", "-f", "--", safePath]);
	}
	return { ok: true, message: `Discarded local changes in ${safePath}.` };
}

export async function restoreFileFromHead(
	exec: Exec,
	repoRoot: string,
	path: string,
	options: DestructiveActionOptions,
): Promise<RepoActionResult> {
	if (options.confirmed !== true) throw new Error("Restore requires explicit confirmation.");
	const safePath = requireSafeRelativePath(path);
	await runGit(exec, repoRoot, ["restore", "--source=HEAD", "--staged", "--worktree", "--", safePath]);
	return { ok: true, message: `Restored ${safePath} from HEAD.` };
}

export async function restoreFileFromBase(
	exec: Exec,
	repoRoot: string,
	path: string,
	baseBranch: string,
	options: DestructiveActionOptions,
): Promise<RepoActionResult> {
	if (options.confirmed !== true) throw new Error("Restore requires explicit confirmation.");
	const safePath = requireSafeRelativePath(path);
	const mergeBase = await getMergeBase(exec, repoRoot, baseBranch);
	if (mergeBase == null) throw new Error(`Could not find merge base for ${baseBranch}.`);
	await runGit(exec, repoRoot, ["restore", `--source=${mergeBase}`, "--staged", "--worktree", "--", safePath]);
	return { ok: true, message: `Restored ${safePath} from ${baseBranch}'s merge base.` };
}
