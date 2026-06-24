# pi-diff-review-wsl

Adds a `/diff-review` command to [pi](https://pi.dev) that opens a native diff review window. The original extension works on macOS, Linux, and Windows. This fork specifically handles the **WSL2 + Windows** case where the pi agent runs in WSL2 but the native window must render on the Windows desktop via WebView2.

## Supported runtimes

This fork works in three ways. In all of them the composed feedback is collected from the native review window and handed back to your editor, chat box, clipboard, or stdout.

- **pi** — install the extension, then type `/diff-review` in the pi editor. The composed feedback is inserted directly into the editor. See [Install](#install) and [Usage](#usage).
- **opencode** — from the repo root, run `opencode` and type `/diff-review` (or `/diff-review <base>`) in the TUI. The composed feedback is inserted into the chat box as a draft. See [opencode support](#opencode-support).
- **Standalone CLI** — run outside any AI agent. `diff-review clip` copies the prompt to your clipboard; `diff-review open` writes it to stdout for an agent harness to ingest. See [Standalone CLI](#standalone-cli).

```bash
# CLI quick start (from this repo)
npm install && npm run build && npm link
diff-review clip              # review uncommitted changes; copy prompt to clipboard
diff-review open --base dev   # agent mode: prompt on stdout, exit 0 only on submit-with-content
```

## What it does

- Opens a native review window
- Lets you switch between `git diff`, `last commit`, `commit`, and `all files` scopes
- Shows a collapsible sidebar with fuzzy file search
- Shows git status markers in the sidebar
- Lazy-loads file contents on demand (with an LRU cache + next-file prefetch)
- Lets you draft comments on the original, modified, or file level
- Hands the resulting feedback prompt back to the host (editor / chat box / clipboard / stdout)

## Pure human-input device (behavioral spec)

**The tool never triggers an LLM.** It is a pure human-input device: it produces a *draft* prompt for the human, and every binding must be able to abort the slash-command's default LLM trigger.

- **Submit with content** → the composed markdown prompt is delivered (editor insertion / chat-box draft / clipboard / stdout) and the command proceeds.
- **Cancel, close, or submit-empty** → no prompt is produced and **no LLM call is made** in any binding.
  - pi: returns early from the command handler before any model call.
  - opencode: throws `__DIFF_REVIEW_ABORT__` from `command.execute.before` to short-circuit the command's automatic LLM call (`TODO: replace with a clean abort when opencode exposes one`).
  - CLI `open`: writes nothing to stdout and exits non-zero.

## How it works on WSL2

The original extension imports `glimpseui` directly, which on WSL2 tries to use the Linux backend. In many WSL2 setups the Linux backend cannot open a stable window.

This fork ships a platform shim (`src/platform/wsl-glimpse.ts`) that:

1. Detects WSL2 at runtime.
2. When running in WSL2, it installs `glimpseui` into a Windows directory (`C:\temp\pi-wsl-glimpse`) if it is not already there.
3. Spawns a Windows `node.exe` process that opens the Glimpse window using the native Windows WebView2 backend.
4. Streams the Glimpse JSON Lines protocol over stdin/stdout between the WSL2 extension and the Windows host.

When not running in WSL2, the shim re-exports `glimpseui` directly, so the behavior on macOS, Linux, and native Windows is unchanged.

> The shim is **frozen** for this refactor — no new features. A separate, deferred effort is to upstream (or fork) the taskbar fix + `loadFile`-over-`NavigateToString` into glimpseui, after which `platform/wsl-glimpse.ts` can shrink to a one-line `glimpse.open()`.

## Prerequisites

All platforms require:
- A **git repository** in the current working directory
- **No internet access required** — the review UI ships vendored Tailwind + Monaco in `web/vendor/` and runs fully offline.

Platform-specific requirements below.

---

### Native Linux (Fedora, Ubuntu, Arch, etc.)

The extension uses [glimpseui](https://github.com/nickvdyck/glimpseui)'s Chromium CDP backend on native Linux.

| Dependency | Required? | Notes |
|---|---|---|
| **Chromium** | Yes | Auto-downloaded to `~/.cache/pi-diff-review/chromium/` on first run if not found on `PATH`. You can also install it system-wide. |
| **xdotool** | Recommended | Used for window positioning, floating, and focus management. Without it the window still opens but may not position correctly. |

**Option A — Let it auto-download (zero setup):** just run `/diff-review`.

**Option B — Install system Chromium + xdotool:**

```bash
# Fedora
sudo dnf install -y chromium xdotool
# Ubuntu / Debian
sudo apt install -y chromium-browser xdotool
# Arch
sudo pacman -S chromium xdotool
```

**Option C — Point to a custom Chromium binary:**

```bash
export GLIMPSE_CHROME_PATH=/path/to/your/chrome-or-chromium
```

---

### WSL2 (Windows Subsystem for Linux)

The extension detects WSL2 at runtime and routes the window through Windows Node.js + WebView2 so it renders natively on the Windows desktop.

| Dependency | Where | How to check |
|---|---|---|
| **Node.js for Windows** | `C:\Program Files\nodejs\node.exe` | `powershell.exe -Command "node --version"` |
| **.NET 8 SDK** (or newer) | Windows | `powershell.exe -Command "dotnet --list-sdks"` |
| **WebView2 Runtime** | Windows | Pre-installed on Windows 10/11 |

**Install missing dependencies:**

1. **Node.js for Windows** — <https://nodejs.org> (the Windows build, not the WSL Linux version).
2. **.NET 8 SDK** — <https://dotnet.microsoft.com/download/dotnet/8.0>.
3. **WebView2 Runtime** — already present on Windows 10/11.

**First-run note:** the first `/diff-review` in WSL2 installs `glimpseui` into `C:\temp\pi-wsl-glimpse` and builds the Windows native host (30–60s). Subsequent runs are fast.

---

### macOS

Uses glimpseui's native Swift/WebKit backend. No extra dependencies — just install and run.

## Install

> **Important:** Do not install this alongside the original `pi-diff-review`. Both register the `/diff-review` command and will conflict.

```bash
pi install git:https://github.com/YOUR_USERNAME/pi-diff-review-wsl
# or locally:
pi install .
```

If you previously installed the original, remove it first:

```bash
pi remove git:https://github.com/badlogic/pi-diff-review
```

## Usage

Inside a git repository in pi:

```
/diff-review
/diff-review dev        # review current branch against base branch `dev`
```

## Standalone CLI

Run diff-review directly from your shell, outside any AI agent.

### Subcommands

- `diff-review clip [--base <branch>]` — **human mode (default).** Opens the window; on submit copies the prompt to the clipboard. Cancel/close just prints "cancelled".
- `diff-review open [--base <branch>] [--out <path>]` — **agent mode.** Opens the window; on submit-with-content writes the raw markdown prompt to stdout (or `--out <path>`) and exits `0`. On cancel/close/empty/error writes **nothing** to stdout, logs to stderr, and exits **non-zero**. Never calls an LLM.

`--base` replaces the old positional branch argument.

### Run locally / install globally

```bash
cd /home/danny/personal/projects/pi-diff-review-wsl
npm install
npm run build     # compile to dist/
npm link          # makes `diff-review` available globally

diff-review clip --base main
diff-review open --base main --out /tmp/review.md
```

### Clipboard requirements (clip mode)

- **WSL2 / Windows**: `clip.exe` or PowerShell is used automatically.
- **macOS**: `pbcopy` is built-in.
- **Linux**: install one of `xclip`, `wl-copy` (Wayland), or `xsel`. The CLI tries them in that order.

## Reviewing against a specific base branch

By default, `diff-review` shows only uncommitted changes on the current branch (working tree vs `HEAD`).

To review the entire feature branch against a different base branch (e.g. `dev` or `main`):

```
/diff-review dev          # pi / opencode
diff-review open --base dev   # CLI
```

This compares `HEAD` against the merge base of `dev` and shows all commits and files introduced on the feature branch.

## Architecture

The package is split into three layers:

- `src/core/` — agent-agnostic. The git pipeline (`Exec` is injected, not pulled from any specific runtime), prompt composer, window orchestrator, and wire protocol. No `pi-coding-agent`, `pi-tui`, or `@opencode-ai/*` imports.
- `src/platform/` — platform shim. `wsl-glimpse.ts` (frozen) wraps glimpse for WSL2; `resolve-web-dir.ts` locates the packaged `web/` directory in both source and `dist` layouts and produces a webview-loadable path (UNC on WSL, plain path elsewhere).
- `src/bindings/{pi,opencode,cli}.ts` — thin host-specific adapters. Only these files import host SDKs.

Any other agentic tool (Claude Code, Codex, …) can drop in its own binding by importing from `src/core/index.js` and supplying its own `Exec`. `src/index.ts` is a barrel re-exporting the core for direct consumers.

### Module layout

```
src/
  index.ts                      # root barrel
  core/
    index.ts                    # public API barrel
    types.ts                    # domain + wire-protocol types
    prompt.ts                   # composeReviewPrompt
    git/
      types.ts                  # Exec / ExecOptions / ExecResult contract
      repo.ts                   # getRepoRoot, hasHead, resolveBranch, getMergeBase, runGit
      parse.ts                  # parseNameStatus, parseCommitLog, parseCommitLogWithNameStatus (pure)
      contents.ts               # loadReviewFileContents + LRU cache + prefetch
      index.ts                  # getReviewWindowData (the pipeline; one git log --name-status)
    window/
      protocol.ts               # handshake + message type guards
      orchestrator.ts           # openReviewWindow / openReviewWindowWithData + {data, result, close}
    ui.ts                       # buildPlaceholderHtml (real page loaded via loadFile)
  platform/
    wsl-glimpse.ts              # FROZEN — WSL2 detection + Windows routing
    resolve-web-dir.ts          # resolveWebDir() / resolveLoadFilePath()
  bindings/
    pi.ts                       # pi adapter
    opencode.ts                 # opencode adapter (keeps abort hack w/ TODO)
    cli.ts                      # CLI: open (agent stdout) + clip (human clipboard)
web/
  index.html                    # references ./vendor/* relatively; data via channel
  app.js                        # sectioned, no build step
  vendor/                       # vendored Monaco 0.52.2 + Tailwind browser build (committed)
bin/diff-review                 # entry shim (dist, with tsx fallback)
scripts/
  vendor.mjs                    # re-fetch/upgrade vendored assets
  dev-window.ts                 # manual verification: fake dataset + fake Exec → open window
```

### Data lifecycle (channel-based)

The window opens immediately and shows a loading state. The webview posts a `ready` message; the orchestrator gathers the git data (if not pre-supplied) and sends `init` then `files` over the message channel. File contents are fetched lazily via `request-file` → `file-data`, through an LRU cache (cap ~40) with next-file-in-sidebar prefetch. No data is inlined into the HTML.

### Web assets

Tailwind and Monaco are vendored into `web/vendor/` (committed; ~15MB) and referenced relatively from `index.html`, which is loaded via glimpse's `loadFile` from the on-disk `web/` directory. This retires the `NavigateToString` size limit and removes all CDN calls at runtime and install. Re-vendor or upgrade with `npm run vendor`.

## Development

```bash
npm run check        # tsgo --noEmit across the new layout
npm run build        # compile to dist/
npm run vendor       # re-fetch/upgrade vendored Monaco + Tailwind into web/vendor/
npm run dev:window   # open the review window against a fake dataset + fake Exec (manual verification)
```

`scripts/dev-window.ts` builds a 2-file fake `ReviewWindowData`, a fake `Exec` that returns fixture contents for `git show`, and opens `openReviewWindowWithData`. Use it to verify UI changes without a real repo.

## opencode support

To run the opencode binding locally:

1. Make sure opencode's local plugin deps are present:
   ```bash
   cd .opencode && bun add @opencode-ai/plugin
   ```
2. From the repo root, start opencode: `opencode`
3. Type `/diff-review` (or `/diff-review main`) in the TUI.

The plugin's `command.execute.before` hook fires for `diff-review`, opens the native Glimpse window, awaits submit/cancel, then inserts the composed feedback into the opencode chat box as a draft. The command's automatic LLM call is aborted (`__DIFF_REVIEW_ABORT__`) until opencode exposes a clean abort API.

## Fixes and workarounds

### Offline / no CDN

The review UI loads Tailwind and Monaco from `web/vendor/` (committed to the repo), not from CDNs. The window page is loaded via `loadFile` against the on-disk `web/index.html`, so relative `./app.js` and `./vendor/…` references resolve from disk. On WSL the web directory is reached via a `\\wsl.localhost\<distro>\…` UNC path that WebView2 resolves (and which keeps vendor assets same-origin).

### WebView2 `NavigateToString` size limit (Windows / WSL2)

Large diffs used to exceed WebView2's `NavigateToString` limit. This is now moot: the HTML loaded is the small static `index.html` (no inlined data), and all data flows over the message channel.

### Brief dark placeholder / flicker on open

The window first shows a tiny dark placeholder while `loadFile` swaps in the real page. The placeholder background matches the review app, so the flash is minimal.

## Packaging as a pi extension

```json
{
  "name": "pi-diff-review-wsl",
  "keywords": ["pi-package"],
  "pi": { "extensions": ["./src/bindings/pi.ts"] },
  "bin": { "diff-review": "./bin/diff-review" },
  "files": ["bin", "dist", "src", "types", "web"]
}
```

`web` (including `web/vendor/`) is shipped in `files`; there is no `postinstall` and no runtime download.

## Adapted from

A WSL2-adapted fork of [pi-diff-review](https://github.com/badlogic/pi-diff-review) by Mario Zechner.
