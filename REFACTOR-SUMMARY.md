# Refactor Summary — Performance, What Was Done, Next Steps

Refactor of `pi-diff-review-wsl` per `REFACTOR-PLAN.md`. This document records
the performance improvements, the full scope of changes, and what remains.

---

## 1. Performance improvements

### 1.1 Git pipeline: one spawn instead of N (Q4-C)

**Before.** `getReviewWindowData` ran a `git diff-tree --name-status` spawn
*per commit* to build the per-commit file index. A 50-commit feature branch
meant ~50 sequential `git` process spawns just to populate the sidebar's
"Commits" scope, plus the working-tree diff, last-commit diff, `ls-files`,
untracked, and deleted-list spawns.

**After.** A single combined invocation:

```
git log <mergeBase>..HEAD --max-count=50 --name-status --format=%H%x09%h%x09%s
```

…is parsed by `parseCommitLogWithNameStatus` into `{ sha, shortSha, subject,
changes[] }` entries in one pass. The commit header is detected by
`/^[0-9a-f]{40}\t/`; following name-status lines attach to the current
commit.

**Effect.** Per-commit index cost drops from **N+1 spawns to 1 spawn**. On a
50-commit branch that's ~50 process creations + git startup latencies removed.
The working-tree/last-commit/ls-files/untracked/deleted gathers are unchanged
(they were already single spawns).

### 1.2 File-content LRU cache + next-file prefetch (Q5-A)

**Before.** `review-window.ts` kept an unbounded `Map<string, Promise>` cache
keyed by `scope:commitSha:fileId`. No eviction, no prefetch — every navigation
to a not-yet-seen file paid a full two-`git show` latency (original revision +
modified revision/working tree), and revisiting a long-since-evicted… it was
never evicted, so memory grew unbounded across a long review session.

**After.** `ReviewFileContentCache` (in `core/git/contents.ts`):

- **Bounded LRU, cap 40.** `get()` promotes the entry to most-recently-used;
  insertion evicts the oldest when the cap is exceeded. Memory is bounded for
  the lifetime of the window.
- **Promise memoisation.** In-flight and settled loads share the same promise,
  so rapid re-requests for the same file (e.g. scope switches back and forth)
  never re-spawn.
- **Next-file prefetch.** After a `file-data` is sent for the active file, the
  orchestrator calls `cache.prefetch(nextFileInSidebar, scope, commitSha)` —
  a fire-and-forget `get()` that primes the cache for the file the user is
  most likely to open next. Sequential sidebar navigation becomes **instant**
  (cache hit) instead of paying two `git show` spawns per step.

**Effect.** Sequential file walkthrough goes from *2 spawns per file* to
*~0 spawns per file after the first* (prefetched). Memory is bounded at ~40
file contents regardless of session length.

### 1.3 Window opens immediately; data gathered in background (Q3-B)

**Before.** Bindings called `getReviewWindowData` *first*, awaited it, then
called `openReviewWindow`. The user stared at a frozen agent while the git
pipeline ran before any window appeared.

**After.** `openReviewWindow(exec, cwd, baseBranch)` opens the window
immediately (showing a dark "Loading review…" overlay) and runs the git
pipeline concurrently. The orchestrator sends `init` + `files` over the
channel once *both* the webview has posted `ready` *and* the data has settled.

**Effect.** Perceived time-to-window drops to ~0; the git gather latency is
hidden behind the window-open + Monaco-boot time, which was already on the
critical path.

### 1.4 No CDN; loadFile from disk (Q2, Q13)

**Before.** `index.html` pulled Tailwind from `cdn.jsdelivr.net` and Monaco
from `cdnjs.cloudflare.com` on every window open. Two network round-trips
(or failures, offline) before the editor could render. The review data was
inlined into the HTML as a giant escaped JSON `<script>` blob, and `app.js`
was inlined too — all loaded via `NavigateToString`, which has a size limit
on WebView2 (large diffs could throw `ArgumentException`).

**After.** Tailwind + Monaco are vendored into `web/vendor/` (~15MB,
committed). `index.html` references them relatively (`./vendor/…`, `./app.js`).
The orchestrator loads the *static* `index.html` via glimpse's `loadFile`
from the on-disk `web/` directory (UNC path on WSL so WebView2 resolves
same-origin); all data flows over the message channel.

