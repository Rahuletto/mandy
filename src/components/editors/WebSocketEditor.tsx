import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  TbSend,
  TbArrowDown,
  TbArrowUp,
  TbSearch,
  TbTrash,
  TbChevronDown,
  TbChevronRight,
  TbCircleCheck,
  TbCircleX,
  TbFilter,
} from "react-icons/tb";
import type { AuthType } from "../../bindings";
import type {
  WebSocketFile,
  WebSocketMessage,
  WebSocketKeyValue,
} from "../../types/project";
import { KeyValueTable, type KeyValueItem } from "../KeyValueTable";
import { AuthEditor } from "./AuthEditor";
import { CodeEditor, CodeViewer } from "../CodeMirror";
import type { Language } from "../CodeMirror";
import { Dropdown } from "../ui";
import { useToastStore } from "../../stores/toastStore";


interface WebSocketEditorProps {
  ws: WebSocketFile;
  onUpdate: (updater: (ws: WebSocketFile) => WebSocketFile) => void;
  availableVariables?: string[];
  projectAuth?: AuthType;
  onOpenProjectSettings?: () => void;
}

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
type MessageFilter = "all" | "sent" | "received";
type WsTab =
  | "overview"
  | "message"
  | "params"
  | "authorization"
  | "headers"
  | "cookies";
type MessageContentType = "json" | "text";

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  const ms = d.getMilliseconds().toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

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

type WsSnippetLang =
  | "JavaScript"
  | "Python"
  | "Go"
  | "Rust"
  | "Java"
  | "PHP"
  | "Shell wscat";

function generateWsSnippet(
  url: string,
  lang: WsSnippetLang,
): { code: string; language: Language } {
  const u = url || "wss://echo.websocket.org";
  switch (lang) {
    case "JavaScript":
      return {
        language: "javascript",
        code: `const ws = new WebSocket("${u}");

ws.onopen = () => {
  console.log("Connected");
  ws.send(JSON.stringify({ message: "Hello" }));
};

ws.onmessage = (event) => {
  console.log("Received:", event.data);
};

ws.onerror = (error) => {
  console.error("Error:", error);
};

ws.onclose = (event) => {
  console.log("Disconnected:", event.code, event.reason);
};`,
      };
    case "Python":
      return {
        language: "python",
        code: `import asyncio
import websockets

async def connect():
    async with websockets.connect("${u}") as ws:
        await ws.send('{"message": "Hello"}')
        response = await ws.recv()
        print(f"Received: {response}")

asyncio.run(connect())`,
      };
    case "Go":
      return {
        language: "go",
        code: `package main

import (
\t"fmt"
\t"log"
\t"github.com/gorilla/websocket"
)

func main() {
\tc, _, err := websocket.DefaultDialer.Dial("${u}", nil)
\tif err != nil {
\t\tlog.Fatal("dial:", err)
\t}
\tdefer c.Close()

\terr = c.WriteMessage(websocket.TextMessage, []byte("Hello"))
\tif err != nil {
\t\tlog.Fatal("write:", err)
\t}

\t_, msg, err := c.ReadMessage()
\tif err != nil {
\t\tlog.Fatal("read:", err)
\t}
\tfmt.Printf("Received: %s\\n", msg)
}`,
      };
    case "Rust":
      return {
        language: "rust",
        code: `use tungstenite::connect;
use url::Url;

fn main() {
    let (mut socket, _response) =
        connect(Url::parse("${u}").unwrap())
            .expect("Can't connect");

    socket.send("Hello".into()).expect("Error sending");

    let msg = socket.read().expect("Error reading");
    println!("Received: {}", msg);
}`,
      };
    case "Java":
      return {
        language: "java",
        code: `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.concurrent.CompletionStage;

public class WsClient {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        WebSocket ws = client.newWebSocketBuilder()
            .buildAsync(URI.create("${u}"),
                new WebSocket.Listener() {
                    @Override
                    public CompletionStage<?> onText(
                            WebSocket webSocket,
                            CharSequence data,
                            boolean last) {
                        System.out.println("Received: " + data);
                        return WebSocket.Listener.super
                            .onText(webSocket, data, last);
                    }
                })
            .join();

        ws.sendText("Hello", true);
        Thread.sleep(2000);
    }
}`,
      };
    case "PHP":
      return {
        language: "php",
        code: `<?php
require 'vendor/autoload.php';

use Ratchet\\Client\\connect;

connect("${u}")->then(function($conn) {
    $conn->on('message', function($msg) use ($conn) {
        echo "Received: {$msg}\\n";
        $conn->close();
    });

    $conn->send('Hello');
}, function ($e) {
    echo "Could not connect: {$e->getMessage()}\\n";
});`,
      };
    case "Shell wscat":
      return {
        language: "shell",
        code: `# Install: npm install -g wscat
wscat -c "${u}"

# Then type messages in the interactive prompt
# > Hello`,
      };
  }
}

