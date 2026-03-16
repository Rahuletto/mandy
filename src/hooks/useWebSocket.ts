import { useState, useRef, useEffect, useCallback } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { commands } from "../bindings";
import type { WsIncomingMessage, WsClosedEvent } from "../bindings";
import type { WebSocketFile, WebSocketMessage } from "../types/project";
import { useToastStore } from "../stores/toastStore";
import { playSuccessChime } from "../utils/sounds";

const persistentWsConnections = new Set<string>();

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface UseWebSocketOptions {
  ws: WebSocketFile;
  onUpdate: (updater: (ws: WebSocketFile) => WebSocketFile) => void;
  persist?: boolean;
}

export function useWebSocket({
  ws,
  onUpdate,
  persist = false,
}: UseWebSocketOptions) {
  const { addToast } = useToastStore();
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  // Track the active connection_id so we can send/disconnect to the right session
  const connectionIdRef = useRef<string | null>(null);

  // Tauri event unlisteners — cleaned up on disconnect or unmount
  const unlistenMsgRef = useRef<UnlistenFn | null>(null);
  const unlistenCloseRef = useRef<UnlistenFn | null>(null);

  // Clean up event listeners without closing the socket (used internally)
  const cleanupListeners = useCallback(() => {
    unlistenMsgRef.current?.();
    unlistenMsgRef.current = null;
    unlistenCloseRef.current?.();
    unlistenCloseRef.current = null;
  }, []);

  // Disconnect and clean up everything on unmount
  useEffect(() => {
    return () => {
      const id = connectionIdRef.current;
      if (id && !persist) {
        commands.wsDisconnect(id).catch(() => {});
        connectionIdRef.current = null;
      }
      cleanupListeners();
    };
  }, [cleanupListeners, persist]);

  const addMessage = useCallback(
    (msg: WebSocketMessage) => {
      onUpdate((prev) => ({ ...prev, messages: [...prev.messages, msg] }));
    },
    [onUpdate],
  );

  const connect = useCallback(
    async (url: string) => {
      if (!url) return;

      // If already connected, disconnect first
      if (connectionIdRef.current) {
        await commands.wsDisconnect(connectionIdRef.current).catch(() => {});
        cleanupListeners();
        connectionIdRef.current = null;
      }

      setStatus("connecting");

      // Build the connection ID from the ws file id so it's stable and unique
      const connectionId = ws.id;

      // Collect enabled headers
      const headers: Record<string, string> = {};
      for (const item of ws.headerItems || []) {
        if (item.enabled && item.key) headers[item.key] = item.value;
      }
      for (const [k, v] of Object.entries(ws.headers || {})) {
        headers[k] = v;
      }

      // Register Tauri event listeners BEFORE calling ws_connect so we
      // never miss a message that arrives right after the handshake.
      const msgEventName = `ws://message/${connectionId}`;
      const closeEventName = `ws://closed/${connectionId}`;

      const unlistenMsg = await listen<WsIncomingMessage>(
        msgEventName,
        (event) => {
          const { id, data, binary, timestamp_ms } = event.payload;
          addMessage({
            id,
            direction: "receive",
            data,
            timestamp: timestamp_ms,
            type: binary ? "binary" : "text",
          });
        },
      );
      unlistenMsgRef.current = unlistenMsg;

      const unlistenClose = await listen<WsClosedEvent>(
        closeEventName,
        (event) => {
          const { code, reason } = event.payload;
          cleanupListeners();
          connectionIdRef.current = null;
          setStatus(code === 1000 || code === 1001 ? "disconnected" : "error");
          if (persist && persistentWsConnections.has(ws.id)) {
            persistentWsConnections.delete(ws.id);
          }

          if (code !== 1000 && code !== 1001) {
            addToast(`WebSocket disconnected (code ${code})`, "error");
          }

          addMessage({
            id: crypto.randomUUID(),
            direction: "system",
            data: `Disconnected${reason ? `: ${reason}` : ""} (code ${code})`,
            timestamp: Date.now(),
            type: "close",
          });
        },
      );
      unlistenCloseRef.current = unlistenClose;

      // Dial — this returns once the HTTP upgrade handshake is complete
      const result = await commands.wsConnect({
        connection_id: connectionId,
        url,
        headers,
        protocols: ws.protocols ?? [],
      });

      if (result.status === "error") {
        cleanupListeners();
        setStatus("error");
        addToast(`Failed to connect: ${result.error}`, "error");
        return;
      }

      const resp = result.data;

      if (resp.error) {
        cleanupListeners();
        setStatus("error");
        addToast(`Failed to connect: ${resp.error}`, "error");
        return;
      }

      connectionIdRef.current = connectionId;
      setStatus("connected");
      playSuccessChime();

      // Build the system connection message with real handshake data from Rust
      const requestHeaders: Record<string, string> = {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        ...headers,
      };

      const responseHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(resp.response_headers ?? {})) {
        if (v != null) responseHeaders[k] = v;
      }

      addMessage({
        id: crypto.randomUUID(),
        direction: "system",
        data: `Connected to ${resp.url}`,
        timestamp: Date.now(),
        type: "connection",
        handshake: {
          requestUrl: resp.url.replace(/^ws(s?):/, "http$1:"),
          requestMethod: "GET",
          statusCode: `${resp.status_code} ${resp.status_text}`,
          requestHeaders,
          responseHeaders,
        },
      });

      if (persist) {
        persistentWsConnections.add(ws.id);
      }
    },
    [
      ws.id,
      ws.headers,
      ws.headerItems,
      ws.protocols,
      addMessage,
      addToast,
      cleanupListeners,
    ],
  );

  const disconnect = useCallback(async () => {
    const id = connectionIdRef.current;
    if (!id) return;

    await commands.wsDisconnect(id).catch(() => {});
    cleanupListeners();
    connectionIdRef.current = null;
    setStatus("disconnected");
    if (persist && persistentWsConnections.has(ws.id)) {
      persistentWsConnections.delete(ws.id);
    }

    addMessage({
      id: crypto.randomUUID(),
      direction: "system",
      data: "Disconnected",
      timestamp: Date.now(),
      type: "close",
    });
  }, [addMessage, cleanupListeners]);

  const sendMessage = useCallback(
    async (data: string) => {
      const id = connectionIdRef.current;
      if (!data.trim() || !id) return;

      const result = await commands.wsSend({
        connection_id: id,
        data,
        binary: false,
      });

      if (result.status === "error") {
        addToast(`Failed to send message: ${result.error}`, "error");
        return;
      }

      addMessage({
        id: crypto.randomUUID(),
        direction: "send",
        data,
        timestamp: Date.now(),
        type: "text",
      });
    },
    [addMessage, addToast],
  );

  const clearMessages = useCallback(() => {
    onUpdate((prev) => ({ ...prev, messages: [] }));
  }, [onUpdate]);

  // Reattach to existing persistent connection on mount
  useEffect(() => {
    if (persist && persistentWsConnections.has(ws.id)) {
      const reattach = async () => {
        const msgEventName = `ws://message/${ws.id}`;
        const closeEventName = `ws://closed/${ws.id}`;

        const unlistenMsg = await listen<WsIncomingMessage>(
          msgEventName,
          (event) => {
            const { id, data, binary, timestamp_ms } = event.payload;
            addMessage({
              id,
              direction: "receive",
              data,
              timestamp: timestamp_ms,
              type: binary ? "binary" : "text",
            });
          },
        );
        unlistenMsgRef.current = unlistenMsg;

        const unlistenClose = await listen<WsClosedEvent>(
          closeEventName,
          (event) => {
            const { code, reason } = event.payload;
            cleanupListeners();
            connectionIdRef.current = null;
            setStatus(
              code === 1000 || code === 1001 ? "disconnected" : "error",
            );
            persistentWsConnections.delete(ws.id);

            if (code !== 1000 && code !== 1001) {
              addToast(`WebSocket disconnected (code ${code})`, "error");
            }

            addMessage({
              id: crypto.randomUUID(),
              direction: "system",
              data: `Disconnected${reason ? `: ${reason}` : ""} (code ${code})`,
              timestamp: Date.now(),
              type: "close",
            });
          },
        );
        unlistenCloseRef.current = unlistenClose;

        connectionIdRef.current = ws.id;
        setStatus("connected");
        addMessage({
          id: crypto.randomUUID(),
          direction: "system",
          data: "Reconnected to existing WebSocket session",
          timestamp: Date.now(),
          type: "connection",
        });
      };

      reattach();
    }
  }, [persist, ws.id, addMessage, addToast, cleanupListeners]);

  return { status, connect, disconnect, sendMessage, clearMessages };
}
