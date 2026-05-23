import { describe, expect, it } from "vitest";
import { parseOpenAPISpec } from "./import";

const minimalOpenApi = {
	openapi: "3.0.0",
	info: { title: "Petstore", version: "1.0.0" },
	paths: {
		"/pets": {
			get: {
				operationId: "listPets",
				responses: { "200": { description: "ok" } },
			},
		},
	},
};

describe("parseOpenAPISpec", () => {
	it("imports a minimal OpenAPI 3 document", () => {
		const project = parseOpenAPISpec(minimalOpenApi);
		expect(project.name).toBe("Petstore");
		expect(project.root?.children.length).toBeGreaterThan(0);
	});
});
