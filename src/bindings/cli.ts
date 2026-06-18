/**
 * Standalone CLI binding for the agent-agnostic diff-review core.
 *
 * Usage:
 *   diff-review [base-branch]
 *
 * The review window opens outside of any AI agent. When you submit, the
 * composed feedback prompt is copied to the system clipboard instead of
 * being inserted into an editor or chat box.
 */

import { spawn } from "node:child_process";
import {
	composeReviewPrompt,
	getReviewWindowData,
	isWSL,
	openReviewWindow,
	type Exec,
	type ExecResult,
} from "../core/index.js";

function execWithStdin(cmd: string, args: string[], stdin: string): Promise<ExecResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (data: Buffer) => {
			stdout += data.toString("utf8");
		});

		child.stderr.on("data", (data: Buffer) => {
			stderr += data.toString("utf8");
		});

		child.on("error", (err) => {
			// Surface missing binaries as a 127-style result so callers get the
			// same shape they would for a normal shell failure.
			if ("code" in err && err.code === "ENOENT") {
				resolve({ code: 127, stdout: "", stderr: err.message });
				return;
			}
			reject(err);
		});

		child.on("close", (code) => {
			resolve({ code: code ?? 0, stdout, stderr });
		});

		child.stdin.write(stdin, "utf8");
		child.stdin.end();
	});
}

function makeExec(): Exec {
	return async (cmd, args, opts): Promise<ExecResult> => {
		return new Promise((resolve, reject) => {
			const child = spawn(cmd, args, { cwd: opts.cwd });
			let stdout = "";
			let stderr = "";

			child.stdout.on("data", (data: Buffer) => {
				stdout += data.toString("utf8");
			});

			child.stderr.on("data", (data: Buffer) => {
				stderr += data.toString("utf8");
			});

			child.on("error", (err) => {
				if ("code" in err && err.code === "ENOENT") {
					resolve({ code: 127, stdout: "", stderr: err.message });
					return;
				}
				reject(err);
			});

			child.on("close", (code) => {
				resolve({ code: code ?? 0, stdout, stderr });
			});
		});
	};
}

async function tryCopy(cmd: string, args: string[], text: string): Promise<boolean> {
	try {
		const result = await execWithStdin(cmd, args, text);
		return result.code === 0;
	} catch {
		return false;
	}
}

async function copyToClipboard(text: string): Promise<void> {
	const wsl = isWSL();

	if (wsl) {
		if (await tryCopy("clip.exe", [], text)) return;
		if (await tryCopy("powershell.exe", ["-Command", "$input | Set-Clipboard"], text)) return;
	}

	if (process.platform === "win32") {
		if (await tryCopy("clip", [], text)) return;
		if (await tryCopy("powershell.exe", ["-Command", "$input | Set-Clipboard"], text)) return;
	}

	if (process.platform === "darwin") {
		if (await tryCopy("pbcopy", [], text)) return;
	}

	if (process.platform === "linux" || wsl) {
		if (process.env.WAYLAND_DISPLAY && (await tryCopy("wl-copy", [], text))) return;
		if (await tryCopy("xclip", ["-selection", "clipboard"], text)) return;
		if (await tryCopy("xsel", ["--clipboard", "input"], text)) return;
	}

	throw new Error(
		"Could not copy to clipboard. " +
			"On Linux install xclip, wl-copy, or xsel; on macOS use pbcopy; on Windows/WSL clip.exe or PowerShell should be available.",
	);
}

function printUsage(): void {
	console.log("Usage: diff-review [base-branch]");
	console.log("");
	console.log("Open a native diff review window for the current git repository.");
	console.log("When you submit the review, the composed feedback is copied to the clipboard.");
	console.log("");
	console.log("Examples:");
	console.log("  diff-review          review uncommitted changes");
	console.log("  diff-review main     review the feature branch against main");
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.includes("--help") || args.includes("-h")) {
		printUsage();
		return;
	}

	const baseBranch = args[0]?.trim() || undefined;
	const cwd = process.cwd();
	const exec = makeExec();

	let data;
	try {
		data = await getReviewWindowData(exec, cwd, baseBranch);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Error: ${message}`);
		process.exit(1);
	}

	if (data.files.length === 0) {
		console.log("No reviewable files found.");
		return;
	}

	console.log("Opening diff review window...");

	const handle = openReviewWindow(exec, data, {
		width: 1680,
		height: 1020,
		title: "diff review",
	});

	try {
		const message = await handle.result;
		if (message == null || message.type === "cancel") {
			console.log("Review cancelled.");
			return;
		}

		const prompt = composeReviewPrompt(data.files, message);
		await copyToClipboard(prompt);
		console.log("Review feedback copied to clipboard.");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Review failed: ${message}`);
		process.exit(1);
	} finally {
		handle.close();
	}
}

void main();
