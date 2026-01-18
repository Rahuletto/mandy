import type { Project, Folder, RequestFile } from "../types/project";
import { createDefaultRequest } from "../reqhelpers/rest";

interface OpenAPISpec {
    openapi: string;
    info: {
        title: string;
        version: string;
        description?: string;
    };
    servers?: { url: string }[];
    paths: Record<string, Record<string, OpenAPIOperation>>;
    components?: {
        securitySchemes?: Record<string, any>;
    };
}

interface OpenAPIOperation {
    summary?: string;
    description?: string;
    operationId?: string;
    tags?: string[];
    servers?: { url: string }[];
    parameters?: Array<{
        name: string;
        in: "query" | "header" | "path" | "cookie";
        required?: boolean;
        schema?: { type: string; example?: any };
    }>;
    requestBody?: {
        content: Record<string, { schema?: any; example?: any }>;
    };
    responses?: Record<string, any>;
}

function generateId(): string {
    return crypto.randomUUID();
}

export function parseOpenAPISpec(spec: any): Partial<Project> {
    const root: Folder = {
        id: generateId(),
        type: "folder",
        name: "Root",
        children: [],
        expanded: true,
    };

    function getOrCreateFolder(parent: Folder, name: string): Folder {
        const existing = parent.children.find(
            (c) => c.type === "folder" && c.name === name
        ) as Folder | undefined;

        if (existing) return existing;

        const newFolder: Folder = {
            id: generateId(),
            type: "folder",
            name,
            children: [],
            expanded: true,
        };
        parent.children.push(newFolder);
        return newFolder;
    }

    const paths = spec.paths || {};
    for (const [path, methods] of Object.entries(paths)) {
        for (const [method, operation] of Object.entries(methods as Record<string, OpenAPIOperation>)) {
            if (["get", "post", "put", "patch", "delete", "head", "options"].includes(method.toLowerCase())) {
                const op = operation as OpenAPIOperation;

                const queryParams: Record<string, string> = {};
                const headers: Record<string, string> = {};

                if (op.parameters) {
                    for (const param of op.parameters) {
                        if (param.in === "query") {
                            queryParams[param.name] = "";
                        } else if (param.in === "header") {
                            headers[param.name] = "";
                        }
                    }
                }

                let body: any = "None";
                if (op.requestBody?.content) {
                    const jsonContent = op.requestBody.content["application/json"];
                    if (jsonContent?.example) {
                        body = {
                            Raw: {
                                content: JSON.stringify(jsonContent.example, null, 2),
                                content_type: "application/json",
                            },
                        };
                    }
                }

                // Determine full URL, checking for operation-level server overrides
                let fullUrl = path;
                const opServer = op.servers && op.servers.length > 0 ? op.servers[0].url : null;

                if (opServer) {
                    // Combine server and path, handling potential double slashes
                    const safeServer = opServer.endsWith("/") ? opServer.slice(0, -1) : opServer;
                    const safePath = path.startsWith("/") ? path : "/" + path;
                    fullUrl = safeServer + safePath;
                }

                const request: RequestFile = {
                    id: generateId(),
                    type: "request",
                    name: op.summary || op.operationId || `${method.toUpperCase()} ${path}`,
                    description: op.description,
                    request: {
                        ...createDefaultRequest(fullUrl, method.toUpperCase() as any),
                        headers,
                        query_params: queryParams,
                        body,
                    },
                    response: null,
                };

                // Determine folder location
                let targetFolder = root;
                if (op.tags && op.tags.length > 0 && typeof op.tags[0] === 'string') {
                    // We take the first tag as the "path"
                    // and support "/" as separator for hierarchy
                    const pathParts = op.tags[0].split("/");
                    for (const part of pathParts) {
                        const trimmedPart = part.trim();
                        if (trimmedPart) {
                            targetFolder = getOrCreateFolder(targetFolder, trimmedPart);
                        }
                    }
                }

                targetFolder.children.push(request);
            }
        }
    }

    const baseUrl = spec.servers?.[0]?.url;

    return {
        name: spec.info?.title || "Imported API",
        root,
        baseUrl,
    };
}

