import {
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
import type { ConnectionStatus } from "../../hooks/useWebSocket";
import type { WebSocketMessage } from "../../types/project";
import { formatBytes } from "../../utils/format";
import { utf8ByteLength } from "../../utils/workflowMetrics";
import { CodeViewer } from "../CodeMirror";
import {
	formatMessageTimestamp,
	useVirtualizedFollowList,
	useVirtualListHeightKey,
	VIRTUAL_MESSAGE_ROW_BODY_MAX_PX,
	VIRTUAL_MESSAGE_ROW_COLLAPSED_PX,
	VirtualizedMessageListPane,
} from "./virtualizedMessageList";

interface WebSocketMessageListProps {
	messages: WebSocketMessage[];
	status: ConnectionStatus;
	onClear: () => void;
}

type MessageFilter = "all" | "sent" | "received";

function HeaderSection({
	title,
	headers,
	collapsible = true,
}: {
	title: string;
	headers: Record<string, string>;
	collapsible?: boolean;
}) {
	const [expanded, setExpanded] = useState(true);
	const entries = Object.entries(headers);
	if (entries.length === 0) return null;

	if (!collapsible) {
		return (
			<div>
				<div className="py-2 font-semibold text-[11px] text-white/40 uppercase tracking-wide">
					{title}
				</div>
				<div className="ml-1 space-y-1 font-mono text-xs">
					{entries.map(([key, value]) => (
						<p key={key} className="text-white/60">
							{key}: <span className="text-white/80">"{value}"</span>
						</p>
					))}
				</div>
			</div>
		);
	}

	return (
		<div>
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex cursor-pointer items-center gap-1 py-3.5 font-semibold text-[11px] text-white/40 transition-colors hover:text-white/60"
			>
				{expanded ? <TbChevronDown size={12} /> : <TbChevronRight size={12} />}
				{title}
			</button>
			{expanded && (
				<div className="mt-1.5 ml-4 space-y-1 font-mono text-xs">
					{entries.map(([key, value]) => (
						<p key={key} className="text-white/60">
							{key}: <span className="text-white/80">"{value}"</span>
						</p>
					))}
				</div>
			)}
		</div>
	);
}

function WebSocketRowContent({
	msg,
	isExpanded,
	onToggle,
}: {
	msg: WebSocketMessage;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	const isConnection = msg.type === "connection" || msg.type === "close";
	const isSuccess = msg.type === "connection";

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden text-xs">
			<button
				type="button"
				onClick={onToggle}
				className="flex w-full shrink-0 cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/2"
			>
				{isConnection ? (
					isSuccess ? (
						<TbCircleCheck size={13} className="shrink-0 text-green" />
					) : (
						<TbCircleX size={13} className="shrink-0 text-red" />
					)
				) : msg.direction === "receive" ? (
					<TbArrowDown size={13} className="shrink-0 text-green" />
				) : (
					<TbArrowUp size={13} className="shrink-0 text-yellow" />
				)}

				<span className="min-w-0 flex-1 truncate font-mono text-white/80 text-xs">
					{msg.data}
				</span>

				<span className="shrink-0 font-mono text-[10px] text-white/30 tabular-nums">
					{formatBytes(utf8ByteLength(msg.data))}
				</span>
				<span className="shrink-0 font-mono text-[11px] text-white/30 tabular-nums">
					{formatMessageTimestamp(msg.timestamp)}
				</span>

				{isExpanded ? (
					<TbChevronDown size={14} className="shrink-0 text-white/30" />
				) : (
					<TbChevronRight size={14} className="shrink-0 text-white/30" />
				)}
			</button>

			{isExpanded && (
				<div
					className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pt-1 pb-4"
					style={{ maxHeight: VIRTUAL_MESSAGE_ROW_BODY_MAX_PX }}
				>
					{msg.handshake ? (
						<div className="space-y-3">
							<p className="font-semibold text-[11px] text-white/40 uppercase tracking-wide">
								Handshake Details
							</p>
							<div className="space-y-1.5 font-mono text-xs">
								<p className="text-white/60">
									Request URL:{" "}
									<span className="text-white/80">
										"{msg.handshake.requestUrl}"
									</span>
								</p>
								<p className="text-white/60">
									Request Method:{" "}
									<span className="text-white/80">
										"{msg.handshake.requestMethod}"
									</span>
								</p>
								<p className="text-white/60">
									Status Code:{" "}
									<span className="text-white/80">
										"{msg.handshake.statusCode}"
									</span>
								</p>
							</div>
							<HeaderSection
								title="Request Headers"
								headers={msg.handshake.requestHeaders}
								collapsible={false}
							/>
							<HeaderSection
								title="Response Headers"
								headers={msg.handshake.responseHeaders}
								collapsible={false}
							/>
						</div>
					) : (
						(() => {
							try {
								const parsed = JSON.parse(msg.data);
								return (
									<div className="min-h-0 overflow-hidden rounded-md border border-white/5 bg-white/2 text-[11px]">
										<CodeViewer
											code={JSON.stringify(parsed, null, 2)}
											language="json"
										/>
									</div>
								);
							} catch {
								return (
									<div className="rounded-md border border-white/5 bg-white/2 p-3">
										<pre className="whitespace-pre-wrap break-all font-mono text-white/70 text-xs">
											{msg.data}
										</pre>
									</div>
								);
							}
						})()
					)}
				</div>
			)}
		</div>
	);
}

type WsVirtualRowProps = RowComponentProps<{
	filteredMessages: WebSocketMessage[];
	expandedMessages: Set<string>;
	toggleExpanded: (id: string) => void;
}>;

function Row({
	index,
	style,
	ariaAttributes,
	filteredMessages,
	expandedMessages,
	toggleExpanded,
}: WsVirtualRowProps): ReactElement | null {
	const msg = filteredMessages[index];
	if (!msg) return null;

	return (
		<div
			{...ariaAttributes}
			style={style}
			className="box-border w-full min-w-0 overflow-hidden border-white/5 border-b"
		>
			<WebSocketRowContent
				msg={msg}
				isExpanded={expandedMessages.has(msg.id)}
				onToggle={() => toggleExpanded(msg.id)}
			/>
		</div>
	);
}

const VirtualListRow = memo(Row) as (
	props: WsVirtualRowProps,
) => ReactElement | null;

export const WebSocketMessageList = ({
	messages,
	status,
	onClear,
}: WebSocketMessageListProps) => {
	const deferredMessages = useDeferredValue(messages);
	const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
		new Set(),
	);
	const [searchQuery, setSearchQuery] = useState("");
	const [filter, setFilter] = useState<MessageFilter>("all");

	const filteredMessages = useMemo(
		() =>
			deferredMessages.filter((msg) => {
				if (
					searchQuery &&
					!msg.data.toLowerCase().includes(searchQuery.toLowerCase())
				) {
					return false;
				}
				if (filter === "sent" && msg.direction !== "send") return false;
				if (filter === "received" && msg.direction !== "receive") return false;
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
		initialFollowOutput: true,
	});

	const cycleFilter = useCallback(() => {
		setFilter((prev) =>
			prev === "all" ? "sent" : prev === "sent" ? "received" : "all",
		);
	}, []);

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

	const statusLabel = {
		disconnected: "Disconnected",
		connecting: "Connecting...",
		connected: "Connected",
		error: "Error",
	}[status];

	return (
		<div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-2 border-white/5 border-b p-2 px-4">
				<span className="font-medium text-white text-xs">Response</span>
				<div className="flex-1" />
				<div
					className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold text-[11px] ${
						status === "connected"
							? "bg-green/15 text-green"
							: status === "error"
								? "bg-red/15 text-red"
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
									: status === "error"
										? "bg-red"
										: "bg-white/20"
						}`}
					/>
					{statusLabel}
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-2 border-white/5 border-b px-4 py-2">
				<div className="flex flex-1 items-center gap-2 rounded-md bg-white/3 px-2.5 py-1.5">
					<TbSearch size={13} className="shrink-0 text-white/30" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Search"
						className="flex-1 bg-transparent text-white text-xs outline-none placeholder:text-white/20"
					/>
				</div>

				<button
					type="button"
					onClick={cycleFilter}
					className="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white/70"
				>
					<TbFilter size={13} />
					{filter === "all"
						? "All Messages"
						: filter === "sent"
							? "Sent"
							: "Received"}
				</button>

				{messages.length > 0 && (
					<button
						type="button"
						onClick={handleClear}
						className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/5 hover:text-white/70"
						aria-label="Clear messages"
						title="Clear"
					>
						<TbTrash size={13} />
					</button>
				)}
			</div>

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{filteredMessages.length === 0 ? (
					<div className="flex h-full items-center justify-center px-6 py-12 text-sm text-white/20">
						{messages.length === 0
							? status === "connected"
								? "Waiting for messages..."
								: "Connect to start sending and receiving messages"
							: "No messages match your filter"}
					</div>
				) : (
					<VirtualizedMessageListPane<{
						filteredMessages: WebSocketMessage[];
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
