export interface OpenAPISpec {
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

export interface OpenAPIOperation {
    summary?: string;
    description?: string;
    operationId?: string;
    tags?: string[];
    servers?: { url: string }[];
    parameters?: OpenAPIParameter[];
    requestBody?: {
        content: Record<string, { schema?: any; example?: any }>;
    };
    responses?: Record<string, any>;
}

export interface OpenAPIParameter {
    name: string;
    in: "query" | "header" | "path" | "cookie";
    required?: boolean;
    schema?: { type: string; example?: any };
}
