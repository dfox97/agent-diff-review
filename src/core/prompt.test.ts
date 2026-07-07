import { describe, expect, it } from "vitest";
import { composeReviewPrompt } from "./prompt.js";
import type { ReviewFile, ReviewSubmitPayload } from "./types.js";

const files: ReviewFile[] = [
	{
		id: "file-1",
		path: "src/app.ts",
		worktreeStatus: "modified",
		hasWorkingTreeFile: true,
		inGitDiff: true,
		inLastCommit: true,
		gitDiff: {
			status: "modified",
			oldPath: "src/app.ts",
			newPath: "src/app.ts",
			displayPath: "src/app.ts",
			hasOriginal: true,
			hasModified: true,
		},
		lastCommit: {
			status: "renamed",
			oldPath: "src/old-app.ts",
			newPath: "src/app.ts",
			displayPath: "src/old-app.ts -> src/app.ts",
			hasOriginal: true,
			hasModified: true,
		},
		commitComparisons: {
			"1234567890abcdef": {
				status: "added",
				oldPath: null,
				newPath: "src/app.ts",
				displayPath: "src/app.ts",
				hasOriginal: false,
				hasModified: true,
			},
		},
	},
];

describe("composeReviewPrompt", () => {
	it("includes an overall-only note", () => {
		const payload: ReviewSubmitPayload = {
			type: "submit",
			overallComment: "  Please tighten this up.  ",
			comments: [],
		};

		expect(composeReviewPrompt(files, payload)).toBe([
			"Please address the following feedback",
			"",
			"Please tighten this up.",
		].join("\n"));
	});

	it("formats file and inline comments with scope-specific locations", () => {
		const payload: ReviewSubmitPayload = {
			type: "submit",
			overallComment: "",
			comments: [
				{
					id: "c1",
					fileId: "file-1",
					scope: "git-diff",
					side: "modified",
					startLine: 12,
					endLine: 15,
					body: "  Handle the error path.  ",
				},
				{
					id: "c2",
					fileId: "file-1",
					scope: "last-commit",
					side: "original",
					startLine: 3,
					endLine: 3,
					body: "Old name is clearer.",
				},
				{
					id: "c3",
					fileId: "file-1",
					scope: "all-files",
					side: "file",
					startLine: null,
					endLine: null,
					body: "File-level note.",
				},
			],
		};

		expect(composeReviewPrompt(files, payload)).toBe([
			"Please address the following feedback",
			"",
			"1. [git diff] src/app.ts:12-15 (new)",
			"   Handle the error path.",
			"",
			"2. [last commit] src/old-app.ts -> src/app.ts:3 (old)",
			"   Old name is clearer.",
			"",
			"3. [all files] src/app.ts",
			"   File-level note.",
		].join("\n"));
	});

	it("formats commit-scoped comments with shortened commit sha", () => {
		const payload: ReviewSubmitPayload = {
			type: "submit",
			overallComment: "",
			comments: [
				{
					id: "c1",
					fileId: "file-1",
					scope: "commit",
					commitSha: "1234567890abcdef",
					side: "modified",
					startLine: 8,
					endLine: 8,
					body: "Commit-specific note.",
				},
			],
		};

		expect(composeReviewPrompt(files, payload)).toContain("1. [commit 1234567890ab] src/app.ts:8 (new)");
	});
});
