import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, chmodSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isWSL } from "../platform/wsl-glimpse.js";

/**
 * Open a worktree file in Neovim (or `$EDITOR`).
 *
 * The review window runs inside a Glimpse webview whose host process has no
 * usable TTY, so we can't just `spawn("nvim", …)` — it would have nowhere to
 * render. Instead we pick a launcher in this order:
 *
 *   1. `DIFF_REVIEW_EDITOR_CMD` — a custom shell command string with `%file`
 *      and `%line` placeholders. Total escape hatch.
 *   2. tmux, when `$TMUX` is set and the `tmux` binary is on `PATH`. The host
 *      process inherits the user's tmux socket, so the editor opens inside the
 *      user's *current* tmux session — no separate terminal emulator needed,
 *      works identically on WSL2 and native Linux. This is the common case
 *      because pi/opencode run inside tmux. By default it splits the current
 *      window (`tmux split-window`) so the editor appears next to pi; set
 *      `DIFF_REVIEW_TMUX_MODE=popup` for a floating overlay or `=window` for
 *      a separate tmux window.
 *   3. WSL2 without tmux → Windows Terminal (`wt.exe`) running `wsl bash …`.
 *   4. macOS without tmux → Terminal.app via `osascript`.
 *   5. Linux without tmux → first available terminal emulator.
 *
 * Override the editor binary with `DIFF_REVIEW_EDITOR` / `PI_DIFF_REVIEW_EDITOR`
 * / `EDITOR` (defaults to `nvim`).
 */

