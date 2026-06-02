import type {
	ApiRequest,
	ApiResponse,
	AuthType,
	BodyType,
	Cookie,
	HttpProtocol,
	Methods,
	MultipartField,
	OAuth2TokenRequest,
	OAuth2TokenResponse,
	ProxyConfig,
	RestStreamEvent,
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
	OAuth2TokenRequest,
	OAuth2TokenResponse,
	ProxyConfig,
	RestStreamEvent,
	ResponseRenderer,
};

type OAuthCacheEntry = {
	accessToken: string;
	refreshToken: string | null;
	expiresAtMs: number | null;
	refreshTimer: ReturnType<typeof setTimeout> | null;
	request: OAuth2TokenRequest;
};

const oauthTokenCache = new Map<string, OAuthCacheEntry>();

function oauthCacheKey(request: OAuth2TokenRequest): string {
	const scopes = request.scopes?.join(" ") ?? "";
	return `${request.token_url}|${request.client_id}|${scopes}`;
}

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

export async function fetchOAuth2Token(
	request: OAuth2TokenRequest,
): Promise<OAuth2TokenResponse> {
	const result = await commands.restOauth2Token(request);
	if (result.status === "error") {
		throw new Error(result.error);
	}
	return result.data;
}

async function refreshOAuthToken(cacheKey: string): Promise<void> {
	const entry = oauthTokenCache.get(cacheKey);
	if (!entry) return;
	const grantType = entry.refreshToken ? "refresh_token" : "client_credentials";
	const response = await fetchOAuth2Token({
		...entry.request,
		grant_type: grantType,
		refresh_token: entry.refreshToken,
	});
	const expiresAtMs = response.expires_in
		? Date.now() + response.expires_in * 1000
		: null;
	const refreshInMs = response.expires_in
		? Math.max(response.expires_in * 1000 - 60_000, 10_000)
		: null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	if (refreshInMs != null) {
		refreshTimer = setTimeout(() => {
			void refreshOAuthToken(cacheKey);
		}, refreshInMs);
	}
	oauthTokenCache.set(cacheKey, {
		accessToken: response.access_token,
		refreshToken: response.refresh_token ?? entry.refreshToken,
		expiresAtMs,
		refreshTimer,
		request: entry.request,
	});
}

export async function getOAuth2TokenCached(
	request: OAuth2TokenRequest,
): Promise<OAuth2TokenResponse> {
	const cacheKey = oauthCacheKey(request);
	const cached = oauthTokenCache.get(cacheKey);
	const now = Date.now();
	if (
		cached &&
		(cached.expiresAtMs == null || cached.expiresAtMs - now > 60_000)
	) {
		return {
			access_token: cached.accessToken,
			token_type: "Bearer",
			expires_in:
				cached.expiresAtMs == null
					? null
					: Math.max(Math.floor((cached.expiresAtMs - now) / 1000), 0),
			refresh_token: cached.refreshToken,
			scope: request.scopes?.join(" ") ?? null,
			raw_json: JSON.stringify({ source: "cache" }),
		};
	}
	const response = await fetchOAuth2Token(request);
	const expiresAtMs = response.expires_in
		? Date.now() + response.expires_in * 1000
		: null;
	const refreshInMs = response.expires_in
		? Math.max(response.expires_in * 1000 - 60_000, 10_000)
		: null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	if (refreshInMs != null) {
		refreshTimer = setTimeout(() => {
			void refreshOAuthToken(cacheKey);
		}, refreshInMs);
	}
	if (cached?.refreshTimer) {
		clearTimeout(cached.refreshTimer);
	}
	oauthTokenCache.set(cacheKey, {
		accessToken: response.access_token,
		refreshToken: response.refresh_token ?? null,
		expiresAtMs,
		refreshTimer,
		request,
	});
	return response;
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