function WebSocketOverview({
  ws,
  onUpdate,
  onConnect,
  status,
}: {
  ws: WebSocketFile;
  onUpdate: WebSocketEditorProps["onUpdate"];
  onConnect: () => void;
  status: ConnectionStatus;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState(ws.name);
  const [description, setDescription] = useState(ws.description || "");
  const [snippetLang, setSnippetLang] = useState<WsSnippetLang>("JavaScript");
  const [showSnippetDropdown, setShowSnippetDropdown] = useState(false);

  useEffect(() => {
    setName(ws.name);
    setDescription(ws.description || "");
  }, [ws]);

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (name.trim() && name !== ws.name) {
      onUpdate((prev) => ({ ...prev, name: name.trim() }));
    } else {
      setName(ws.name);
    }
  };

  const { code: snippetCode, language: snippetLanguage } = generateWsSnippet(
    ws.url,
    snippetLang,
  );

  const snippetLangs: { label: string; lang: WsSnippetLang; icon?: React.ReactNode }[] = [
    { label: "JavaScript", lang: "JavaScript" },
    { label: "Python", lang: "Python" },
    { label: "Go Native", lang: "Go" },
    { label: "Rust Tungstenite", lang: "Rust" },
    { label: "Java HttpClient", lang: "Java" },
    { label: "PHP Ratchet", lang: "PHP" },
    { label: "Shell wscat", lang: "Shell wscat" },
  ];

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="flex min-h-full max-w-[1600px] mx-auto relative pl-8 pr-4 gap-8">
        <div className="flex-1 py-12 w-[40%]">
          <div className="max-w-3xl">
            {isEditingName ? (
              <input
                autoFocus
                className="text-2xl font-bold bg-transparent border-none outline-none text-white w-full mb-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
              />
            ) : (
              <h1
                className="text-2xl font-bold text-white mb-2 cursor-text hover:text-white/90"
                onClick={() => setIsEditingName(true)}
              >
                {ws.name}
              </h1>
            )}

            <textarea
              ref={(el) => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = el.scrollHeight + "px";
                }
              }}
              className="w-full bg-transparent border-none outline-none text-sm text-white/60 resize-none overflow-hidden min-h-6 mb-3 placeholder:text-white/20"
              placeholder="Add a description..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                onUpdate((prev) => ({
                  ...prev,
                  description: e.target.value,
                }));
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = target.scrollHeight + "px";
              }}
            />

            <section className="flex flex-col gap-8">
              {(ws.params || []).filter((p) => p.enabled && p.key).length >
                0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-white/70 mb-2">
                    Query Parameters
                  </h3>
                  <div className="space-y-1">
                    {(ws.params || [])
                      .filter((p) => p.enabled && p.key)
                      .map((p) => (
                        <div
                          key={p.id}
                          className="py-2 border-b border-white/5 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-white font-medium">
                              {p.key}
                            </span>
                            <span className="text-[10px] lowercase font-mono text-emerald-400/60">
                              string
                            </span>
                          </div>
                          {p.description && (
                            <p className="mt-1 text-[11px] text-white/40">
                              {p.description}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {(ws.headerItems || []).filter((h) => h.enabled && h.key)
                .length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-white/70 mb-2">
                    Headers
                  </h3>
                  <div className="space-y-1">
                    {(ws.headerItems || [])
                      .filter((h) => h.enabled && h.key)
                      .map((h) => (
                        <div
                          key={h.id}
                          className="py-2 border-b border-white/5 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-white font-medium">
                              {h.key}
                            </span>
                          </div>
                          {h.description && (
                            <p className="mt-1 text-[11px] text-white/40">
                              {h.description}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </section>

            <div className="h-24" />
          </div>
        </div>

        <div className="w-[60%] shrink-0 py-4 self-start sticky top-0 h-[80vh]">
          <div className="h-full rounded-xl bg-background border border-white/5 overflow-hidden flex flex-col">
            <div className="flex shrink-0 items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                  WS
                </span>
                <span className="text-xs text-white/40 truncate max-w-[200px]">
                  {ws.url || "No URL set"}
                </span>
              </div>

              <div className="relative">
                <button
                  onClick={() => setShowSnippetDropdown(!showSnippetDropdown)}
                  className="text-[11px] text-white/60 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  {snippetLang}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {showSnippetDropdown && (
                  <Dropdown
                    className="top-full right-0 mt-1"
                    onClose={() => setShowSnippetDropdown(false)}
                    items={snippetLangs.map((s) => ({
                      label: s.label,
                      icon: s.icon,
                      onClick: () => {
                        setSnippetLang(s.lang);
                        setShowSnippetDropdown(false);
                      },
                    }))}
                  />
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 text-[11px] relative">
              <div className="absolute inset-0 overflow-auto">
                <CodeViewer code={snippetCode} language={snippetLanguage} />
              </div>
              <button
                onClick={onConnect}
                disabled={!ws.url || status === "connected"}
                className="flex absolute right-4 bottom-4 cursor-pointer items-center gap-2 px-4 py-1.5 bg-accent disabled:opacity-50 text-background rounded-full text-sm font-semibold hover:bg-accent/90 transition-colors z-20"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WebSocketEditor({
  ws,
  onUpdate,
  availableVariables,
  projectAuth,
  onOpenProjectSettings,
}: WebSocketEditorProps) {
  const { addToast } = useToastStore();
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [messageInput, setMessageInput] = useState("");
  const [messageContentType, setMessageContentType] =
    useState<MessageContentType>("json");
  const [url, setUrl] = useState(ws.url);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<MessageFilter>("all");
  const [activeTab, setActiveTab] = useState<WsTab>("overview");
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    new Set(),
  );
  const [splitPercent, setSplitPercent] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUrl(ws.url);
  }, [ws.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ws.messages.length]);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing && splitContainerRef.current) {
        const rect = splitContainerRef.current.getBoundingClientRect();
        const newPercent = ((e.clientX - rect.left) / rect.width) * 100;
        setSplitPercent(Math.max(30, Math.min(70, newPercent)));
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };
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

  const addMessage = useCallback(
    (msg: WebSocketMessage) => {
      onUpdate((prev) => ({
        ...prev,
        messages: [...prev.messages, msg],
      }));
    },
    [onUpdate],
  );

  const connect = useCallback(() => {
    if (!url) return;
    setStatus("connecting");

    try {
      const socket = new WebSocket(url);
      socketRef.current = socket;

      timeoutRef.current = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          socket.close();
          socketRef.current = null;
          setStatus("error");
          addToast("Connection timed out", "error");
        }
      }, 10000);

      socket.onopen = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setStatus("connected");

        const enabledHeaders: Record<string, string> = {};
        for (const item of ws.headerItems || []) {
          if (item.enabled && item.key) enabledHeaders[item.key] = item.value;
        }
        for (const [k, v] of Object.entries(ws.headers || {})) {
          enabledHeaders[k] = v;
        }

        const connMsg: WebSocketMessage = {
          id: crypto.randomUUID(),
          direction: "system",
          data: `Connected to ${url}`,
          timestamp: Date.now(),
          type: "connection",
          handshake: {
            requestUrl: url.replace(/^ws/, "http"),
            requestMethod: "GET",
            statusCode: "101 Switching Protocols",
            requestHeaders: {
              Connection: "Upgrade",
              Upgrade: "websocket",
              "Sec-WebSocket-Version": "13",
              ...enabledHeaders,
            },
            responseHeaders: {
              Connection: "Upgrade",
              Upgrade: "websocket",
            },
          },
        };
        addMessage(connMsg);
        setExpandedMessages(new Set());
      };

      socket.onmessage = (event) => {
        const msg: WebSocketMessage = {
          id: crypto.randomUUID(),
          direction: "receive",
          data: String(event.data),
          timestamp: Date.now(),
          type: "text",
        };
        addMessage(msg);
      };

      socket.onerror = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setStatus("error");
        addToast("Failed to connect to WebSocket", "error");
      };

      socket.onclose = (event) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setStatus("disconnected");
        socketRef.current = null;
        if (event.code !== 1000) {
          addToast(`WebSocket disconnected (code ${event.code})`, "error");
        }
        const closeMsg: WebSocketMessage = {
          id: crypto.randomUUID(),
          direction: "system",
          data: `Disconnected${event.reason ? `: ${event.reason}` : ""} (code ${event.code})`,
          timestamp: Date.now(),
          type: "close",
        };
        addMessage(closeMsg);
      };
    } catch {
      setStatus("error");
      addToast("Failed to connect to WebSocket", "error");
    }
  }, [url, addMessage, addToast, ws.headers, ws.headerItems]);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setStatus("disconnected");
  }, []);

  const sendMessage = useCallback(() => {
    if (!messageInput.trim() || !socketRef.current) return;
    socketRef.current.send(messageInput);
    const msg: WebSocketMessage = {
      id: crypto.randomUUID(),
      direction: "send",
      data: messageInput,
      timestamp: Date.now(),
      type: "text",
    };
    addMessage(msg);
    setMessageInput("");
  }, [messageInput, addMessage]);

  const clearMessages = useCallback(() => {
    onUpdate((prev) => ({ ...prev, messages: [] }));
    setExpandedMessages(new Set());
  }, [onUpdate]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filteredMessages = useMemo(() => {
    let msgs = ws.messages;

    if (filter === "sent") {
      msgs = msgs.filter((m) => m.direction === "send");
    } else if (filter === "received") {
      msgs = msgs.filter(
        (m) => m.direction === "receive" || m.direction === "system",
      );
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      msgs = msgs.filter((m) => m.data.toLowerCase().includes(q));
    }

    return msgs;
  }, [ws.messages, filter, searchQuery]);

  const statusLabel = {
    disconnected: "Disconnected",
    connecting: "Connecting...",
    connected: "Connected",
    error: "Error",
  }[status];

  const tabs: WsTab[] = [
    "overview",
    "message",
    "params",
    "authorization",
    "headers",
    "cookies",
  ];

  const editorLanguage: Language =
    messageContentType === "json" ? "json" : "text";

  const isOverview = activeTab === "overview";

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-4 border-b border-text/15 p-4">
        <div className="flex-1 flex items-center bg-inputbox rounded-lg overflow-hidden">
          <span className="px-4 py-2.5 text-sm font-bold font-mono text-emerald-400">
            WS
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
            onClick={connect}
            disabled={!url || status === "connecting"}
            className="px-6 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 rounded-full text-background font-semibold transition-all"
          >
            Connect
          </button>
        )}
      </div>

      <div ref={splitContainerRef} className="flex flex-1 overflow-hidden">
        {/* Left side */}
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
                onConnect={connect}
                status={status}
              />
            )}

            {activeTab === "message" && (
              <div className="flex flex-col h-full relative">
                <div className="flex items-center gap-2 px-2 py-2 border-b border-white/5">
                  {(["json", "text"] as const).map((ct) => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => setMessageContentType(ct)}
                      className={`px-2 py-0.5 text-[11px] cursor-pointer font-medium rounded transition-colors ${
                        messageContentType === ct
                          ? "text-accent bg-accent/10"
                          : "text-white/50 hover:text-white/70"
                      }`}
                    >
                      {ct === "json" ? "JSON" : "Raw Text"}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-auto">
                  <CodeEditor
                    code={messageInput}
                    language={editorLanguage}
                    onChange={setMessageInput}
                    placeholder={
                      messageContentType === "json"
                        ? '{ "message": "Hello" }'
                        : "Type your message..."
                    }
                  />
                </div>
                <button
                  onClick={sendMessage}
                  disabled={!messageInput.trim() || status !== "connected"}
                  className="absolute right-4 bottom-4 p-2.5 bg-accent hover:bg-accent/90 disabled:opacity-50 rounded-full text-background transition-all z-20"
                >
                  <TbSend size={16} />
                </button>
              </div>
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
                onChange={(auth) =>
                  onUpdate((prev) => ({ ...prev, auth }))
                }
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

        {/* Resize handle + Response panel (hidden on overview) */}
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

            <div className="flex flex-col flex-1 overflow-hidden bg-inset border-l border-white/10">
              <div className="flex items-center gap-2 p-2 px-4 border-b border-white/5">
                <span className="text-xs font-medium text-white">
                  Response
                </span>
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
                  onClick={() =>
                    setFilter((f) =>
                      f === "all"
                        ? "sent"
                        : f === "sent"
                          ? "received"
                          : "all",
                    )
                  }
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-white/50 hover:text-white/70 transition-colors rounded-md hover:bg-white/5 cursor-pointer"
                >
                  <TbFilter size={13} />
                  {filter === "all"
                    ? "All Messages"
                    : filter === "sent"
                      ? "Sent"
                      : "Received"}
                </button>

                {ws.messages.length > 0 && (
                  <button
                    type="button"
                    onClick={clearMessages}
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
                    {ws.messages.length === 0
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
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
