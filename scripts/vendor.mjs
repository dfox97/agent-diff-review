#!/usr/bin/env node
/**
 * Re-fetch/upgrade vendored web assets (Monaco editor + Tailwind browser build)
 * into `web/vendor/` so the review window runs fully offline with no CDN calls.
 *
 * Run: `npm run vendor`
 *
 * Assets are pinned by version below. Bumping a version + re-running this
 * script is the upgrade path; the vendored files are committed to the repo
 * (no postinstall, no runtime download).
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const WEB_VENDOR = join(ROOT, "web", "vendor");

const ASSETS = {
	monaco: {
		version: "0.52.2",
		tarball: "https://registry.npmjs.org/monaco-editor/-/monaco-editor-0.52.2.tgz",
		// Inside the tarball (top-level `package/`), copy `min/vs` → `web/vendor/monaco/vs`.
		extract: (stagedDir, targetDir) => {
			const src = join(stagedDir, "package", "min", "vs");
			const dest = join(targetDir, "monaco", "vs");
			rmSync(join(targetDir, "monaco"), { recursive: true, force: true });
			mkdirSync(join(targetDir, "monaco"), { recursive: true });
			cpSync(src, dest, { recursive: true });
		},
	},
	tailwind: {
		version: "4.3.1",
		tarball: "https://registry.npmjs.org/@tailwindcss/browser/-/browser-4.3.1.tgz",
		// Copy `dist/index.global.js` → `web/vendor/tailwind/tailwindcss.js`.
		extract: (stagedDir, targetDir) => {
			const src = join(stagedDir, "package", "dist", "index.global.js");
			const dest = join(targetDir, "tailwind", "tailwindcss.js");
			rmSync(join(targetDir, "tailwind"), { recursive: true, force: true });
			mkdirSync(join(targetDir, "tailwind"), { recursive: true });
			cpSync(src, dest, { recursive: true });
		},
	},
};

async function download(url, destFile) {
	const res = await fetch(url);
	if (!res.ok || res.body == null) {
		throw new Error(`Fetch ${url} failed: ${res.status} ${res.statusText}`);
	}
	const buffer = Buffer.from(await res.arrayBuffer());
	writeFileSync(destFile, buffer);
}

function extractTarball(tarballPath, destDir) {
	// Use system tar; available on all our target platforms.
	const result = spawnSync("tar", ["-xzf", tarballPath, "-C", destDir], { stdio: "inherit" });
	if (result.status !== 0) {
		throw new Error(`tar extraction failed with status ${result.status ?? "unknown"} for ${tarballPath}`);
	}
}

async function fetchAsset(name, config) {
	const tmp = mkdtempSync(join(tmpdir(), `vendor-${name}-`));
	try {
		const tarballPath = join(tmp, `${name}.tgz`);
		console.log(`[${name}] downloading ${config.tarball}`);
		await download(config.tarball, tarballPath);
		const staged = join(tmp, "extracted");
		mkdirSync(staged, { recursive: true });
		extractTarball(tarballPath, staged);
		console.log(`[${name}] extracting into ${WEB_VENDOR}`);
		config.extract(staged, WEB_VENDOR);
		console.log(`[${name}] done (v${config.version})`);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

async function main() {
	mkdirSync(WEB_VENDOR, { recursive: true });
	for (const [name, config] of Object.entries(ASSETS)) {
		await fetchAsset(name, config);
	}
	console.log("Vendored assets updated in web/vendor/.");
}

await main();
