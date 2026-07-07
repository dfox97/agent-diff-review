# Agent Diff Review

A small native diff-review window for AI coding agents and the command line.

It lets you review git changes yourself, write comments in a VS Code-like diff UI, and send the resulting markdown feedback back to your agent, clipboard, stdout, or editor.

**It never calls an LLM by itself.** It is a human-input tool that creates a prompt draft.

## What it does

- Opens a native review window for a git repo
- Shows changed files, last commit, commit history, or all files
- Supports inline comments on old/new lines and file-level notes
- Lazy-loads file contents for speed on large repos
- Returns one clean markdown feedback prompt
- Works with pi, opencode, Claude Code-style hooks, standalone CLI, and any agent that can run a command

## Install from this repo

```bash
npm install
npm run build
npm link
```

Then run it inside any git repository:

```bash
diff-review
```

## CLI usage

### Copy review feedback to clipboard

```bash
diff-review
# or
diff-review clip
```

Review current uncommitted changes and copy the final prompt to your clipboard.

### Review against a base branch

```bash
diff-review --base main
diff-review main
```

These compare your current branch against the merge base of `main`.

### Print prompt to stdout for agents

```bash
diff-review open --base main
```

Agent mode:

- submit with comments: writes markdown to stdout and exits `0`
- cancel, close, or submit empty: writes nothing and exits non-zero

Write to a file instead:

```bash
diff-review open --base main --out /tmp/review.md
```

## Agent usage

### pi

Install locally:

```bash
pi install .
```

Then inside pi:

```text
/diff-review
/diff-review main
```

### opencode

From this repo, run opencode and use:

```text
/diff-review
/diff-review main
```

### Claude Code / other agents

Use the CLI contract:

```bash
diff-review open --base main
```

Claude Code can also use this as a hook: run `diff-review open`, pass submitted stdout into the prompt/context, and block the turn when the command exits non-zero. This repo includes a `.claude/` example hook setup.

Any agentic tool can integrate by running that command and reading stdout. No special SDK is required.

## Platform support

- **macOS**: native window via Glimpse/WebKit
- **Linux**: native window via Glimpse/Chromium
- **Windows**: native window support through Glimpse
- **WSL2**: runs the agent in WSL and opens the native window on Windows using WebView2

WSL2 requirements:

- Windows Node.js installed at `C:\Program Files\nodejs\node.exe`
- .NET 8 SDK or newer on Windows
- WebView2 Runtime, usually already installed on Windows 10/11

First WSL2 run may take 30–60 seconds while the Windows host is prepared.

## Clipboard support

`diff-review clip` uses the first available clipboard tool:

- WSL/Windows: `clip.exe` or PowerShell
- macOS: `pbcopy`
- Linux: `wl-copy`, `xclip`, or `xsel`

## Development

```bash
npm install
npm test
npm run check
npm run build
```

Manual window smoke test:

```bash
npm run dev:window
```

Refresh vendored Monaco/Tailwind assets:

```bash
npm run vendor
```

## Project layout

```text
src/core/       agent-agnostic git, prompt, window, protocol logic
src/bindings/   pi, opencode, and CLI adapters
src/platform/   native window / WSL support
web/            browser UI loaded into the native window
bin/            diff-review executable shim
```

## Safety model

- This tool does not call an LLM.
- Cancel/close/empty submit produces no prompt.
- File contents are lazy-loaded and capped to avoid huge files.
- Symlinks are not followed into arbitrary local files.
- The UI assets are vendored locally; no CDN is needed at runtime.

## License

MIT
