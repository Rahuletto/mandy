import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { startTransition } from "react";
import {
	commands,
	type MqttIncomingMessage,
	type SioIncomingMessage,
	type SseIncomingMessage,
	type WsClosedEvent,
	type WsIncomingMessage,
} from "../bindings";
import { useProjectStore } from "../stores/projectStore";
import { useToastStore } from "../stores/toastStore";
import { findTreeItemById } from "../utils/findTreeItem";
import {
	persistedMqttSessionIds,
	persistedSioSessionIds,
	persistedSseSessionIds,
	persistedWsSessionIds,
} from "./backgroundSessionIds";
import {
	clearAllRealtimeUiSubscribers,
	emitMqttRemoteDisconnect,
	emitSocketIoRemoteDisconnect,
	emitSseRemoteDisconnect,
	emitWebSocketRemoteClosed,
} from "./realtimeUiBus";
import {
	assignExclusiveWebSocketOwner,
	releaseExclusiveWebSocketLock,
} from "./wsExclusiveLock";

/** After forced teardown, bridge listeners are gone so Tauri close events never run — editors listen here. */
function notifyEditorsForcedRealtimeClose(connectionId: string) {
	emitWebSocketRemoteClosed(connectionId, { code: 1000 });
	emitSocketIoRemoteDisconnect(connectionId);
	emitMqttRemoteDisconnect(connectionId);
	emitSseRemoteDisconnect(connectionId);
}

const MAX_SOCKETIO_MESSAGES = 600;
const MAX_MQTT_MESSAGES = 600;
const MAX_SSE_EVENTS = 600;

function appendCapped<T>(messages: T[], entry: T, max: number): T[] {
	const next = [...messages, entry];
	return next.length > max ? next.slice(next.length - max) : next;
}

export type RealtimeBridgeKind = "websocket" | "socketio" | "mqtt" | "sse";

type BridgeEntry = { kind: RealtimeBridgeKind; dispose: () => void };

const active = new Map<string, BridgeEntry>();

function canUpdateItem(
	connectionId: string,
	kind: RealtimeBridgeKind,
): boolean {
	const state = useProjectStore.getState();
	const project = state.projects.find((p) => p.id === state.activeProjectId);
	if (!project) return false;
	const item = findTreeItemById(project.root, connectionId);
	return !!item && item.type === kind;
}

function appendSocketIoReceive(
	connectionId: string,
	payload: SioIncomingMessage,
) {
	if (!canUpdateItem(connectionId, "socketio")) return;
	startTransition(() => {
		useProjectStore.getState().updateItem(connectionId, "socketio", (prev) => ({
			...prev,
			messages: appendCapped(
				prev.messages,
				{
					id: payload.id || crypto.randomUUID(),
					direction: "receive" as const,
					event: payload.event || "message",
					data: payload.data || "",
					timestamp: payload.timestamp_ms || Date.now(),
				},
				MAX_SOCKETIO_MESSAGES,
			),
		}));
	});
}

function appendSocketIoSystem(connectionId: string, text: string) {
	if (!canUpdateItem(connectionId, "socketio")) return;
	startTransition(() => {
		useProjectStore.getState().updateItem(connectionId, "socketio", (prev) => ({
			...prev,
			messages: appendCapped(
				prev.messages,
				{
					id: crypto.randomUUID(),
					direction: "system" as const,
					event: "system",
					data: text,
					timestamp: Date.now(),
				},
				MAX_SOCKETIO_MESSAGES,
			),
		}));
	});
}

function appendMqttReceive(connectionId: string, payload: MqttIncomingMessage) {
	if (!canUpdateItem(connectionId, "mqtt")) return;
	startTransition(() => {
		useProjectStore.getState().updateItem(connectionId, "mqtt", (prev) => ({
			...prev,
			messages: appendCapped(
				prev.messages,
				{
					id: payload.id || crypto.randomUUID(),
					direction: "receive" as const,
					topic: payload.topic,
					data: payload.data || "",
					timestamp: payload.timestamp_ms || Date.now(),
					qos: (payload.qos ?? 0) as 0 | 1 | 2,
					retain: payload.retain ?? false,
				},
				MAX_MQTT_MESSAGES,
			),
		}));
	});
}

function appendSseEvent(connectionId: string, payload: SseIncomingMessage) {
	if (!canUpdateItem(connectionId, "sse")) return;
	startTransition(() => {
		useProjectStore.getState().updateItem(connectionId, "sse", (prev) => {
			const nextEvents = appendCapped(
				prev.events,
				{
					id: payload.id || crypto.randomUUID(),
					timestamp: payload.timestamp_ms || Date.now(),
					event: payload.event || "message",
					data: payload.data || "",
					sseId: payload.sse_id ?? undefined,
				},
				MAX_SSE_EVENTS,
			);
			const last = nextEvents[nextEvents.length - 1];
			return {
				...prev,
				events: nextEvents,
				lastEventId: last?.sseId ?? prev.lastEventId,
			};
		});
	});
}

