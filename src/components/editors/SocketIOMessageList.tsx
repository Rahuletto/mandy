import {
	type CSSProperties,
	memo,
	type ReactElement,
	useCallback,
	useDeferredValue,
	useMemo,
	useState,
} from "react";
import {
	TbArrowDown,
	TbArrowUp,
	TbChevronDown,
	TbChevronRight,
	TbCircleCheck,
	TbCircleX,
	TbFilter,
	TbSearch,
	TbTrash,
} from "react-icons/tb";
import { type RowComponentProps, useDynamicRowHeight } from "react-window";
import type { SocketIOMessage } from "../../types/project";
import { formatBytes } from "../../utils/format";
import { utf8ByteLength } from "../../utils/workflowMetrics";
import { CodeViewer } from "../CodeMirror";
import { AutocompleteInput } from "../ui";
import {
	formatMessageTimestamp,
	useVirtualizedFollowList,
	useVirtualListHeightKey,
	VIRTUAL_MESSAGE_ROW_BODY_MAX_PX,
	VIRTUAL_MESSAGE_ROW_COLLAPSED_PX,
	VirtualizedMessageListPane,
} from "./virtualizedMessageList";

interface SocketIOMessageListProps {
	messages: SocketIOMessage[];
	status: "connected" | "connecting" | "disconnected";
	onClear: () => void;
}

type MessageFilter = "all" | "sent" | "received" | "system";

function getEventBadgeStyle(eventName: string): CSSProperties {
	const name = eventName || "message";
	let hash = 0;
	for (let i = 0; i < name.length; i += 1) {
		hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	}
	const hue = hash % 360;
	return {
		backgroundColor: `hsl(${hue}, 72%, 62%)`,
		color: "var(--color-background, #0a0a0a)",
	};
}

function renderEventSuggestion(eventName: string) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<span
				className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-extrabold"
				style={getEventBadgeStyle(eventName)}
			>
				{eventName}
			</span>
			<span className="truncate font-mono text-[11px] text-white/45">
				event
			</span>
		</div>
	);
}

function getDirectionIcon(message: SocketIOMessage) {
	if (message.direction === "system" && message.data.startsWith("Connected")) {
		return <TbCircleCheck size={13} />;
	}
	if (
		message.direction === "system" &&
		message.data.startsWith("Disconnected")
	) {
		return <TbCircleX size={13} />;
	}
	if (message.direction === "send") {
		return <TbArrowUp size={13} />;
	}
	if (message.direction === "receive") {
		return <TbArrowDown size={13} />;
	}
	return "SYS";
}

function getDirectionIconClass(message: SocketIOMessage): string {
	if (message.direction === "system" && message.data.startsWith("Connected")) {
		return "text-green";
	}
	if (
		message.direction === "system" &&
		message.data.startsWith("Disconnected")
	) {
		return "text-red";
	}
	if (message.direction === "send") {
		return "text-accent";
	}
	if (message.direction === "receive") {
		return "text-emerald-400";
	}
	return "text-white/40";
}

function shouldShowEventBadge(message: SocketIOMessage): boolean {
	if (message.direction !== "system") {
		return true;
	}
	return !(
		message.data.startsWith("Connected") ||
		message.data.startsWith("Disconnected")
	);
}

function Row({
	index,
	style,
	ariaAttributes,
	filteredMessages,
	expandedMessages,
	toggleExpanded,
}: RowComponentProps<{
	filteredMessages: SocketIOMessage[];
	expandedMessages: Set<string>;
	toggleExpanded: (id: string) => void;
}>): ReactElement | null {
	const msg = filteredMessages[index];
	if (!msg) return null;
	const isExpanded = expandedMessages.has(msg.id);

	return (
		<div
			{...ariaAttributes}
			style={style}
			className="box-border w-full min-w-0 overflow-hidden border-b border-white/5"
		>
			<div className="text-xs h-full overflow-hidden">
				<button
					type="button"
					onClick={() => toggleExpanded(msg.id)}
					className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
				>
					<span className={getDirectionIconClass(msg)}>
						{getDirectionIcon(msg)}
					</span>
					{shouldShowEventBadge(msg) && (
						<span
							className="max-w-[180px] shrink-0 truncate rounded-full px-2 py-0.5 font-mono text-[10px] font-extrabold"
							style={getEventBadgeStyle(msg.event || "message")}
						>
							{msg.event || "message"}
						</span>
					)}
					<span className="text-xs font-mono text-white/80 truncate flex-1">
						{msg.data}
					</span>
					<span className="ml-auto shrink-0 font-mono text-[10px] text-white/30 tabular-nums">
						{formatBytes(utf8ByteLength(msg.data))}
					</span>
					<span className="text-[11px] text-white/30 font-mono shrink-0 tabular-nums">
						{formatMessageTimestamp(msg.timestamp)}
					</span>
					{isExpanded ? (
						<TbChevronDown size={14} className="text-white/30 shrink-0" />
					) : (
						<TbChevronRight size={14} className="text-white/30 shrink-0" />
					)}
				</button>

				{isExpanded && (
					<div
						className="min-h-0 space-y-4 overflow-y-auto px-6 pb-4 pt-1"
						style={{ maxHeight: VIRTUAL_MESSAGE_ROW_BODY_MAX_PX }}
					>
						{(() => {
							try {
								const parsed = JSON.parse(msg.data);
								return (
									<div className="min-h-0 overflow-hidden rounded-md border border-white/5 bg-white/[0.02] text-[11px]">
										<CodeViewer
											code={JSON.stringify(parsed, null, 2)}
											language="json"
										/>
									</div>
								);
							} catch {
								return (
									<div className="bg-white/[0.02] rounded-md p-3 border border-white/5">
										<pre className="text-xs font-mono text-white/70 whitespace-pre-wrap break-all">
											{msg.data}
										</pre>
									</div>
								);
							}
						})()}
					</div>
				)}
			</div>
		</div>
	);
}

