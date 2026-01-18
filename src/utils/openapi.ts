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
    parameters?: Array<{
        name: string;
        in: "query" | "header" | "path" | "cookie";
        required?: boolean;
        schema?: { type: string };
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
    const requests: RequestFile[] = [];

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

                const request: RequestFile = {
                    id: generateId(),
                    type: "request",
                    name: op.summary || op.operationId || `${method.toUpperCase()} ${path}`,
                    description: op.description,
                    request: {
                        ...createDefaultRequest(path, method.toUpperCase() as any),
                        headers,
                        query_params: queryParams,
                        body,
                    },
                    response: null,
                };

                requests.push(request);
            }
        }
    }

    const root: Folder = {
        id: generateId(),
        type: "folder",
        name: "Root",
        children: requests,
        expanded: true,
    };

    const baseUrl = spec.servers?.[0]?.url;

    return {
        name: spec.info?.title || "Imported API",
        root,
        baseUrl,
    };
}

export function generateOpenAPISpec(project: Project): OpenAPISpec {
    const paths: Record<string, Record<string, OpenAPIOperation>> = {};

    function collectRequests(folder: Folder): RequestFile[] {
        const results: RequestFile[] = [];
        for (const child of folder.children) {
            if (child.type === "request") {
                results.push(child);
            } else {
                results.push(...collectRequests(child));
            }
        }
        return results;
    }

    const requests = collectRequests(project.root);

    for (const req of requests) {
        const url = req.request.url || "/";
        const method = req.request.method.toLowerCase();

        if (!paths[url]) {
            paths[url] = {};
        }

        const parameters: OpenAPIOperation["parameters"] = [];

        for (const [key] of Object.entries(req.request.query_params)) {
            parameters.push({
                name: key,
                in: "query",
                schema: { type: "string" },
            });
        }

        for (const [key] of Object.entries(req.request.headers)) {
            parameters.push({
                name: key,
                in: "header",
                schema: { type: "string" },
            });
        }

        let requestBody: OpenAPIOperation["requestBody"] | undefined;
        const body = req.request.body;
        if (body !== "None" && "Raw" in body && body.Raw.content_type?.includes("json")) {
            try {
                requestBody = {
                    content: {
                        "application/json": {
                            example: JSON.parse(body.Raw.content),
                        },
                    },
                };
            } catch { }
        }

        paths[url][method] = {
            summary: req.name,
            description: req.description,
            operationId: req.name.replace(/\s+/g, "_").toLowerCase(),
            parameters: parameters.length > 0 ? parameters : undefined,
            requestBody,
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

    if (project.baseUrl) {
        spec.servers = [{ url: project.baseUrl }];
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
