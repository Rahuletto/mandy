import type { Cookie } from "../../bindings";

export function generateId(): string {
    return crypto.randomUUID();
}

export function generatePrefixedId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").substring(0, 24)}`;
}

export function parseCookieHeader(value: string): Cookie[] {
    const cookies: Cookie[] = [];
    const cookieParts = value.split(";").map(p => p.trim());

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

    return cookies;
}

export function cookiesToHeaderValue(cookies: Cookie[]): string {
    if (cookies.length === 0) return "";
    return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

export function headersToObject(headers: Array<{ key?: string; name?: string; value: string; disabled?: boolean }>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const h of headers) {
        if (h.disabled) continue;
        const key = h.key || h.name || "";
        if (key) {
            result[key] = h.value;
        }
    }
    return result;
}

export function objectToHeaders<T extends { key?: string; name?: string; value: string }>(
    obj: Record<string, string>,
    format: "key" | "name" = "key"
): T[] {
    return Object.entries(obj).map(([k, v]) => {
        if (format === "name") {
            return { name: k, value: v || "" } as T;
        }
        return { key: k, value: v || "" } as T;
    });
}