**Effect.**
- **Zero network calls** at runtime or install — works offline, no CDN
  latency or failure mode.
- **No `NavigateToString` size limit** — the loaded HTML is the tiny static
  page; data is never inlined. Large repos/branches no longer risk the
  WebView2 cap.
- **Faster first paint** — vendored scripts load from local disk (memory/fs)
  instead of the network.

### 1.5 Atomic init+files send

`init` and `files` are delivered as a single `window.send(...)` script
(`sendBatch`), so the webview never observes a half-initialised state where
`repoRoot` is set but the file list is empty. This avoids a redundant
intermediate render of the empty-state sidebar.

---

## 2. What was done (full scope)

### Phase 1 — Web asset bundling + channel-based data
- `scripts/vendor.mjs` — re-fetch/upgrade vendored Monaco + Tailwind into
  `web/vendor/` (`npm run vendor`).
- Vendored Monaco 0.52.2 (`web/vendor/monaco/vs/`) and Tailwind 4.3.1
  (`web/vendor/tailwind/tailwindcss.js`).
- `src/platform/resolve-web-dir.ts` — `resolveWebDir()` (locates `web/` in
  both `src/` and `dist/` layouts) and `resolveLoadFilePath()` (UNC path on
  WSL, plain absolute path elsewhere).
- `web/index.html` — relative `./vendor/*` + `./app.js` refs, loading
  overlay, inline-data `<script>` removed.
- `src/core/ui.ts` — `buildPlaceholderHtml()` (small static page; real page
  loaded via `loadFile`).
- `src/core/window/protocol.ts` — handshake types + message guards
  (`isReady`, `isSubmit`, `isCancel`, `isRequestFile`).
- `src/core/window/orchestrator.ts` — `openReviewWindow` (gathers data
  internally) and `openReviewWindowWithData` (pre-built data, for tests);
  returns `{ data, result, close }`.
- `web/app.js` — restructured into 10 commented sections; data arrives via
  `window.__reviewReceive` (`init`/`files`/`file-data`/`file-error`); loading
  overlay shown until `files` arrives; posts `ready` on boot.
- `src/core/types.ts` — added `ReviewReadyPayload`, `ReviewInitMessage`,
  `ReviewFilesMessage`; widened `ReviewWindowMessage` / `ReviewHostMessage`.

### Phase 2 — Git pipeline
- `src/core/git/types.ts` — `Exec` / `ExecOptions` / `ExecResult` contract.
- `src/core/git/parse.ts` — pure parsers: `parseNameStatus`,
  `parseUntrackedPaths`, `parseTrackedPaths`, `parseCommitLog`,
  `parseCommitLogWithNameStatus`; path helpers (`isReviewableFilePath`,
  `toDisplayPath`, `toComparison`, `mergeChangedPaths`, `uniquePaths`).
- `src/core/git/repo.ts` — `runGit`, `runGitAllowFailure`, `getRepoRoot`,
  `hasHead`, `resolveBranch`, `getMergeBase`.
- `src/core/git/contents.ts` — `loadReviewFileContents` +
  `ReviewFileContentCache` (LRU, cap 40, prefetch).
- `src/core/git/index.ts` — `getReviewWindowData` using the combined
  `git log --name-status` (one spawn for the whole commit index).
- Moved `wsl-glimpse.ts` → `src/platform/wsl-glimpse.ts` (frozen, no logic
  change); imports updated.

### Phase 3 — CLI/stdio + bindings
- `src/bindings/cli.ts` — `open` (agent: prompt to stdout/`--out`, exit `0`
  only on submit-with-content, non-zero + no stdout on cancel/close/empty/
  error) and `clip` (human: clipboard); `--base` flag replaces positional arg.
- `src/bindings/pi.ts` — updated for `{ data, result, close }` handle;
  orchestrator owns gathering; keeps escape-race + no-LLM-on-cancel.
- `src/bindings/opencode.ts` — updated for the new handle; keeps the
  `__DIFF_REVIEW_ABORT__` hack with `TODO`.
- `package.json` — `dev:window` and `vendor` scripts.

