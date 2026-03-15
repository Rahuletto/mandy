import { useState } from "react";
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
import type { WebSocketMessage } from "../../types/project";
import { CodeViewer } from "../CodeMirror";
import type { ConnectionStatus } from "../../hooks/useWebSocket";

interface WebSocketMessageListProps {
  messages: WebSocketMessage[];
  status: ConnectionStatus;
  onClear: () => void;
}

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
        className="flex items-center gap-1 text-[11px] text-white/40 font-semibold cursor-pointer hover:text-white/60 transition-colors"
      >
        {expanded ? (
          <TbChevronDown size={12} />
        ) : (
          <TbChevronRight size={12} />
        )}
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
}: {
  msg: WebSocketMessage;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isConnection = msg.type === "connection" || msg.type === "close";
  const isSuccess = msg.type === "connection";

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors text-left cursor-pointer"
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
        <div className="px-6 pb-3 space-y-3">
          {msg.handshake ? (
            <div className="space-y-3">
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
          ) : (() => {
            try {
              const parsed = JSON.parse(msg.data);
              return (
                <div className="bg-white/[0.02] rounded-md border border-white/5 overflow-hidden text-[11px]">
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
  );
}

type MessageFilter = "all" | "sent" | "received";

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

  const cycleFilter = () => {
    setFilter((prev) =>
      prev === "all" ? "sent" : prev === "sent" ? "received" : "all",
    );
  };

  const filteredMessages = messages.filter((msg) => {
    if (
      searchQuery &&
      !msg.data.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    if (filter === "sent" && msg.direction !== "send") return false;
    if (filter === "received" && msg.direction !== "receive") return false;
    return true;
  });

  const toggleExpanded = (id: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClear = () => {
    onClear();
    setExpandedMessages(new Set());
  };

  const statusLabel = {
    disconnected: "Disconnected",
    connecting: "Connecting...",
    connected: "Connected",
    error: "Error",
  }[status];

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-inset border-l border-white/10">
      <div className="flex items-center gap-2 p-2 px-4 border-b border-white/5">
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

      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5">
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
          {filter === "all" ? "All Messages" : filter === "sent" ? "Sent" : "Received"}
        </button>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors rounded-md hover:bg-white/5 cursor-pointer"
          >
            <TbTrash size={13} />
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {filteredMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/20 text-sm">
            {messages.length === 0
              ? status === "connected"
                ? "Waiting for messages..."
                : "Connect to start sending and receiving messages"
              : "No messages match your filter"}
          </div>
        ) : (
          <div>
            {filteredMessages.map((msg) => (
              <MessageRow
                key={msg.id}
                msg={msg}
                isExpanded={expandedMessages.has(msg.id)}
                onToggle={() => toggleExpanded(msg.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
