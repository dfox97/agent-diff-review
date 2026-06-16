/**
 * Root barrel for `pi-diff-review-wsl`. Re-exports the agent-agnostic core
 * public API so other bindings (or direct consumers) can `import { ... } from
 * "../src/index.ts"` without reaching into `./core/`.
 *
 * The pi-specific extension entrypoint lives at `./bindings/pi.ts` and is
 * referenced from `package.json`'s `pi.extensions` field.
 */
export * from "./core/index.js";
