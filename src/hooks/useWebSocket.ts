import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { commands } from "../bindings";
import type { WsIncomingMessage, WsClosedEvent } from "../bindings";
import type { WebSocketFile, WebSocketMessage } from "../types/project";
import { useToastStore } from "../stores/toastStore";
import { playSuccessChime } from "../utils/sounds";

/** Only one WebSocket may be connected app-wide (exclusive lock by file id). */
let exclusiveWsOwnerId: string | null = null;

const exclusiveOwnerListeners = new Set<() => void>();

function notifyExclusiveOwnerChanged() {
  exclusiveOwnerListeners.forEach((fn) => fn());
}

function assignExclusiveOwner(id: string | null) {
  if (exclusiveWsOwnerId === id) return;
  exclusiveWsOwnerId = id;
  notifyExclusiveOwnerChanged();
}

/**
 * File ids whose Rust WebSocket is still open while no editor is mounted
 * (user switched to another tab — listeners were torn down).
 */
const persistedWsSessionIds = new Set<string>();

function releaseExclusiveLock(wsId: string) {
  if (exclusiveWsOwnerId === wsId) {
    exclusiveWsOwnerId = null;
    notifyExclusiveOwnerChanged();
  }
}

/** For UI: which WebSocket file currently holds the connection lock, if any. */
export function getExclusiveWebSocketOwnerId(): string | null {
  return exclusiveWsOwnerId;
}

function subscribeExclusiveWsOwner(onStoreChange: () => void) {
  exclusiveOwnerListeners.add(onStoreChange);
  return () => exclusiveOwnerListeners.delete(onStoreChange);
}

