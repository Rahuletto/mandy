import { useCallback, useEffect, useRef, useState } from "react";
import { useListRef } from "react-window";
import { useListContainerSize } from "../../../hooks/useListContainerSize";
import { scrollListViewportToEnd } from "./scrollListViewport";

export interface UseVirtualizedFollowListOptions {
	/** Number of rows currently shown (usually filtered list length). */
	filteredCount: number;
	/** Bumps auto-scroll when the backing message array grows (e.g. `messages.length`). */
	messageVersion: number;
	/** Initial “stick to bottom” / follow stream. */
	initialFollowOutput?: boolean;
}

/**
 * Shared scroll-follow + bottom detection for react-window `List` message UIs.
 * Matches Socket.IO behavior (align end, timeout cleanup on unmount).
 */
export function useVirtualizedFollowList({
	filteredCount,
	messageVersion,
	initialFollowOutput = false,
}: UseVirtualizedFollowListOptions) {
	const listRef = useListRef(null);
	const {
		ref: listContainerRef,
		width: listWidth,
		height: listHeight,
	} = useListContainerSize();

	const [followOutput, setFollowOutput] = useState(initialFollowOutput);
	const [isAtBottom, setIsAtBottom] = useState(true);
	const followOutputRef = useRef(followOutput);
	const isAtBottomRef = useRef(true);
	const followScrollInFlightRef = useRef(false);
	const followTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearFollowTimeout = useCallback(() => {
		if (followTimeoutRef.current !== null) {
			clearTimeout(followTimeoutRef.current);
			followTimeoutRef.current = null;
		}
	}, []);

	const scheduleFollowScrollEnd = useCallback(() => {
		clearFollowTimeout();
		followTimeoutRef.current = setTimeout(() => {
			followScrollInFlightRef.current = false;
			followTimeoutRef.current = null;
		}, 550);
	}, [clearFollowTimeout]);

	useEffect(() => {
		followOutputRef.current = followOutput;
	}, [followOutput]);

	useEffect(() => {
		isAtBottomRef.current = isAtBottom;
	}, [isAtBottom]);

	useEffect(
		() => () => {
			clearFollowTimeout();
		},
		[clearFollowTimeout],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: messageVersion triggers auto-scroll when new messages arrive
	useEffect(() => {
		if (!followOutput || filteredCount === 0) return;
		followScrollInFlightRef.current = true;
		let cancelled = false;
		let innerRaf = 0;
		const outerRaf = requestAnimationFrame(() => {
			if (cancelled) return;
			scrollListViewportToEnd(listRef, "instant");
			if (cancelled) return;
			innerRaf = requestAnimationFrame(() => {
				if (cancelled) return;
				scrollListViewportToEnd(listRef, "instant");
				scheduleFollowScrollEnd();
			});
		});
		return () => {
			cancelled = true;
			cancelAnimationFrame(outerRaf);
			cancelAnimationFrame(innerRaf);
			clearFollowTimeout();
		};
	}, [
		filteredCount,
		messageVersion,
		followOutput,
		listRef,
		scheduleFollowScrollEnd,
		clearFollowTimeout,
	]);

	const jumpToLatest = useCallback(() => {
		if (filteredCount === 0) return;
		setFollowOutput(true);
		setIsAtBottom(true);
		followOutputRef.current = true;
		isAtBottomRef.current = true;
		followScrollInFlightRef.current = true;
		requestAnimationFrame(() => {
			scrollListViewportToEnd(listRef, "instant");
			requestAnimationFrame(() => {
				scrollListViewportToEnd(listRef, "smooth");
				scheduleFollowScrollEnd();
			});
		});
	}, [filteredCount, listRef, scheduleFollowScrollEnd]);

	const handleRowsRendered = useCallback(
		(visibleRows: { startIndex: number; stopIndex: number }) => {
			const nextAtBottom =
				filteredCount === 0 || visibleRows.stopIndex >= filteredCount - 1;

			if (nextAtBottom !== isAtBottomRef.current) {
				isAtBottomRef.current = nextAtBottom;
				setIsAtBottom(nextAtBottom);
			}

			if (nextAtBottom && followScrollInFlightRef.current) {
				followScrollInFlightRef.current = false;
			}

			if (followScrollInFlightRef.current) {
				return;
			}

			if (!nextAtBottom && followOutputRef.current) {
				followOutputRef.current = false;
				setFollowOutput(false);
			}
		},
		[filteredCount],
	);

	const resetFollowAfterClear = useCallback(() => {
		setFollowOutput(initialFollowOutput);
		setIsAtBottom(true);
		followOutputRef.current = initialFollowOutput;
		isAtBottomRef.current = true;
		followScrollInFlightRef.current = false;
		clearFollowTimeout();
	}, [clearFollowTimeout, initialFollowOutput]);

	return {
		listRef,
		listContainerRef,
		listWidth,
		listHeight,
		followOutput,
		setFollowOutput,
		isAtBottom,
		jumpToLatest,
		handleRowsRendered,
		resetFollowAfterClear,
	};
}
