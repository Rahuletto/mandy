import { describe, expect, it } from "vitest";
import { findSecrets } from "./secretDetection";

describe("findSecrets", () => {
	it("detects GitHub personal access tokens", () => {
		const matches = findSecrets(
			"token ghp_123456789012345678901234567890123456",
		);
		expect(matches.some((m) => m.patternId === "github_pat")).toBe(true);
	});

	it("detects bearer tokens", () => {
		const matches = findSecrets("Authorization: Bearer abc.def.ghi");
		expect(matches.some((m) => m.patternId === "bearer_token")).toBe(true);
	});

	it("returns empty for benign strings", () => {
		expect(findSecrets("hello world")).toEqual([]);
	});
});
