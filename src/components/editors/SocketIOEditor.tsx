import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { TbBolt, TbSend } from "react-icons/tb";
import { commands, type SioIncomingMessage } from "../../bindings";
import type { SocketIOFile, SocketIOKeyValue } from "../../types/project";
import { KeyValueTable, type KeyValueItem } from "../KeyValueTable";
import { CodeEditor } from "../CodeMirror";
import { SocketIOOverview } from "./SocketIOOverview";
import { SocketIOMessageList } from "./SocketIOMessageList";
import { Tooltip } from "../ui/Tooltip";

const persistedSioSessionIds = new Set<string>();

interface SocketIOEditorProps {
  sio: SocketIOFile;
  onUpdate: (updater: (sio: SocketIOFile) => SocketIOFile) => void;
  availableVariables?: string[];
  resolveVariables?: (text: string) => string;
  onStartLoading?: (id: string) => void;
  onStopLoading?: (id: string) => void;
}

type SioTab = "overview" | "message" | "headers" | "auth";

function toKeyValueItems(items: SocketIOKeyValue[]): KeyValueItem[] {
  return items.map((item) => ({
    id: item.id,
    key: item.key,
    value: item.value,
    description: item.description,
    enabled: item.enabled,
  }));
}

function fromKeyValueItems(items: KeyValueItem[]): SocketIOKeyValue[] {
  return items.map((item) => ({
    id: item.id,
    key: item.key,
    value: item.value,
    description: item.description,
    enabled: item.enabled,
  }));
}

