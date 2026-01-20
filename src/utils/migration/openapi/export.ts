import type { Project, Folder, RequestFile } from "../../../types/project";
import type { OpenAPISpec, OpenAPIOperation } from "./types";

export function generateOpenAPISpec(
  project: Project,
  resolver?: (s: string) => string,
): OpenAPISpec {
  const paths: Record<string, Record<string, OpenAPIOperation>> = {};

  const rawProjectBaseUrl = project.baseUrl || "";
  const resolvedBaseUrl =
    resolver && rawProjectBaseUrl
      ? resolver(rawProjectBaseUrl)
      : rawProjectBaseUrl;

  function collectRequests(
    folder: Folder,
    path: string[] = [],
  ): { request: RequestFile; folders: string[] }[] {
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
    const method = req.request.method.toLowerCase();
    let pathKey = url;
    let operationServers: { url: string }[] | undefined;

    try {
      let isRelative = url.startsWith("/");
      let strippedUrl = url;

      if (!isRelative) {
        if (rawProjectBaseUrl && url.startsWith(rawProjectBaseUrl)) {
          isRelative = true;
          strippedUrl = url.substring(rawProjectBaseUrl.length);
        } else if (resolvedBaseUrl && url.startsWith(resolvedBaseUrl)) {
          isRelative = true;
          strippedUrl = url.substring(resolvedBaseUrl.length);
        }
      }

      if (isRelative) {
        pathKey = strippedUrl;
        if (!pathKey.startsWith("/")) {
          pathKey = "/" + pathKey;
        }
      } else {
        let origin = "";
        try {
          const hasProtocol = url.match(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//);
          const urlToParse = hasProtocol ? url : `http://${url}`;
          const urlObj = new URL(urlToParse);

          origin = hasProtocol ? urlObj.origin : urlObj.host;
          pathKey = urlObj.pathname;
          if (urlObj.search && urlObj.search.length > 1) {
            pathKey += urlObj.search;
          }

          if (!hasProtocol && (url.includes("{{") || url.includes("<<"))) {
            throw new Error("Variable in URL");
          }
        } catch {
          const firstSlash = url.indexOf("/");
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

      if (pathKey.length === 0) pathKey = "/";
    } catch {
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
        schema: {
          type: "string",
          example: resolver ? resolver(String(value || "")) : value,
        },
      });
    }

    for (const [key, value] of Object.entries(req.request.headers)) {
      parameters.push({
        name: key,
        in: "header",
        schema: {
          type: "string",
          example: resolver ? resolver(String(value || "")) : value,
        },
      });
    }

    let requestBody: OpenAPIOperation["requestBody"] | undefined;
    const body = req.request.body;
    if (
      body !== "None" &&
      "Raw" in body &&
      body.Raw.content_type?.includes("json")
    ) {
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
      } catch {}
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
