import {
	memo,
	type ReactElement,
	useCallback,
	useDeferredValue,
	useMemo,
	useState,
} from "react";
import { TbSearch, TbTrash } from "react-icons/tb";
import { type RowComponentProps, useDynamicRowHeight } from "react-window";
import type { SseConnectionStatus } from "../../hooks/useSse";
import type { SseEvent } from "../../types/project";
import { AutocompleteInput } from "../ui";
import {
	formatMessageTimestamp,
	useVirtualizedFollowList,
	useVirtualListHeightKey,
	VIRTUAL_MESSAGE_ROW_COLLAPSED_PX,
	VirtualizedMessageListPane,
} from "./virtualizedMessageList";

interface SseEventListProps {
	events: SseEvent[];
	status: SseConnectionStatus;
	onClear: () => void;
}

type RowProps = RowComponentProps<{
	filteredEvents: SseEvent[];
}>;

const EventRow = memo(function EventRow({
	index,
	style,
	ariaAttributes,
	filteredEvents,
}: RowProps): ReactElement | null {
	const event = filteredEvents[index];
	if (!event) return null;

	return (
		<div
			{...ariaAttributes}
			style={style}
			className="box-border w-full min-w-0 overflow-hidden border-white/5 border-b px-4 py-2"
		>
			<div className="flex items-center gap-2 text-white/40 text-xs">
				<span className="font-bold text-white/60">{event.event}</span>
				<span>{formatMessageTimestamp(event.timestamp)}</span>
				{event.sseId ? (
					<span className="font-mono text-white/30">id={event.sseId}</span>
				) : null}
			</div>
			<pre className="mt-1 whitespace-pre-wrap break-all font-mono text-white/70 text-xs">
				{event.data}
			</pre>
		</div>
	);
});

const VirtualListRow = memo(EventRow) as (
	props: RowProps,
) => ReactElement | null;

export function SseEventList({ events, status, onClear }: SseEventListProps) {
	const deferredEvents = useDeferredValue(events);
	const [searchQuery, setSearchQuery] = useState("");

	const filteredEvents = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return deferredEvents;
		return deferredEvents.filter(
			(e) =>
				e.event.toLowerCase().includes(q) || e.data.toLowerCase().includes(q),
		);
	}, [deferredEvents, searchQuery]);

	const {
		listRef,
		listContainerRef,
		listWidth,
		listHeight,
		isAtBottom,
		jumpToLatest,
		handleRowsRendered,
		resetFollowAfterClear,
	} = useVirtualizedFollowList({
		filteredCount: filteredEvents.length,
		messageVersion: deferredEvents.length,
		initialFollowOutput: true,
	});

	const dynamicHeightKey = useVirtualListHeightKey(
		searchQuery,
		"all",
		new Set(),
	);
	const dynamicRowHeight = useDynamicRowHeight({
		defaultRowHeight: VIRTUAL_MESSAGE_ROW_COLLAPSED_PX + 24,
		key: dynamicHeightKey,
	});

	const rowProps = useMemo(() => ({ filteredEvents }), [filteredEvents]);

	const handleClear = useCallback(() => {
		resetFollowAfterClear();
		onClear();
	}, [onClear, resetFollowAfterClear]);

	const statusLabel =
		status === "connected"
			? "Connected"
			: status === "connecting"
				? "Connecting…"
				: "Disconnected";

	return (
		<div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-inset">
			<div className="flex shrink-0 items-center gap-2 border-white/5 border-b p-2 px-4">
				<span className="font-medium text-white text-xs">Events</span>
				<div className="flex-1" />
				<div
					className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold text-[11px] ${
						status === "connected"
							? "bg-green/15 text-green"
							: status === "connecting"
								? "bg-yellow/15 text-yellow"
								: "bg-white/5 text-white/40"
					}`}
				>
					<div
						className={`h-1.5 w-1.5 rounded-full ${
							status === "connected"
								? "bg-green"
								: status === "connecting"
									? "animate-pulse bg-yellow"
									: "bg-white/20"
						}`}
					/>
					{statusLabel}
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-2 border-white/5 border-b px-4 py-2">
				<div className="flex min-w-0 flex-1 items-center rounded-lg bg-white/3 px-2.5 py-1.5">
					<TbSearch size={13} className="shrink-0 text-white/30" />
					<AutocompleteInput
						value={searchQuery}
						onChange={setSearchQuery}
						suggestions={[]}
						placeholder="Search events or payload"
						className="min-w-0 flex-1"
						inputClassName="h-full w-full text-xs text-white outline-none placeholder:text-white/20"
					/>
				</div>
				{events.length > 0 && (
					<button
						type="button"
						onClick={handleClear}
						className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
						aria-label="Clear events"
						title="Clear"
					>
						<TbTrash size={13} />
					</button>
				)}
			</div>

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{filteredEvents.length === 0 ? (
					<div className="flex h-full items-center justify-center px-6 py-12 text-sm text-white/20">
						{events.length === 0
							? status === "connected"
								? "Waiting for events…"
								: "Connect to receive SSE events"
							: "No events match your filter"}
					</div>
				) : (
					<VirtualizedMessageListPane<{ filteredEvents: SseEvent[] }>
						listRef={listRef}
						listContainerRef={listContainerRef}
						listWidth={listWidth}
						listHeight={listHeight}
						rowCount={filteredEvents.length}
						rowHeight={dynamicRowHeight}
						rowComponent={VirtualListRow}
						rowProps={rowProps}
						onRowsRendered={handleRowsRendered}
						isAtBottom={isAtBottom}
						onJumpToLatest={jumpToLatest}
						jumpLabel="Jump to latest events"
					/>
				)}
			</div>
		</div>
	);
}
