# `pi-diff-review-wsl` Refactor Plan

## Goals (restated)

- Lightweight, fast, works on any machine in any terminal.
- As good as VS Code's diff reviewer, but easier to open than launching VS Code.
- Compatible with all AI agents via a stable CLI/stdio contract + an in-process TS core library.
- The tool is a **pure human-input device**: it never triggers an LLM. It produces a draft prompt for the human; cancel/close/empty = no draft and no LLM call. Every binding must be able to abort the slash-command's default LLM trigger.
- Keep the current Glimpse native-window UX (own window, fast, no browser-tab noise).

## Decisions locked

| #  | Decision                | Choice                                                                                                                              |
| -- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Q1 | Rendering surface       | Keep Glimpse native window                                                                                                          |
| Q2 | Web assets into webview | Bundle locally, always `loadFile`, data over message channel                                                                        |
| Q3 | Data lifecycle          | B — skeleton → file index → lazy contents                                                                                           |
| Q4 | Git pipeline            | C — one `git log --name-status`, parse into per-commit map                                                                          |
| Q5 | File contents           | A — keep two-`git show`, LRU + next-file prefetch                                                                                   |
| Q6 | Platform layer          | Phase 2 — freeze `wsl-glimpse.ts`; glimpse fork deferred                                                                            |
| Q7 | `web/app.js`            | A — clean up internally into sections + pure functions, no build step                                                               |
| Q8 | Agent extensibility     | C — core TS library + CLI/stdio (CLI primary)                                                                                       |
| Q9 | CLI contract            | Raw markdown on stdout, exit `0` only when there's a prompt; non-zero + no stdout for cancel/empty/error; `--out` optional          |
| Q10| Tool behavior           | Pure human-input device, never LLM; draft into chat input / clipboard; cancel = no LLM call                                         |
| Q11| Codebase org            | B — split `git.ts` + `review-window.ts` along seams, move platform shim to `platform/`                                              |
| Q12| Testing                 | Skip formal tests; `scripts/dev-window.ts` + `npm run dev:window` for manual verification                                           |
| Q13| Build/distribution      | A — commit vendored Monaco + Tailwind into `web/vendor/`, ship in `files`, no postinstall                                           |

**One open sub-decision (recommendation embedded):** web-asset resolution across source-vs-`dist` layouts → a single `resolveWebDir()` helper that locates `web/` from the package root in both layouts. (If you'd rather resolve from `import.meta.url` directly, that's a minor variation — say so when we start and I'll adjust.)

---

## Target module layout

```
src/
  index.ts                      # root barrel (unchanged role)
  core/
    index.ts                    # public API barrel (updated exports)
    types.ts                    # domain + wire-protocol types
    prompt.ts                   # composeReviewPrompt (unchanged logic)
    git/
      repo.ts                   # getRepoRoot, hasHead, resolveBranch, getMergeBase
      index.ts                  # getReviewWindowData (the pipeline; uses parse + repo)
      contents.ts               # loadReviewFileContents + LRU cache + prefetch
      parse.ts                  # parseNameStatus, parseCommitLog, parseUntrackedPaths (pure)
    window/
      orchestrator.ts           # openReviewWindow + {result, close} handle
      protocol.ts               # handshake + message type guards (init/files/request-file/...)
    ui.ts                       # buildReviewHtml (loads web/index.html + app.js)
  platform/
    wsl-glimpse.ts              # FROZEN — moved from core/, no new features
    resolve-web-dir.ts          # resolveWebDir() helper
  bindings/
    pi.ts                       # slim pi adapter (updated for new handshake)
    opencode.ts                 # slim opencode adapter (updated; keep abort hack w/ TODO)
    cli.ts                      # CLI: open (agent stdout) + clip (human clipboard) subcommands
web/
  index.html                    # references ./vendor/* relatively; data via channel, not inline
  app.js                        # cleaned into sections + pure functions
  vendor/
    monaco/                     # vendored Monaco 0.52.x
    tailwind/                   # vendored Tailwind browser build
bin/
  diff-review                   # entry shim (updated subcommands)
scripts/
  dev-window.ts                 # manual verification: fake dataset + fake Exec → open window
```

---

## Implementation phases

### Phase 1 — Web asset bundling + channel-based data (Q2, Q3, Q7, Q13)

The highest-leverage, lowest-risk changes. Independently shippable.

1. **Vendor Monaco + Tailwind into `web/vendor/`.**
   - Download Monaco `0.52.2` min distribution and Tailwind browser build into `web/vendor/`.
   - Add a `scripts/vendor.mjs` helper to re-fetch/upgrade vendored assets on demand.
   - Update `web/index.html`: replace the two CDN `<script>`/`<style>` tags with relative `./vendor/monaco/...` and `./vendor/tailwind/...` references.
   - Remove the inline `__INLINE_DATA__` JSON `<script>` tag. The webview will receive data via the message channel.

2. **`resolveWebDir()` helper** (`platform/resolve-web-dir.ts`): locate `web/` relative to package root whether running from `src/` (pi extension) or `dist/` (CLI). `ui.ts` uses it instead of the current `__dirname`-relative `join(__dirname, "..", "..", "web")`.

3. **`buildReviewHtml()` change:** return the *static* `index.html` (with vendored refs) only — no inlined `app.js`, no inlined data. `app.js` is loaded via a relative `<script src="./app.js">` so the webview fetches it from disk. (Confirm `loadFile` serves sibling files in the same dir — it does for `file://`-based loading.)

4. **Window open path switches to always-`loadFile`:** write `index.html` (and the `web/` dir is already on disk) and load via `loadFile`. This replaces the inline-HTML + `NavigateToString` path on macOS/Linux too, retiring the size limit everywhere. On WSL, compose with the existing host script's `loadFile` message (the one integration constraint from Q6 — verify during implementation, don't redesign the shim).