export interface OpenEditorOptions {
	repoRoot: string;
	/** Path of the working-tree file to open, relative to `repoRoot`. */
	relPath: string;
	/** 1-based line to jump to (`nvim +<line>`). Omit to open at the top. */
	line?: number;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveEditor(): string {
	return (
		process.env.DIFF_REVIEW_EDITOR ||
		process.env.PI_DIFF_REVIEW_EDITOR ||
		process.env.EDITOR ||
		"nvim"
	);
}

function commandExists(command: string): boolean {
	try {
		const result = spawnSync("which", [command], { stdio: "ignore" });
		return result.status === 0;
	} catch {
		return false;
	}
}

function spawnDetached(command: string, args: string[]): void {
	try {
		const child = spawn(command, args, {
			detached: true,
			stdio: "ignore",
			windowsHide: false,
		});
		child.on("error", () => {
			/* best-effort */
		});
		child.unref();
	} catch {
		/* ignore */
	}
}

function launchWithCustomTemplate(template: string, absPath: string, line: number | undefined): void {
	const filled = template
		.replace(/%file/g, shellQuote(absPath))
		.replace(/%line/g, line && line > 0 ? String(line) : "");
	spawnDetached("sh", ["-c", filled]);
}

// ---- tmux -----------------------------------------------------------------

/**
 * How to open the editor inside tmux:
 *   - "split"  → `tmux split-window` (default): new pane in the *same* window
 *     as pi, so the editor is right next to the TUI.
 *   - "popup"  → `tmux popup` (tmux 3.2+): floating overlay on the current
 *     pane; closes automatically when the editor exits, leaving pi untouched.
 *   - "window" → `tmux new-window`: a separate tmux window in the session.
 *
 * Override with `DIFF_REVIEW_TMUX_MODE`. Defaults to "split".
 */
function resolveTmuxMode(): "split" | "popup" | "window" {
	const raw = (
		process.env.DIFF_REVIEW_TMUX_MODE ||
		process.env.PI_DIFF_REVIEW_TMUX_MODE ||
		"split"
	).toLowerCase();
	if (raw === "popup" || raw === "window") return raw;
	return "split";
}

/**
 * Open the editor inside the current tmux session. Returns true if it
 * attempted the launch (i.e. tmux looks usable), false to fall through to
 * other launchers.
 */
function launchTmux(editor: string, absPath: string, line: number | undefined): boolean {
	if (!process.env.TMUX) return false;
	if (!commandExists("tmux")) return false;

	const dir = dirname(absPath);
	const lineArg = line && line > 0 ? `+${line}` : "";
	const mode = resolveTmuxMode();

	let args: string[];
	switch (mode) {
		case "popup":
			// `-E` closes the popup automatically when the command exits, so quitting
			// the editor returns focus to pi with no leftover pane. `-C` centers it;
			// `-w`/`-h` size it to ~90% of the window.
			args = ["popup", "-d", dir, "-E", "-C", "-w", "90%", "-h", "90%"];
			break;
		case "window":
			args = ["new-window", "-c", dir];
			break;
		case "split":
		default:
			args = ["split-window", "-c", dir];
			break;
	}
	if (lineArg) args.push(editor, lineArg, absPath);
	else args.push(editor, absPath);

	spawnDetached("tmux", args);
	return true;
}

// ---- terminal-emulator fallbacks -----------------------------------------

function writeLauncherScript(editor: string, absPath: string, line: number | undefined): string {
	const dir = dirname(absPath);
	const lineArg = line && line > 0 ? `+${line}` : "";
	const script = `#!/usr/bin/env bash
cd ${shellQuote(dir)} 2>/dev/null || true
exec ${shellQuote(editor)}${lineArg ? ` ${lineArg}` : ""} ${shellQuote(absPath)}
`;

	const tmp = tmpdir();
	const scriptDir = join(tmp, "pi-diff-review");
	try {
		mkdirSync(scriptDir, { recursive: true });
	} catch {}
	const scriptPath = join(
		scriptDir,
		`open-nvim-${process.pid}-${Math.random().toString(36).slice(2, 10)}.sh`,
	);
	writeFileSync(scriptPath, script, "utf8");
	try {
		chmodSync(scriptPath, 0o755);
	} catch {}
	return scriptPath;
}

function launchWSL(scriptPath: string): void {
	let hasWt = false;
	try {
		const result = spawnSync("cmd.exe", ["/c", "where", "wt.exe"], { stdio: "ignore" });
		hasWt = result.status === 0;
	} catch {}

	if (hasWt) {
		const distro = process.env.WSL_DISTRO_NAME;
		const wslArgs = distro ? ["-d", distro, "bash", scriptPath] : ["bash", scriptPath];
		spawnDetached("cmd.exe", ["/c", "wt.exe", "wsl", ...wslArgs]);
		return;
	}

	console.error(
		"[diff-review] Windows Terminal (wt.exe) not found and tmux unavailable; cannot open Neovim from WSL. " +
			"Install Windows Terminal, run inside tmux, or set DIFF_REVIEW_EDITOR_CMD to a custom launcher.",
	);
}

function launchMac(scriptPath: string): void {
	const AppleScript = `tell application "Terminal"
	activate
	do script ${shellQuote(`bash ${shellQuote(scriptPath)}`)}
end tell`;
	spawnDetached("osascript", ["-e", AppleScript]);
}

interface LinuxTerminal {
	command: string;
	buildArgs: (scriptPath: string) => string[];
}

const LINUX_TERMINALS: LinuxTerminal[] = [
	{ command: "gnome-terminal", buildArgs: (s) => ["--", "bash", s] },
	{ command: "konsole", buildArgs: (s) => ["-e", "bash", s] },
	{ command: "xfce4-terminal", buildArgs: (s) => ["-x", "bash", s] },
	{ command: "alacritty", buildArgs: (s) => ["-e", "bash", s] },
	{ command: "kitty", buildArgs: (s) => ["bash", s] },
	{ command: "xterm", buildArgs: (s) => ["-e", "bash", s] },
];

function launchLinux(scriptPath: string): void {
	for (const term of LINUX_TERMINALS) {
		if (commandExists(term.command)) {
			spawnDetached(term.command, term.buildArgs(scriptPath));
			return;
		}
	}
	console.error(
		"[diff-review] No supported terminal emulator found (tried gnome-terminal, konsole, " +
			"xfce4-terminal, alacritty, kitty, xterm). Run inside tmux or set DIFF_REVIEW_EDITOR_CMD.",
	);
}

/**
 * Open `relPath` (relative to `repoRoot`) in Neovim. Best-effort: if no
 * launcher can be found, writes a hint to stderr and does nothing. Never
 * throws.
 */
export function openInEditor(options: OpenEditorOptions): void {
	const absPath = join(options.repoRoot, options.relPath);
	const line = options.line && options.line > 0 ? options.line : undefined;
	const editor = resolveEditor();

	const customCmd =
		process.env.DIFF_REVIEW_EDITOR_CMD || process.env.PI_DIFF_REVIEW_EDITOR_CMD;
	if (customCmd) {
		launchWithCustomTemplate(customCmd, absPath, line);
		return;
	}

	// Preferred path: tmux. The agent host process inherits the user's tmux
	// socket via $TMUX, so this opens the editor in the user's actual session
	// without needing a separate terminal emulator. Works on WSL2 too.
	if (launchTmux(editor, absPath, line)) return;

	// Fall back to a terminal-emulator launcher.
	const scriptPath = writeLauncherScript(editor, absPath, line);
	setTimeout(() => {
		try {
			unlinkSync(scriptPath);
		} catch {}
	}, 60_000);

	if (isWSL()) {
		launchWSL(scriptPath);
	} else if (process.platform === "darwin") {
		launchMac(scriptPath);
	} else {
		launchLinux(scriptPath);
	}
}
