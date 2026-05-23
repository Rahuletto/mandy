import { describe, expect, it } from "vitest";
import { parsePostmanCollection } from "./import";

const minimalCollection = {
	info: {
		name: "E2E Collection",
		schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
	},
	item: [
		{
			name: "Get Users",
			request: {
				method: "GET",
				header: [],
				url: "https://httpbin.org/get",
			},
		},
	],
};

describe("parsePostmanCollection", () => {
	it("imports a flat Postman v2.1 collection", () => {
		const project = parsePostmanCollection(minimalCollection);
		expect(project.name).toBe("E2E Collection");
		expect(project.root?.children).toHaveLength(1);
		expect(project.root?.children[0]?.type).toBe("request");
		const child = project.root?.children[0];
		if (child?.type === "request") {
			expect(child.name).toBe("Get Users");
			expect(child.request.url).toContain("httpbin.org");
		}
	});
});
