export type WsCloseDetail = { code: number; reason?: string };

const sioDisc = new Map<string, Set<() => void>>();
const mqttDisc = new Map<string, Set<() => void>>();
const wsClose = new Map<string, Set<(d: WsCloseDetail) => void>>();

function addListener<T>(
	map: Map<string, Set<T>>,
	id: string,
	fn: T,
): () => void {
	let set = map.get(id);
	if (!set) {
		set = new Set();
		map.set(id, set);
	}
	set.add(fn);
	return () => {
		set?.delete(fn);
		if (set?.size === 0) map.delete(id);
	};
}

export function subscribeSocketIoRemoteDisconnect(id: string, fn: () => void) {
	return addListener(sioDisc, id, fn);
}

export function emitSocketIoRemoteDisconnect(id: string) {
	for (const fn of sioDisc.get(id) ?? []) {
		fn();
	}
}

export function subscribeMqttRemoteDisconnect(id: string, fn: () => void) {
	return addListener(mqttDisc, id, fn);
}

export function emitMqttRemoteDisconnect(id: string) {
	for (const fn of mqttDisc.get(id) ?? []) {
		fn();
	}
}

export function subscribeWebSocketRemoteClosed(
	id: string,
	fn: (d: WsCloseDetail) => void,
) {
	return addListener(wsClose, id, fn);
}

export function emitWebSocketRemoteClosed(id: string, detail: WsCloseDetail) {
	for (const fn of wsClose.get(id) ?? []) {
		fn(detail);
	}
}

/** Drop editor subscriptions (e.g. app close / project switch) so callbacks are not retained. */
export function clearAllRealtimeUiSubscribers() {
	sioDisc.clear();
	mqttDisc.clear();
	wsClose.clear();
}
