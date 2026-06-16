/**
 * opencode plugin binding for the agent-agnostic diff-review core.
 *
 * Two entry points, both funnelling through the same `runReviewFlow`:
 *
 *   1. A custom tool `diff_review` that the LLM can call.
 *   2. A `command.execute.before` hook so when the user types
 *      `/diff-review [base]` directly in the TUI, the diff window opens
 *      and the composed feedback is dropped into the chat box as a draft
 *      for the user to review and send — matching the pi binding's
 *      "insert into the editor" UX.
 */

import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { OpencodeClient } from "@opencode-ai/sdk";
import {
	composeReviewPrompt,
	getReviewWindowData,
	openReviewWindow,
	type Exec,
	type ExecResult,
} from "../core/index.js";

/**
 * Inlined scope for `Bun.spawn` so this binding remains the only file in the
 * project that depends on the Bun runtime. Full `Bun` typings live in
 * `@types/bun` (devDep) but are not pulled in here.
 */
declare const Bun: {
	spawn(
		cmd: string[],
		opts: { cwd?: string; stdout?: "pipe"; stderr?: "pipe" },
	): {
		stdout: ReadableStream;
		stderr: ReadableStream;
		exited: Promise<number>;
	};
};

/**
 * Adapt opencode's Bun runtime to the agent-agnostic `Exec` interface
 * defined in `core/git.ts`. Uses `Bun.spawn` directly (instead of Bun's
 * `$` shell) because git is invoked many times with structured stdout and
 * we want predictable `{code, stdout, stderr}` triples.
 */

function makeExec(): Exec {
	return async (cmd, args, opts): Promise<ExecResult> => {
		let proc;
		try {
			proc = Bun.spawn([cmd, ...args], {
				cwd: opts.cwd,
				stdout: "pipe",
				stderr: "pipe",
			});
		} catch (err) {
			// Bun.spawn throws synchronously if the binary can't be exec'd
			// (ENOENT, EACCES, …). Surface as a 127-style result so callers
			// see the same shape they see for any other failure.
			const message = err instanceof Error ? err.message : String(err);
			return { code: 127, stdout: "", stderr: message };
		}

		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		return { code: exitCode, stdout, stderr };
	};
}

type ReviewFlowResult =
	| { status: "prompt"; text: string }
	| { status: "cancel" }
	| { status: "empty"; reason: string };

/**
 * Single source of truth for the entire review session. Used by both the
 * custom tool and the command hook so behaviour is identical regardless
 * of how the user (or the LLM) triggered diff-review.
 */
async function runReviewFlow(
	exec: Exec,
	cwd: string,
	baseBranch?: string,
): Promise<ReviewFlowResult> {
	const data = await getReviewWindowData(exec, cwd, baseBranch);
	if (data.files.length === 0) {
		return { status: "empty", reason: "No reviewable files found." };
	}

	const handle = openReviewWindow(exec, data, {
		width: 1680,
		height: 1020,
		title: "opencode review",
	});

	try {
		const message = await handle.result;
		if (message == null || message.type === "cancel") {
			return { status: "cancel" };
		}
		return { status: "prompt", text: composeReviewPrompt(data.files, message) };
	} finally {
		handle.close();
	}
}

/**
 * Insert the composed review prompt into the opencode TUI chat box as a
 * draft. The user still has to press Enter to send it.
 */
async function insertPromptIntoChatBox(
	client: OpencodeClient,
	directory: string,
	prompt: string,
): Promise<void> {
	const query = { directory };
	await client.tui.clearPrompt({ query });
	await client.tui.appendPrompt({ query, body: { text: prompt } });
}

export const DiffReviewPlugin: Plugin = async (pluginInput: PluginInput) => {
	const exec = makeExec();
	const client = pluginInput.client;

	return {
		/**
		 * opencode fires this for any slash command the TUI executes. We
		 * narrow on `command === "diff-review"`, open the review window, and
		 * drop the composed feedback into the chat box as a draft. The
		 * command's own message parts are cleared so the LLM is not called
		 * until the user presses Enter.
		 */
		"command.execute.before": async (input, output) => {
			if (input.command !== "diff-review") return;

			const baseBranch = input.arguments?.trim() || undefined;
			const result = await runReviewFlow(exec, pluginInput.directory, baseBranch);

			if (result.status === "prompt") {
				await insertPromptIntoChatBox(client, pluginInput.directory, result.text);
			}

			// Prevent the slash command from sending a message automatically.
			output.parts = [];

			// Abort the LLM call. In opencode v1.3.0 there is no clean
			// way to prevent the command from calling the LLM after the hook.
			// Throwing short-circuits the execution and prevents any LLM call.
			throw new Error("__DIFF_REVIEW_ABORT__");
		},
	};
};
