import { describe, expect, it } from "vitest";
import { getItemConfig } from "../../../registry";
import { exportToMandyJSON, parseMandyJSON } from "./mandy";

describe("Mandy project JSON round-trip", () => {
	it("exports and parses a project with a REST request", () => {
		const request = getItemConfig("request").createDefault({
			id: "req-1",
			name: "Ping",
		});
		const project = {
			id: "proj-1",
			name: "Roundtrip",
			root: {
				id: "root",
				type: "folder" as const,
				name: "Root",
				expanded: true,
				children: [request],
			},
			environments: [],
			activeEnvironmentId: null,
			recentRequests: [],
			schemaVersion: 1,
		};

		const json = exportToMandyJSON(project);
		const parsed = parseMandyJSON(json);
		expect(parsed).not.toBeNull();
		if (!parsed) return;
		expect(parsed.name).toBe("Roundtrip");
		expect(parsed.root.children).toHaveLength(1);
		expect(parsed.root.children[0]?.type).toBe("request");
	});
});
