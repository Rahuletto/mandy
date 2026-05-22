import type { KeyValueItem } from "../types/project";

export function buildHeaderMap(
	headerItems: KeyValueItem[] | undefined,
	headers: Record<string, string> | undefined,
	resolve: (text: string) => string,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const item of headerItems ?? []) {
		if (item.enabled && item.key) {
			out[resolve(item.key)] = resolve(item.value);
		}
	}
	for (const [k, v] of Object.entries(headers ?? {})) {
		out[resolve(k)] = resolve(v);
	}
	return out;
}
