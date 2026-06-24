import type {
	ReviewCancelPayload,
	ReviewFileDataMessage,
	ReviewFileErrorMessage,
	ReviewFilesMessage,
	ReviewInitMessage,
	ReviewReadyPayload,
	ReviewRequestFilePayload,
	ReviewSubmitPayload,
	ReviewWindowMessage,
} from "../types.js";

// ---- Webview → host message guards ---------------------------------------

export function isReady(value: ReviewWindowMessage): value is ReviewReadyPayload {
	return value.type === "ready";
}

export function isSubmit(value: ReviewWindowMessage): value is ReviewSubmitPayload {
	return value.type === "submit";
}

export function isCancel(value: ReviewWindowMessage): value is ReviewCancelPayload {
	return value.type === "cancel";
}

export function isRequestFile(value: ReviewWindowMessage): value is ReviewRequestFilePayload {
	return value.type === "request-file";
}

// ---- Host → webview message guards ---------------------------------------

export function isFileData(value: ReviewFileDataMessage | ReviewFileErrorMessage): value is ReviewFileDataMessage {
	return value.type === "file-data";
}

export type HostMessage =
	| ReviewInitMessage
	| ReviewFilesMessage
	| ReviewFileDataMessage
	| ReviewFileErrorMessage;