export function SocketIOEditor({
  sio,
  onUpdate,
  availableVariables,
  resolveVariables,
  onStartLoading,
  onStopLoading,
}: SocketIOEditorProps) {
  const resolve = resolveVariables ?? ((value: string) => value);
  const [activeTab, setActiveTab] = useState<SioTab>("overview");
  const [url, setUrl] = useState(sio.url);
  const [isConnected, setIsConnected] = useState(
    persistedSioSessionIds.has(sio.id),
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [eventName, setEventName] = useState("message");
  const [eventPayload, setEventPayload] = useState("{}");
  const [isSending, setIsSending] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const connectedRef = useRef(persistedSioSessionIds.has(sio.id));

  useEffect(() => {
    setUrl(sio.url);
    const resumed = persistedSioSessionIds.has(sio.id);
    setIsConnected(resumed);
    setIsConnecting(false);
    connectedRef.current = resumed;
  }, [sio.id, sio.url, sio.namespace]);

  useEffect(() => {
    if (isConnected || isConnecting) onStartLoading?.(sio.id);
    else onStopLoading?.(sio.id);
  }, [isConnected, isConnecting, onStartLoading, onStopLoading, sio.id]);

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

  const pushSystemMessage = useCallback(
    (message: string) => {
      startTransition(() => {
        onUpdate((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: crypto.randomUUID(),
              direction: "system",
              event: "system",
              data: message,
              timestamp: Date.now(),
            },
          ],
        }));
      });
    },
    [onUpdate],
  );

  useEffect(() => {
    let disposed = false;
    let unlistenMessage: (() => void) | null = null;
    let unlistenDisconnect: (() => void) | null = null;

    const setupListeners = async () => {
      unlistenMessage = await listen<SioIncomingMessage>(
        `sio://message/${sio.id}`,
        (event) => {
          if (disposed) return;
          if (!connectedRef.current) return;
          const payload = event.payload;
          startTransition(() => {
            onUpdate((prev) => ({
              ...prev,
              messages: [
                ...prev.messages,
                {
                  id: payload.id || crypto.randomUUID(),
                  direction: "receive",
                  event: payload.event || "message",
                  data: payload.data || "",
                  timestamp: payload.timestamp_ms || Date.now(),
                },
              ],
            }));
          });
        },
      );

      unlistenDisconnect = await listen<{ reason: string }>(
        `sio://disconnected/${sio.id}`,
        (event) => {
          if (disposed) return;
          setIsConnected(false);
          setIsConnecting(false);
          connectedRef.current = false;
          persistedSioSessionIds.delete(sio.id);
          pushSystemMessage(
            `Disconnected: ${event.payload?.reason || "connection closed"}`,
          );
        },
      );

      if (persistedSioSessionIds.has(sio.id)) {
        setIsConnecting(false);
        setIsConnected(true);
        connectedRef.current = true;
        persistedSioSessionIds.delete(sio.id);
      }
    };

    setupListeners();

    return () => {
      disposed = true;
      unlistenMessage?.();
      unlistenDisconnect?.();
    };
  }, [sio.id, onUpdate, pushSystemMessage]);

  useEffect(() => {
    return () => {
      if (connectedRef.current) {
        persistedSioSessionIds.add(sio.id);
      } else {
        onStopLoading?.(sio.id);
      }
    };
  }, [onStopLoading, sio.id]);

  const connect = useCallback(async () => {
    if (!url || isConnecting || isConnected) return;
    setIsConnecting(true);

    const headers: Record<string, string> = {};
    (sio.headerItems || [])
      .filter((item) => item.enabled && item.key.trim())
      .forEach((item) => {
        headers[item.key] = resolve(item.value);
      });

    try {
      const result = await commands.sioConnect({
        connection_id: sio.id,
        url: resolve(url),
        namespace: sio.namespace || "/",
        headers,
        auth: sio.authPayload ? resolve(sio.authPayload) : null,
      });

      if (result.status === "error") {
        throw new Error(String(result.error));
      }

      setIsConnected(true);
      connectedRef.current = true;
      persistedSioSessionIds.delete(sio.id);
      pushSystemMessage(
        `Connected to ${result.data.url}${result.data.namespace || "/"}`,
      );
    } catch (error: any) {
      pushSystemMessage(error?.message || "Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  }, [
    isConnected,
    isConnecting,
    pushSystemMessage,
    resolve,
    sio.authPayload,
    sio.headerItems,
    sio.id,
    url,
  ]);

  const disconnect = useCallback(async () => {
    try {
      await commands.sioDisconnect(sio.id);
    } finally {
      setIsConnected(false);
      setIsConnecting(false);
      connectedRef.current = false;
      persistedSioSessionIds.delete(sio.id);
      pushSystemMessage("Disconnected");
    }
  }, [pushSystemMessage, sio.id]);

  const sendEvent = useCallback(async () => {
    if (!isConnected || !eventName.trim() || !eventPayload.trim() || isSending) {
      return;
    }
    const resolvedPayload = resolve(eventPayload);
    setIsSending(true);
    try {
      const result = await commands.sioEmit({
        connection_id: sio.id,
        event: eventName.trim(),
        data: resolvedPayload,
      });
      if (result.status === "error") {
        throw new Error(String(result.error));
      }
      startTransition(() => {
        onUpdate((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: crypto.randomUUID(),
              direction: "send",
              event: eventName.trim(),
              data: resolvedPayload,
              timestamp: Date.now(),
            },
          ],
        }));
      });
    } catch (error: any) {
      pushSystemMessage(error?.message || "Emit failed");
    } finally {
      setIsSending(false);
    }
  }, [
    eventName,
    eventPayload,
    isConnected,
    isSending,
    onUpdate,
    pushSystemMessage,
    resolve,
    sio.id,
  ]);

  const isOverview = activeTab === "overview";
  const headerConnectTooltip = !url
    ? "Enter a Socket.IO URL to connect"
    : isConnecting
      ? "Connecting..."
      : undefined;

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-4 border-b border-text/15 p-4">
        <div className="flex-1 flex items-center bg-inputbox rounded-lg overflow-hidden">
          <span className="px-4 py-2.5 flex items-center text-amber-400">
            <TbBolt size={18} />
          </span>
          <div className="w-px h-5 bg-white/10" />
          <input
            type="text"
            value={url}
            onChange={(e) => {
              const next = e.target.value;
              setUrl(next);
              onUpdate((prev) => ({ ...prev, url: next }));
            }}
            placeholder="https://api.example.com"
            className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20"
            disabled={isConnected}
          />
        </div>
        {isConnected ? (
          <button
            onClick={disconnect}
            className="px-6 py-2 bg-red hover:bg-red/90 rounded-full text-background font-semibold transition-all cursor-pointer"
          >
            Disconnect
          </button>
        ) : (
          <Tooltip content={headerConnectTooltip} position="bottom">
            <button
              onClick={connect}
              disabled={!url || isConnecting}
              className="px-6 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-background font-semibold transition-all cursor-pointer"
            >
              {isConnecting ? "Connecting" : "Connect"}
            </button>
          </Tooltip>
        )}
      </div>

      <div ref={splitContainerRef} className="flex-1 min-h-0 flex overflow-hidden">
        <div
          className="flex p-2 pl-4 flex-col overflow-hidden min-h-0"
          style={{
            width: isOverview ? "100%" : `${splitPercent}%`,
          }}
        >
          <div className="flex items-center gap-1 py-2 shrink-0">
            {(["overview", "message", "headers", "auth"] as const).map((tab) => (
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
                {tab === "auth" ? "Auth" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto relative min-h-0">
            {activeTab === "overview" && (
              <SocketIOOverview
                sio={sio}
                status={
                  isConnected
                    ? "connected"
                    : isConnecting
                      ? "connecting"
                      : "disconnected"
                }
                onUpdate={onUpdate}
                onConnect={connect}
              />
            )}

            {activeTab === "message" && (
              <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col">
                <div className="px-4 pt-4 pb-2 border-b border-white/5">
                  <label className="block text-xs text-white/60 mb-2">Event</label>
                  <input
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="message"
                    className="w-full bg-inputbox rounded px-3 py-2 text-sm text-white outline-none placeholder:text-white/20"
                  />
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                  <CodeEditor
                    code={eventPayload}
                    language="json"
                    onChange={setEventPayload}
                    placeholder='{ "message": "Hello" }'
                  />
                </div>
                <div className="absolute right-4 bottom-4 z-20 inline-flex w-fit h-fit">
                  <Tooltip
                    content={
                      !isConnected
                        ? "Connect to a Socket.IO server first"
                        : !eventName.trim()
                          ? "Enter an event name to emit"
                          : !eventPayload.trim()
                            ? "Enter a payload to emit"
                            : isSending
                              ? "Sending..."
                              : undefined
                    }
                    wrapperClassName="inline-flex w-fit h-fit"
                  >
                    <button
                      onClick={sendEvent}
                      disabled={
                        !isConnected ||
                        !eventName.trim() ||
                        !eventPayload.trim() ||
                        isSending
                      }
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-background transition-all hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <TbSend size={16} />
                    </button>
                  </Tooltip>
                </div>
              </div>
            )}

            {activeTab === "headers" && (
              <KeyValueTable
                items={toKeyValueItems(sio.headerItems || [])}
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

            {activeTab === "auth" && (
              <div className="p-4 space-y-3">
                <label className="block text-xs text-white/60">
                  Auth Payload (JSON)
                </label>
                <div className="h-[300px] overflow-hidden rounded border border-white/10">
                  <CodeEditor
                    code={sio.authPayload || "{}"}
                    language="json"
                    onChange={(value) =>
                      onUpdate((prev) => ({ ...prev, authPayload: value }))
                    }
                  />
                </div>
              </div>
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
            <div className="flex-1 min-w-0 overflow-auto bg-inset border-l border-white/10">
              <SocketIOMessageList
                messages={sio.messages}
                status={
                  isConnected
                    ? "connected"
                    : isConnecting
                      ? "connecting"
                      : "disconnected"
                }
                onClear={() => onUpdate((prev) => ({ ...prev, messages: [] }))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
