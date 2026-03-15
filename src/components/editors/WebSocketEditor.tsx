import { useState, useRef, useEffect, useCallback } from "react";
import { TbPlugConnected } from "react-icons/tb";
import { useWebSocket } from "../../hooks/useWebSocket";
import type { AuthType } from "../../bindings";
import type { WebSocketFile, WebSocketKeyValue } from "../../types/project";
import { KeyValueTable, type KeyValueItem } from "../KeyValueTable";
import { AuthEditor } from "./AuthEditor";
import { WebSocketOverview } from "./WebSocketOverview";
import { WebSocketMessageList } from "./WebSocketMessageList";
import { WebSocketMessageComposer } from "./WebSocketMessageComposer";

interface WebSocketEditorProps {
  ws: WebSocketFile;
  onUpdate: (updater: (ws: WebSocketFile) => WebSocketFile) => void;
  availableVariables?: string[];
  projectAuth?: AuthType;
  onOpenProjectSettings?: () => void;
}

type WsTab =
  | "overview"
  | "message"
  | "params"
  | "authorization"
  | "headers"
  | "cookies";

function toKeyValueItems(items: WebSocketKeyValue[]): KeyValueItem[] {
  return items.map((item) => ({
    id: item.id,
    key: item.key,
    value: item.value,
    description: item.description,
    enabled: item.enabled,
  }));
}

function fromKeyValueItems(items: KeyValueItem[]): WebSocketKeyValue[] {
  return items.map((item) => ({
    id: item.id,
    key: item.key,
    value: item.value,
    description: item.description,
    enabled: item.enabled,
  }));
}

export function WebSocketEditor({
  ws,
  onUpdate,
  availableVariables,
  projectAuth,
  onOpenProjectSettings,
}: WebSocketEditorProps) {
  const { status, connect, disconnect, sendMessage, clearMessages } =
    useWebSocket({ ws, onUpdate });

  const [url, setUrl] = useState(ws.url);
  const [activeTab, setActiveTab] = useState<WsTab>("overview");
  const [splitPercent, setSplitPercent] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUrl(ws.url);
  }, [ws.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ws.messages.length]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing && splitContainerRef.current) {
        const rect = splitContainerRef.current.getBoundingClientRect();
        const newPercent = ((e.clientX - rect.left) / rect.width) * 100;
        setSplitPercent(Math.max(30, Math.min(70, newPercent)));
      }
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const handleUrlChange = useCallback(
    (newUrl: string) => {
      setUrl(newUrl);
      onUpdate((prev) => ({ ...prev, url: newUrl }));
    },
    [onUpdate],
  );

  const tabs: WsTab[] = [
    "overview",
    "message",
    "params",
    "authorization",
    "headers",
    "cookies",
  ];

  const isOverview = activeTab === "overview";

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-4 border-b border-text/15 p-4">
        <div className="flex-1 flex items-center bg-inputbox rounded-lg overflow-hidden">
          <span className="px-4 py-2.5 flex items-center text-emerald-400">
            <TbPlugConnected size={18} />
          </span>
          <div className="w-px h-5 bg-white/10" />
          <input
            type="text"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="ws://localhost:8080 or wss://..."
            className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20"
            disabled={status === "connected"}
          />
        </div>
        {status === "connected" ? (
          <button
            onClick={disconnect}
            className="px-6 py-2 bg-red hover:bg-red/90 rounded-full text-background font-semibold transition-all"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={() => connect(url)}
            disabled={!url || status === "connecting"}
            className="px-6 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 rounded-full text-background font-semibold transition-all"
          >
            Connect
          </button>
        )}
      </div>

      <div ref={splitContainerRef} className="flex flex-1 overflow-hidden">
        <div
          className="flex p-2 pl-4 flex-col overflow-hidden"
          style={{ width: isOverview ? "100%" : `${splitPercent}%` }}
        >
          <div className="flex items-center gap-1 py-2 shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-2 py-0.5 text-xs cursor-pointer font-medium rounded-md transition-colors ${
                  activeTab === tab
                    ? "text-accent bg-accent/10"
                    : "text-white/80 hover:text-white/60"
                }`}
              >
                {tab === "overview"
                  ? "Overview"
                  : tab === "authorization"
                    ? "Authorization"
                    : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto relative">
            {activeTab === "overview" && (
              <WebSocketOverview
                ws={ws}
                onUpdate={onUpdate}
                onConnect={() => connect(url)}
                status={status}
              />
            )}

            {activeTab === "message" && (
              <WebSocketMessageComposer status={status} onSend={sendMessage} />
            )}

            {activeTab === "params" && (
              <KeyValueTable
                items={toKeyValueItems(ws.params || [])}
                onChange={(items) =>
                  onUpdate((prev) => ({
                    ...prev,
                    params: fromKeyValueItems(items),
                  }))
                }
                availableVariables={availableVariables}
                placeholder={{ key: "Key", value: "Value" }}
              />
            )}

            {activeTab === "authorization" && (
              <AuthEditor
                auth={ws.auth || "None"}
                onChange={(auth) => onUpdate((prev) => ({ ...prev, auth }))}
                availableVariables={availableVariables}
                projectAuth={projectAuth}
                isInherited={ws.useInheritedAuth ?? true}
                onInheritChange={(inherit) =>
                  onUpdate((prev) => ({
                    ...prev,
                    useInheritedAuth: inherit,
                  }))
                }
                onOpenProjectSettings={onOpenProjectSettings}
              />
            )}

            {activeTab === "headers" && (
              <KeyValueTable
                items={toKeyValueItems(ws.headerItems || [])}
                onChange={(items) =>
                  onUpdate((prev) => ({
                    ...prev,
                    headerItems: fromKeyValueItems(items),
                  }))
                }
                availableVariables={availableVariables}
                placeholder={{ key: "Header", value: "Value" }}
              />
            )}

            {activeTab === "cookies" && (
              <KeyValueTable
                items={toKeyValueItems(ws.cookies || [])}
                onChange={(items) =>
                  onUpdate((prev) => ({
                    ...prev,
                    cookies: fromKeyValueItems(items),
                  }))
                }
                availableVariables={availableVariables}
                placeholder={{ key: "Cookie", value: "Value" }}
              />
            )}
          </div>
        </div>

        {!isOverview && (
          <>
            <div
              className="w-2 cursor-col-resize flex items-center justify-center shrink-0 group"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizing(true);
              }}
            >
              <div className="w-px h-full group-hover:bg-accent/50 transition-colors" />
            </div>

            <WebSocketMessageList
              messages={ws.messages}
              status={status}
              onClear={clearMessages}
            />
          </>
        )}
      </div>
    </div>
  );
}
