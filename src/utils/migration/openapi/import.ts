import type { Project, Folder, RequestFile } from "../../../types/project";
import { createDefaultRequest } from "../../../reqhelpers/rest";
import { generateId } from "../shared";
import type { OpenAPIOperation } from "./types";

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

                let fullUrl = path;
                const opServer = op.servers && op.servers.length > 0 ? op.servers[0].url : null;

                if (opServer) {
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

                let targetFolder = root;
                if (op.tags && op.tags.length > 0 && typeof op.tags[0] === 'string') {
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
