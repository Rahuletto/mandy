import type { ApiRequest } from "../bindings";
import {
	generateRestSnippet,
	getLegacyLanguageSnippetId,
	getRestSnippetProfile,
} from "./restSnippets";

export function generateCurl(request: ApiRequest): string {
	return generateRestSnippet("shell-curl", request).code;
}

export function generateFetch(request: ApiRequest): string {
	return generateRestSnippet("javascript-fetch", request).code;
}

export function generatePythonRequests(request: ApiRequest): string {
	return generateRestSnippet("python-requests", request).code;
}

export function generateGo(request: ApiRequest): string {
	return generateRestSnippet("go-net-http", request).code;
}

export function generateRust(request: ApiRequest): string {
	return generateRestSnippet("rust-reqwest", request).code;
}

export function generateJava(request: ApiRequest): string {
	return generateRestSnippet("java-http-client", request).code;
}

export function generatePHP(request: ApiRequest): string {
	return generateRestSnippet("php-guzzle", request).code;
}
export function generateSnippet(langId: string, request: ApiRequest): string {
	const directProfile = getRestSnippetProfile(langId);
	if (directProfile) return directProfile.generate(request);
	return generateRestSnippet(getLegacyLanguageSnippetId(langId), request).code;
}
