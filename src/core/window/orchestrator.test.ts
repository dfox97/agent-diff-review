import { describe, expect, it } from "vitest";
import { escapeForInlineScript } from "./orchestrator.js";

describe("escapeForInlineScript", () => {
	it("keeps webview protocol scripts ASCII-only and preserves Unicode", () => {
		const message = { text: "context — café 😀 <tag>" };
		const escaped = escapeForInlineScript(JSON.stringify(message));

		expect(escaped).toMatch(/^[\x20-\x7e]+$/);
		expect(escaped).not.toContain("—");

		let received: unknown;
		Function("receive", `receive(${escaped})`)((value: unknown) => { received = value; });
		expect(received).toEqual(message);
	});
});
