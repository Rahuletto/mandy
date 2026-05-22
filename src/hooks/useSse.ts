import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthType } from "../bindings";
import { commands } from "../bindings";
import { persistedSseSessionIds } from "../realtime/backgroundSessionIds";
import {
	ensureRealtimeBridge,
	releaseRealtimeBridge,
} from "../realtime/globalRealtimeBridge";
import { subscribeSseRemoteDisconnect } from "../realtime/realtimeUiBus";
import { useToastStore } from "../stores/toastStore";
import type { SseFile } from "../types/project";
import { resolveEffectiveAuth } from "../utils/effectiveAuth";
import { buildHeaderMap } from "../utils/protocolHeaders";
import { playSuccessChime } from "../utils/sounds";

export type SseConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

interface UseSseOptions {
	sse: SseFile;
	onUpdate: (updater: (sse: SseFile) => SseFile) => void;
	resolveVariables?: (text: string) => string;
	projectAuth?: AuthType;
	onTreeActivity?: (active: boolean) => void;
}

export function useSse({
	sse,
	onUpdate,
	resolveVariables = (t) => t,
	projectAuth,
	onTreeActivity,
}: UseSseOptions) {
	const { addToast } = useToastStore();
	const [status, setStatus] = useState<SseConnectionStatus>(() =>
		persistedSseSessionIds.has(sse.id) ? "connecting" : "disconnected",
	);
	const connectionIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (!onTreeActivity) return;
		onTreeActivity(status === "connected" || status === "connecting");
	}, [status, onTreeActivity]);

	useEffect(() => {
		return subscribeSseRemoteDisconnect(sse.id, () => {
			connectionIdRef.current = null;
			setStatus("disconnected");
		});
	}, [sse.id]);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			if (!persistedSseSessionIds.has(sse.id)) return;
			try {
				await ensureRealtimeBridge(sse.id, "sse");
				if (cancelled) return;
				connectionIdRef.current = sse.id;
				persistedSseSessionIds.delete(sse.id);
				setStatus("connected");
			} catch {
				persistedSseSessionIds.delete(sse.id);
				setStatus("error");
				await commands.sseDisconnect(sse.id).catch(() => {});
			}
		})();

		return () => {
			cancelled = true;
			const id = connectionIdRef.current;
			if (id) {
				persistedSseSessionIds.add(sse.id);
			} else {
				onTreeActivity?.(false);
			}
		};
	}, [sse.id, onTreeActivity]);

	const connect = useCallback(
		async (url: string) => {
			if (!url) return;

			if (connectionIdRef.current) {
				await commands.sseDisconnect(connectionIdRef.current).catch(() => {});
				releaseRealtimeBridge(connectionIdRef.current);
				connectionIdRef.current = null;
			}

			if (persistedSseSessionIds.has(sse.id)) {
				await commands.sseDisconnect(sse.id).catch(() => {});
				releaseRealtimeBridge(sse.id);
				persistedSseSessionIds.delete(sse.id);
			}

			setStatus("connecting");

			try {
				const resolvedUrl = resolveVariables(url);
				const connectionId = sse.id;
				const headers = buildHeaderMap(
					sse.headerItems,
					sse.headers,
					resolveVariables,
				);
				const auth = resolveEffectiveAuth(
					sse.auth,
					sse.useInheritedAuth,
					projectAuth,
				);

				await ensureRealtimeBridge(connectionId, "sse");

				const result = await commands.sseConnect({
					connection_id: connectionId,
					url: resolvedUrl,
					headers,
					auth,
					last_event_id: sse.lastEventId ?? null,
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
				persistedSseSessionIds.delete(sse.id);
				setStatus("connected");
				playSuccessChime();
			} catch (err) {
				releaseRealtimeBridge(sse.id);
				setStatus("error");
				addToast(
					`Failed to connect: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
		},
		[
			sse.id,
			sse.headerItems,
			sse.headers,
			sse.auth,
			sse.useInheritedAuth,
			sse.lastEventId,
			resolveVariables,
			projectAuth,
			addToast,
		],
	);

	const disconnect = useCallback(async () => {
		const id = connectionIdRef.current ?? sse.id;
		connectionIdRef.current = null;
		persistedSseSessionIds.delete(sse.id);
		releaseRealtimeBridge(id);
		await commands.sseDisconnect(id).catch(() => {});
		setStatus("disconnected");
		onTreeActivity?.(false);
	}, [sse.id, onTreeActivity]);

	const clearEvents = useCallback(() => {
		onUpdate((prev) => ({ ...prev, events: [] }));
	}, [onUpdate]);

	return { status, connect, disconnect, clearEvents };
}
