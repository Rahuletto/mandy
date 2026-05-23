import { describe, expect, it } from "vitest";
import { parseCurlCommand } from "./parseCurl";

describe("parseCurlCommand", () => {
	it("parses a minimal GET request", () => {
		const parsed = parseCurlCommand("curl https://api.example.com/users");
		expect(parsed.method).toBe("GET");
		expect(parsed.url).toBe("https://api.example.com/users");
	});

	it("parses method, headers, and JSON body", () => {
		const parsed = parseCurlCommand(
			`curl -X POST https://api.example.com/items \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer token" \\
  -d '{"name":"widget"}'`,
		);
		expect(parsed.method).toBe("POST");
		expect(parsed.url).toBe("https://api.example.com/items");
		expect(parsed.headers?.["Content-Type"]).toBe("application/json");
		expect(parsed.headers?.Authorization).toBe("Bearer token");
		expect(parsed.body).toMatchObject({
			Raw: expect.objectContaining({
				content: expect.stringContaining('"name"'),
			}),
		});
	});

	it("extracts query parameters from the URL", () => {
		const parsed = parseCurlCommand(
			"curl 'https://api.example.com/search?q=hello&page=2'",
		);
		expect(parsed.url).toContain("api.example.com/search");
		expect(parsed.query_params).toEqual({ q: "hello", page: "2" });
	});
});
