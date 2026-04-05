import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { startTransition } from "react";
import {
	commands,
	type MqttIncomingMessage,
	type SioIncomingMessage,
	type WsClosedEvent,
	type WsIncomingMessage,
} from "../bindings";
import { useProjectStore } from "../stores/projectStore";
import { useToastStore } from "../stores/toastStore";
import { findTreeItemById } from "../utils/findTreeItem";
import {
	persistedMqttSessionIds,
	persistedSioSessionIds,
	persistedWsSessionIds,
} from "./backgroundSessionIds";
import {
	clearAllRealtimeUiSubscribers,
	emitMqttRemoteDisconnect,
	emitSocketIoRemoteDisconnect,
	emitWebSocketRemoteClosed,
} from "./realtimeUiBus";
import {
	assignExclusiveWebSocketOwner,
	releaseExclusiveWebSocketLock,
} from "./wsExclusiveLock";

const MAX_SOCKETIO_MESSAGES = 600;
const MAX_MQTT_MESSAGES = 600;

function appendCapped<T>(messages: T[], entry: T, max: number): T[] {
	const next = [...messages, entry];
	return next.length > max ? next.slice(next.length - max) : next;
}

export type RealtimeBridgeKind = "websocket" | "socketio" | "mqtt";

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
		unsubs.forEach((u) => u());
		throw e;
	}

	return () => {
		unsubs.forEach((u) => u());
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
		unsubs.forEach((u) => u());
		throw e;
	}

	return () => {
		unsubs.forEach((u) => u());
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
		unsubs.forEach((u) => u());
		throw e;
	}

	return () => {
		unsubs.forEach((u) => u());
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
				: commands.mqttDisconnect(connectionId);
	await p.catch(() => {});
}

/** Best-effort: drop any Rust transport using this connection id (handles bridge already torn down). */
async function rustDisconnectAllKinds(connectionId: string): Promise<void> {
	await Promise.allSettled([
		commands.wsDisconnect(connectionId).catch(() => {}),
		commands.sioDisconnect(connectionId).catch(() => {}),
		commands.mqttDisconnect(connectionId).catch(() => {}),
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
	releaseExclusiveWebSocketLock(connectionId);

	const entry = active.get(connectionId);
	if (entry) {
		const kind = entry.kind;
		entry.dispose();
		active.delete(connectionId);
		await rustDisconnectByKind(kind, connectionId);
		return;
	}

	await rustDisconnectAllKinds(connectionId);
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
	assignExclusiveWebSocketOwner(null);
	clearAllRealtimeUiSubscribers();
}
