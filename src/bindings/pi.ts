import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import {
	composeReviewPrompt,
	openReviewWindow,
	type Exec,
	type OpenReviewWindowHandle,
} from "../core/index.js";

type WaitingResult = "escape" | "settled";

function showWaitingUI(ctx: ExtensionCommandContext): {
	promise: Promise<WaitingResult>;
	dismiss: () => void;
} {
	let settled = false;
	let doneFn: ((result: WaitingResult) => void) | null = null;
	let pendingResult: WaitingResult | null = null;

	const finish = (result: WaitingResult): void => {
		if (settled) return;
		settled = true;
		if (doneFn != null) {
			doneFn(result);
		} else {
			pendingResult = result;
		}
	};

	const promise = ctx.ui.custom<WaitingResult>((_tui, theme, _kb, done) => {
		doneFn = done;
		if (pendingResult != null) {
			const result = pendingResult;
			pendingResult = null;
			queueMicrotask(() => done(result));
		}

		return {
			render(width: number): string[] {
				const innerWidth = Math.max(24, width - 2);
				const borderTop = theme.fg("border", `╭${"─".repeat(innerWidth)}╮`);
				const borderBottom = theme.fg("border", `╰${"─".repeat(innerWidth)}╯`);
				const lines = [
					theme.fg("accent", theme.bold("Waiting for review")),
					"The native review window is open.",
					"Press Escape to cancel and close the review window.",
				];
				return [
					borderTop,
					...lines.map((line) => `${theme.fg("border", "│")}${truncateToWidth(line, innerWidth, "...", true).padEnd(innerWidth, " ")}${theme.fg("border", "│")}`),
					borderBottom,
				];
			},
			handleInput(data: string): void {
				if (matchesKey(data, Key.escape)) {
					finish("escape");
				}
			},
			invalidate(): void {},
		};
	});

	const dismiss = (): void => {
		finish("settled");
	};

	return { promise, dismiss };
}

export default function (pi: ExtensionAPI) {
	const exec: Exec = (cmd, args, opts) => pi.exec(cmd, args, opts);

	let activeHandle: OpenReviewWindowHandle | null = null;
	let activeWaitingUIDismiss: (() => void) | null = null;

	function closeActive(): void {
		if (activeHandle == null) return;
		const handle = activeHandle;
		activeHandle = null;
		try {
			handle.close();
		} catch {}
	}

	async function review(ctx: ExtensionCommandContext, baseBranch?: string): Promise<void> {
		if (activeHandle != null) {
			ctx.ui.notify("A review window is already open.", "warning");
			return;
		}

		const handle = openReviewWindow(exec, ctx.cwd, baseBranch, {
			width: 1680,
			height: 1020,
			title: "pi review",
		});
		activeHandle = handle;
		ctx.ui.notify("Opened native review window.", "info");
		const waitingUI = showWaitingUI(ctx);
		activeWaitingUIDismiss = waitingUI.dismiss;

		try {
			const racer = await Promise.race([
				handle.result.then((message) => ({ type: "window" as const, message })),
				waitingUI.promise.then((reason) => ({ type: "ui" as const, reason })),
			]);

			if (racer.type === "ui" && racer.reason === "escape") {
				handle.close();
				await handle.result.catch(() => null);
				ctx.ui.notify("Review cancelled.", "info");
				return;
			}

			const message = racer.type === "window" ? racer.message : await handle.result;

			waitingUI.dismiss();
			await waitingUI.promise;
			handle.close();

			if (message == null || message.type === "cancel") {
				ctx.ui.notify("Review cancelled.", "info");
				return;
			}

			const data = await handle.data;
			const prompt = composeReviewPrompt(data.files, message);
			ctx.ui.setEditorText(prompt);
			ctx.ui.notify("Inserted review feedback into the editor.", "info");
		} catch (error) {
			activeWaitingUIDismiss?.();
			handle.close();
			const errMsg = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Review failed: ${errMsg}`, "error");
		} finally {
			if (activeHandle === handle) {
				activeHandle = null;
			}
		}
	}

	pi.registerCommand("diff-review", {
		description: "Open a native review window with git diff, last commit, and all files scopes. Optional: /diff-review <base-branch>",
		handler: async (args, ctx) => {
			const baseBranch = args?.trim() || undefined;
			await review(ctx, baseBranch);
		},
	});

	pi.on("session_shutdown", async () => {
		activeWaitingUIDismiss?.();
		closeActive();
	});
}
