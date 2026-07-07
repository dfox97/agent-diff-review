import { describe, expect, it } from "vitest";
import {
	parseCommitLog,
	parseCommitLogWithNameStatus,
	parseNameStatus,
	parseTrackedPaths,
	parseUntrackedPaths,
} from "./parse.js";

describe("parseNameStatus", () => {
	it("parses modified, added, deleted, renamed, and copied entries", () => {
		expect(parseNameStatus([
			"M\tsrc/app.ts",
			"A\tsrc/new.ts",
			"D\tsrc/old.ts",
			"R100\tsrc/before.ts\tsrc/after.ts",
			"C087\tsrc/source.ts\tsrc/copy.ts",
		].join("\n"))).toEqual([
			{ status: "modified", oldPath: "src/app.ts", newPath: "src/app.ts" },
			{ status: "added", oldPath: null, newPath: "src/new.ts" },
			{ status: "deleted", oldPath: "src/old.ts", newPath: null },
			{ status: "renamed", oldPath: "src/before.ts", newPath: "src/after.ts" },
			{ status: "modified", oldPath: "src/source.ts", newPath: "src/copy.ts" },
		]);
	});

	it("ignores empty and malformed lines", () => {
		expect(parseNameStatus("\nX\tunknown\nM\nA\tsrc/new.ts\n")).toEqual([
			{ status: "added", oldPath: null, newPath: "src/new.ts" },
		]);
	});
});

describe("path list parsers", () => {
	it("parses untracked paths as added changes", () => {
		expect(parseUntrackedPaths("a.txt\n\nfolder/b.ts\n")).toEqual([
			{ status: "added", oldPath: null, newPath: "a.txt" },
			{ status: "added", oldPath: null, newPath: "folder/b.ts" },
		]);
	});

	it("parses tracked path output", () => {
		expect(parseTrackedPaths("a.txt\r\n\r\nfolder/b.ts\r\n")).toEqual(["a.txt", "folder/b.ts"]);
	});
});

describe("commit log parsers", () => {
	it("parses commit log subjects containing tabs", () => {
		expect(parseCommitLog("abc123\tabc\tfeat:\twith tab\n")).toEqual([
			{ sha: "abc123", shortSha: "abc", subject: "feat:\twith tab" },
		]);
	});

	it("parses combined git log --name-status output", () => {
		const first = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		const second = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
		const output = [
			`${first}\taaaaaaa\tfeat: first`,
			"",
			"M\tsrc/app.ts",
			"R100\told-name.ts\tnew-name.ts",
			`${second}\tbbbbbbb\tfix:\tsubject with tab`,
			"A\tadded.ts",
			"malformed",
			"D\tdeleted.ts",
		].join("\n");

		expect(parseCommitLogWithNameStatus(output)).toEqual([
			{
				sha: first,
				shortSha: "aaaaaaa",
				subject: "feat: first",
				changes: [
					{ status: "modified", oldPath: "src/app.ts", newPath: "src/app.ts" },
					{ status: "renamed", oldPath: "old-name.ts", newPath: "new-name.ts" },
				],
			},
			{
				sha: second,
				shortSha: "bbbbbbb",
				subject: "fix:\tsubject with tab",
				changes: [
					{ status: "added", oldPath: null, newPath: "added.ts" },
					{ status: "deleted", oldPath: "deleted.ts", newPath: null },
				],
			},
		]);
	});
});
