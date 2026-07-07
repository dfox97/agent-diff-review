import { loadReviewGitOutputs } from "./review-commands.js";
import { buildReviewFiles } from "./review-files.js";
import { resolveReviewRepoState } from "./review-state.js";
import type { ReviewWindowDataResult } from "./review-types.js";
import type { Exec } from "./types.js";

export type { Exec, ExecOptions, ExecResult } from "./types.js";
export { getRepoRoot } from "./repo.js";
export { loadReviewFileContents, ReviewFileContentCache } from "./contents.js";
export type { ReviewWindowDataResult } from "./review-types.js";
export type { BranchInfo, DestructiveActionOptions, RepoActionResult } from "./actions.js";
export {
	discardFileChanges,
	listBranches,
	restoreFileFromBase,
	restoreFileFromHead,
	switchBranch,
} from "./actions.js";

/**
 * Build the full review window dataset.
 *
 * The pipeline is intentionally split across small modules:
 * - review-state: resolve repository root, HEAD state, and optional merge base
 * - review-commands: run independent git commands in parallel
 * - review-files: parse git output into ReviewFile records
 */
export async function getReviewWindowData(
	exec: Exec,
	cwd: string,
	baseBranch?: string,
): Promise<ReviewWindowDataResult> {
	const { repoRoot, repositoryHasHead, mergeBase } = await resolveReviewRepoState(exec, cwd, baseBranch);
	const outputs = await loadReviewGitOutputs(exec, repoRoot, repositoryHasHead, mergeBase);
	const { files, commits } = buildReviewFiles(outputs);

	return { repoRoot, files, commits, baseBranch, mergeBase };
}

export const refreshReviewData = getReviewWindowData;

// Keep parseCommitLog exported for callers that want just the commit list.
export { parseCommitLog } from "./parse.js";
