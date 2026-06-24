/**
 * Agent-agnostic core for `pi-diff-review-wsl`. Provides the diff-review data
 * pipeline, the prompt composer, and the window orchestrator. Any tool binding
 * (pi, opencode, CLI, …) imports from here and supplies its own
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
	ReviewReadyPayload,
	ReviewWindowMessage,
	ReviewInitMessage,
	ReviewFilesMessage,
	ReviewFileDataMessage,
	ReviewFileErrorMessage,
	ReviewHostMessage,
	ReviewWindowData,
} from "./types.js";

// Git pipeline (with injectable Exec)
export type { Exec, ExecOptions, ExecResult } from "./git/types.js";
export { getRepoRoot, getReviewWindowData, loadReviewFileContents, ReviewFileContentCache } from "./git/index.js";

// Markdown prompt composer
export { composeReviewPrompt } from "./prompt.js";

// HTML builder (loads web/index.html + app.js)
export { buildPlaceholderHtml, readIndexHtml } from "./ui.js";

// Window orchestrator (open + lazy-load + lifecycle)
export type { OpenReviewWindowOptions, OpenReviewWindowHandle } from "./window/orchestrator.js";
export { openReviewWindow, openReviewWindowWithData } from "./window/orchestrator.js";

// Platform adapter (Glimpse with WSL2 fallback). Useful for diagnostics.
export { isWSL } from "../platform/wsl-glimpse.js";
export { resolveWebDir, resolveLoadFilePath } from "../platform/resolve-web-dir.js";