5. **Handshake protocol (Q3):** define in `core/window/protocol.ts`:
   - Webview → host: `{ type: "ready" }`, `{ type: "request-file", ... }` (existing), `{ type: "submit"|"cancel" }` (existing).
   - Host → webview: `{ type: "init", repoRoot, baseBranch?, mergeBase? }` on `ready`; `{ type: "files", files, commits }` when the index is built; `{ type: "file-data"|"file-error" }` (existing).

6. **`openReviewWindow()` reorder:** open the window immediately, then gather data, then send `init` + `files`. Bindings call `openReviewWindow(exec, cwd, baseBranch)` and the orchestrator owns the gather-then-send internally (so bindings don't each reimplement the ordering).

7. **`web/app.js` cleanup (Q7, partial — structure first):** split into clearly commented sections: state, DOM refs, git-data access, Monaco glue, comment model, sidebar, scopes, rendering, message handlers. Add a loading state for the window-between-`ready`-and-`files` interval. Receive data via `window.__reviewReceive(msg)` (already plumbed) instead of the inline JSON.

**Phase 1 exit criteria:** window opens offline, no CDN calls, large repos don't hit any size limit, data flows over the channel, `npm run dev:window` works against a fake dataset.

### Phase 2 — Git pipeline (Q4, Q5)

Replaces the 50-spawn storm and adds the content cache.

1. **`core/git/parse.ts`:** extract the pure parsers (`parseNameStatus`, `parseCommitLog`, `parseUntrackedPaths`) from `git.ts`. Add a parser for the combined `git log --name-status --format=...` output (commit header + name-status block per commit).

2. **`core/git/repo.ts`:** extract repo-root / branch / merge-base resolution.

3. **`core/git/index.ts` (`getReviewWindowData`):**
   - Replace the per-commit `diff-tree` loop with **one** `git log ${mergeBase}..HEAD --name-status --format=%H%x09%h%x09%s` (or `git log` without merge-base for the no-base case) and parse into `commitComparisons`.
   - Keep the working-tree diff, last-commit `diff-tree HEAD`, untracked/ls-files/deleted gathering.
   - Runs *after* the window is open (per Phase 1's reorder), feeds `init` + `files`.

4. **`core/git/contents.ts`:** move `loadReviewFileContents` here; add an LRU cache (cap ~40 entries) keyed by `scope:commitSha:fileId`; add next-file-in-sidebar prefetch (opportunistic, one speculative spawn).

5. **Move `wsl-glimpse.ts` → `platform/wsl-glimpse.ts`** (freeze, no logic change) and update imports.

**Phase 2 exit criteria:** big-branch open is fast (no 50-spawn storm), sequential file navigation is instant (prefetch), memory bounded (LRU), `dev:window` still works.

### Phase 3 — CLI/stdio contract + bindings (Q8, Q9, Q10)

Makes it compatible with all agents.

1. **`bin/diff-review` + `src/bindings/cli.ts`:** two subcommands:
   - `diff-review open [--base <branch>] [--out <path>]` — agent mode. Opens window; on submit-with-comments writes raw markdown to stdout (or `--out`), exit `0`; on cancel/close/empty/error writes nothing to stdout, exit non-zero, logs to stderr only. **Never calls an LLM.**
   - `diff-review clip` (or no subcommand) — human mode. Opens window; on submit copies to clipboard + prints friendly message. (Today's behavior, preserved.)
   - `--base` replaces the positional arg (flag-based for future extensibility).

2. **`src/bindings/pi.ts`:** update for the new handshake (call `openReviewWindow`, the orchestrator owns data gathering); keep `setEditorText(prompt)` on submit; keep the escape-race + "no LLM call on cancel" behavior (return early from the command handler).

3. **`src/bindings/opencode.ts`:** update for the new handshake; keep the `command.execute.before` abort (`throw new Error("__DIFF_REVIEW_ABORT__")`) with a `TODO: replace with clean abort when opencode API supports it`; keep `appendPrompt` draft insertion.

4. **`package.json`:** update `bin`, `files` (include `web/vendor`), `scripts` (`dev:window`, `vendor`).

**Phase 3 exit criteria:** an external agent can `diff-review open --base dev`, get the prompt on stdout, and the harness inserts it as a draft; cancel/empty produces no stdout and no LLM call in any binding.

### Phase 4 — Manual verification + polish (Q12)

1. **`scripts/dev-window.ts`:** fake `ReviewWindowData` (2-3 files with original/modified content, a fake commit), fake `Exec` returning fixture contents on `request-file`, opens `openReviewWindow`, logs emitted messages. `npm run dev:window` runs it via `tsx`.
2. **README update:** new CLI contract, offline/vendored assets, `dev:window`, module layout, the "pure human-input device" behavioral spec, Phase-2 note about the deferred glimpse fork.
3. **`npm run check`** (tsgo) passes across the new layout.

### Phase 2 (deferred — separate effort) — Glimpse fork (Q6)

- Upstream (or fork) the taskbar fix + `loadFile`-over-`NavigateToString` into glimpseui.
- Delete `platform/wsl-glimpse.ts` down to a one-line `glimpse.open()` once a fixed glimpse ships.
- Not in scope for this refactor; revisit when the above phases are stable.

---

## Cross-cutting constraints to honor during implementation

- **No CDN at runtime or install.** Everything local, offline-capable.
- **The tool never triggers an LLM.** Every binding aborts the slash-command's default model call on cancel/close/empty.
- **`platform/wsl-glimpse.ts` is frozen** — don't add features; only verify the new `loadFile`-from-disk path composes with its existing host-script `loadFile` message.
- **No build step for `web/`.** Vendored `<script>`/`<style>` refs + a cleaned single `app.js`.
- **`web/app.js` cleanup is structural only** — preserve current behavior, just make it legible (sections + pure functions).
- **Web-asset resolution** works in both `src/` (pi extension) and `dist/` (CLI) layouts via `resolveWebDir()`.

## Risks to validate early

1. **`loadFile` serving sibling files** (`app.js`, `vendor/*`) from the same dir across all three webviews (WebView2/WSL, WebKit/macOS, Chromium/Linux). Validate in Phase 1 step 3-4 before building further on it. Fallback if it fails: inline `app.js` only (small) but keep `vendor/` on disk and data on the channel.
2. **ESM/CSP restrictions** on `file://`-loaded scripts in WebView2 — same early check. (We're not using ES modules per Q7-A, which lowers this risk; plain `<script src>` is broadly supported.)
3. **Combined `git log --name-status` parsing** across git versions — validate the format on your git in Phase 2 step 1. Fallback: Q4 option A (defer per-commit to on-demand).
