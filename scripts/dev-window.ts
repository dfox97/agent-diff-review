/**
 * Manual verification harness (Q12). Fakes a `ReviewWindowData` (2 files with
 * original/modified content + a fake commit) and a fake `Exec` that returns
 * fixture contents for `git show` calls, then opens the real review window via
 * `openReviewWindowWithData` and logs every host → webview message.
 *
 * Run: `npm run dev:window`
 */
import { openReviewWindowWithData, type Exec, type ExecResult, type ReviewWindowData } from "../src/core/index.js";

const FIXTURES: Record<string, string> = {
	"HEAD^:src/app.ts": [
		"function greet(name) {",
		"  return 'hello ' + name;",
		"}",
		"",
		"module.exports = { greet };",
	].join("\n"),
	"HEAD:src/app.ts": [
		"function greet(name) {",
		"  if (!name) throw new Error('name required');",
		"  return `hello ${name}`;",
		"}",
		"",
		"export { greet };",
	].join("\n"),
	"HEAD^:docs/guide.md": [
		"# Guide",
		"",
		"## Setup",
		"",
		"Run `npm install`.",
	].join("\n"),
	"HEAD:docs/guide.md": [
		"# Guide",
		"",
		"## Setup",
		"",
		"Run `npm install` then `npm run build`.",
		"",
		"## Usage",
		"",
		"See the README.",
	].join("\n"),
};

const fakeExec: Exec = async (cmd, args): Promise<ExecResult> => {
	if (cmd !== "git") {
		return { code: 127, stdout: "", stderr: `fake exec: unknown command ${cmd}` };
	}
	// The only git calls the content cache makes are `git show <rev>:<path>`.
	const showArg = args.find((arg) => arg.includes(":"));
	if (args[0] === "show" && showArg != null) {
		const content = FIXTURES[showArg];
		if (content != null) return { code: 0, stdout: content, stderr: "" };
		return { code: 1, stdout: "", stderr: `fake exec: no fixture for git show ${showArg}` };
	}
	return { code: 0, stdout: "", stderr: "" };
};

const data: ReviewWindowData = {
	repoRoot: "/fake/repo",
	baseBranch: "main",
	mergeBase: "main",
	files: [
		{
			id: "src/app.ts::gone::src/app.ts::src/app.ts",
			path: "src/app.ts",
			worktreeStatus: null,
			hasWorkingTreeFile: false,
			inGitDiff: false,
			inLastCommit: true,
			gitDiff: null,
			lastCommit: {
				status: "modified",
				oldPath: "src/app.ts",
				newPath: "src/app.ts",
				displayPath: "src/app.ts",
				hasOriginal: true,
				hasModified: true,
			},
			commitComparisons: {},
		},
		{
			id: "docs/guide.md::gone::docs/guide.md::docs/guide.md",
			path: "docs/guide.md",
			worktreeStatus: null,
			hasWorkingTreeFile: false,
			inGitDiff: false,
			inLastCommit: true,
			gitDiff: null,
			lastCommit: {
				status: "modified",
				oldPath: "docs/guide.md",
				newPath: "docs/guide.md",
				displayPath: "docs/guide.md",
				hasOriginal: true,
				hasModified: true,
			},
			commitComparisons: {},
		},
	],
	commits: [{ sha: "abcdef0123456789abcdef0123456789abcdef01", shortSha: "abcdef0", subject: "fake: update app + guide" }],
};

console.log("[dev:window] opening review window with fake data…");
console.log("[dev:window] expected: window loads offline, last-commit scope shows 2 files, diffs render from fixtures.");

const handle = openReviewWindowWithData(fakeExec, data, { width: 1280, height: 800, title: "dev:window" });

try {
	const payload = await handle.result;
	if (payload == null) {
		console.log("[dev:window] window closed without submit.");
	} else if (payload.type === "cancel") {
		console.log("[dev:window] cancelled.");
	} else {
		console.log("[dev:window] submitted. overallComment=%j, comments=%d", payload.overallComment, payload.comments.length);
		console.log("---- prompt ----");
		const { composeReviewPrompt } = await import("../src/core/index.js");
		console.log(composeReviewPrompt(data.files, payload));
		console.log("---- end prompt ----");
	}
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[dev:window] error: ${message}`);
} finally {
	handle.close();
}
