import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
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
import {
  List,
  useListRef,
  useDynamicRowHeight,
  type RowComponentProps,
} from "react-window";
import type { WebSocketMessage } from "../../types/project";
import { CodeViewer } from "../CodeMirror";
import type { ConnectionStatus } from "../../hooks/useWebSocket";

interface WebSocketMessageListProps {
  messages: WebSocketMessage[];
  status: ConnectionStatus;
  onClear: () => void;
}

const ROW_COLLAPSED_PX = 46;
/** Expanded body caps height; row total is measured (header + body up to this max) */
const ROW_EXPANDED_BODY_MAX_PX = 300;

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  const ms = d.getMilliseconds().toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function HeaderSection({
  title,
  headers,
}: {
  title: string;
  headers: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(true);
  const entries = Object.entries(headers);
  if (entries.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 py-3.5 text-[11px] text-white/40 font-semibold cursor-pointer hover:text-white/60 transition-colors"
      >
        {expanded ? <TbChevronDown size={12} /> : <TbChevronRight size={12} />}
        {title}
      </button>
      {expanded && (
        <div className="ml-4 mt-1.5 space-y-1 font-mono text-xs">
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

function MessageRow({
  msg,
  isExpanded,
  onToggle,
  virtualized,
}: {
  msg: WebSocketMessage;
  isExpanded: boolean;
  onToggle: () => void;
  virtualized?: boolean;
}) {
  const isConnection = msg.type === "connection" || msg.type === "close";
  const isSuccess = msg.type === "connection";

  return (
    <div
      className={
        virtualized
          ? isExpanded
            ? "flex w-full min-h-0 min-w-0 flex-col overflow-hidden"
            : "flex w-full min-h-0 min-w-0 flex-col overflow-hidden"
          : "border-b border-white/5 last:border-b-0"
      }
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left cursor-pointer shrink-0"
      >
        {isConnection ? (
          isSuccess ? (
            <TbCircleCheck size={16} className="text-green shrink-0" />
          ) : (
            <TbCircleX size={16} className="text-red shrink-0" />
          )
        ) : msg.direction === "receive" ? (
          <TbArrowDown size={16} className="text-green shrink-0" />
        ) : (
          <TbArrowUp size={16} className="text-yellow shrink-0" />
        )}

        <span className="flex-1 text-xs font-mono text-white/80 truncate">
          {msg.data}
        </span>

        <span className="text-[11px] text-white/30 font-mono shrink-0">
          {formatTimestamp(msg.timestamp)}
        </span>

        {isExpanded ? (
          <TbChevronDown size={14} className="text-white/30 shrink-0" />
        ) : (
          <TbChevronRight size={14} className="text-white/30 shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div
          className={
            virtualized
              ? "min-h-0 space-y-4 overflow-y-auto px-6 pb-3 pt-1"
              : "space-y-4 px-6 pb-4 pt-1"
          }
          style={
            virtualized ? { maxHeight: ROW_EXPANDED_BODY_MAX_PX } : undefined
          }
        >
          {msg.handshake ? (
            <div className="space-y-4">
              <p className="text-[11px] text-white/40 font-semibold uppercase tracking-wide">
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
              />
              <HeaderSection
                title="Response Headers"
                headers={msg.handshake.responseHeaders}
              />
            </div>
          ) : (
            (() => {
              try {
                const parsed = JSON.parse(msg.data);
                return (
                  <div className="bg-white/[0.02] rounded-md border border-white/5 overflow-hidden text-[11px] min-h-0">
                    <CodeViewer
                      code={JSON.stringify(parsed, null, 2)}
                      language="json"
                    />
                  </div>
                );
              } catch {
                return (
                  <div className="bg-white/[0.02] rounded-md p-3 border border-white/5 min-h-0 overflow-auto max-h-full">
                    <pre className="text-xs font-mono text-white/70 whitespace-pre-wrap break-all">
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

type MessageFilter = "all" | "sent" | "received";

/** AutoSizer often gets 0 height in nested flex; measure the real box instead. */
function useListContainerSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = (w: number, h: number) => {
      const nw = Math.max(0, Math.floor(w));
      const nh = Math.max(0, Math.floor(h));
      setSize((prev) =>
        prev.width === nw && prev.height === nh
          ? prev
          : { width: nw, height: nh },
      );
    };

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      apply(entry.contentRect.width, entry.contentRect.height);
    });

    ro.observe(el);
    apply(el.clientWidth, el.clientHeight);

    return () => ro.disconnect();
  }, []);

  return { ref, width: size.width, height: size.height };
}

interface VirtualListRowProps {
  filteredMessages: WebSocketMessage[];
  expandedMessages: Set<string>;
  toggleExpanded: (id: string) => void;
}

const VirtualListRow = memo(function VirtualListRow({
  index,
  style,
  ariaAttributes,
  filteredMessages,
  expandedMessages,
  toggleExpanded,
}: RowComponentProps<VirtualListRowProps>) {
  const msg = filteredMessages[index];
  if (!msg) return null;

  return (
    <div
      {...ariaAttributes}
      style={style}
      className="box-border w-full min-w-0 overflow-hidden border-b border-white/5"
    >
      <MessageRow
        msg={msg}
        isExpanded={expandedMessages.has(msg.id)}
        onToggle={() => toggleExpanded(msg.id)}
        virtualized
      />
    </div>
  );
});

export const WebSocketMessageList = ({
  messages,
  status,
  onClear,
}: WebSocketMessageListProps) => {
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<MessageFilter>("all");
  const [followOutput, setFollowOutput] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const followOutputRef = useRef(true);
  const isAtBottomRef = useRef(true);
  const followScrollInFlightRef = useRef(false);
  const listRef = useListRef(null);
  const {
    ref: listContainerRef,
    width: listWidth,
    height: listHeight,
  } = useListContainerSize();

  const cycleFilter = () => {
    setFilter((prev) =>
      prev === "all" ? "sent" : prev === "sent" ? "received" : "all",
    );
  };

  const filteredMessages = useMemo(
    () =>
      messages.filter((msg) => {
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
    [messages, searchQuery, filter],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleClear = () => {
    onClear();
    setExpandedMessages(new Set());
    setFollowOutput(true);
    setIsAtBottom(true);
    followOutputRef.current = true;
    isAtBottomRef.current = true;
    followScrollInFlightRef.current = false;
  };

  const rowProps: VirtualListRowProps = useMemo(
    () => ({
      filteredMessages,
      expandedMessages,
      toggleExpanded,
    }),
    [filteredMessages, expandedMessages, toggleExpanded],
  );

  const dynamicHeightKey = useMemo(
    () => filteredMessages.map((m) => m.id).join("\0"),
    [filteredMessages],
  );

  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: ROW_COLLAPSED_PX,
    key: dynamicHeightKey,
  });

  useEffect(() => {
    followOutputRef.current = followOutput;
  }, [followOutput]);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  useEffect(() => {
    if (!followOutput || filteredMessages.length === 0) return;
    followScrollInFlightRef.current = true;
    const last = filteredMessages.length - 1;
    const id = requestAnimationFrame(() => {
      listRef.current?.scrollToRow({
        index: last,
        align: "auto",
        behavior: "smooth",
      });
    });
    const timeoutId = window.setTimeout(() => {
      followScrollInFlightRef.current = false;
    }, 350);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(timeoutId);
    };
  }, [filteredMessages.length, followOutput, listRef, messages.length]);

  const jumpToLatest = useCallback(() => {
    if (filteredMessages.length === 0) return;
    setFollowOutput(true);
    setIsAtBottom(true);
    followOutputRef.current = true;
    isAtBottomRef.current = true;
    followScrollInFlightRef.current = true;
    listRef.current?.scrollToRow({
      index: filteredMessages.length - 1,
      align: "end",
      behavior: "smooth",
    });
    window.setTimeout(() => {
      followScrollInFlightRef.current = false;
    }, 350);
  }, [filteredMessages.length, listRef]);

  const handleRowsRendered = useCallback(
    (visibleRows: { startIndex: number; stopIndex: number }) => {
      const nextAtBottom =
        filteredMessages.length === 0 ||
        visibleRows.stopIndex >= filteredMessages.length - 1;

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
    [filteredMessages.length],
  );

  const statusLabel = {
    disconnected: "Disconnected",
    connecting: "Connecting...",
    connected: "Connected",
    error: "Error",
  }[status];

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 p-2 px-4 border-b border-white/5 shrink-0">
        <span className="text-xs font-medium text-white">Response</span>
        <div className="flex-1" />
        <div
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 ${
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
            className={`w-1.5 h-1.5 rounded-full ${
              status === "connected"
                ? "bg-green"
                : status === "connecting"
                  ? "bg-yellow animate-pulse"
                  : status === "error"
                    ? "bg-red"
                    : "bg-white/20"
            }`}
          />
          {statusLabel}
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2 flex-1 bg-white/[0.03] rounded-md px-2.5 py-1.5">
          <TbSearch size={13} className="text-white/30 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/20"
          />
        </div>

        <button
          type="button"
          onClick={cycleFilter}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-white/50 hover:text-white/70 transition-colors rounded-md hover:bg-white/5 cursor-pointer"
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
              ? status === "connected"
                ? "Waiting for messages..."
                : "Connect to start sending and receiving messages"
              : "No messages match your filter"}
          </div>
        ) : (
          <div
            ref={listContainerRef}
            className="relative min-h-0 w-full min-w-0 flex-1 py-3"
          >
            {listWidth > 0 && listHeight > 0 ? (
              <>
                <List<VirtualListRowProps>
                  listRef={listRef}
                  className="pb-0"
                  style={{ height: listHeight, width: listWidth }}
                  rowCount={filteredMessages.length}
                  rowHeight={dynamicRowHeight}
                  rowComponent={VirtualListRow}
                  rowProps={rowProps}
                  overscanCount={8}
                  onRowsRendered={handleRowsRendered}
                />
                {!isAtBottom && (
                  <button
                    type="button"
                    onClick={jumpToLatest}
                    className="absolute bottom-4 left-1/2 z-10 inline-flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-background/90 text-white/80 shadow-lg backdrop-blur transition-colors hover:bg-background hover:text-white"
                    aria-label="Jump to latest messages"
                  >
                    <TbArrowDown size={18} />
                  </button>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
