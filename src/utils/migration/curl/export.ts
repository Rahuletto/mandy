import type { ApiRequest } from "../../../bindings";

export function generateCurl(request: ApiRequest): string {
    const parts = ["curl"];

    parts.push("--request", request.method);
    parts.push("--url", `'${request.url}'`);

    Object.entries(request.headers).forEach(([key, value]) => {
        if (value) {
            parts.push("--header", `'${key}: ${value}'`);
        }
    });

    if (request.body !== "None") {
        if ("Raw" in request.body) {
            const { content, content_type } = request.body.Raw;
            if (content_type) {
                parts.push("--header", `'Content-Type: ${content_type}'`);
            }
            parts.push("--data", `'${content.replace(/'/g, "'\\''")}'`);
        } else if ("FormUrlEncoded" in request.body) {
            parts.push("--header", "'Content-Type: application/x-www-form-urlencoded'");
            const params = new URLSearchParams();
            Object.entries(request.body.FormUrlEncoded.fields).forEach(([key, value]) => {
                if (value) params.append(key, value);
            });
            parts.push("--data", `'${params.toString()}'`);
        } else if ("Multipart" in request.body) {
            for (const field of request.body.Multipart.fields) {
                if ("Text" in field.value) {
                    parts.push("--form", `'${field.name}=${field.value.Text}'`);
                } else {
                    parts.push("--form", `'${field.name}=@${field.value.File.filename || "file"}'`);
                }
            }
        }
    }

    return parts.join(" \\\n  ");
}
