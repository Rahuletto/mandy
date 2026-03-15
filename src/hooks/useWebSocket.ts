import { useState, useRef, useEffect, useCallback } from "react";
import type { WebSocketFile, WebSocketMessage } from "../types/project";
import { useToastStore } from "../stores/toastStore";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface UseWebSocketOptions {
  ws: WebSocketFile;
  onUpdate: (updater: (ws: WebSocketFile) => WebSocketFile) => void;
}

export function useWebSocket({ ws, onUpdate }: UseWebSocketOptions) {
  const { addToast } = useToastStore();
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const socketRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const addMessage = useCallback(
    (msg: WebSocketMessage) => {
      onUpdate((prev) => ({ ...prev, messages: [...prev.messages, msg] }));
    },
    [onUpdate],
  );

  const connect = useCallback(
    (url: string) => {
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

          addMessage({
            id: crypto.randomUUID(),
            direction: "system",
            data: `Connected to ${url}`,
            timestamp: Date.now(),
            type: "connection",
            handshake: {
              requestUrl: url.replace(/^ws(s?):/, "http$1:"),
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
          });
        };

        socket.onmessage = (event) => {
          addMessage({
            id: crypto.randomUUID(),
            direction: "receive",
            data: String(event.data),
            timestamp: Date.now(),
            type: "text",
          });
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
          addMessage({
            id: crypto.randomUUID(),
            direction: "system",
            data: `Disconnected${event.reason ? `: ${event.reason}` : ""} (code ${event.code})`,
            timestamp: Date.now(),
            type: "close",
          });
        };
      } catch {
        setStatus("error");
        addToast("Failed to connect to WebSocket", "error");
      }
    },
    [addMessage, addToast, ws.headers, ws.headerItems],
  );

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setStatus("disconnected");
  }, []);

  const sendMessage = useCallback(
    (data: string) => {
      if (!data.trim() || !socketRef.current) return;
      socketRef.current.send(data);
      addMessage({
        id: crypto.randomUUID(),
        direction: "send",
        data,
        timestamp: Date.now(),
        type: "text",
      });
    },
    [addMessage],
  );

  const clearMessages = useCallback(() => {
    onUpdate((prev) => ({ ...prev, messages: [] }));
  }, [onUpdate]);

  return { status, connect, disconnect, sendMessage, clearMessages };
}
