import { describe, expect, it } from "vitest";
import { isCancel, isFileData, isOpenInEditor, isReady, isRequestFile, isSubmit } from "./protocol.js";

const malformedValues = [null, undefined, "ready", 42, true, [], { type: 123 }, { nope: "ready" }];

describe("webview -> host protocol guards", () => {
	it("never throws for malformed values", () => {
		for (const value of malformedValues) {
			expect(() => isReady(value)).not.toThrow();
			expect(() => isSubmit(value)).not.toThrow();
			expect(() => isCancel(value)).not.toThrow();
			expect(() => isRequestFile(value)).not.toThrow();
			expect(() => isOpenInEditor(value)).not.toThrow();
		}
	});

	it("accepts ready and cancel messages", () => {
		expect(isReady({ type: "ready" })).toBe(true);
		expect(isCancel({ type: "cancel" })).toBe(true);
	});

	it("validates submit shape", () => {
		expect(isSubmit({ type: "submit", overallComment: "note", comments: [] })).toBe(true);
		expect(isSubmit({ type: "submit", overallComment: 1, comments: [] })).toBe(false);
		expect(isSubmit({ type: "submit", overallComment: "note", comments: {} })).toBe(false);
	});

	it("validates request-file shape", () => {
		expect(isRequestFile({
			type: "request-file",
			requestId: "r1",
			fileId: "f1",
			scope: "git-diff",
		})).toBe(true);
		expect(isRequestFile({
			type: "request-file",
			requestId: "r1",
			fileId: "f1",
			scope: "not-a-scope",
		})).toBe(false);
		expect(isRequestFile({
			type: "request-file",
			requestId: "r1",
			fileId: "f1",
			scope: "commit",
			commitSha: 123,
		})).toBe(false);
	});

	it("validates open-in-editor shape", () => {
		expect(isOpenInEditor({ type: "open-in-editor", fileId: "f1", line: 10 })).toBe(true);
		expect(isOpenInEditor({ type: "open-in-editor", fileId: "f1" })).toBe(true);
		expect(isOpenInEditor({ type: "open-in-editor", fileId: "f1", line: "10" })).toBe(false);
	});
});

describe("host -> webview protocol guards", () => {
	it("accepts file-data messages without throwing on malformed input", () => {
		expect(isFileData({ type: "file-data" })).toBe(true);
		expect(isFileData(null)).toBe(false);
	});
});
