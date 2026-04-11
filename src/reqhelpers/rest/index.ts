import type {
	ApiRequest,
	ApiResponse,
	AuthType,
	BodyType,
	Cookie,
	HttpProtocol,
	Methods,
	MultipartField,
	ProxyConfig,
	ResponseRenderer,
} from "../../bindings";
import { commands } from "../../bindings";

export type {
	ApiRequest,
	ApiResponse,
	AuthType,
	BodyType,
	Cookie,
	HttpProtocol,
	Methods,
	MultipartField,
	ProxyConfig,
	ResponseRenderer,
};

export function createDefaultRequest(
	url = "",
	method: Methods = "GET",
): ApiRequest {
	return {
		method,
		url,
		headers: {},
		body: "None",
		auth: "None",
		query_params: {},
		cookies: [],
		timeout_ms: 30000,
		follow_redirects: true,
		max_redirects: 10,
		verify_ssl: true,
		proxy: null,
		protocol: null,
		request_label: null,
		cancel_key: null,
	};
}

export function setBasicAuth(username: string, password: string): AuthType {
	return { Basic: { username, password } };
}

export function setBearerAuth(token: string): AuthType {
	return { Bearer: { token } };
}

export function setRawBody(content: string, contentType?: string): BodyType {
	return { Raw: { content, content_type: contentType ?? null } };
}

export function setJsonBody(data: unknown): BodyType {
	return {
		Raw: {
			content: JSON.stringify(data, null, 2),
			content_type: "application/json",
		},
	};
}

export function setFormBody(fields: Record<string, string>): BodyType {
	return { FormUrlEncoded: { fields } };
}

export async function sendRequest(request: ApiRequest): Promise<ApiResponse> {
	const result = await commands.restRequest(request);
	if (result.status === "error") {
		throw new Error(result.error);
	}
	return result.data;
}

export async function cancelRestRequest(cancelKey: string): Promise<void> {
	const result = await commands.restCancelRequest(cancelKey);
	if (result.status === "error") {
		throw new Error(result.error);
	}
}

export function decodeBody(response: ApiResponse): string {
	try {
		return atob(response.body_base64);
	} catch {
		return "";
	}
}

export function decodeBodyAsJson<T = unknown>(response: ApiResponse): T | null {
	try {
		return JSON.parse(decodeBody(response));
	} catch {
		return null;
	}
}

export { parseCurlCommand } from "./parseCurl";
