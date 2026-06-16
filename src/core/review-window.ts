import { open, type GlimpseOpenOptions, type GlimpseWindow } from "./wsl-glimpse.js";
import type { Exec } from "./git.js";
import { loadReviewFileContents } from "./git.js";
import { buildReviewHtml } from "./ui.js";
import type {
	ReviewCancelPayload,
	ReviewFile,
	ReviewFileContents,
	ReviewHostMessage,
	ReviewRequestFilePayload,
	ReviewSubmitPayload,
	ReviewWindowData,
	ReviewWindowMessage,
} from "./types.js";

function escapeForInlineScript(value: string): string {
	return value.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function isSubmit(value: ReviewWindowMessage): value is ReviewSubmitPayload {
	return value.type === "submit";
}

function isCancel(value: ReviewWindowMessage): value is ReviewCancelPayload {
	return value.type === "cancel";
}

function isRequestFile(value: ReviewWindowMessage): value is ReviewRequestFilePayload {
	return value.type === "request-file";
}

export interface OpenReviewWindowOptions {
	width?: number;
	height?: number;
	title?: string;
}

export interface OpenReviewWindowHandle {
	/**
	 * Resolves to the submit payload when the user clicks Submit, the cancel
	 * payload when the user clicks Cancel, or `null` when the window was closed
	 * by any other means (driven by the user clicking the window's close button,
	 * the host process exiting, etc.).
	 */
	readonly result: Promise<ReviewSubmitPayload | ReviewCancelPayload | null>;
	/** Programmatically closes the window. Safe to call more than once. */
	close(): void;
}

/**
 * Opens the native review window for the supplied `data`, wires up the
 * message protocol for lazy file-content loading, and returns a handle whose
 * `result` promise resolves when the user submits, cancels, or the window
 * closes externally.
 *
 * The returned `handle.result` rejects if the underlying window reports an
 * error event.
 */
export function openReviewWindow(
	exec: Exec,
	data: ReviewWindowData,
	options: OpenReviewWindowOptions = {},
): OpenReviewWindowHandle {
	const html = buildReviewHtml(data);
	const glimpseOptions: GlimpseOpenOptions = {
		width: options.width ?? 1680,
		height: options.height ?? 1020,
		title: options.title ?? "review",
	};
	const window: GlimpseWindow = open(html, glimpseOptions);

	const fileMap = new Map<string, ReviewFile>(data.files.map((file) => [file.id, file]));
	const contentCache = new Map<string, Promise<ReviewFileContents>>();
	const mergeBase = data.mergeBase;

	const sendWindowMessage = (message: ReviewHostMessage): void => {
		const payload = escapeForInlineScript(JSON.stringify(message));
		window.send(`window.__reviewReceive(${payload});`);
	};

	const loadContents = (
		file: ReviewFile,
		scope: ReviewRequestFilePayload["scope"],
		commitSha?: string,
	): Promise<ReviewFileContents> => {
		const cacheKey = `${scope}:${commitSha ?? ""}:${file.id}`;
		const cached = contentCache.get(cacheKey);
		if (cached != null) return cached;

		const pending = loadReviewFileContents(exec, data.repoRoot, file, scope, commitSha, mergeBase);
		contentCache.set(cacheKey, pending);
		return pending;
	};

	const result = new Promise<ReviewSubmitPayload | ReviewCancelPayload | null>((resolve, reject) => {
		let settled = false;

		const cleanup = (): void => {
			window.removeListener("message", onMessage);
			window.removeListener("closed", onClosed);
			window.removeListener("error", onError);
		};

		const settle = (value: ReviewSubmitPayload | ReviewCancelPayload | null): void => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(value);
		};

		const handleRequestFile = async (message: ReviewRequestFilePayload): Promise<void> => {
			const file = fileMap.get(message.fileId);
			if (file == null) {
				sendWindowMessage({
					type: "file-error",
					requestId: message.requestId,
					fileId: message.fileId,
					scope: message.scope,
					commitSha: message.commitSha,
					message: "Unknown file requested.",
				});
				return;
			}

			try {
				const contents = await loadContents(file, message.scope, message.commitSha);
				sendWindowMessage({
					type: "file-data",
					requestId: message.requestId,
					fileId: message.fileId,
					scope: message.scope,
					commitSha: message.commitSha,
					originalContent: contents.originalContent,
					modifiedContent: contents.modifiedContent,
				});
			} catch (error) {
				const messageText = error instanceof Error ? error.message : String(error);
				sendWindowMessage({
					type: "file-error",
					requestId: message.requestId,
					fileId: message.fileId,
					scope: message.scope,
					commitSha: message.commitSha,
					message: messageText,
				});
			}
		};

		const onMessage = (raw: unknown): void => {
			const msg = raw as ReviewWindowMessage;
			if (isRequestFile(msg)) {
				void handleRequestFile(msg);
				return;
			}
			if (isSubmit(msg) || isCancel(msg)) {
				settle(msg);
			}
		};

		const onClosed = (): void => {
			settle(null);
		};

		const onError = (err: Error): void => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(err);
		};

		window.on("message", onMessage);
		window.on("closed", onClosed);
		window.on("error", onError);
	});

	return {
		result,
		close: () => {
			try {
				window.close();
			} catch {}
		},
	};
}