function appendSseSystem(connectionId: string, text: string) {
	if (!canUpdateItem(connectionId, "sse")) return;
	startTransition(() => {
		useProjectStore.getState().updateItem(connectionId, "sse", (prev) => ({
			...prev,
			events: appendCapped(
				prev.events,
				{
					id: crypto.randomUUID(),
					timestamp: Date.now(),
					event: "system",
					data: text,
				},
				MAX_SSE_EVENTS,
			),
		}));
	});
}

function appendMqttSystem(connectionId: string, text: string) {
	if (!canUpdateItem(connectionId, "mqtt")) return;
	startTransition(() => {
		useProjectStore.getState().updateItem(connectionId, "mqtt", (prev) => ({
			...prev,
			messages: appendCapped(
				prev.messages,
				{
					id: crypto.randomUUID(),
					direction: "system" as const,
					topic: "system",
					data: text,
					timestamp: Date.now(),
				},
				MAX_MQTT_MESSAGES,
			),
		}));
	});
}

function appendWebSocketReceive(
	connectionId: string,
	payload: WsIncomingMessage,
) {
	if (!canUpdateItem(connectionId, "websocket")) return;
	const { connection_id, id, data, binary, timestamp_ms } = payload;
	if (connection_id !== connectionId) return;
	startTransition(() => {
		useProjectStore
			.getState()
			.updateItem(connectionId, "websocket", (prev) => ({
				...prev,
				messages: [
					...prev.messages,
					{
						id,
						direction: "receive" as const,
						data,
						timestamp: timestamp_ms,
						type: binary ? ("binary" as const) : ("text" as const),
					},
				],
			}));
	});
}

function appendWebSocketSystemClose(
	connectionId: string,
	code: number,
	reason: string | undefined,
) {
	if (!canUpdateItem(connectionId, "websocket")) return;
	startTransition(() => {
		useProjectStore
			.getState()
			.updateItem(connectionId, "websocket", (prev) => ({
				...prev,
				messages: [
					...prev.messages,
					{
						id: crypto.randomUUID(),
						direction: "system" as const,
						data: `Disconnected${reason ? `: ${reason}` : ""} (code ${code})`,
						timestamp: Date.now(),
						type: "close" as const,
					},
				],
			}));
	});
}

async function attachSocketIo(connectionId: string): Promise<() => void> {
	const unsubs: UnlistenFn[] = [];
	try {
		unsubs.push(
			await listen<SioIncomingMessage>(
				`sio://message/${connectionId}`,
				(event) => {
					appendSocketIoReceive(connectionId, event.payload);
				},
			),
		);

		unsubs.push(
			await listen<{ reason: string }>(
				`sio://disconnected/${connectionId}`,
				(event) => {
					persistedSioSessionIds.delete(connectionId);
					appendSocketIoSystem(
						connectionId,
						`Disconnected: ${event.payload?.reason || "connection closed"}`,
					);
					emitSocketIoRemoteDisconnect(connectionId);
					queueMicrotask(() => releaseRealtimeBridge(connectionId));
				},
			),
		);
	} catch (e) {
		for (const u of unsubs) {
			u();
		}
		throw e;
	}

	return () => {
		for (const u of unsubs) {
			u();
		}
	};
}

async function attachMqtt(connectionId: string): Promise<() => void> {
	const unsubs: UnlistenFn[] = [];
	try {
		unsubs.push(
			await listen<MqttIncomingMessage>(
				`mqtt://message/${connectionId}`,
				(event) => {
					appendMqttReceive(connectionId, event.payload);
				},
			),
		);

		unsubs.push(
			await listen<{ reason: string }>(
				`mqtt://disconnected/${connectionId}`,
				(event) => {
					persistedMqttSessionIds.delete(connectionId);
					appendMqttSystem(
						connectionId,
						`Disconnected: ${event.payload?.reason || "connection closed"}`,
					);
					emitMqttRemoteDisconnect(connectionId);
					queueMicrotask(() => releaseRealtimeBridge(connectionId));
				},
			),
		);
	} catch (e) {
		for (const u of unsubs) {
			u();
		}
		throw e;
	}

	return () => {
		for (const u of unsubs) {
			u();
		}
	};
}

async function attachSse(connectionId: string): Promise<() => void> {
	const unsubs: UnlistenFn[] = [];
	try {
		unsubs.push(
			await listen<SseIncomingMessage>(
				`sse://message/${connectionId}`,
				(event) => {
					appendSseEvent(connectionId, event.payload);
				},
			),
		);

		unsubs.push(
			await listen<{ reason: string }>(
				`sse://disconnected/${connectionId}`,
				(event) => {
					persistedSseSessionIds.delete(connectionId);
					appendSseSystem(
						connectionId,
						`Disconnected: ${event.payload?.reason || "connection closed"}`,
					);
					emitSseRemoteDisconnect(connectionId);
					queueMicrotask(() => releaseRealtimeBridge(connectionId));
				},
			),
		);
	} catch (e) {
		for (const u of unsubs) {
			u();
		}
		throw e;
	}

	return () => {
		for (const u of unsubs) {
			u();
		}
	};
}

