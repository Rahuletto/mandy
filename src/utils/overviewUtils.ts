import { ObjectDefinition } from "../types/overview";

export const getValueType = (value: unknown): string => {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
};


export const getTypeColor = (type: string) => {
    switch (type) {
        case "string": return "text-sky-400";
        case "number": return "text-emerald-400";
        case "boolean": return "text-purple-400";
        case "object": return "text-amber-400";
        case "array": return "text-pink-400";
        default: return "text-white/30";
    }
};

export const extractDefinitions = (data: any, rootName: string, seen: Set<string> = new Set()): ObjectDefinition[] => {
    const defs: ObjectDefinition[] = [];

    const extract = (obj: any, parentName: string) => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;

        if (Object.keys(obj).length === 0) return;

        const name = parentName.charAt(0).toUpperCase() + parentName.slice(1);
        if (seen.has(name)) return;
        seen.add(name);

        defs.push({ name, properties: obj });

        Object.entries(obj).forEach(([key, value]) => {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                extract(value, key);
            } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
                extract(value[0], key + 'Item');
            }
        });
    };

    extract(data, rootName);
    return defs;
};

export const scrollToId = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        element.classList.add('bg-white/5');
        setTimeout(() => element.classList.remove('bg-white/5'), 2000);
    }
};
