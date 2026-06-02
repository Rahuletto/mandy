import { describe, expect, it } from "vitest";
import type { ApiRequest } from "../bindings";
import {
	generateRestSnippet,
	getDefaultRestSnippetId,
	getLegacyLanguageSnippetId,
	getRestSnippetProfile,
	listRestSnippetProfiles,
} from "./restSnippets";

const request: ApiRequest = {
	url: "https://api.example.com/users",
	method: "POST",
	headers: {
		Authorization: "Bearer token",
	},
	query_params: {},
	body: {
		Raw: {
			content: '{"name":"Mandy"}',
			content_type: "application/json",
		},
	},
	auth: "None",
	cookies: [],
	timeout_ms: null,
	follow_redirects: null,
	max_redirects: null,
	verify_ssl: null,
	proxy: null,
	protocol: null,
};

describe("rest snippet catalog", () => {
	it("provides a stable default snippet profile", () => {
		const profile = getRestSnippetProfile(getDefaultRestSnippetId());
		expect(profile).toBeDefined();
		expect(profile?.id).toBe(getDefaultRestSnippetId());
	});

	it("maps legacy language ids to modern profile ids", () => {
		expect(getLegacyLanguageSnippetId("javascript")).toBe("javascript-fetch");
		expect(getLegacyLanguageSnippetId("python")).toBe("python-requests");
		expect(getLegacyLanguageSnippetId("shell")).toBe("shell-curl");
	});

	it("lists grouped profiles across multiple language families", () => {
		const profiles = listRestSnippetProfiles();
		const groups = new Set(profiles.map((profile) => profile.languageGroup));
		expect(groups.has("JavaScript")).toBe(true);
		expect(groups.has("Python")).toBe(true);
		expect(groups.has("Shell")).toBe(true);
		expect(profiles.length).toBeGreaterThanOrEqual(18);
	});

	it("generates snippet code and language for selected profile", () => {
		const snippet = generateRestSnippet("python-httpx-sync", request);
		expect(snippet.language).toBe("python");
		expect(snippet.code).toContain("httpx.request");
		expect(snippet.code).toContain("https://api.example.com/users");
	});

	it("generates raw HTTP without parsing template URLs", () => {
		const snippet = generateRestSnippet("http-raw", {
			...request,
			url: "{{BASE_URL}}/get",
			method: "GET",
			body: "None",
		});
		expect(snippet.language).toBe("http");
		expect(snippet.code).toContain("GET /get HTTP/1.1");
		expect(snippet.code).toContain("Host: {{BASE_URL}}");
	});

	it("maps removed http-1-1-raw id to http-raw", () => {
		expect(getRestSnippetProfile("http-1-1-raw")?.id).toBe("http-raw");
	});

	it("generates PHP snippets with opening tag for Laravel client", () => {
		const snippet = generateRestSnippet("php-laravel-http-client", request);
		expect(snippet.language).toBe("php");
		expect(snippet.code.startsWith("<?php")).toBe(true);
	});
});
