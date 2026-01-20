import type { Project, Folder, RequestFile } from "../../../types/project";
import type { AuthType, BodyType, Cookie } from "../../../bindings";
import { generateId } from "../shared";
import type {
    PostmanCollection,
    PostmanItem,
    PostmanItemGroup,
    PostmanUrl,
    PostmanHeader,
    PostmanBody,
    PostmanAuth,
    PostmanVariable
} from "./types";

function parseUrlForPostman(urlString: string, queryParams: Record<string, string>): PostmanUrl {
    const extraQueryParams = Object.entries(queryParams).map(([key, value]) => ({
        key,
        value: value || ""
    }));

    if (!urlString || urlString.trim() === "") {
        return {
            raw: extraQueryParams.length > 0
                ? "?" + extraQueryParams.map(q => `${q.key}=${q.value}`).join("&")
                : "",
            query: extraQueryParams.length > 0 ? extraQueryParams : undefined
        };
    }

    const [baseUrl, existingQueryString] = urlString.split("?");

    const allQueryParams: Array<{ key: string; value: string }> = [];

    if (existingQueryString) {
        const pairs = existingQueryString.split("&");
        for (const pair of pairs) {
            const eqIndex = pair.indexOf("=");
            if (eqIndex !== -1) {
                allQueryParams.push({
                    key: pair.substring(0, eqIndex),
                    value: pair.substring(eqIndex + 1)
                });
            } else if (pair) {
                allQueryParams.push({ key: pair, value: "" });
            }
        }
    }

    for (const param of extraQueryParams) {
        if (!allQueryParams.some(q => q.key === param.key)) {
            allQueryParams.push(param);
        }
    }

    let raw = baseUrl;
    if (allQueryParams.length > 0) {
        raw += "?" + allQueryParams.map(q => `${q.key}=${q.value}`).join("&");
    }

    let protocol: string | undefined;
    let host: string[] | undefined;
    let port: string | undefined;
    let path: string[] | undefined;

    const protocolMatch = baseUrl.match(/^([a-zA-Z][a-zA-Z\d+\-.]*):\/\//);
    if (protocolMatch) {
        protocol = protocolMatch[1];
        const afterProtocol = baseUrl.substring(protocolMatch[0].length);

        const pathStart = afterProtocol.indexOf("/");
        let hostPart: string;
        let pathPart: string;

        if (pathStart !== -1) {
            hostPart = afterProtocol.substring(0, pathStart);
            pathPart = afterProtocol.substring(pathStart + 1);
        } else {
            hostPart = afterProtocol;
            pathPart = "";
        }

        const portMatch = hostPart.match(/:(\d+)$/);
        if (portMatch) {
            port = portMatch[1];
            hostPart = hostPart.substring(0, hostPart.length - portMatch[0].length);
        }

        host = hostPart.split(".");
        if (pathPart) {
            path = pathPart.split("/").filter(p => p.length > 0);
        }
    }

    return {
        raw,
        protocol,
        host,
        port,
        path: path && path.length > 0 ? path : undefined,
        query: allQueryParams.length > 0 ? allQueryParams : undefined
    };
}

function convertAuthToPostman(auth: AuthType): PostmanAuth | null {
    if (auth === "None") {
        return { type: "noauth" };
    }
    if ("Bearer" in auth) {
        return {
            type: "bearer",
            bearer: [{ key: "token", value: auth.Bearer.token, type: "string" }]
        };
    }
    if ("Basic" in auth) {
        return {
            type: "basic",
            basic: [
                { key: "username", value: auth.Basic.username, type: "string" },
                { key: "password", value: auth.Basic.password, type: "string" }
            ]
        };
    }
    if ("ApiKey" in auth) {
        return {
            type: "apikey",
            apikey: [
                { key: "key", value: auth.ApiKey.key, type: "string" },
                { key: "value", value: auth.ApiKey.value, type: "string" },
                { key: "in", value: auth.ApiKey.add_to === "Header" ? "header" : "query", type: "string" }
            ]
        };
    }
    return null;
}

function convertBodyToPostman(body: BodyType): PostmanBody | null {
    if (body === "None") {
        return null;
    }
    if ("Raw" in body) {
        const contentType = body.Raw.content_type || "text/plain";
        let language = "text";
        if (contentType.includes("json")) language = "json";
        else if (contentType.includes("xml")) language = "xml";
        else if (contentType.includes("html")) language = "html";
        else if (contentType.includes("javascript")) language = "javascript";

        return {
            mode: "raw",
            raw: body.Raw.content,
            options: { raw: { language } }
        };
    }
    if ("FormUrlEncoded" in body) {
        return {
            mode: "urlencoded",
            urlencoded: Object.entries(body.FormUrlEncoded.fields).map(([key, value]) => ({
                key,
                value: value || ""
            }))
        };
    }
    if ("Multipart" in body) {
        return {
            mode: "formdata",
            formdata: body.Multipart.fields.map(field => {
                if ("Text" in field.value) {
                    return {
                        key: field.name,
                        value: field.value.Text,
                        type: "text" as const
                    };
                } else {
                    return {
                        key: field.name,
                        type: "file" as const,
                        src: field.value.File.filename || null
                    };
                }
            })
        };
    }
    if ("Binary" in body) {
        return {
            mode: "file",
            file: { src: body.Binary.filename || null }
        };
    }
    return null;
}

function convertCookiesToHeaders(cookies: Cookie[]): PostmanHeader[] {
    if (cookies.length === 0) return [];
    const cookieValue = cookies.map(c => `${c.name}=${c.value}`).join("; ");
    return [{ key: "Cookie", value: cookieValue }];
}

function convertRequestToPostman(req: RequestFile): PostmanItem {
    const apiReq = req.request;
    const queryParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(apiReq.query_params)) {
        if (v !== undefined) queryParams[k] = v;
    }
    const postmanUrl = parseUrlForPostman(apiReq.url, queryParams);

    const headers: PostmanHeader[] = Object.entries(apiReq.headers).map(([key, value]) => ({
        key,
        value: value || ""
    }));

    headers.push(...convertCookiesToHeaders(apiReq.cookies));

    const postmanRequest: any = {
        method: apiReq.method,
        header: headers,
        url: postmanUrl,
        description: req.description
    };

    const body = convertBodyToPostman(apiReq.body);
    if (body) {
        postmanRequest.body = body;
    }

    const auth = convertAuthToPostman(apiReq.auth);
    if (auth && auth.type !== "noauth") {
        postmanRequest.auth = auth;
    }

    return {
        name: req.name,
        request: postmanRequest,
        response: [],
        description: req.description
    };
}

function convertFolderToPostman(folder: Folder): PostmanItemGroup {
    const items: (PostmanItem | PostmanItemGroup)[] = [];

    for (const child of folder.children) {
        if (child.type === "folder") {
            items.push(convertFolderToPostman(child));
        } else {
            items.push(convertRequestToPostman(child));
        }
    }

    return {
        name: folder.name,
        item: items
    };
}

export function generatePostmanCollection(project: Project): PostmanCollection {
    const items: (PostmanItem | PostmanItemGroup)[] = [];

    for (const child of project.root.children) {
        if (child.type === "folder") {
            items.push(convertFolderToPostman(child));
        } else {
            items.push(convertRequestToPostman(child));
        }
    }

    const activeEnv = project.environments.find(e => e.id === project.activeEnvironmentId);
    const variables: PostmanVariable[] = activeEnv
        ? activeEnv.variables.map(v => ({
            key: v.key,
            value: v.value,
            type: "string",
            disabled: !v.enabled
        }))
        : [];

    return {
        info: {
            name: project.name,
            _postman_id: generateId(),
            description: project.description,
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        item: items,
        variable: variables.length > 0 ? variables : undefined
    };
}
