import { getMergeBase, getRepoRoot, hasHead, resolveBranch } from "./repo.js";
import type { Exec } from "./types.js";
import type { ReviewRepoState } from "./review-types.js";

export async function resolveReviewRepoState(exec: Exec, cwd: string, baseBranch?: string): Promise<ReviewRepoState> {
	const repoRoot = await getRepoRoot(exec, cwd);
	const repositoryHasHead = await hasHead(exec, repoRoot);
	const mergeBase = await resolveMergeBase(exec, repoRoot, repositoryHasHead, baseBranch);

	return { repoRoot, repositoryHasHead, mergeBase };
}

async function resolveMergeBase(
	exec: Exec,
	repoRoot: string,
	repositoryHasHead: boolean,
	baseBranch?: string,
): Promise<string | undefined> {
	if (!baseBranch || !repositoryHasHead) return undefined;

	const resolvedBranch = await resolveBranch(exec, repoRoot, baseBranch);
	if (resolvedBranch == null) {
		throw new Error(`Base branch "${baseBranch}" not found.`);
	}

	const mergeBase = await getMergeBase(exec, repoRoot, resolvedBranch);
	if (mergeBase == null) {
		throw new Error(`Could not find merge base between "${baseBranch}" and HEAD.`);
	}

	return mergeBase;
}
