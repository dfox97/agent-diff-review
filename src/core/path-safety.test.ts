import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { joinRepoPath, requireSafeRepoRelativePath } from "./path-safety.js";

describe("requireSafeRepoRelativePath", () => {
	it("normalizes safe relative paths", () => {
		expect(requireSafeRepoRelativePath(" src\\app.ts ")).toBe("src/app.ts");
	});

	it("rejects empty, absolute, traversal, home, and NUL paths", () => {
		for (const value of ["", "   ", "/etc/passwd", "~/secret", "../secret", "src/../../secret", "a\0b"]) {
			expect(() => requireSafeRepoRelativePath(value)).toThrow(/unsafe|Path is required/);
		}
	});
});

describe("joinRepoPath", () => {
	it("joins safe paths to the repo root", async () => {
		const repo = await mkdtemp(join(tmpdir(), "diff-review-path-"));
		await writeFile(join(repo, "file.txt"), "ok");
		expect(joinRepoPath(repo, "file.txt")).toBe(join(repo, "file.txt"));
	});

	it("rejects traversal through path syntax", async () => {
		const repo = await mkdtemp(join(tmpdir(), "diff-review-path-"));
		expect(() => joinRepoPath(repo, "../outside.txt")).toThrow(/unsafe/);
	});

	it("does not reject symlink path itself; callers can decide whether to follow it", async () => {
		const repo = await mkdtemp(join(tmpdir(), "diff-review-path-"));
		const outside = join(await mkdtemp(join(tmpdir(), "diff-review-outside-")), "secret.txt");
		await writeFile(outside, "secret");
		await symlink(outside, join(repo, "link.txt"));
		expect(joinRepoPath(repo, "link.txt")).toBe(join(repo, "link.txt"));
	});
});