### Phase 4 — Manual verification + polish
- `scripts/dev-window.ts` — fake `ReviewWindowData` (2 files) + fake `Exec`
  returning fixture contents → `openReviewWindowWithData`. `npm run
  dev:window` runs it via tsx.
- `README.md` — rewritten: CLI contract, offline/vendored assets,
  `dev:window`, module layout, "pure human-input device" spec, deferred-
  glimpse-fork note.
- `npm run check` (tsgo) passes; `npm run build` produces a clean `dist/`.

### Validation performed
- `npm run check` clean; `npm run build` clean.
- `dev:window` opens on WSL: `loadFile` from the UNC path works, `app.js`
  boots, posts `ready`, requests files, receives `file-data`.
- Real-repo `diff-review clip --base HEAD~3` opens without errors.
- `diff-review open --base nonexistent` → exit 1, empty stdout, stderr
  message only (contract verified).
- `getReviewWindowData` against this repo: 23 files, 5 commits, correct
  `commitComparisons` populated from the single combined `git log`.

---

## 3. Next steps

### 3.1 Land the vendored assets + new modules
The vendored `web/vendor/` (~15MB) and new source dirs are currently
untracked. To land:

```bash
git add web/vendor scripts src/core/git src/core/window \
        src/platform/resolve-web-dir.ts
git commit -m "Refactor: vendored web assets, channel-based data, git pipeline, CLI contract"
```

Consider whether to commit `web/vendor/` wholesale or add a `.gitattributes`
LFS rule for the large Monaco `min/vs` bundle. The plan chose "commit
vendored" (Q13-A) for zero-postinstall simplicity; if repo size is a concern,
LFS is the knob.

### 3.2 Deferred — Glimpse fork (Q6, Phase 2 separate effort)
- Upstream (or fork) into glimpseui: the taskbar fix
  (`ShowInTaskbar = false` → `true`) and `loadFile`-over-`NavigateToString`.
- Once shipped, delete `platform/wsl-glimpse.ts` down to a one-line
  `glimpse.open()` and remove the Windows install/build dance
  (`ensureWindowsGlimpseInstalled`, `patchWindowsGlimpseShowInTaskbar`).
- Not in scope for this refactor; revisit once the above phases are stable
  in real use.

### 3.3 Validate the early risks that were assumed-safe
- **`loadFile` sibling-file serving** across all three webviews. Validated on
  WSL (WebView2 via UNC). Still to manually confirm on macOS (WebKit
  `loadFileURL`) and native Linux (Chromium CDP `file://`). Fallback if it
  fails on a platform: inline `app.js` only (small) but keep `vendor/` on
  disk and data on the channel.
- **Combined `git log --name-status` parsing** across git versions. Validated
  on the local git. Fallback if a git version produces a different shape:
  defer per-commit index to on-demand (Q4 option A).

### 3.4 `web/app.js` deeper cleanup (optional, Q7 was structural-only)
The app was split into 10 commented sections with pure functions extracted,
but no logic was rewritten. Opportunities if desired later:
- Extract the comment model into a small module (currently inline state +
  DOM helpers).
- Pull the tree/search rendering into its own file.
- Replace `window.glimpse.send`/`window.__reviewReceive` globals with a
  small typed message bus.
- These are purely legibility wins; behaviour is preserved.

### 3.5 More bindings
The core is agent-agnostic. Adding a Claude Code / Codex / Cursor binding is
now: implement `Exec`, call `openReviewWindow(exec, cwd, baseBranch)`, await
`handle.result` + `handle.data`, and deliver `composeReviewPrompt(...)` per
the host's "draft input" mechanism — mirroring `cli.ts`'s `open` mode for
stdout-based harnesses.

### 3.6 Telemetry / observability (optional)
No timing instrumentation was added. If perf needs to be proven in the field,
consider logging (to stderr, behind a flag) the git-pipeline duration, the
ready→files interval, and cache hit/miss counts. Low priority.

### 3.7 Tests (deferred per Q12)
The plan explicitly skipped formal tests in favour of `dev:window`. If that
changes, the pure parsers in `core/git/parse.ts` are the natural first
unit-test targets (no fs/exec needed), and `openReviewWindowWithData` +
a fake `Exec` is the integration seam (already exercised by `dev-window.ts`).
