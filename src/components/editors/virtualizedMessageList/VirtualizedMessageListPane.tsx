import type { ReactNode, RefObject } from "react";
import { TbArrowDown } from "react-icons/tb";
import { List, type ListImperativeAPI, type ListProps } from "react-window";
import { VIRTUAL_MESSAGE_LIST_OVERSCAN } from "./constants";

interface VirtualizedMessageListPaneProps<TRowProps extends object> {
	listRef: RefObject<ListImperativeAPI | null>;
	listContainerRef: RefObject<HTMLDivElement | null>;
	listWidth: number;
	listHeight: number;
	rowCount: number;
	rowHeight: ListProps<TRowProps>["rowHeight"];
	rowComponent: ListProps<TRowProps>["rowComponent"];
	rowProps: ListProps<TRowProps>["rowProps"];
	onRowsRendered?: (
		visibleRows: { startIndex: number; stopIndex: number },
		allRows: { startIndex: number; stopIndex: number },
	) => void;
	isAtBottom: boolean;
	onJumpToLatest: () => void;
	jumpLabel?: string;
	/** Optional slot under the list (inside the scroll region wrapper). */
	footer?: ReactNode;
}

/**
 * Measured list viewport + jump-to-latest control. Parent handles empty state.
 */
export function VirtualizedMessageListPane<TRowProps extends object>({
	listRef,
	listContainerRef,
	listWidth,
	listHeight,
	rowCount,
	rowHeight,
	rowComponent,
	rowProps,
	onRowsRendered,
	isAtBottom,
	onJumpToLatest,
	jumpLabel = "Jump to latest messages",
	footer,
}: VirtualizedMessageListPaneProps<TRowProps>) {
	return (
		<div
			ref={listContainerRef}
			className="relative min-h-0 w-full min-w-0 flex-1 py-3"
		>
			{listWidth > 0 && listHeight > 0 ? (
				<>
					<List<TRowProps>
						listRef={listRef}
						className="pb-0"
						style={{ width: listWidth, height: listHeight }}
						rowCount={rowCount}
						rowHeight={rowHeight}
						rowComponent={rowComponent}
						rowProps={rowProps}
						overscanCount={VIRTUAL_MESSAGE_LIST_OVERSCAN}
						onRowsRendered={onRowsRendered}
					/>
					{footer}
					{!isAtBottom && (
						<button
							type="button"
							onClick={onJumpToLatest}
							className="absolute bottom-4 left-1/2 z-10 inline-flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-background/90 text-white/80 shadow-lg backdrop-blur transition-colors hover:bg-background hover:text-white"
							aria-label={jumpLabel}
						>
							<TbArrowDown size={18} />
						</button>
					)}
				</>
			) : null}
		</div>
	);
}
