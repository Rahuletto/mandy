import type { RefObject } from "react";
import type { ListImperativeAPI } from "react-window";

/**
 * Scroll the react-window List viewport to the bottom. Prefer this over `scrollToRow`
 * when using `useDynamicRowHeight`, until row sizes are measured.
 */
export function scrollListViewportToEnd(
	listRef: RefObject<ListImperativeAPI | null>,
	behavior: ScrollBehavior,
) {
	const el = listRef.current?.element;
	if (!el) return;
	const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
	el.scrollTo({ top: maxTop, behavior });
}