type SocketVirtualRowProps = RowComponentProps<{
	filteredMessages: SocketIOMessage[];
	expandedMessages: Set<string>;
	toggleExpanded: (id: string) => void;
}>;

const VirtualListRow = memo(Row) as (
	props: SocketVirtualRowProps,
) => ReactElement | null;

export const SocketIOMessageList = ({
	messages,
	status,
	onClear,
}: SocketIOMessageListProps) => {
	const deferredMessages = useDeferredValue(messages);
	const [searchQuery, setSearchQuery] = useState("");
	const [filter, setFilter] = useState<MessageFilter>("all");
	const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
		new Set(),
	);

	const eventSuggestions = useMemo(
		() =>
			Array.from(
				new Set(
					deferredMessages.map((msg) => msg.event.trim()).filter(Boolean),
				),
			).sort((a, b) => a.localeCompare(b)),
		[deferredMessages],
	);

	const filteredMessages = useMemo(
		() =>
			deferredMessages.filter((msg) => {
				if (searchQuery) {
					const query = searchQuery.toLowerCase();
					const matchesPayload = msg.data.toLowerCase().includes(query);
					const matchesEvent = msg.event.toLowerCase().includes(query);
					if (!matchesPayload && !matchesEvent) {
						return false;
					}
				}
				if (filter === "sent") return msg.direction === "send";
				if (filter === "received") return msg.direction === "receive";
				if (filter === "system") return msg.direction === "system";
				return true;
			}),
		[deferredMessages, searchQuery, filter],
	);

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
		filteredCount: filteredMessages.length,
		messageVersion: deferredMessages.length,
		initialFollowOutput: false,
	});

	const toggleExpanded = useCallback((id: string) => {
		setExpandedMessages((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const rowProps = useMemo(
		() => ({
			filteredMessages,
			expandedMessages,
			toggleExpanded,
		}),
		[filteredMessages, expandedMessages, toggleExpanded],
	);

	const dynamicHeightKey = useVirtualListHeightKey(
		searchQuery,
		filter,
		expandedMessages,
	);

	const dynamicRowHeight = useDynamicRowHeight({
		defaultRowHeight: VIRTUAL_MESSAGE_ROW_COLLAPSED_PX,
		key: dynamicHeightKey,
	});

	const handleClear = useCallback(() => {
		setExpandedMessages(new Set());
		resetFollowAfterClear();
		onClear();
	}, [onClear, resetFollowAfterClear]);

	const statusLabel =
		status === "connected"
			? "Connected"
			: status === "connecting"
				? "Connecting..."
				: "Disconnected";

	return (
		<div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-inset">
			<div className="flex items-center gap-2 p-2 px-4 border-b border-white/5 shrink-0">
				<span className="text-xs font-medium text-white">Messages</span>
				<div className="flex-1" />
				<div
					className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold ${
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
									? "bg-yellow animate-pulse"
									: "bg-white/20"
						}`}
					/>
					{statusLabel}
				</div>
			</div>

			<div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 shrink-0">
				<div className="flex items-center gap-2 flex-1 bg-white/[0.03] rounded-md px-2.5 py-1.5">
					<TbSearch size={13} className="text-white/30 shrink-0" />
					<AutocompleteInput
						value={searchQuery}
						onChange={setSearchQuery}
						suggestions={eventSuggestions}
						placeholder="Search payload or event"
						emptyText="No matching events"
						className="flex-1"
						inputClassName="h-full w-full text-xs text-white outline-none placeholder:text-white/20"
						renderSuggestion={(suggestion) => renderEventSuggestion(suggestion)}
					/>
				</div>
				<button
					type="button"
					onClick={() =>
						setFilter((prev) =>
							prev === "all"
								? "sent"
								: prev === "sent"
									? "received"
									: prev === "received"
										? "system"
										: "all",
						)
					}
					className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-white/50 hover:text-white/70 transition-colors rounded-md hover:bg-white/5 cursor-pointer"
				>
					<TbFilter size={13} />
					{filter}
				</button>
				{messages.length > 0 && (
					<button
						type="button"
						onClick={handleClear}
						className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/5 hover:text-white/70 cursor-pointer"
						aria-label="Clear messages"
						title="Clear"
					>
						<TbTrash size={13} />
					</button>
				)}
			</div>

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{filteredMessages.length === 0 ? (
					<div className="flex items-center justify-center h-full px-6 py-12 text-white/20 text-sm">
						{messages.length === 0
							? "No messages yet"
							: "No messages match your filter"}
					</div>
				) : (
					<VirtualizedMessageListPane<{
						filteredMessages: SocketIOMessage[];
						expandedMessages: Set<string>;
						toggleExpanded: (id: string) => void;
					}>
						listRef={listRef}
						listContainerRef={listContainerRef}
						listWidth={listWidth}
						listHeight={listHeight}
						rowCount={filteredMessages.length}
						rowHeight={dynamicRowHeight}
						rowComponent={VirtualListRow}
						rowProps={rowProps}
						onRowsRendered={handleRowsRendered}
						isAtBottom={isAtBottom}
						onJumpToLatest={jumpToLatest}
					/>
				)}
			</div>
		</div>
	);
};
