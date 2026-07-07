import type { ReviewFile } from "../types.js";

export interface ReviewWindowDataResult {
	repoRoot: string;
	files: ReviewFile[];
	commits: CommitSummary[];
	baseBranch?: string;
	mergeBase?: string;
}

export interface CommitSummary {
	sha: string;
	shortSha: string;
	subject: string;
}

export interface ReviewRepoState {
	repoRoot: string;
	repositoryHasHead: boolean;
	mergeBase?: string;
}

export interface ReviewGitOutputs {
	trackedDiffOutput: string;
	untrackedOutput: string;
	trackedFilesOutput: string;
	deletedFilesOutput: string;
	lastCommitOutput: string;
	commitLogOutput: string;
}
