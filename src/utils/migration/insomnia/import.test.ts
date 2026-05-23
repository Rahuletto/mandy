import { describe, expect, it } from "vitest";
import { parseInsomniaExport } from "./import";

const minimalExport = {
	__export_format: 4,
	__export_date: "2026-01-01T00:00:00.000Z",
	__export_source: "insomnia.desktop.app:v2023.5.8",
	resources: [
		{
			_id: "wrk_1",
			_type: "workspace",
			name: "Insomnia E2E",
		},
		{
			_id: "req_1",
			_type: "request",
			name: "Health",
			method: "GET",
			url: "https://httpbin.org/status/200",
			parentId: "wrk_1",
		},
	],
};

describe("parseInsomniaExport", () => {
	it("imports a minimal Insomnia v4 export", () => {
		const project = parseInsomniaExport(minimalExport);
		expect(project.name).toBe("Insomnia E2E");
		expect(project.root?.children.length).toBeGreaterThan(0);
		const first = project.root?.children[0];
		expect(first?.type).toBe("request");
		if (first?.type === "request") {
			expect(first.name).toBe("Health");
		}
	});
});
