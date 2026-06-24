import { readFileSync } from "node:fs";
import { resolveWebDir } from "../platform/resolve-web-dir.js";

/**
 * Returns the small dark placeholder HTML used for the initial window open.
 * The real review page is loaded immediately afterwards via `loadFile` against
 * the on-disk `web/index.html`, so that relative `./app.js` and `./vendor/…`
 * references resolve from disk (retiring the NavigateToString size limit and
 * all CDN calls).
 */
export function buildPlaceholderHtml(title = "review"): string {
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>html,body{margin:0;height:100%;background:#0d1117;color:#c9d1d9;font:14px system-ui, sans-serif}#l{display:flex;align-items:center;justify-content:center;height:100%}</style></head><body><div id="l">Loading review…</div></body></html>`;
}

/**
 * Reads the static `web/index.html` from disk. Currently only used for size
 * diagnostics / future paths; the orchestrator loads it via `loadFile`.
 */
export function readIndexHtml(): string {
	return readFileSync(`${resolveWebDir()}/index.html`, "utf8");
}
