type Language = "json" | "xml" | "html" | "text";

export function prettifyJson(code: string): string {
    try {
        const parsed = JSON.parse(code);
        return JSON.stringify(parsed, null, 2);
    } catch {
        return code;
    }
}

export function prettifyXml(code: string): string {
    try {
        let formatted = '';
        let indent = 0;
        const normalized = code.replace(/>\s*</g, '><').trim();
        const parts = normalized.split(/(<[^>]+>)/);

        for (const part of parts) {
            if (!part.trim()) continue;

            if (part.match(/^<\/\w/)) {
                indent = Math.max(0, indent - 1);
            }

            formatted += '  '.repeat(indent) + part.trim() + '\n';

            if (part.match(/^<\w[^>]*[^/]>$/) && !part.match(/^<(br|hr|img|input|meta|link|area|base|col|embed|param|source|track|wbr)/i)) {
                indent++;
            }
        }

        return formatted.trim();
    } catch {
        return code;
    }
}

export function prettifyHtml(code: string): string {
    try {
        let formatted = '';
        let indent = 0;
        const normalized = code.replace(/>\s+</g, '><').trim();
        const parts = normalized.split(/(<[^>]+>)/);

        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('<')) {
                if (trimmed.match(/^<\/\w/)) {
                    indent = Math.max(0, indent - 1);
                }

                formatted += '  '.repeat(indent) + trimmed + '\n';

                if (trimmed.match(/^<\w[^>]*[^/]>$/) &&
                    !trimmed.match(/^<(br|hr|img|input|meta|link|area|base|col|embed|param|source|track|wbr|!doctype)/i)) {
                    indent++;
                }
            } else {
                formatted += '  '.repeat(indent) + trimmed + '\n';
            }
        }

        return formatted.trim();
    } catch {
        return code;
    }
}

export function prettifyCode(code: string, language: Language): string {
    switch (language) {
        case "json":
            return prettifyJson(code);
        case "xml":
            return prettifyXml(code);
        case "html":
            return prettifyHtml(code);
        default:
            return code;
    }
}
