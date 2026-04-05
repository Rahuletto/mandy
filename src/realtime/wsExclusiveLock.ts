import { useSyncExternalStore } from "react";

/** Only one WebSocket may be connected app-wide (exclusive lock by file id). */
let exclusiveWsOwnerId: string | null = null;

const exclusiveOwnerListeners = new Set<() => void>();

function notifyExclusiveOwnerChanged() {
	exclusiveOwnerListeners.forEach((fn) => fn());
}

export function assignExclusiveWebSocketOwner(id: string | null) {
	if (exclusiveWsOwnerId === id) return;
	exclusiveWsOwnerId = id;
	notifyExclusiveOwnerChanged();
}

export function releaseExclusiveWebSocketLock(wsId: string) {
	if (exclusiveWsOwnerId === wsId) {
		exclusiveWsOwnerId = null;
		notifyExclusiveOwnerChanged();
	}
}

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
