import { useMemo } from "react";

/**
 * Key for `useDynamicRowHeight` — must NOT include message ids or it resets
 * measurement on every new frame (jitter). Only filter/search/expand state.
 */
export function useVirtualListHeightKey(
	searchQuery: string,
	filterKey: string,
	expandedMessages: Set<string>,
): string {
	return useMemo(
		() =>
			`${searchQuery}::${filterKey}::${Array.from(expandedMessages).sort().join("\0")}`,
		[expandedMessages, filterKey, searchQuery],
	);
}
