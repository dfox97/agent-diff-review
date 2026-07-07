import { runGit, runGitAllowFailure } from "./repo.js";
import type { Exec } from "./types.js";
import type { ReviewGitOutputs } from "./review-types.js";

export async function loadReviewGitOutputs(
	exec: Exec,
	repoRoot: string,
	repositoryHasHead: boolean,
	mergeBase?: string,
): Promise<ReviewGitOutputs> {
	const [
		trackedDiffOutput,
		untrackedOutput,
		trackedFilesOutput,
		deletedFilesOutput,
		lastCommitOutput,
		commitLogOutput,
	] = await Promise.all([
		loadTrackedDiff(exec, repoRoot, repositoryHasHead, mergeBase),
		loadUntrackedPaths(exec, repoRoot, mergeBase),
		loadTrackedPaths(exec, repoRoot),
		loadDeletedPaths(exec, repoRoot, mergeBase),
		loadLastCommitChanges(exec, repoRoot, repositoryHasHead),
		loadCommitLog(exec, repoRoot, repositoryHasHead, mergeBase),
	]);

	return {
		trackedDiffOutput,
		untrackedOutput,
		trackedFilesOutput,
		deletedFilesOutput,
		lastCommitOutput,
		commitLogOutput,
	};
}

function loadTrackedDiff(exec: Exec, repoRoot: string, repositoryHasHead: boolean, mergeBase?: string): Promise<string> {
	if (!repositoryHasHead) return Promise.resolve("");

	const target = mergeBase != null ? `${mergeBase}..HEAD` : "HEAD";
	return runGit(exec, repoRoot, ["diff", "--find-renames", "-M", "--name-status", target, "--"]);
}

function loadUntrackedPaths(exec: Exec, repoRoot: string, mergeBase?: string): Promise<string> {
	if (mergeBase != null) return Promise.resolve("");
	return runGitAllowFailure(exec, repoRoot, ["ls-files", "--others", "--exclude-standard"]);
}

function loadTrackedPaths(exec: Exec, repoRoot: string): Promise<string> {
	return runGitAllowFailure(exec, repoRoot, ["ls-files", "--cached"]);
}

function loadDeletedPaths(exec: Exec, repoRoot: string, mergeBase?: string): Promise<string> {
	if (mergeBase != null) return Promise.resolve("");
	return runGitAllowFailure(exec, repoRoot, ["ls-files", "--deleted"]);
}

function loadLastCommitChanges(exec: Exec, repoRoot: string, repositoryHasHead: boolean): Promise<string> {
	if (!repositoryHasHead) return Promise.resolve("");

	return runGitAllowFailure(exec, repoRoot, [
		"diff-tree",
		"--root",
		"--find-renames",
		"-M",
		"--name-status",
		"--no-commit-id",
		"-r",
		"HEAD",
	]);
}

function loadCommitLog(exec: Exec, repoRoot: string, repositoryHasHead: boolean, mergeBase?: string): Promise<string> {
	if (!repositoryHasHead) return Promise.resolve("");

	if (mergeBase != null) {
		return runGitAllowFailure(exec, repoRoot, [
			"log",
			`${mergeBase}..HEAD`,
			"--max-count=50",
			"--name-status",
			"--format=%H%x09%h%x09%s",
		]);
	}

	return runGitAllowFailure(exec, repoRoot, [
		"log",
		"--max-count=50",
		"--name-status",
		"--format=%H%x09%h%x09%s",
	]);
}
