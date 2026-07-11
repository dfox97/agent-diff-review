export function reportBestEffortError(context: string, error: unknown): void {
	if (process.env.DIFF_REVIEW_DEBUG !== "1") return;
	const detail = error instanceof Error ? error.stack ?? error.message : String(error);
	console.error(`[diff-review] ${context}: ${detail}`);
}
