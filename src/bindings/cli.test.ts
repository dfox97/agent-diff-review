import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli.js";

describe("parseArgs", () => {
	it("parses subcommands, positional base, and valued flags", () => {
		expect(parseArgs(["open", "feature", "--out", "review.md"])).toEqual({
			subcommand: "open",
			baseBranch: "feature",
			outPath: "review.md",
			help: false,
			errors: [],
		});
		expect(parseArgs(["clip", "--base=main"])).toEqual({
			subcommand: "clip",
			baseBranch: "main",
			outPath: undefined,
			help: false,
			errors: [],
		});
	});

	it("reports unknown flags", () => {
		expect(parseArgs(["--bogus"]).errors).toEqual(["Unknown flag: --bogus"]);
	});

	it("reports missing --base and --out values", () => {
		expect(parseArgs(["open", "--base", "--out="]).errors).toEqual([
			"Missing value for --base.",
			"Missing value for --out.",
		]);
	});
});
