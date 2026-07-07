import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadReviewFileContents } from "./contents.js";
import type { Exec } from "./types.js";
import type { ReviewFile } from "../types.js";

const exec: Exec = async () => ({ code: 1, stdout: "", stderr: "" });

function file(path: string): ReviewFile {
	return {
		id: path,
		path,
		worktreeStatus: null,
		hasWorkingTreeFile: true,
		inGitDiff: false,
		inLastCommit: false,
		gitDiff: null,
		lastCommit: null,
		commitComparisons: {},
	};
}

describe("loadReviewFileContents all-files working tree reads", () => {
	it("loads regular files", async () => {
		const repo = await mkdtemp(join(tmpdir(), "diff-review-contents-"));
		await writeFile(join(repo, "a.txt"), "hello");
		expect(await loadReviewFileContents(exec, repo, file("a.txt"), "all-files")).toEqual({
			originalContent: "hello",
			modifiedContent: "hello",
		});
	});

	it("omits symlinks instead of following them", async () => {
		const repo = await mkdtemp(join(tmpdir(), "diff-review-contents-"));
		const outsideDir = await mkdtemp(join(tmpdir(), "diff-review-secret-"));
		const outsidePath = join(outsideDir, "secret.txt");
		await writeFile(outsidePath, "TOP-SECRET-CONTENT");
		await symlink(outsidePath, join(repo, "link.txt"));
		const result = await loadReviewFileContents(exec, repo, file("link.txt"), "all-files");
		expect(result.originalContent).toBe("[link.txt omitted from review: symlink]");
		expect(result.originalContent).not.toContain("TOP-SECRET-CONTENT");
		expect(result.modifiedContent).toBe(result.originalContent);
	});

	it("omits large files", async () => {
		const repo = await mkdtemp(join(tmpdir(), "diff-review-contents-"));
		await writeFile(join(repo, "large.txt"), "x".repeat(1_000_001));
		const result = await loadReviewFileContents(exec, repo, file("large.txt"), "all-files");
		expect(result.originalContent).toBe("[large.txt omitted from review: file is larger than 1000000 bytes]");
	});
});
