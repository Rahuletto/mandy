import { commands } from "../bindings";
import type {
    ApiRequest,
    ApiResponse,
    Methods,
    AuthType,
    BodyType,
    Cookie,
    ProxyConfig,
    MultipartField,
    ResponseRenderer,
    HttpProtocol,
} from "../bindings";

export type {
    ApiRequest,
    ApiResponse,
    Methods,
    AuthType,
    BodyType,
    Cookie,
    ProxyConfig,
    MultipartField,
    ResponseRenderer,
    HttpProtocol,
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

export function parseCurlCommand(curl: string): Partial<ApiRequest> {
    const request: Partial<ApiRequest> = {
        method: "GET",
        headers: {},
        query_params: {},
        cookies: [],
    };

    const cleaned = curl.replace(/\\\n/g, " ").replace(/\s+/g, " ").trim();

    const urlPatterns = [
        /curl\s+(?:.*?\s)?['"]([^'"]+)['"]/,
        /curl\s+(?:.*?\s)?(\S+)/,
    ];

    for (const pattern of urlPatterns) {
        const match = cleaned.match(pattern);
        if (
            match &&
            match[1] &&
            (match[1].startsWith("http") || match[1].startsWith("/"))
        ) {
            request.url = match[1];
            break;
        }
    }

    if (!request.url) {
        const urlMatch = cleaned.match(/(https?:\/\/[^\s'"]+)/);
        if (urlMatch) {
            request.url = urlMatch[1];
        }
    }

    // Method
    const methodMatch = cleaned.match(/-X\s+['"]?(\w+)['"]?/i);
    if (methodMatch) {
        request.method = methodMatch[1].toUpperCase() as Methods;
    }

    const headerRegex = /-H\s+['"]([^'"]+)['"]/gi;
    let headerMatch;
    while ((headerMatch = headerRegex.exec(cleaned)) !== null) {
        const header = headerMatch[1];
        const colonIndex = header.indexOf(":");
        if (colonIndex > 0) {
            const key = header.slice(0, colonIndex).trim();
            const value = header.slice(colonIndex + 1).trim();
            request.headers![key] = value;
        }
    }

    const dataPatterns = [
        /-d\s+'([^']+)'/i,
        /-d\s+"([^"]+)"/i,
        /--data\s+'([^']+)'/i,
        /--data\s+"([^"]+)"/i,
        /--data-raw\s+'([^']+)'/i,
        /--data-raw\s+"([^"]+)"/i,
    ];

    for (const pattern of dataPatterns) {
        const match = cleaned.match(pattern);
        if (match) {
            const data = match[1];
            request.body = { Raw: { content: data, content_type: null } };
            if (request.method === "GET") {
                request.method = "POST";
            }
            break;
        }
    }

    const userMatch = cleaned.match(/-u\s+['"]?([^'"\s]+)['"]?/i);
    if (userMatch) {
        const [username, password] = userMatch[1].split(":");
        request.auth = { Basic: { username, password: password || "" } };
    }

    if (cleaned.includes("-k") || cleaned.includes("--insecure")) {
        request.verify_ssl = false;
    }

    if (cleaned.includes("-L") || cleaned.includes("--location")) {
        request.follow_redirects = true;
    }

    return request;
}
