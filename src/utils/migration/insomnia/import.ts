import type { Project, Folder, RequestFile, Environment, EnvironmentVariable } from "../../../types/project";
import type { ApiRequest, AuthType, BodyType, Cookie } from "../../../bindings";
import { createDefaultRequest } from "../../../reqhelpers/rest";
import type {
    InsomniaResourceType,
    InsomniaWorkspace,
    InsomniaEnvironment,
    InsomniaRequest,
    InsomniaHeader,
    InsomniaBody,
    InsomniaAuthentication
} from "./types";

function parseInsomniaAuth(auth: InsomniaAuthentication | undefined): AuthType {
    if (!auth || auth.type === "none" || auth.disabled) {
        return "None";
    }

    if (auth.type === "bearer") {
        return { Bearer: { token: auth.token || "" } };
    }

    if (auth.type === "basic") {
        return {
            Basic: {
                username: auth.username || "",
                password: auth.password || ""
            }
        };
    }

    if (auth.type === "apikey") {
        return {
            ApiKey: {
                key: auth.key || "",
                value: auth.value || "",
                add_to: auth.addTo === "queryParams" ? "Query" : "Header"
            }
        };
    }

    return "None";
}

function parseInsomniaBody(body: InsomniaBody | undefined): BodyType {
    if (!body || (!body.text && !body.params && !body.fileName)) {
        return "None";
    }

    const mimeType = body.mimeType || "";

    if (body.params && body.params.length > 0) {
        if (mimeType.includes("x-www-form-urlencoded")) {
            const fields: Record<string, string> = {};
            for (const p of body.params) {
                if (!p.disabled) {
                    fields[p.name] = p.value;
                }
            }
            return { FormUrlEncoded: { fields } };
        }

        if (mimeType.includes("multipart/form-data")) {
            const fields = body.params
                .filter(p => !p.disabled)
                .map(p => {
                    if (p.type === "file") {
                        return {
                            name: p.name,
                            value: {
                                File: {
                                    data: [],
                                    filename: p.fileName || p.name,
                                    content_type: null
                                }
                            }
                        };
                    }
                    return {
                        name: p.name,
                        value: { Text: p.value }
                    };
                });
            return { Multipart: { fields } };
        }
    }

    if (body.text !== undefined) {
        return {
            Raw: {
                content: body.text,
                content_type: mimeType || "text/plain"
            }
        };
    }

    if (body.fileName) {
        return {
            Binary: {
                data: [],
                filename: body.fileName
            }
        };
    }

    return "None";
}

function parseInsomniaHeaders(headers: InsomniaHeader[] | undefined): {
    headers: Record<string, string>;
    cookies: Cookie[];
} {
    const result: Record<string, string> = {};
    const cookies: Cookie[] = [];

    if (!headers) {
        return { headers: result, cookies };
    }

    for (const h of headers) {
        if (h.disabled) continue;

        if (h.name.toLowerCase() === "cookie") {
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
            result[h.name] = h.value;
        }
    }

    return { headers: result, cookies };
}

function parseInsomniaRequest(resource: InsomniaRequest): RequestFile {
    const { headers, cookies } = parseInsomniaHeaders(resource.headers);

    const queryParams: Record<string, string> = {};
    if (resource.parameters) {
        for (const p of resource.parameters) {
            if (!p.disabled) {
                queryParams[p.name] = p.value;
            }
        }
    }

    const apiRequest: ApiRequest = {
        ...createDefaultRequest(resource.url, resource.method.toUpperCase() as any),
        headers,
        query_params: queryParams,
        body: parseInsomniaBody(resource.body),
        auth: parseInsomniaAuth(resource.authentication),
        cookies
    };

    return {
        id: crypto.randomUUID(),
        type: "request",
        name: resource.name,
        description: resource.description,
        request: apiRequest,
        response: null
    };
}

export function parseInsomniaExport(data: any): Partial<Project> {
    if (!data.resources || !Array.isArray(data.resources)) {
        throw new Error("Invalid Insomnia export: missing resources array");
    }

    const resources = data.resources as InsomniaResourceType[];

    const workspace = resources.find(r => r._type === "workspace") as InsomniaWorkspace | undefined;
    if (!workspace) {
        throw new Error("Invalid Insomnia export: no workspace found");
    }

    const childrenMap = new Map<string, InsomniaResourceType[]>();
    for (const resource of resources) {
        const parentId = resource.parentId || "";
        if (!childrenMap.has(parentId)) {
            childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId)!.push(resource);
    }

    function buildFolder(parentId: string, name: string): Folder {
        const children: (Folder | RequestFile)[] = [];
        const childResources = childrenMap.get(parentId) || [];

        childResources.sort((a, b) => {
            const aKey = (a as any).metaSortKey ?? 0;
            const bKey = (b as any).metaSortKey ?? 0;
            return aKey - bKey;
        });

        for (const child of childResources) {
            if (child._type === "request_group") {
                children.push(buildFolder(child._id, child.name));
            } else if (child._type === "request") {
                children.push(parseInsomniaRequest(child as InsomniaRequest));
            }
        }

        return {
            id: crypto.randomUUID(),
            type: "folder",
            name,
            children,
            expanded: true
        };
    }

    const root = buildFolder(workspace._id, "Root");

    const environments: Environment[] = [];
    const baseEnv = resources.find(r =>
        r._type === "environment" &&
        r.parentId === workspace._id
    ) as InsomniaEnvironment | undefined;

    if (baseEnv) {
        const subEnvs = resources.filter(r =>
            r._type === "environment" &&
            r.parentId === baseEnv._id
        ) as InsomniaEnvironment[];

        for (const env of subEnvs) {
            const variables: EnvironmentVariable[] = Object.entries(env.data || {}).map(([key, value]) => ({
                id: crypto.randomUUID(),
                key,
                value: String(value),
                enabled: true
            }));

            environments.push({
                id: crypto.randomUUID(),
                name: env.name,
                variables
            });
        }
    }

    return {
        name: workspace.name || "Imported Collection",
        description: workspace.description,
        root,
        environments,
        activeEnvironmentId: environments.length > 0 ? environments[0].id : null
    };
}
