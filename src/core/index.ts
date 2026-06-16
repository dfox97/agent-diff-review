/**
 * Agent-agnostic core for `pi-diff-review-wsl`. Provides the diff-review data
 * pipeline, the prompt composer, and the window orchestrator. Any tool binding
 * (pi, Claude Code, OpenCode, Codex, …) imports from here and supplies its own
 * {@link Exec} implementation.
 */

// Domain + window wire protocol
export type {
	ReviewScope,
	ChangeStatus,
	ReviewFileComparison,
	ReviewCommit,
	ReviewFile,
	ReviewFileContents,
	CommentSide,
	DiffReviewComment,
	ReviewSubmitPayload,
	ReviewCancelPayload,
	ReviewRequestFilePayload,
	ReviewWindowMessage,
	ReviewFileDataMessage,
	ReviewFileErrorMessage,
	ReviewHostMessage,
	ReviewWindowData,
} from "./types.js";

// Git pipeline (with injectable Exec)
export type { Exec, ExecOptions, ExecResult } from "./git.js";
export { getRepoRoot, getReviewWindowData, loadReviewFileContents } from "./git.js";

// Markdown prompt composer
export { composeReviewPrompt } from "./prompt.js";

// HTML builder (loads web/index.html + web/app.js)
export { buildReviewHtml } from "./ui.js";

// Window orchestrator (open + lazy-load + lifecycle)
export type { OpenReviewWindowOptions, OpenReviewWindowHandle } from "./review-window.js";
export { openReviewWindow } from "./review-window.js";

// Platform adapter (Glimpse with WSL2 fallback). Useful for diagnostics:
export { isWSL } from "./wsl-glimpse.js";
