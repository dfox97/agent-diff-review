export type ReviewScope = "git-diff" | "last-commit" | "commit" | "all-files";

export type ChangeStatus = "modified" | "added" | "deleted" | "renamed";

export interface ReviewFileComparison {
	status: ChangeStatus;
	oldPath: string | null;
	newPath: string | null;
	displayPath: string;
	hasOriginal: boolean;
	hasModified: boolean;
}

export interface ReviewCommit {
	sha: string;
	shortSha: string;
	subject: string;
}

export interface ReviewFile {
	id: string;
	path: string;
	worktreeStatus: ChangeStatus | null;
	hasWorkingTreeFile: boolean;
	inGitDiff: boolean;
	inLastCommit: boolean;
	gitDiff: ReviewFileComparison | null;
	lastCommit: ReviewFileComparison | null;
	commitComparisons: Record<string, ReviewFileComparison>;
}

export interface ReviewFileContents {
	originalContent: string;
	modifiedContent: string;
}

export type CommentSide = "original" | "modified" | "file";

export interface DiffReviewComment {
	id: string;
	fileId: string;
	scope: ReviewScope;
	commitSha?: string;
	side: CommentSide;
	startLine: number | null;
	endLine: number | null;
	body: string;
}

export interface ReviewSubmitPayload {
	type: "submit";
	overallComment: string;
	comments: DiffReviewComment[];
}

export interface ReviewCancelPayload {
	type: "cancel";
}

export interface ReviewRequestFilePayload {
	type: "request-file";
	requestId: string;
	fileId: string;
	scope: ReviewScope;
	commitSha?: string;
}

/** Sent by the webview once it has booted and registered `__reviewReceive`. */
export interface ReviewReadyPayload {
	type: "ready";
}

export type ReviewWindowMessage =
	| ReviewSubmitPayload
	| ReviewCancelPayload
	| ReviewRequestFilePayload
	| ReviewReadyPayload;

/** Host → webview: identifies the repo + base before the file index arrives. */
export interface ReviewInitMessage {
	type: "init";
	repoRoot: string;
	baseBranch?: string;
	mergeBase?: string;
}

/** Host → webview: the full file index + commit list, sent after `init`. */
export interface ReviewFilesMessage {
	type: "files";
	files: ReviewFile[];
	commits: ReviewCommit[];
}

export interface ReviewFileDataMessage {
	type: "file-data";
	requestId: string;
	fileId: string;
	scope: ReviewScope;
	commitSha?: string;
	originalContent: string;
	modifiedContent: string;
}

export interface ReviewFileErrorMessage {
	type: "file-error";
	requestId: string;
	fileId: string;
	scope: ReviewScope;
	commitSha?: string;
	message: string;
}

export type ReviewHostMessage =
	| ReviewInitMessage
	| ReviewFilesMessage
	| ReviewFileDataMessage
	| ReviewFileErrorMessage;

export interface ReviewWindowData {
	repoRoot: string;
	files: ReviewFile[];
	commits: ReviewCommit[];
	baseBranch?: string;
	mergeBase?: string;
}
