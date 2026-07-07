import type {
	ReviewCancelPayload,
	ReviewFileDataMessage,
	ReviewFileErrorMessage,
	ReviewFilesMessage,
	ReviewInitMessage,
	ReviewOpenInEditorPayload,
	ReviewReadyPayload,
	ReviewRequestFilePayload,
	ReviewSubmitPayload,
} from "../types.js";

// ---- Message guard helpers ------------------------------------------------

function isReviewScope(value: unknown): boolean {
	return value === "git-diff" || value === "last-commit" || value === "commit" || value === "all-files";
}

// ---- Webview -> host message guards ---------------------------------------

export function isReady(value: unknown): value is ReviewReadyPayload {
	return (value as ReviewReadyPayload | null)?.type === "ready";
}

export function isSubmit(value: unknown): value is ReviewSubmitPayload {
	const msg = value as ReviewSubmitPayload | null;
	return msg?.type === "submit" && typeof msg.overallComment === "string" && Array.isArray(msg.comments);
}

export function isCancel(value: unknown): value is ReviewCancelPayload {
	return (value as ReviewCancelPayload | null)?.type === "cancel";
}

export function isRequestFile(value: unknown): value is ReviewRequestFilePayload {
	const msg = value as ReviewRequestFilePayload | null;
	return msg?.type === "request-file"
		&& typeof msg.requestId === "string"
		&& typeof msg.fileId === "string"
		&& isReviewScope(msg.scope)
		&& (msg.commitSha === undefined || typeof msg.commitSha === "string");
}

export function isOpenInEditor(value: unknown): value is ReviewOpenInEditorPayload {
	const msg = value as ReviewOpenInEditorPayload | null;
	return msg?.type === "open-in-editor"
		&& typeof msg.fileId === "string"
		&& (msg.line === undefined || typeof msg.line === "number");
}

// ---- Host -> webview message guards ---------------------------------------

export function isFileData(value: unknown): value is ReviewFileDataMessage {
	return (value as ReviewFileDataMessage | null)?.type === "file-data";
}

export type HostMessage =
	| ReviewInitMessage
	| ReviewFilesMessage
	| ReviewFileDataMessage
	| ReviewFileErrorMessage;
