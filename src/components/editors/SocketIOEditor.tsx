import {
	startTransition,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { TbChevronDown, TbPlus, TbSend, TbTrash } from "react-icons/tb";
import { commands } from "../../bindings";
import { persistedSioSessionIds } from "../../realtime/backgroundSessionIds";
import {
	ensureRealtimeBridge,
	releaseRealtimeBridge,
} from "../../realtime/globalRealtimeBridge";
import { subscribeSocketIoRemoteDisconnect } from "../../realtime/realtimeUiBus";
import type { KeyValueItem, SocketIOFile } from "../../types/project";
import { CodeEditor } from "../CodeMirror";
import { KeyValueTable } from "../KeyValueTable";
import {
	AutocompleteInput,
	Checkbox,
	Dropdown,
	Tooltip,
	UrlInput,
} from "../ui";
import { EditorRequestBar, ProtocolEditorLeading } from "./EditorRequestBar";
import {
	EDITOR_DANGER_BUTTON_CLASS,
	EDITOR_PRIMARY_BUTTON_CLASS,
	editorTabButtonClass,
} from "./editorRequestBarStyles";
import { SocketIOMessageList } from "./SocketIOMessageList";
import { SocketIOOverview } from "./SocketIOOverview";

const MAX_SOCKETIO_MESSAGES = 600;

interface SocketIOEditorProps {
	sio: SocketIOFile;
	onUpdate: (updater: (sio: SocketIOFile) => SocketIOFile) => void;
	availableVariables?: string[];
	resolveVariables?: (text: string) => string;
	onStartLoading?: (id: string) => void;
	onStopLoading?: (id: string) => void;
}

type SioTab = "overview" | "emit" | "headers" | "authorization" | "connection";

function appendSioMessage(
	messages: SocketIOFile["messages"],
	nextMessage: SocketIOFile["messages"][number],
) {
	const next = [...messages, nextMessage];
	return next.length > MAX_SOCKETIO_MESSAGES
		? next.slice(next.length - MAX_SOCKETIO_MESSAGES)
		: next;
}

function buildSocketIoUrl(
	baseUrl: string,
	path: string | undefined,
	queryItems: KeyValueItem[] | undefined,
	resolve: (text: string) => string,
): string {
	const normalizedBase = resolve(baseUrl).trim();
	if (!normalizedBase) return "";

	try {
		const url = new URL(normalizedBase);
		const nextPath = (path || "/socket.io/").trim();
		if (nextPath) {
			url.pathname = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
		}
		for (const item of queryItems || []) {
			if (!item.enabled || !item.key.trim()) continue;
			url.searchParams.set(item.key.trim(), resolve(item.value));
		}
		return url.toString();
	} catch {
		return normalizedBase;
	}
}

export function SocketIOEditor({
	sio,
	onUpdate,
	availableVariables,
	resolveVariables,
	onStartLoading,
	onStopLoading,
}: SocketIOEditorProps) {
	const resolve = resolveVariables ?? ((value: string) => value);
	const [activeTab, setActiveTab] = useState<SioTab>("overview");
	const [url, setUrl] = useState(sio.url);
	const [isConnected, setIsConnected] = useState(
		persistedSioSessionIds.has(sio.id),
	);
	const [isConnecting, setIsConnecting] = useState(false);
	const [eventName, setEventName] = useState("message");
	const [eventPayload, setEventPayload] = useState("{}");
	const [isSending, setIsSending] = useState(false);
	const [awaitAck, setAwaitAck] = useState(false);
	const [ackTimeoutMs, setAckTimeoutMs] = useState(3000);
	const [queryDraftKey, setQueryDraftKey] = useState("");
	const [queryDraftValue, setQueryDraftValue] = useState("");
	const [openTransportMenu, setOpenTransportMenu] = useState(false);
	const [splitPercent, setSplitPercent] = useState(50);
	const [isResizing, setIsResizing] = useState(false);
	const splitContainerRef = useRef<HTMLDivElement>(null);
	const connectedRef = useRef(persistedSioSessionIds.has(sio.id));

	/** Keep URL in sync with the file; do not derive live connection from persisted state here (see `[sio.id]` effect). */
	useEffect(() => {
		setUrl(sio.url);
	}, [sio.url]);

	/** Only when switching Socket.IO files: restore background session flag from persisted set. */
	useEffect(() => {
		const resumed = persistedSioSessionIds.has(sio.id);
		setIsConnected(resumed);
		setIsConnecting(false);
		connectedRef.current = resumed;
	}, [sio.id]);

	useEffect(() => {
		if (isConnected || isConnecting) onStartLoading?.(sio.id);
		else onStopLoading?.(sio.id);
	}, [isConnected, isConnecting, onStartLoading, onStopLoading, sio.id]);

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (isResizing && splitContainerRef.current) {
				const rect = splitContainerRef.current.getBoundingClientRect();
				const newPercent = ((e.clientX - rect.left) / rect.width) * 100;
				setSplitPercent(Math.max(30, Math.min(70, newPercent)));
			}
		};
		const handleMouseUp = () => setIsResizing(false);
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

	const onUpdateRef = useRef(onUpdate);
	onUpdateRef.current = onUpdate;

	const pushSystemMessage = useCallback((message: string) => {
		startTransition(() => {
			onUpdateRef.current((prev) => ({
				...prev,
				messages: appendSioMessage(prev.messages, {
					id: crypto.randomUUID(),
					direction: "system",
					event: "system",
					data: message,
					timestamp: Date.now(),
				}),
			}));
		});
	}, []);

	useEffect(() => {
		return subscribeSocketIoRemoteDisconnect(sio.id, () => {
			setIsConnected(false);
			setIsConnecting(false);
			connectedRef.current = false;
		});
	}, [sio.id]);

	useEffect(() => {
		if (!persistedSioSessionIds.has(sio.id)) return;
		void ensureRealtimeBridge(sio.id, "socketio");
	}, [sio.id]);

	useEffect(() => {
		return () => {
			if (connectedRef.current) {
				persistedSioSessionIds.add(sio.id);
			} else {
				onStopLoading?.(sio.id);
			}
		};
	}, [onStopLoading, sio.id]);

	const connect = useCallback(async () => {
		if (!url || isConnecting || isConnected) return;
		setIsConnecting(true);

		const headers: Record<string, string> = {};
		(sio.headerItems || [])
			.filter((item) => item.enabled && item.key.trim())
			.forEach((item) => {
				headers[item.key] = resolve(item.value);
			});

		const resolvedUrl = buildSocketIoUrl(
			url,
			sio.path,
			sio.queryItems,
			resolve,
		);

		try {
			await ensureRealtimeBridge(sio.id, "socketio");

			const result = await commands.sioConnect({
				connection_id: sio.id,
				url: resolvedUrl,
				namespace: sio.namespace || "/",
				headers,
				auth: sio.authPayload ? resolve(sio.authPayload) : null,
				transport: sio.transport || "websocket",
				reconnect: sio.reconnect ?? true,
				reconnect_on_disconnect: sio.reconnectOnDisconnect ?? false,
				reconnect_delay_min_ms: sio.reconnectDelayMinMs ?? 300,
				reconnect_delay_max_ms: sio.reconnectDelayMaxMs ?? 5000,
				max_reconnect_attempts:
					sio.maxReconnectAttempts == null ? 20 : sio.maxReconnectAttempts,
			});

			if (result.status === "error") {
				releaseRealtimeBridge(sio.id);
				throw new Error(String(result.error));
			}

			setIsConnected(true);
			connectedRef.current = true;
			persistedSioSessionIds.delete(sio.id);
			pushSystemMessage(
				`Connected to ${result.data.url}${result.data.namespace || "/"}`,
			);
		} catch (error: any) {
			releaseRealtimeBridge(sio.id);
			pushSystemMessage(error?.message || "Failed to connect");
		} finally {
			setIsConnecting(false);
		}
	}, [
		isConnected,
		isConnecting,
		pushSystemMessage,
		resolve,
		sio.authPayload,
		sio.headerItems,
		sio.id,
		sio.maxReconnectAttempts,
		sio.namespace,
		sio.path,
		sio.queryItems,
		sio.reconnect,
		sio.reconnectDelayMaxMs,
		sio.reconnectDelayMinMs,
		sio.reconnectOnDisconnect,
		sio.transport,
		url,
	]);

	const disconnect = useCallback(async () => {
		try {
			releaseRealtimeBridge(sio.id);
			await commands.sioDisconnect(sio.id);
		} finally {
			setIsConnected(false);
			setIsConnecting(false);
			connectedRef.current = false;
			persistedSioSessionIds.delete(sio.id);
			pushSystemMessage("Disconnected");
		}
	}, [pushSystemMessage, sio.id]);

	const sendEvent = useCallback(async () => {
		if (
			!isConnected ||
			!eventName.trim() ||
			!eventPayload.trim() ||
			isSending
		) {
			return;
		}
		const resolvedPayload = resolve(eventPayload);
		setIsSending(true);
		try {
			if (awaitAck) {
				const result = await commands.sioEmitWithAck({
					connection_id: sio.id,
					event: eventName.trim(),
					data: resolvedPayload,
					timeout_ms: Math.max(100, ackTimeoutMs),
				});
				if (result.status === "error") {
					throw new Error(String(result.error));
				}
				const ackResult = result.data;
				startTransition(() => {
					onUpdate((prev) => ({
						...prev,
						messages: appendSioMessage(prev.messages, {
							id: crypto.randomUUID(),
							direction: "send",
							event: eventName.trim(),
							data: resolvedPayload,
							timestamp: Date.now(),
						}),
					}));
				});
				startTransition(() => {
					onUpdate((prev) => ({
						...prev,
						messages: appendSioMessage(prev.messages, {
							id: crypto.randomUUID(),
							direction: ackResult.timed_out ? "system" : "receive",
							event: ackResult.timed_out
								? "ack-timeout"
								: `${eventName.trim()}:ack`,
							data: ackResult.timed_out
								? `Ack timed out after ${Math.max(100, ackTimeoutMs)}ms`
								: ackResult.data || "(empty ack)",
							timestamp: Date.now(),
						}),
					}));
				});
			} else {
				const result = await commands.sioEmit({
					connection_id: sio.id,
					event: eventName.trim(),
					data: resolvedPayload,
				});
				if (result.status === "error") {
					throw new Error(String(result.error));
				}
				startTransition(() => {
					onUpdate((prev) => ({
						...prev,
						messages: appendSioMessage(prev.messages, {
							id: crypto.randomUUID(),
							direction: "send",
							event: eventName.trim(),
							data: resolvedPayload,
							timestamp: Date.now(),
						}),
					}));
				});
			}
		} catch (error: any) {
			pushSystemMessage(error?.message || "Emit failed");
		} finally {
			setIsSending(false);
		}
	}, [
		eventName,
		eventPayload,
		isConnected,
		isSending,
		onUpdate,
		pushSystemMessage,
		resolve,
		awaitAck,
		ackTimeoutMs,
		sio.id,
	]);

	const isOverview = activeTab === "overview";
	const eventSuggestions = Array.from(
		new Set(sio.messages.map((message) => message.event).filter(Boolean)),
	).sort((a, b) => a.localeCompare(b));
	const headerConnectTooltip = !url
		? "Enter a Socket.IO URL to connect"
		: isConnecting
			? "Connecting..."
			: undefined;
	const connectionSectionClass =
		"space-y-4 border-b border-white/6 pb-4 last:border-b-0";
	const fieldClass =
		"w-full rounded bg-inputbox px-3 py-2 text-sm text-white outline-none placeholder:text-white/20 disabled:opacity-50";

	return (
		<div className="flex flex-col h-full">
			<EditorRequestBar
				loading={isConnecting}
				accentDivider={isConnected}
				leading={<ProtocolEditorLeading type="socketio" />}
				urlField={
					<UrlInput
						value={url}
						onChange={(next) => {
							setUrl(next);
							onUpdate((prev) => ({ ...prev, url: next }));
						}}
						placeholder="https://api.example.com"
						availableVariables={availableVariables ?? []}
						disabled={isConnected || isConnecting}
					/>
				}
				action={
					isConnected ? (
						<button
							type="button"
							onClick={disconnect}
							className={EDITOR_DANGER_BUTTON_CLASS}
						>
							Disconnect
						</button>
					) : (
						<Tooltip content={headerConnectTooltip} position="bottom">
							<button
								type="button"
								onClick={connect}
								disabled={!url || isConnecting}
								className={EDITOR_PRIMARY_BUTTON_CLASS}
							>
								{isConnecting ? "Connecting" : "Connect"}
							</button>
						</Tooltip>
					)
				}
			/>

			<div
				ref={splitContainerRef}
				className="flex-1 min-h-0 flex overflow-hidden"
			>
				<div
					className="flex p-2 pl-4 flex-col overflow-hidden min-h-0"
					style={{
						width: isOverview ? "100%" : `${splitPercent}%`,
					}}
				>
					<div className="flex items-center gap-1 py-2 shrink-0">
						{(
							[
								"overview",
								"emit",
								"headers",
								"authorization",
								"connection",
							] as const
						).map((tab) => (
							<button
								key={tab}
								type="button"
								onClick={() => setActiveTab(tab)}
								className={editorTabButtonClass(activeTab === tab)}
							>
								{tab === "emit"
									? "Emit"
									: tab === "authorization"
										? "Authorization"
										: tab === "connection"
											? "Connection"
											: tab.charAt(0).toUpperCase() + tab.slice(1)}
							</button>
						))}
					</div>

					<div className="flex-1 overflow-auto relative min-h-0">
						{activeTab === "overview" && (
							<SocketIOOverview
								sio={sio}
								status={
									isConnected
										? "connected"
										: isConnecting
											? "connecting"
											: "disconnected"
								}
								onUpdate={onUpdate}
								onConnect={connect}
							/>
						)}

						{activeTab === "emit" && (
							<div className="relative flex h-full min-h-0 w-full min-w-0 flex-col">
								<div className="px-4 pt-4 pb-2 border-b border-white/5">
									<label className="block text-xs text-white/60 mb-2">
										Event
									</label>
									<div className="rounded-lg bg-inputbox px-3">
										<AutocompleteInput
											value={eventName}
											onChange={setEventName}
											suggestions={eventSuggestions}
											placeholder="message"
											className="min-w-0"
											inputClassName="w-full py-2 text-sm text-white outline-none placeholder:text-white/20"
										/>
									</div>
									<div className="mt-3 flex items-center gap-4">
										<label className="inline-flex items-center gap-2 text-xs font-semibold text-white/72">
											<Checkbox checked={awaitAck} onChange={setAwaitAck} />
											Await ack
										</label>
										<div className="flex items-center gap-2">
											<span className="text-xs text-white/45">Timeout</span>
											<input
												type="number"
												min={100}
												step={100}
												value={ackTimeoutMs}
												onChange={(e) =>
													setAckTimeoutMs(
														Math.max(100, Number(e.target.value) || 3000),
													)
												}
												disabled={!awaitAck}
												className="w-28 rounded bg-inputbox px-3 py-2 text-sm text-white outline-none disabled:opacity-50"
											/>
											<span className="text-xs text-white/35">ms</span>
										</div>
									</div>
								</div>
								<div className="flex-1 min-h-0 overflow-auto">
									<CodeEditor
										code={eventPayload}
										language="json"
										onChange={setEventPayload}
										placeholder='{ "message": "Hello" }'
									/>
								</div>
								<div className="absolute right-4 bottom-4 z-20 inline-flex w-fit h-fit">
									<Tooltip
										content={
											!isConnected
												? "Connect to a Socket.IO server first"
												: !eventName.trim()
													? "Enter an event name to emit"
													: !eventPayload.trim()
														? "Enter a payload to emit"
														: isSending
															? "Sending..."
															: undefined
										}
										wrapperClassName="inline-flex w-fit h-fit"
									>
										<button
											type="button"
											onClick={sendEvent}
											disabled={
												!isConnected ||
												!eventName.trim() ||
												!eventPayload.trim() ||
												isSending
											}
											className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-background transition-all hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
										>
											<TbSend size={16} />
										</button>
									</Tooltip>
								</div>
							</div>
						)}

						{activeTab === "headers" && (
							<KeyValueTable
								items={sio.headerItems || []}
								onChange={(items) =>
									onUpdate((prev) => ({
										...prev,
										headerItems: items,
									}))
								}
								availableVariables={availableVariables}
								placeholder={{ key: "Header", value: "Value" }}
							/>
						)}

						{activeTab === "authorization" && (
							<div className="space-y-4 p-4">
								<section className={connectionSectionClass}>
									<div className="space-y-1">
										<h3 className="text-sm font-semibold text-white/78">
											Auth Payload
										</h3>
										<p className="text-xs leading-5 text-white/38">
											JSON sent during the Socket.IO handshake as the auth
											payload.
										</p>
									</div>
									<div className="h-[320px] overflow-hidden rounded border border-white/10">
										<CodeEditor
											code={sio.authPayload || "{}"}
											language="json"
											onChange={(value) =>
												onUpdate((prev) => ({ ...prev, authPayload: value }))
											}
										/>
									</div>
								</section>
							</div>
						)}

						{activeTab === "connection" && (
							<div className="space-y-4 p-4">
								<section className={connectionSectionClass}>
									<div className="space-y-1">
										<h3 className="text-sm font-semibold text-white/78">
											Endpoint
										</h3>
										<p className="text-xs leading-5 text-white/38">
											Define the namespace, transport, and handshake path used
											for the Socket.IO session.
										</p>
									</div>

									<div className="grid grid-cols-2 gap-4">
										<div>
											<label className="mb-2 block text-xs text-white/60">
												Namespace
											</label>
											<input
												type="text"
												value={sio.namespace || "/"}
												onChange={(e) =>
													onUpdate((prev) => ({
														...prev,
														namespace: e.target.value || "/",
													}))
												}
												className={`${fieldClass} font-mono`}
												placeholder="/"
												disabled={isConnected}
											/>
										</div>
										<div>
											<label className="mb-2 block text-xs text-white/60">
												Path
											</label>
											<input
												type="text"
												value={sio.path || "/socket.io/"}
												onChange={(e) =>
													onUpdate((prev) => ({
														...prev,
														path: e.target.value,
													}))
												}
												className={`${fieldClass} font-mono`}
												placeholder="/socket.io/"
												disabled={isConnected}
											/>
										</div>
									</div>

									<div className="space-y-2">
										<label className="block text-xs text-white/60">
											Transport
										</label>
										<div className="relative">
											<button
												type="button"
												onClick={() => setOpenTransportMenu((prev) => !prev)}
												disabled={isConnected}
												className="inline-flex h-10 w-full items-center justify-between rounded-lg border border-white/8 bg-inputbox px-3 text-sm text-white transition-colors hover:border-white/15 disabled:opacity-50"
											>
												<span>
													{sio.transport === "polling"
														? "Polling"
														: sio.transport === "websocket-upgrade"
															? "Upgrade"
															: sio.transport === "auto"
																? "Auto"
																: "WebSocket"}
												</span>
												<TbChevronDown size={14} className="text-white/35" />
											</button>
											{openTransportMenu && !isConnected && (
												<Dropdown
													width="w-full min-w-[220px]"
													onClose={() => setOpenTransportMenu(false)}
													items={[
														["auto", "Auto"],
														["websocket", "WebSocket"],
														["polling", "Polling"],
														["websocket-upgrade", "Upgrade"],
													].map(([value, label]) => ({
														label,
														active: (sio.transport || "websocket") === value,
														onClick: () =>
															onUpdate((prev) => ({
																...prev,
																transport: value as SocketIOFile["transport"],
															})),
													}))}
												/>
											)}
										</div>
									</div>
								</section>

								<section className={connectionSectionClass}>
									<div className="space-y-1">
										<h3 className="text-sm font-semibold text-white/78">
											Session
										</h3>
										<p className="text-xs leading-5 text-white/38">
											Tune reconnect behavior without changing the main request
											shape.
										</p>
									</div>

									<div className="grid grid-cols-2 gap-4">
										<label className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-white/72">
											<Checkbox
												checked={sio.reconnect ?? true}
												onChange={(checked) =>
													onUpdate((prev) => ({ ...prev, reconnect: checked }))
												}
											/>
											Reconnect
										</label>
										<label className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-white/72">
											<Checkbox
												checked={sio.reconnectOnDisconnect ?? false}
												onChange={(checked) =>
													onUpdate((prev) => ({
														...prev,
														reconnectOnDisconnect: checked,
													}))
												}
											/>
											Reconnect on disconnect
										</label>
									</div>

									<div className="grid grid-cols-3 gap-4">
										<div>
											<label className="mb-2 block text-xs text-white/60">
												Reconnect Min (ms)
											</label>
											<input
												type="number"
												min={0}
												value={sio.reconnectDelayMinMs ?? 300}
												onChange={(e) =>
													onUpdate((prev) => ({
														...prev,
														reconnectDelayMinMs: Math.max(
															0,
															Number(e.target.value) || 0,
														),
													}))
												}
												className={fieldClass}
												disabled={isConnected}
											/>
										</div>
										<div>
											<label className="mb-2 block text-xs text-white/60">
												Reconnect Max (ms)
											</label>
											<input
												type="number"
												min={0}
												value={sio.reconnectDelayMaxMs ?? 5000}
												onChange={(e) =>
													onUpdate((prev) => ({
														...prev,
														reconnectDelayMaxMs: Math.max(
															0,
															Number(e.target.value) || 0,
														),
													}))
												}
												className={fieldClass}
												disabled={isConnected}
											/>
										</div>
										<div>
											<label className="mb-2 block text-xs text-white/60">
												Max Attempts
											</label>
											<input
												type="number"
												min={0}
												value={sio.maxReconnectAttempts ?? 20}
												onChange={(e) =>
													onUpdate((prev) => ({
														...prev,
														maxReconnectAttempts: Math.max(
															0,
															Number(e.target.value) || 0,
														),
													}))
												}
												className={fieldClass}
												disabled={isConnected}
											/>
										</div>
									</div>
								</section>

								<section className={connectionSectionClass}>
									<div className="flex items-start justify-between gap-4">
										<div className="space-y-1">
											<h3 className="text-sm font-semibold text-white/78">
												Handshake Query
											</h3>
											<p className="text-xs leading-5 text-white/38">
												These params are attached to the initial Socket.IO
												connection URL.
											</p>
										</div>
										<span className="shrink-0 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/35">
											{(sio.queryItems || []).length} configured
										</span>
									</div>

									<div className="flex items-center gap-2">
										<input
											type="text"
											value={queryDraftKey}
											onChange={(e) => setQueryDraftKey(e.target.value)}
											className={`${fieldClass} min-w-0 flex-1 font-mono`}
											placeholder="token"
										/>
										<input
											type="text"
											value={queryDraftValue}
											onChange={(e) => setQueryDraftValue(e.target.value)}
											className={`${fieldClass} min-w-0 flex-1 font-mono`}
											placeholder="abc123"
										/>
										<button
											type="button"
											onClick={() => {
												const nextKey = queryDraftKey.trim();
												if (!nextKey) return;
												onUpdate((prev) => ({
													...prev,
													queryItems: [
														...(prev.queryItems || []).filter(
															(item) => item.key !== nextKey,
														),
														{
															id: crypto.randomUUID(),
															key: nextKey,
															value: queryDraftValue,
															description: "",
															enabled: true,
														},
													],
												}));
												setQueryDraftKey("");
												setQueryDraftValue("");
											}}
											disabled={!queryDraftKey.trim() || isConnected}
											className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-background transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
											aria-label="Add query param"
										>
											<TbPlus size={18} />
										</button>
									</div>

									<div className="space-y-2">
										{(sio.queryItems || []).length === 0 ? (
											<div className="rounded-lg border border-dashed border-white/8 bg-white/[0.02] px-3 py-4 text-sm text-white/35">
												No query params configured.
											</div>
										) : (
											(sio.queryItems || []).map((item) => (
												<div
													key={item.id}
													className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/[0.02] p-2"
												>
													<input
														type="text"
														value={item.key}
														onChange={(e) =>
															onUpdate((prev) => ({
																...prev,
																queryItems: (prev.queryItems || []).map(
																	(entry) =>
																		entry.id === item.id
																			? { ...entry, key: e.target.value }
																			: entry,
																),
															}))
														}
														className={`${fieldClass} min-w-0 flex-1 font-mono`}
														disabled={isConnected}
													/>
													<input
														type="text"
														value={item.value}
														onChange={(e) =>
															onUpdate((prev) => ({
																...prev,
																queryItems: (prev.queryItems || []).map(
																	(entry) =>
																		entry.id === item.id
																			? { ...entry, value: e.target.value }
																			: entry,
																),
															}))
														}
														className={`${fieldClass} min-w-0 flex-1 font-mono`}
														disabled={isConnected}
													/>
													<button
														type="button"
														onClick={() =>
															onUpdate((prev) => ({
																...prev,
																queryItems: (prev.queryItems || []).filter(
																	(entry) => entry.id !== item.id,
																),
															}))
														}
														className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/5 hover:text-red"
														aria-label="Remove query param"
														disabled={isConnected}
													>
														<TbTrash size={16} />
													</button>
												</div>
											))
										)}
									</div>
								</section>
							</div>
						)}
					</div>
				</div>

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
						<div className="flex-1 min-w-0 overflow-auto bg-inset border-l border-white/10">
							<SocketIOMessageList
								messages={sio.messages}
								status={
									isConnected
										? "connected"
										: isConnecting
											? "connecting"
											: "disconnected"
								}
								onClear={() => onUpdate((prev) => ({ ...prev, messages: [] }))}
							/>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