/** Re-renders when the exclusive WebSocket owner id changes (for Connect button state). */
export function useExclusiveWebSocketOwnerId(): string | null {
  return useSyncExternalStore(
    subscribeExclusiveWsOwner,
    getExclusiveWebSocketOwnerId,
    getExclusiveWebSocketOwnerId,
  );
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface UseWebSocketOptions {
  ws: WebSocketFile;
  onUpdate: (updater: (ws: WebSocketFile) => WebSocketFile) => void;
  resolveVariables?: (text: string) => string;
  /** File tree spinner: active while connecting or connected (including background session). */
  onTreeActivity?: (active: boolean) => void;
}

export function useWebSocket({
  ws,
  onUpdate,
  resolveVariables = (t) => t,
  onTreeActivity,
}: UseWebSocketOptions) {
  const { addToast } = useToastStore();
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    persistedWsSessionIds.has(ws.id) ? "connecting" : "disconnected",
  );

  const connectionIdRef = useRef<string | null>(null);
  const unlistenMsgRef = useRef<UnlistenFn | null>(null);
  const unlistenCloseRef = useRef<UnlistenFn | null>(null);

  const cleanupListeners = useCallback(() => {
    unlistenMsgRef.current?.();
    unlistenMsgRef.current = null;
    unlistenCloseRef.current?.();
    unlistenCloseRef.current = null;
  }, []);

  useEffect(() => {
    if (!onTreeActivity) return;
    onTreeActivity(
      status === "connected" || status === "connecting",
    );
  }, [status, onTreeActivity]);

  const addMessage = useCallback(
    (msg: WebSocketMessage) => {
      onUpdate((prev) => ({ ...prev, messages: [...prev.messages, msg] }));
    },
    [onUpdate],
  );

  // Resume background session when reopening this file; on any unmount, drop listeners but keep Rust open.
  useEffect(() => {
    let cancelled = false;

    async function maybeReattach() {
      if (!persistedWsSessionIds.has(ws.id)) return;

      const connectionId = ws.id;
      const msgEventName = `ws://message/${connectionId}`;
      const closeEventName = `ws://closed/${connectionId}`;

      try {
        const unlistenMsg = await listen<WsIncomingMessage>(
          msgEventName,
          (event) => {
            const { connection_id, id, data, binary, timestamp_ms } =
              event.payload;
            if (connection_id !== ws.id) return;
            addMessage({
              id,
              direction: "receive",
              data,
              timestamp: timestamp_ms,
              type: binary ? "binary" : "text",
            });
          },
        );
        if (cancelled) {
          unlistenMsg();
          return;
        }
        unlistenMsgRef.current = unlistenMsg;

        const unlistenClose = await listen<WsClosedEvent>(
          closeEventName,
          (event) => {
            const { connection_id, code, reason } = event.payload;
            if (connection_id !== ws.id) return;
            if (connectionIdRef.current !== connection_id) return;

            cleanupListeners();
            connectionIdRef.current = null;
            persistedWsSessionIds.delete(ws.id);
            releaseExclusiveLock(ws.id);
            setStatus(code === 1000 || code === 1001 ? "disconnected" : "error");

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
        if (cancelled) {
          unlistenMsg();
          unlistenClose();
          return;
        }
        unlistenCloseRef.current = unlistenClose;

        connectionIdRef.current = connectionId;
        assignExclusiveOwner(ws.id);
        persistedWsSessionIds.delete(ws.id);
        setStatus("connected");
      } catch {
        persistedWsSessionIds.delete(ws.id);
        releaseExclusiveLock(ws.id);
        setStatus("error");
        addToast("Failed to resume WebSocket session", "error");
        await commands.wsDisconnect(connectionId).catch(() => {});
      }
    }

    void maybeReattach();

    return () => {
      cancelled = true;
      const id = connectionIdRef.current;
      cleanupListeners();
      connectionIdRef.current = null;
      if (id) {
        persistedWsSessionIds.add(ws.id);
      } else {
        onTreeActivity?.(false);
      }
    };
  }, [ws.id, addMessage, addToast, cleanupListeners, onTreeActivity]);

  const connect = useCallback(
    async (url: string) => {
      if (!url) return;

      if (
        exclusiveWsOwnerId !== null &&
        exclusiveWsOwnerId !== ws.id
      ) {
        return;
      }

      if (connectionIdRef.current) {
        await commands.wsDisconnect(connectionIdRef.current).catch(() => {});
        cleanupListeners();
        connectionIdRef.current = null;
        persistedWsSessionIds.delete(ws.id);
        releaseExclusiveLock(ws.id);
      }

      // Background session for this file: user clicked Connect again — replace it.
      if (persistedWsSessionIds.has(ws.id)) {
        await commands.wsDisconnect(ws.id).catch(() => {});
        persistedWsSessionIds.delete(ws.id);
        releaseExclusiveLock(ws.id);
      }

      setStatus("connecting");

      try {
        const resolvedUrl = resolveVariables(url);
        const connectionId = ws.id;

        const headers: Record<string, string> = {};
        for (const item of ws.headerItems || []) {
          if (item.enabled && item.key) {
            headers[resolveVariables(item.key)] = resolveVariables(item.value);
          }
        }
        for (const [k, v] of Object.entries(ws.headers || {})) {
          headers[resolveVariables(k)] = resolveVariables(v);
        }

        const msgEventName = `ws://message/${connectionId}`;
        const closeEventName = `ws://closed/${connectionId}`;

        const unlistenMsg = await listen<WsIncomingMessage>(
          msgEventName,
          (event) => {
            const { connection_id, id, data, binary, timestamp_ms } =
              event.payload;
            if (connection_id !== ws.id) return;
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
            const { connection_id, code, reason } = event.payload;
            if (connection_id !== ws.id) return;
            if (connectionIdRef.current !== connection_id) return;

            cleanupListeners();
            connectionIdRef.current = null;
            persistedWsSessionIds.delete(ws.id);
            releaseExclusiveLock(ws.id);
            setStatus(code === 1000 || code === 1001 ? "disconnected" : "error");

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

        const result = await commands.wsConnect({
          connection_id: connectionId,
          url: resolvedUrl,
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
        assignExclusiveOwner(ws.id);
        persistedWsSessionIds.delete(ws.id);
        setStatus("connected");
        playSuccessChime();

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
      } catch (err) {
        cleanupListeners();
        setStatus("error");
        addToast(
          `Failed to connect: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
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
      resolveVariables,
    ],
  );

  const disconnect = useCallback(async () => {
    const id = connectionIdRef.current;
    if (!id) {
      if (persistedWsSessionIds.has(ws.id)) {
        await commands.wsDisconnect(ws.id).catch(() => {});
        persistedWsSessionIds.delete(ws.id);
        releaseExclusiveLock(ws.id);
        setStatus("disconnected");
      }
      return;
    }

    await commands.wsDisconnect(id).catch(() => {});

    if (connectionIdRef.current === id) {
      cleanupListeners();
      connectionIdRef.current = null;
      persistedWsSessionIds.delete(ws.id);
      releaseExclusiveLock(ws.id);
      setStatus("disconnected");
      addMessage({
        id: crypto.randomUUID(),
        direction: "system",
        data: "Disconnected",
        timestamp: Date.now(),
        type: "close",
      });
    }
  }, [addMessage, cleanupListeners, ws.id]);

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

  return { status, connect, disconnect, sendMessage, clearMessages };
}
