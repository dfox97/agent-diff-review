import { beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
	spawn: vi.fn(),
	spawnSync: vi.fn(),
}));
const fsMocks = vi.hoisted(() => ({ existsSync: vi.fn(() => false) }));

vi.mock("node:child_process", () => childProcessMocks);
vi.mock("node:fs", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:fs")>()),
	existsSync: fsMocks.existsSync,
}));
vi.mock("../platform/wsl-glimpse.js", () => ({ isWSL: () => false }));

import { openInEditor } from "./editor.js";

describe("openInEditor", () => {
	beforeEach(() => {
		childProcessMocks.spawn.mockReset();
		childProcessMocks.spawnSync.mockReset();
		fsMocks.existsSync.mockReset();
		fsMocks.existsSync.mockReturnValue(false);
		childProcessMocks.spawn.mockReturnValue({ on: vi.fn(), unref: vi.fn() });
		delete process.env.DIFF_REVIEW_EDITOR_CMD;
		delete process.env.PI_DIFF_REVIEW_EDITOR_CMD;
		delete process.env.DIFF_REVIEW_EDITOR;
		delete process.env.PI_DIFF_REVIEW_EDITOR;
		delete process.env.EDITOR;
		delete process.env.HERDR_ENV;
		delete process.env.HERDR_PANE_ID;
		delete process.env.TMUX;
	});

	it("opens the file at the current line in a sibling Herdr pane", () => {
		process.env.HERDR_ENV = "1";
		process.env.HERDR_PANE_ID = "w1:p1";
		process.env.DIFF_REVIEW_EDITOR = "nvim";
		childProcessMocks.spawnSync
			.mockReturnValueOnce({ status: 0 })
			.mockReturnValueOnce({
				status: 0,
				stdout: JSON.stringify({ result: { pane: { pane_id: "w1:p2" } } }),
				stderr: "",
			})
			.mockReturnValueOnce({ status: 0, stdout: "", stderr: "" });

		openInEditor({ repoRoot: "/repo", relPath: "src/example.ts", line: 42 });

		expect(childProcessMocks.spawnSync).toHaveBeenNthCalledWith(
			1,
			"which",
			["herdr"],
			{ stdio: "ignore" },
		);
		expect(childProcessMocks.spawnSync).toHaveBeenNthCalledWith(
			2,
			"herdr",
			[
				"pane",
				"split",
				"w1:p1",
				"--direction",
				"right",
				"--cwd",
				"/repo/src",
				"--focus",
			],
			{ encoding: "utf8" },
		);
		expect(childProcessMocks.spawnSync).toHaveBeenNthCalledWith(
			3,
			"herdr",
			["pane", "run", "w1:p2", "exec 'nvim' +42 '/repo/src/example.ts'"],
			{ encoding: "utf8" },
		);
		expect(childProcessMocks.spawn).not.toHaveBeenCalled();
	});

	it("falls back to tmux when not running inside Herdr", () => {
		process.env.TMUX = "/tmp/tmux.sock";
		childProcessMocks.spawnSync
			.mockReturnValueOnce({ status: 1 })
			.mockReturnValueOnce({ status: 0 });

		openInEditor({ repoRoot: "/repo", relPath: "README.md" });

		expect(childProcessMocks.spawnSync).toHaveBeenCalledTimes(2);
		expect(childProcessMocks.spawn).toHaveBeenCalledWith(
			"tmux",
			["split-window", "-c", "/repo", "nvim", "/repo/README.md"],
			{
				detached: true,
				stdio: "ignore",
				windowsHide: false,
			},
		);
	});

	it("does not open a duplicate fallback when Herdr rejects the split", () => {
		process.env.HERDR_ENV = "1";
		process.env.HERDR_PANE_ID = "w1:p1";
		process.env.TMUX = "/tmp/tmux.sock";
		childProcessMocks.spawnSync
			.mockReturnValueOnce({ status: 0 })
			.mockReturnValueOnce({ status: 1, stdout: "", stderr: "no current pane" });
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

		openInEditor({ repoRoot: "/repo", relPath: "README.md" });

		expect(childProcessMocks.spawnSync).toHaveBeenCalledTimes(2);
		expect(childProcessMocks.spawn).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledWith(
			"[diff-review] Herdr could not create an editor pane: no current pane",
		);
		consoleError.mockRestore();
	});

	it("finds the focused Herdr pane by repository when pane environment is unavailable", () => {
		childProcessMocks.spawnSync
			.mockReturnValueOnce({ status: 0 })
			.mockReturnValueOnce({
				status: 0,
				stdout: JSON.stringify({
					result: {
						panes: [
							{ pane_id: "w2:p1", cwd: "/other", focused: true },
							{
								pane_id: "w1:p3",
								cwd: "/repo",
								foreground_cwd: "/repo",
								focused: true,
							},
						],
					},
				}),
				stderr: "",
			})
			.mockReturnValueOnce({
				status: 0,
				stdout: JSON.stringify({ result: { pane: { pane_id: "w1:p4" } } }),
				stderr: "",
			})
			.mockReturnValueOnce({ status: 0, stdout: "", stderr: "" });

		openInEditor({ repoRoot: "/repo", relPath: "README.md", line: 7 });

		expect(childProcessMocks.spawnSync).toHaveBeenNthCalledWith(
			2,
			"herdr",
			["pane", "list"],
			{ encoding: "utf8" },
		);
		expect(childProcessMocks.spawnSync).toHaveBeenNthCalledWith(
			3,
			"herdr",
			["pane", "split", "w1:p3", "--direction", "right", "--cwd", "/repo", "--focus"],
			{ encoding: "utf8" },
		);
		expect(childProcessMocks.spawnSync).toHaveBeenNthCalledWith(
			4,
			"herdr",
			["pane", "run", "w1:p4", "exec 'nvim' +7 '/repo/README.md'"],
			{ encoding: "utf8" },
		);
	});
});
