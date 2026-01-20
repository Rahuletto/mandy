import type { Project, Folder, RequestFile, Environment, EnvironmentVariable } from "../../../types/project";
import type { ApiRequest, AuthType, BodyType, Cookie } from "../../../bindings";
import { createDefaultRequest } from "../../../reqhelpers/rest";
import { generateId } from "../shared";
import type {
    PostmanAuth,
    PostmanBody,
    PostmanHeader,
    PostmanUrl,
    PostmanItem,
    PostmanItemGroup,
    PostmanVariable
} from "./types";

function isItemGroup(item: PostmanItem | PostmanItemGroup): item is PostmanItemGroup {
    return "item" in item && Array.isArray((item as PostmanItemGroup).item);
}

function parsePostmanAuth(auth: PostmanAuth | null | undefined): AuthType {
    if (!auth || auth.type === "noauth") {
        return "None";
    }

    if (auth.type === "bearer" && auth.bearer) {
        const tokenAttr = auth.bearer.find(a => a.key === "token");
        return { Bearer: { token: tokenAttr?.value || "" } };
    }

    if (auth.type === "basic" && auth.basic) {
        const usernameAttr = auth.basic.find(a => a.key === "username");
        const passwordAttr = auth.basic.find(a => a.key === "password");
        return {
            Basic: {
                username: usernameAttr?.value || "",
                password: passwordAttr?.value || ""
            }
        };
    }

    if (auth.type === "apikey" && auth.apikey) {
        const keyAttr = auth.apikey.find(a => a.key === "key");
        const valueAttr = auth.apikey.find(a => a.key === "value");
        const inAttr = auth.apikey.find(a => a.key === "in");
        return {
            ApiKey: {
                key: keyAttr?.value || "",
                value: valueAttr?.value || "",
                add_to: inAttr?.value === "query" ? "Query" : "Header"
            }
        };
    }

    return "None";
}

function parsePostmanBody(body: PostmanBody | null | undefined): BodyType {
    if (!body || body.disabled) {
        return "None";
    }

    if (body.mode === "raw" && body.raw !== undefined) {
        let contentType = "text/plain";
        const lang = body.options?.raw?.language;
        if (lang === "json") contentType = "application/json";
        else if (lang === "xml") contentType = "application/xml";
        else if (lang === "html") contentType = "text/html";
        else if (lang === "javascript") contentType = "application/javascript";

        return {
            Raw: {
                content: body.raw,
                content_type: contentType
            }
        };
    }

    if (body.mode === "urlencoded" && body.urlencoded) {
        const fields: Record<string, string> = {};
        for (const item of body.urlencoded) {
            if (!item.disabled) {
                fields[item.key] = item.value || "";
            }
        }
        return { FormUrlEncoded: { fields } };
    }

    if (body.mode === "formdata" && body.formdata) {
        const fields = body.formdata
            .filter(f => !f.disabled)
            .map(f => {
                if (f.type === "file") {
                    return {
                        name: f.key,
                        value: {
                            File: {
                                data: [],
                                filename: f.src || f.key,
                                content_type: f.contentType || null
                            }
                        }
                    };
                }
                return {
                    name: f.key,
                    value: { Text: f.value || "" }
                };
            });
        return { Multipart: { fields } };
    }

    return "None";
}

function parsePostmanUrl(url: PostmanUrl | string | undefined | null): { url: string; queryParams: Record<string, string> } {
    const queryParams: Record<string, string> = {};

    if (!url) {
        return { url: "", queryParams };
    }

    if (typeof url === "string") {
        const [baseUrl, queryString] = url.split("?");
        if (queryString) {
            const params = new URLSearchParams(queryString);
            params.forEach((value, key) => {
                queryParams[key] = value;
            });
        }
        return { url: baseUrl || "", queryParams };
    }

    if (url.query && Array.isArray(url.query)) {
        for (const q of url.query) {
            if (q && !q.disabled && q.key) {
                queryParams[q.key] = q.value || "";
            }
        }
    }

    return { url: url.raw?.split("?")[0] || "", queryParams };
}

function parsePostmanHeaders(headers: PostmanHeader[] | string | undefined): {
    headers: Record<string, string>;
    cookies: Cookie[];
} {
    const result: Record<string, string> = {};
    const cookies: Cookie[] = [];

    if (!headers || typeof headers === "string") {
        return { headers: result, cookies };
    }

    for (const h of headers) {
        if (h.disabled) continue;

        if (h.key.toLowerCase() === "cookie") {
            const cookieParts = h.value.split(";").map(p => p.trim());
            for (const part of cookieParts) {
                const [name, ...valueParts] = part.split("=");
                if (name) {
                    cookies.push({
                        name: name.trim(),
                        value: valueParts.join("=").trim(),
                        domain: null,
                        path: null,
                        expires: null,
                        http_only: null,
                        secure: null
                    });
                }
            }
        } else {
            result[h.key] = h.value;
        }
    }

    return { headers: result, cookies };
}

function parsePostmanItem(item: PostmanItem): RequestFile {
    const req = item.request;
    const { url, queryParams } = parsePostmanUrl(req.url);
    const { headers, cookies } = parsePostmanHeaders(req.header);
    const body = parsePostmanBody(req.body);
    const auth = parsePostmanAuth(req.auth);

    const apiRequest: ApiRequest = {
        ...createDefaultRequest(url, req.method.toUpperCase() as any),
        headers,
        query_params: queryParams,
        body,
        auth,
        cookies
    };

    return {
        id: generateId(),
        type: "request",
        name: item.name,
        description: typeof item.description === "string" ? item.description : undefined,
        request: apiRequest,
        response: null
    };
}

function parsePostmanItemGroup(group: PostmanItemGroup): Folder {
    const children: (Folder | RequestFile)[] = [];

    for (const child of group.item) {
        if (isItemGroup(child)) {
            children.push(parsePostmanItemGroup(child));
        } else {
            children.push(parsePostmanItem(child));
        }
    }

    return {
        id: generateId(),
        type: "folder",
        name: group.name,
        children,
        expanded: true
    };
}

export function parsePostmanCollection(collection: any): Partial<Project> {
    if (!collection.info || !collection.item) {
        throw new Error("Invalid Postman collection: missing info or item");
    }

    const root: Folder = {
        id: generateId(),
        type: "folder",
        name: "Root",
        children: [],
        expanded: true
    };

    for (const item of collection.item) {
        if (isItemGroup(item)) {
            root.children.push(parsePostmanItemGroup(item as PostmanItemGroup));
        } else {
            root.children.push(parsePostmanItem(item as PostmanItem));
        }
    }

    const environments: Environment[] = [];
    if (collection.variable && collection.variable.length > 0) {
        const variables: EnvironmentVariable[] = collection.variable.map((v: PostmanVariable) => ({
            id: generateId(),
            key: v.key,
            value: v.value || "",
            enabled: !v.disabled
        }));

        environments.push({
            id: generateId(),
            name: "Imported Variables",
            variables
        });
    }

    return {
        name: collection.info.name || "Imported Collection",
        description: typeof collection.info.description === "string"
            ? collection.info.description
            : undefined,
        root,
        environments,
        activeEnvironmentId: environments.length > 0 ? environments[0].id : null
    };
}
