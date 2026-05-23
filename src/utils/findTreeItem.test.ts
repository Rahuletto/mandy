import { describe, expect, it } from "vitest";
import type { Folder, RequestFile } from "../types/project";
import { findTreeItemById } from "./findTreeItem";

function request(id: string, name: string): RequestFile {
	return {
		id,
		type: "request",
		name,
		request: {
			method: "GET",
			url: "",
			headers: {},
			body: "None",
			auth: "None",
			query_params: {},
			cookies: [],
			timeout_ms: 30_000,
			follow_redirects: true,
			max_redirects: 10,
			verify_ssl: true,
			proxy: null,
			protocol: null,
			request_label: null,
			cancel_key: null,
		},
	};
}

describe("findTreeItemById", () => {
	const root: Folder = {
		id: "root",
		type: "folder",
		name: "Root",
		expanded: true,
		children: [
			{
				id: "nested",
				type: "folder",
				name: "API",
				expanded: true,
				children: [request("leaf", "Users")],
			},
		],
	};

	it("finds nested requests", () => {
		expect(findTreeItemById(root, "leaf")?.name).toBe("Users");
	});

	it("returns null for unknown ids", () => {
		expect(findTreeItemById(root, "missing")).toBeNull();
	});
});
