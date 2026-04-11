import { useCallback, useEffect, useRef, useState } from "react";
import { commands } from "../bindings";
import { persistedWsSessionIds } from "../realtime/backgroundSessionIds";
import {
	ensureRealtimeBridge,
	releaseRealtimeBridge,
} from "../realtime/globalRealtimeBridge";
import { subscribeWebSocketRemoteClosed } from "../realtime/realtimeUiBus";
import {
	assignExclusiveWebSocketOwner,
	getExclusiveWebSocketOwnerId,
	releaseExclusiveWebSocketLock,
} from "../realtime/wsExclusiveLock";
import { useToastStore } from "../stores/toastStore";
import type { WebSocketFile, WebSocketMessage } from "../types/project";
import { playSuccessChime } from "../utils/sounds";

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

	useEffect(() => {
		if (!onTreeActivity) return;
		onTreeActivity(status === "connected" || status === "connecting");
	}, [status, onTreeActivity]);

	const addMessage = useCallback(
		(msg: WebSocketMessage) => {
			onUpdate((prev) => ({ ...prev, messages: [...prev.messages, msg] }));
		},
		[onUpdate],
	);

	/** Rust closed the socket while this editor is mounted (global bridge notifies). */
	useEffect(() => {
		return subscribeWebSocketRemoteClosed(ws.id, ({ code }) => {
			connectionIdRef.current = null;
			setStatus(code === 1000 || code === 1001 ? "disconnected" : "error");
		});
	}, [ws.id]);

	// Resume UI when reopening a file whose Rust WebSocket stayed open (bridge never stopped).
	useEffect(() => {
		let cancelled = false;

		void (async () => {
			if (!persistedWsSessionIds.has(ws.id)) return;

			try {
				await ensureRealtimeBridge(ws.id, "websocket");
				if (cancelled) return;
				connectionIdRef.current = ws.id;
				assignExclusiveWebSocketOwner(ws.id);
				persistedWsSessionIds.delete(ws.id);
				setStatus("connected");
			} catch {
				persistedWsSessionIds.delete(ws.id);
				releaseExclusiveWebSocketLock(ws.id);
				setStatus("error");
				addToast("Failed to resume WebSocket session", "error");
				await commands.wsDisconnect(ws.id).catch(() => {});
			}
		})();

		return () => {
			cancelled = true;
			const id = connectionIdRef.current;
			connectionIdRef.current = null;
			if (id) {
				persistedWsSessionIds.add(ws.id);
			} else {
				onTreeActivity?.(false);
			}
		};
	}, [ws.id, addToast, onTreeActivity]);

	const connect = useCallback(
		async (url: string) => {
			if (!url) return;

			const wsOwner = getExclusiveWebSocketOwnerId();
			if (wsOwner !== null && wsOwner !== ws.id) {
				return;
			}

			if (connectionIdRef.current) {
				await commands.wsDisconnect(connectionIdRef.current).catch(() => {});
				releaseRealtimeBridge(connectionIdRef.current);
				connectionIdRef.current = null;
				persistedWsSessionIds.delete(ws.id);
				releaseExclusiveWebSocketLock(ws.id);
			}

			if (persistedWsSessionIds.has(ws.id)) {
				await commands.wsDisconnect(ws.id).catch(() => {});
				releaseRealtimeBridge(ws.id);
				persistedWsSessionIds.delete(ws.id);
				releaseExclusiveWebSocketLock(ws.id);
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

				await ensureRealtimeBridge(connectionId, "websocket");

				const result = await commands.wsConnect({
					connection_id: connectionId,
					url: resolvedUrl,
					headers,
					protocols: ws.protocols ?? [],
				});

				if (result.status === "error") {
					releaseRealtimeBridge(connectionId);
					setStatus("error");
					addToast(`Failed to connect: ${result.error}`, "error");
					return;
				}

				const resp = result.data;

				if (resp.error) {
					releaseRealtimeBridge(connectionId);
					setStatus("error");
					addToast(`Failed to connect: ${resp.error}`, "error");
					return;
				}

				connectionIdRef.current = connectionId;
				assignExclusiveWebSocketOwner(ws.id);
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
				releaseRealtimeBridge(ws.id);
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
			resolveVariables,
		],
	);

	const disconnect = useCallback(async () => {
		const id = connectionIdRef.current;
		if (!id) {
			if (persistedWsSessionIds.has(ws.id)) {
				releaseRealtimeBridge(ws.id);
				await commands.wsDisconnect(ws.id).catch(() => {});
				persistedWsSessionIds.delete(ws.id);
				releaseExclusiveWebSocketLock(ws.id);
				setStatus("disconnected");
			}
			return;
		}

		releaseRealtimeBridge(id);
		await commands.wsDisconnect(id).catch(() => {});

		if (connectionIdRef.current === id) {
			connectionIdRef.current = null;
			persistedWsSessionIds.delete(ws.id);
			releaseExclusiveWebSocketLock(ws.id);
			setStatus("disconnected");
			addMessage({
				id: crypto.randomUUID(),
				direction: "system",
				data: "Disconnected",
				timestamp: Date.now(),
				type: "close",
			});
		}
	}, [addMessage, ws.id]);

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