export function generateOpenAPISpec(project: Project, resolver?: (s: string) => string): OpenAPISpec {
    const paths: Record<string, Record<string, OpenAPIOperation>> = {};

    // We want to determine the "Global Base URL" for the spec.
    const rawProjectBaseUrl = project.baseUrl || "";
    const resolvedBaseUrl = resolver && rawProjectBaseUrl ? resolver(rawProjectBaseUrl) : rawProjectBaseUrl;

    function collectRequests(folder: Folder, path: string[] = []): { request: RequestFile; folders: string[] }[] {
        const results: { request: RequestFile; folders: string[] }[] = [];
        for (const child of folder.children) {
            if (child.type === "request") {
                results.push({ request: child, folders: path });
            } else {
                results.push(...collectRequests(child, [...path, child.name]));
            }
        }
        return results;
    }

    const requestsWithContext = collectRequests(project.root);

    for (const { request: req, folders } of requestsWithContext) {
        let url = req.request.url || "/";
        // Do NOT resolve the request URL immediately for parsing URL structure if it contains base URL logic

        const method = req.request.method.toLowerCase();
        let pathKey = url;
        let operationServers: { url: string }[] | undefined;

        try {
            // Logic: 
            // 1. If URL starts with explicit "/" -> It is Relative. Use Global Server (implicit).
            // 2. If URL starts with the Project Base URL (Raw OR Resolved) -> It matches the Global Server. STRIP it to make it Relative.
            // 3. Otherwise -> It is a different Absolute URL. Extract Origin as Operation Server override.

            let isRelative = url.startsWith("/");
            let strippedUrl = url;

            if (!isRelative) {
                // Check if it starts with Raw Base URL (e.g. {{baseUrl}})
                if (rawProjectBaseUrl && url.startsWith(rawProjectBaseUrl)) {
                    isRelative = true;
                    strippedUrl = url.substring(rawProjectBaseUrl.length);
                }
                // Check if it starts with Resolved Base URL (e.g. https://api.com)
                else if (resolvedBaseUrl && url.startsWith(resolvedBaseUrl)) {
                    isRelative = true;
                    strippedUrl = url.substring(resolvedBaseUrl.length);
                }
            }

            if (isRelative) {
                // It is relative (or became relative after stripping).
                // Ensure it starts with /
                pathKey = strippedUrl;
                if (!pathKey.startsWith("/")) {
                    pathKey = "/" + pathKey;
                }
                // No operationServers needed because it matches Global
            } else {
                // It is an Absolute URL that DOES NOT match the Base URL.
                // We must preserve it as an Override.

                let origin = "";
                // Attempt to parse standard URL
                try {
                    const hasProtocol = url.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//);
                    const urlToParse = hasProtocol ? url : `http://${url}`;
                    const urlObj = new URL(urlToParse);

                    // Reconstruct Origin
                    origin = hasProtocol ? urlObj.origin : urlObj.host; // host includes port if present

                    // Path is pathname + search
                    pathKey = urlObj.pathname;
                    if (urlObj.search && urlObj.search.length > 1) {
                        pathKey += urlObj.search;
                    }

                    // Special check for variables at start which URL parser might swallow into host
                    if (!hasProtocol && (url.includes("{{") || url.includes("<<"))) {
                        throw new Error("Variable in URL");
                    }

                } catch (e) {
                    // Fallback: Split by first slash
                    const firstSlash = url.indexOf('/');
                    if (firstSlash !== -1) {
                        origin = url.substring(0, firstSlash);
                        pathKey = url.substring(firstSlash);
                    } else {
                        origin = url;
                        pathKey = "/";
                    }
                }

                operationServers = [{ url: origin }];
            }

            // Final check on pathKey
            if (pathKey.length === 0) pathKey = "/";

        } catch (e) {
            console.warn("Failed to parse URL for OpenAPI export:", url);
        }

        if (!paths[pathKey]) {
            paths[pathKey] = {};
        }

        const parameters: OpenAPIOperation["parameters"] = [];

        for (const [key, value] of Object.entries(req.request.query_params)) {
            parameters.push({
                name: key,
                in: "query",
                schema: { type: "string", example: resolver ? resolver(String(value || "")) : value },
            });
        }

        for (const [key, value] of Object.entries(req.request.headers)) {
            parameters.push({
                name: key,
                in: "header",
                schema: { type: "string", example: resolver ? resolver(String(value || "")) : value },
            });
        }

        let requestBody: OpenAPIOperation["requestBody"] | undefined;
        const body = req.request.body;
        if (body !== "None" && "Raw" in body && body.Raw.content_type?.includes("json")) {
            try {
                let contentStr = body.Raw.content;
                if (resolver) {
                    contentStr = resolver(contentStr);
                }

                requestBody = {
                    content: {
                        "application/json": {
                            example: JSON.parse(contentStr),
                        },
                    },
                };
            } catch { }
        }

        paths[pathKey][method] = {
            summary: req.name,
            description: req.description,
            operationId: req.name.replace(/\s+/g, "_").toLowerCase(),
            tags: folders.length > 0 ? [folders.join("/")] : undefined,
            parameters: parameters.length > 0 ? parameters : undefined,
            requestBody,
            servers: operationServers,
            responses: {
                "200": { description: "Successful response" },
            },
        };
    }

    const spec: OpenAPISpec = {
        openapi: "3.0.3",
        info: {
            title: project.name,
            version: "1.0.0",
        },
        paths,
    };

    if (resolvedBaseUrl) {
        spec.servers = [{ url: resolvedBaseUrl }];
    }

    return spec;
}

export function exportToMatchstickJSON(project: Project): string {
    return JSON.stringify(project, null, 2);
}

export function parseMatchstickJSON(json: string): Project | null {
    try {
        const parsed = JSON.parse(json);
        if (parsed.root && parsed.name) {
            // Regenerate IDs to avoid conflicts
            const regenerateIds = (folder: Folder): Folder => {
                return {
                    ...folder,
                    id: generateId(),
                    children: folder.children.map((child) =>
                        child.type === "folder"
                            ? regenerateIds(child)
                            : { ...child, id: generateId() }
                    ),
                };
            };

            return {
                ...parsed,
                id: generateId(),
                root: regenerateIds(parsed.root),
            };
        }
        return null;
    } catch {
        return null;
    }
}