async function attachWebSocket(connectionId: string): Promise<() => void> {
	const unsubs: UnlistenFn[] = [];
	try {
		unsubs.push(
			await listen<WsIncomingMessage>(
				`ws://message/${connectionId}`,
				(event) => {
					appendWebSocketReceive(connectionId, event.payload);
				},
			),
		);

		unsubs.push(
			await listen<WsClosedEvent>(`ws://closed/${connectionId}`, (event) => {
				const { connection_id, code, reason } = event.payload;
				if (connection_id !== connectionId) return;

				persistedWsSessionIds.delete(connectionId);
				releaseExclusiveWebSocketLock(connectionId);

				if (code !== 1000 && code !== 1001) {
					useToastStore
						.getState()
						.addToast(`WebSocket disconnected (code ${code})`, "error");
				}

				appendWebSocketSystemClose(connectionId, code, reason);
				emitWebSocketRemoteClosed(connectionId, { code, reason });
				queueMicrotask(() => releaseRealtimeBridge(connectionId));
			}),
		);
	} catch (e) {
		for (const u of unsubs) {
			u();
		}
		throw e;
	}

	return () => {
		for (const u of unsubs) {
			u();
		}
	};
}

/**
 * Subscribe to Tauri events for this connection until `releaseRealtimeBridge` or remote disconnect.
 * Safe to call when already registered for the same kind (no-op).
 */
export async function ensureRealtimeBridge(
	connectionId: string,
	kind: RealtimeBridgeKind,
): Promise<void> {
	const existing = active.get(connectionId);
	if (existing) {
		if (existing.kind === kind) return;
		existing.dispose();
		active.delete(connectionId);
	}

	let dispose: () => void;
	if (kind === "socketio") {
		dispose = await attachSocketIo(connectionId);
	} else if (kind === "mqtt") {
		dispose = await attachMqtt(connectionId);
	} else if (kind === "sse") {
		dispose = await attachSse(connectionId);
	} else {
		dispose = await attachWebSocket(connectionId);
	}

	active.set(connectionId, { kind, dispose });
}

export function releaseRealtimeBridge(connectionId: string): void {
	const entry = active.get(connectionId);
	if (!entry) return;
	entry.dispose();
	active.delete(connectionId);
}

async function rustDisconnectByKind(
	kind: RealtimeBridgeKind,
	connectionId: string,
): Promise<void> {
	const p =
		kind === "websocket"
			? commands.wsDisconnect(connectionId)
			: kind === "socketio"
				? commands.sioDisconnect(connectionId)
				: kind === "sse"
					? commands.sseDisconnect(connectionId)
					: commands.mqttDisconnect(connectionId);
	await p.catch(() => {});
}

/** Best-effort: drop any Rust transport using this connection id (handles bridge already torn down). */
async function rustDisconnectAllKinds(connectionId: string): Promise<void> {
	await Promise.allSettled([
		commands.wsDisconnect(connectionId).catch(() => {}),
		commands.sioDisconnect(connectionId).catch(() => {}),
		commands.mqttDisconnect(connectionId).catch(() => {}),
		commands.sseDisconnect(connectionId).catch(() => {}),
	]);
}

/**
 * Tear down JS listeners and the matching Rust connection for one tree item id.
 * Call when deleting a request or when you know this id must stop consuming resources.
 */
export async function teardownRealtimeForConnection(
	connectionId: string,
): Promise<void> {
	persistedWsSessionIds.delete(connectionId);
	persistedSioSessionIds.delete(connectionId);
	persistedMqttSessionIds.delete(connectionId);
	persistedSseSessionIds.delete(connectionId);
	releaseExclusiveWebSocketLock(connectionId);

	const entry = active.get(connectionId);
	if (entry) {
		const kind = entry.kind;
		entry.dispose();
		active.delete(connectionId);
		await rustDisconnectByKind(kind, connectionId);
	} else {
		await rustDisconnectAllKinds(connectionId);
	}

	notifyEditorsForcedRealtimeClose(connectionId);
}

/**
 * Dispose every Tauri listener, disconnect all Rust realtime clients, and clear session bookkeeping.
 * Run on window close, project switch, or project delete so tasks/sockets are not left running.
 */
export async function shutdownAllRealtimeTransports(): Promise<void> {
	const snapshot = [...active.entries()];
	for (const [, entry] of snapshot) {
		entry.dispose();
	}
	active.clear();

	await Promise.allSettled(
		snapshot.map(([id, { kind }]) => rustDisconnectByKind(kind, id)),
	);

	persistedWsSessionIds.clear();
	persistedSioSessionIds.clear();
	persistedMqttSessionIds.clear();
	persistedSseSessionIds.clear();
	assignExclusiveWebSocketOwner(null);
	clearAllRealtimeUiSubscribers();
}
