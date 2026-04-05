import {
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { TbChevronDown, TbPlus, TbSend, TbTrash } from "react-icons/tb";
import { commands } from "../../bindings";
import { persistedMqttSessionIds } from "../../realtime/backgroundSessionIds";
import {
	ensureRealtimeBridge,
	releaseRealtimeBridge,
} from "../../realtime/globalRealtimeBridge";
import { subscribeMqttRemoteDisconnect } from "../../realtime/realtimeUiBus";
import type {
	MQTTFile,
	MQTTMessage,
	MQTTSubscription,
} from "../../types/project";
import { CodeEditor } from "../CodeMirror";
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
import { MQTTMessageList } from "./MQTTMessageList";
import { MQTTOverview } from "./MQTTOverview";

type MqttTab = "overview" | "publish" | "topics" | "connection";

interface MQTTEditorProps {
	mqtt: MQTTFile;
	onUpdate: (updater: (mqtt: MQTTFile) => MQTTFile) => void;
	availableVariables?: string[];
	resolveVariables?: (text: string) => string;
	onStartLoading?: (id: string) => void;
	onStopLoading?: (id: string) => void;
}

const MQTT_QOS_LEVELS: Array<0 | 1 | 2> = [0, 1, 2];

function normalizeMqttUrl(input: string) {
	const trimmed = input.trim();
	if (!trimmed) return "";
	return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
		? trimmed
		: `mqtt://${trimmed.replace(/^\/+/, "")}`;
}

function isValidMqttUrl(input: string) {
	const trimmed = input.trim();
	if (!trimmed) return false;
	const normalized = normalizeMqttUrl(trimmed);
	try {
		const parsed = new URL(normalized);
		return ["mqtt:", "mqtts:"].includes(parsed.protocol) && !!parsed.hostname;
	} catch {
		return false;
	}
}
const MAX_MQTT_MESSAGES = 600;

function collectTopLevelJsonKeysFromTopic(
	topic: string,
	messages: MQTTMessage[],
): string[] {
	const keys = new Set<string>();
	const normalized = topic.trim();
	if (!normalized) return [];
	for (const m of messages) {
		if (m.topic !== normalized) continue;
		if (m.direction === "system") continue;
		try {
			const parsed = JSON.parse(m.data);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				for (const k of Object.keys(parsed)) {
					keys.add(k);
				}
			}
		} catch {
			/* non-json payload */
		}
	}
	return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

function isPublishPayloadEmptyish(raw: string): boolean {
	const s = raw.trim();
	if (s === "") return true;
	if (s === "{}" || s === "{\n}" || s === "{\n\n}") return true;
	try {
		const p = JSON.parse(s);
		return (
			typeof p === "object" &&
			p !== null &&
			!Array.isArray(p) &&
			Object.keys(p).length === 0
		);
	} catch {
		return false;
	}
}

function buildJsonSkeletonFromKeys(keys: string[]): string {
	if (keys.length === 0) return "{}";
	const lines = keys.map((k) => `  ${JSON.stringify(k)}: null`);
	return `{\n${lines.join(",\n")}\n}`;
}

function appendMessage(
	messages: MQTTMessage[],
	nextMessage: MQTTMessage,
): MQTTMessage[] {
	const next = [...messages, nextMessage];
	return next.length > MAX_MQTT_MESSAGES
		? next.slice(next.length - MAX_MQTT_MESSAGES)
		: next;
}

export function MQTTEditor({
	mqtt,
	onUpdate,
	availableVariables,
	resolveVariables,
	onStartLoading,
	onStopLoading,
}: MQTTEditorProps) {
	const resolve = resolveVariables ?? ((value: string) => value);
	const [activeTab, setActiveTab] = useState<MqttTab>("overview");
	const [url, setUrl] = useState(mqtt.url);
	const [isConnected, setIsConnected] = useState(
		persistedMqttSessionIds.has(mqtt.id),
	);
	const [isConnecting, setIsConnecting] = useState(false);
	const [isSending, setIsSending] = useState(false);
	const [topic, setTopic] = useState(
		mqtt.subscriptions[0]?.topic || "demo/topic",
	);
	const [payload, setPayload] = useState("{}");
	const [retain, setRetain] = useState(false);
	const [subscriptionDraftTopic, setSubscriptionDraftTopic] = useState("");
	const [subscriptionDraftQos, setSubscriptionDraftQos] = useState<0 | 1 | 2>(
		0,
	);
	const [openQosMenuId, setOpenQosMenuId] = useState<string | null>(null);
	const [splitPercent, setSplitPercent] = useState(50);
	const [isResizing, setIsResizing] = useState(false);
	const splitContainerRef = useRef<HTMLDivElement>(null);
	const connectedRef = useRef(persistedMqttSessionIds.has(mqtt.id));
	const previousSubscriptionsRef = useRef<MQTTSubscription[]>(
		mqtt.subscriptions,
	);
	const publishTopicPrevRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		setUrl(mqtt.url);
	}, [mqtt.url]);

	/** Only when switching MQTT files: restore background session + subscription baseline. */
	useEffect(() => {
		const resumed = persistedMqttSessionIds.has(mqtt.id);
		setIsConnected(resumed);
		setIsConnecting(false);
		connectedRef.current = resumed;
		previousSubscriptionsRef.current = mqtt.subscriptions;
	}, [mqtt.id, mqtt.subscriptions]);

	useEffect(() => {
		if (isConnected || isConnecting) onStartLoading?.(mqtt.id);
		else onStopLoading?.(mqtt.id);
	}, [isConnected, isConnecting, mqtt.id, onStartLoading, onStopLoading]);

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
				messages: appendMessage(prev.messages, {
					id: crypto.randomUUID(),
					direction: "system",
					topic: "system",
					data: message,
					timestamp: Date.now(),
				}),
			}));
		});
	}, []);

	useEffect(() => {
		return subscribeMqttRemoteDisconnect(mqtt.id, () => {
			setIsConnected(false);
			setIsConnecting(false);
			connectedRef.current = false;
		});
	}, [mqtt.id]);

	useEffect(() => {
		if (!persistedMqttSessionIds.has(mqtt.id)) return;
		void ensureRealtimeBridge(mqtt.id, "mqtt");
	}, [mqtt.id]);

	useEffect(() => {
		return () => {
			if (connectedRef.current) {
				persistedMqttSessionIds.add(mqtt.id);
			} else {
				onStopLoading?.(mqtt.id);
			}
		};
	}, [mqtt.id, onStopLoading]);

	useEffect(() => {
		if (!isConnected) {
			previousSubscriptionsRef.current = mqtt.subscriptions;
			return;
		}

		const previous = previousSubscriptionsRef.current;
		const current = mqtt.subscriptions;
		previousSubscriptionsRef.current = current;

		const previousActive = previous.filter((item) => item.enabled !== false);
		const currentActive = current.filter((item) => item.enabled !== false);

		const prevMap = new Map(
			previousActive.map((item) => [item.topic, item.qos]),
		);
		const currentMap = new Map(
			currentActive.map((item) => [item.topic, item.qos]),
		);

		for (const previousItem of previousActive) {
			if (!currentMap.has(previousItem.topic)) {
				void commands.mqttUnsubscribe({
					connection_id: mqtt.id,
					topic: previousItem.topic,
				});
			}
		}

		for (const currentItem of currentActive) {
			const prevQos = prevMap.get(currentItem.topic);
			if (prevQos === undefined || prevQos !== currentItem.qos) {
				void commands.mqttSubscribe({
					connection_id: mqtt.id,
					topic: currentItem.topic,
					qos: currentItem.qos,
				});
			}
		}
	}, [isConnected, mqtt.id, mqtt.subscriptions]);

	const connect = useCallback(async () => {
		if (!url || isConnecting || isConnected) return;
		setIsConnecting(true);
		try {
			await ensureRealtimeBridge(mqtt.id, "mqtt");

			const result = await commands.mqttConnect({
				connection_id: mqtt.id,
				url: normalizeMqttUrl(resolve(url)),
				client_id: resolve(mqtt.clientId || ""),
				username: mqtt.username ? resolve(mqtt.username) : null,
				password: mqtt.password ? resolve(mqtt.password) : null,
				clean_session: mqtt.cleanSession ?? true,
				keep_alive_secs: mqtt.keepAliveSecs ?? 30,
				subscriptions: (mqtt.subscriptions || [])
					.filter((item) => item.enabled !== false)
					.map((item) => ({
						topic: resolve(item.topic),
						qos: item.qos,
					})),
			});

			if (result.status === "error") {
				releaseRealtimeBridge(mqtt.id);
				throw new Error(String(result.error));
			}

			onUpdate((prev) => ({
				...prev,
				clientId: result.data.client_id || prev.clientId,
			}));

			setIsConnected(true);
			connectedRef.current = true;
			persistedMqttSessionIds.delete(mqtt.id);
			pushSystemMessage(`Connected to ${result.data.url}`);
		} catch (error: any) {
			releaseRealtimeBridge(mqtt.id);
			pushSystemMessage(error?.message || "Failed to connect");
		} finally {
			setIsConnecting(false);
		}
	}, [
		isConnected,
		isConnecting,
		mqtt.cleanSession,
		mqtt.clientId,
		mqtt.id,
		mqtt.keepAliveSecs,
		mqtt.password,
		mqtt.subscriptions,
		mqtt.username,
		pushSystemMessage,
		resolve,
		url,
		onUpdate,
	]);

	const disconnect = useCallback(async () => {
		try {
			releaseRealtimeBridge(mqtt.id);
			await commands.mqttDisconnect(mqtt.id);
		} finally {
			setIsConnected(false);
			setIsConnecting(false);
			connectedRef.current = false;
			persistedMqttSessionIds.delete(mqtt.id);
			pushSystemMessage("Disconnected");
		}
	}, [mqtt.id, pushSystemMessage]);

	const knownTopics = useMemo(
		() =>
			Array.from(
				new Set(
					[
						...mqtt.subscriptions.map((subscription) => subscription.topic),
						...mqtt.messages.map((message) => message.topic),
					].filter(Boolean),
				),
			).sort((a, b) => a.localeCompare(b)),
		[mqtt.messages, mqtt.subscriptions],
	);

	const publishJsonKeys = useMemo(
		() => collectTopLevelJsonKeysFromTopic(topic, mqtt.messages),
		[topic, mqtt.messages],
	);

	/** Publish uses the QoS of the matching subscription row (same topic string), or 0 if none. */
	const publishQos = useMemo((): 0 | 1 | 2 => {
		const t = topic.trim();
		if (!t) return 0;
		const sub = mqtt.subscriptions.find(
			(s) => s.topic === t && s.enabled !== false,
		);
		return sub ? sub.qos : 0;
	}, [topic, mqtt.subscriptions]);

	const publishMessage = useCallback(async () => {
		if (!isConnected || !topic.trim() || !payload.trim() || isSending) return;
		const resolvedTopic = resolve(topic);
		const resolvedPayload = resolve(payload);
		setIsSending(true);
		try {
			const result = await commands.mqttPublish({
				connection_id: mqtt.id,
				topic: resolvedTopic,
				data: resolvedPayload,
				qos: publishQos,
				retain,
			});
			if (result.status === "error") {
				throw new Error(String(result.error));
			}
			startTransition(() => {
				onUpdate((prev) => ({
					...prev,
					messages: appendMessage(prev.messages, {
						id: crypto.randomUUID(),
						direction: "send",
						topic: resolvedTopic,
						data: resolvedPayload,
						timestamp: Date.now(),
						qos: publishQos,
						retain,
					}),
				}));
			});
		} catch (error: any) {
			pushSystemMessage(error?.message || "Publish failed");
		} finally {
			setIsSending(false);
		}
	}, [
		isConnected,
		isSending,
		mqtt.id,
		onUpdate,
		payload,
		publishQos,
		pushSystemMessage,
		resolve,
		retain,
		topic,
	]);

	/** When the publish topic changes, always reset the payload to match the new topic (or `{}`). */
	useEffect(() => {
		if (publishTopicPrevRef.current === topic) return;
		publishTopicPrevRef.current = topic;
		const keys = collectTopLevelJsonKeysFromTopic(topic, mqtt.messages);
		if (keys.length > 0) {
			setPayload(buildJsonSkeletonFromKeys(keys));
		} else {
			setPayload("{}");
		}
	}, [topic, mqtt.messages]);

	/** Same topic: fill an empty payload when new traffic reveals JSON keys. */
	useEffect(() => {
		if (publishJsonKeys.length === 0) return;
		setPayload((prev) => {
			if (!isPublishPayloadEmptyish(prev)) return prev;
			return buildJsonSkeletonFromKeys(publishJsonKeys);
		});
	}, [publishJsonKeys]);

	const addSubscription = useCallback(() => {
		const nextTopic = subscriptionDraftTopic.trim();
		if (!nextTopic) return;
		onUpdate((prev) => {
			const existing = prev.subscriptions.find(
				(item) => item.topic === nextTopic,
			);
			if (existing) {
				return {
					...prev,
					subscriptions: prev.subscriptions.map((item) =>
						item.id === existing.id
							? { ...item, qos: subscriptionDraftQos }
							: item,
					),
				};
			}
			return {
				...prev,
				subscriptions: [
					...prev.subscriptions,
					{
						id: crypto.randomUUID(),
						topic: nextTopic,
						qos: subscriptionDraftQos,
						enabled: true,
					},
				],
			};
		});
		setSubscriptionDraftTopic("");
	}, [onUpdate, subscriptionDraftQos, subscriptionDraftTopic]);

	const messageListItems = useMemo(() => mqtt.messages, [mqtt.messages]);
	const sectionClass = "space-y-4 border-b border-white/6 pb-4 last:border-b-0";
	const fieldClass =
		"w-full rounded-lg bg-inputbox px-3 py-2 text-sm text-white outline-none placeholder:text-white/20";

	return (
		<div className="flex h-full flex-col">
			<EditorRequestBar
				loading={isConnecting}
				accentDivider={isConnected}
				leading={<ProtocolEditorLeading type="mqtt" />}
				urlField={
					<UrlInput
						value={url}
						onChange={(next) => {
							setUrl(next);
							onUpdate((prev) => ({ ...prev, url: next }));
						}}
						placeholder="mqtt://broker.emqx.io:1883"
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
						<Tooltip
							content={
								!url
									? "Enter a broker URL"
									: !isValidMqttUrl(url)
										? "URL must include mqtt:// or mqtts:// (or host:port)"
										: isConnecting
											? "Connecting..."
											: undefined
							}
						>
							<button
								type="button"
								onClick={connect}
								disabled={!isValidMqttUrl(url) || isConnecting}
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
				className="flex min-h-0 flex-1 overflow-hidden"
			>
				<div
					className="flex min-h-0 flex-col overflow-hidden p-2 pl-4"
					style={{
						width: activeTab === "overview" ? "100%" : `${splitPercent}%`,
					}}
				>
					<div className="flex items-center gap-1 py-2 shrink-0">
						{(["overview", "publish", "topics", "connection"] as const).map(
							(tab) => (
								<button
									key={tab}
									type="button"
									onClick={() => setActiveTab(tab)}
									className={editorTabButtonClass(activeTab === tab)}
								>
									{tab === "publish"
										? "Message"
										: tab === "connection"
											? "Connection"
											: tab.charAt(0).toUpperCase() + tab.slice(1)}
								</button>
							),
						)}
					</div>

					<div className="relative min-h-0 flex-1 overflow-auto">
						{activeTab === "overview" && (
							<MQTTOverview
								mqtt={mqtt}
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

						{activeTab === "publish" && (
							<div className="relative flex h-full min-h-0 w-full min-w-0 flex-col">
								<div className="border-b border-white/5 px-4 py-4">
									<div className={sectionClass}>
										<div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
											<div>
												<label className="mb-2 block text-xs text-white/60">
													Topic
												</label>
												<div className="rounded-lg bg-inputbox px-3">
													<AutocompleteInput
														value={topic}
														onChange={setTopic}
														suggestions={knownTopics}
														placeholder="my/topic"
														className="min-w-0"
														inputClassName="w-full py-2 text-sm text-white outline-none placeholder:text-white/20"
													/>
												</div>
											</div>
											<div className="flex items-end">
												<Tooltip
													content="The broker stores this publish as the topic’s current value and may send it to new subscribers when they subscribe (retained message)."
													wrapperClassName="inline-flex"
												>
													<label className="inline-flex h-10 cursor-help items-center gap-2 text-sm font-medium text-white/72">
														<Checkbox checked={retain} onChange={setRetain} />
														Retain
													</label>
												</Tooltip>
											</div>
										</div>
									</div>
								</div>
								<div className="flex-1 min-h-0 overflow-auto">
									<CodeEditor
										code={payload}
										language="json"
										onChange={setPayload}
										placeholder='{ "message": "Hello" }'
										jsonKeyCompletions={publishJsonKeys}
									/>
								</div>
								<div className="absolute bottom-4 right-4 z-20 inline-flex w-fit h-fit">
									<Tooltip
										content={
											!isConnected
												? "Connect to an MQTT broker first"
												: !topic.trim()
													? "Enter a topic to publish to"
													: !payload.trim()
														? "Enter a payload to publish"
														: isSending
															? "Publishing..."
															: undefined
										}
										wrapperClassName="inline-flex w-fit h-fit"
									>
										<button
											type="button"
											onClick={publishMessage}
											disabled={
												!isConnected ||
												!topic.trim() ||
												!payload.trim() ||
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

						{activeTab === "topics" && (
							<div className="flex h-full min-h-0 flex-col">
								<div className="min-h-0 flex-1 overflow-y-auto p-4">
									<div className={sectionClass}>
										<div className="space-y-1">
											<h3 className="text-sm font-semibold text-white/78">
												Topics
											</h3>
											<p className="text-xs leading-5 text-white/38">
												Configure broker subscriptions here. This is separate
												from publishing and keeps the receive flow explicit.
											</p>
										</div>
										<div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
											<div className="min-w-0 rounded-lg bg-inputbox px-3">
												<AutocompleteInput
													value={subscriptionDraftTopic}
													onChange={setSubscriptionDraftTopic}
													suggestions={knownTopics}
													placeholder="sensor/temperature"
													className="min-w-0"
													inputClassName="w-full py-2 text-sm text-white outline-none placeholder:text-white/20"
												/>
											</div>
											<div className="relative shrink-0 justify-self-start">
												<button
													type="button"
													onClick={() =>
														setOpenQosMenuId((prev) =>
															prev === "draft" ? null : "draft",
														)
													}
													className="inline-flex h-10 w-fit items-center gap-1 rounded-lg border border-white/8 bg-inputbox px-2 text-sm text-white transition-colors hover:border-white/15"
												>
													<span className="font-mono text-xs text-white/70">
														QoS {subscriptionDraftQos}
													</span>
													<TbChevronDown
														size={14}
														className="shrink-0 text-white/35"
													/>
												</button>
												{openQosMenuId === "draft" && (
													<Dropdown
														width="min-w-[120px]"
														onClose={() => setOpenQosMenuId(null)}
														items={MQTT_QOS_LEVELS.map((level) => ({
															label: `QoS ${level}`,
															active: subscriptionDraftQos === level,
															onClick: () => setSubscriptionDraftQos(level),
														}))}
													/>
												)}
											</div>
											<button
												type="button"
												onClick={addSubscription}
												disabled={!subscriptionDraftTopic.trim()}
												className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-background transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
												aria-label="Add MQTT subscription"
											>
												<TbPlus size={18} />
											</button>
										</div>

										{mqtt.subscriptions.length === 0 ? (
											<div className="rounded-lg border border-dashed border-white/8 bg-white/[0.02] px-4 py-5 text-sm text-white/35">
												No topics yet. Add one above to start listening for
												broker traffic.
											</div>
										) : (
											<div className="overflow-hidden rounded-lg border border-white/6 bg-background/25">
												<div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 border-b border-white/6 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/35">
													<span className="min-w-0">Name</span>
													<span className="justify-self-start">QoS</span>
													<span
														className="justify-self-center"
														title="Subscribe"
													>
														On
													</span>
													<span className="sr-only">Remove</span>
												</div>
												{mqtt.subscriptions.map((subscription) => (
													<div
														key={subscription.id}
														className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 border-b border-white/6 px-3 py-2 last:border-b-0"
													>
														<input
															type="text"
															value={subscription.topic}
															onChange={(e) =>
																onUpdate((prev) => ({
																	...prev,
																	subscriptions: prev.subscriptions.map(
																		(item) =>
																			item.id === subscription.id
																				? { ...item, topic: e.target.value }
																				: item,
																	),
																}))
															}
															onFocus={() => setTopic(subscription.topic)}
															className={`${fieldClass} min-w-0 font-mono`}
														/>
														<div className="relative shrink-0 justify-self-start">
															<button
																type="button"
																onClick={() =>
																	setOpenQosMenuId((prev) =>
																		prev === subscription.id
																			? null
																			: subscription.id,
																	)
																}
																className="inline-flex h-10 w-fit items-center gap-1 rounded-lg border border-white/8 bg-inputbox px-2 text-sm text-white transition-colors hover:border-white/15"
															>
																<span className="font-mono text-xs text-white/70">
																	QoS {subscription.qos}
																</span>
																<TbChevronDown
																	size={14}
																	className="shrink-0 text-white/35"
																/>
															</button>
															{openQosMenuId === subscription.id && (
																<Dropdown
																	width="min-w-[120px]"
																	onClose={() => setOpenQosMenuId(null)}
																	items={MQTT_QOS_LEVELS.map((level) => ({
																		label: `QoS ${level}`,
																		active: subscription.qos === level,
																		onClick: () =>
																			onUpdate((prev) => ({
																				...prev,
																				subscriptions: prev.subscriptions.map(
																					(item) =>
																						item.id === subscription.id
																							? { ...item, qos: level }
																							: item,
																				),
																			})),
																	}))}
																/>
															)}
														</div>
														<div className="flex h-10 w-10 shrink-0 items-center justify-center justify-self-center">
															<label className="inline-flex cursor-pointer items-center">
																<Checkbox
																	checked={subscription.enabled !== false}
																	onChange={(checked) =>
																		onUpdate((prev) => ({
																			...prev,
																			subscriptions: prev.subscriptions.map(
																				(item) =>
																					item.id === subscription.id
																						? { ...item, enabled: checked }
																						: item,
																			),
																		}))
																	}
																/>
															</label>
														</div>
														<button
															type="button"
															onClick={() =>
																onUpdate((prev) => ({
																	...prev,
																	subscriptions: prev.subscriptions.filter(
																		(item) => item.id !== subscription.id,
																	),
																}))
															}
															className="inline-flex h-9 w-9 shrink-0 items-center justify-center justify-self-center rounded-lg text-white/45 transition-colors hover:bg-white/5 hover:text-red"
															aria-label="Remove MQTT subscription"
														>
															<TbTrash size={16} />
														</button>
													</div>
												))}
											</div>
										)}
									</div>
								</div>
							</div>
						)}

						{activeTab === "connection" && (
							<div className="space-y-4 p-4">
								<section className={sectionClass}>
									<div>
										<label className="mb-2 block text-xs text-white/60">
											Client ID
										</label>
										<input
											type="text"
											value={mqtt.clientId}
											onChange={(e) =>
												onUpdate((prev) => ({
													...prev,
													clientId: e.target.value,
												}))
											}
											placeholder="Leave blank to auto-generate"
											className={fieldClass}
										/>
										<p className="mt-2 text-xs text-white/35">
											MQTT clients typically need a unique client ID. If you
											leave this empty, Mandy will generate one at connect time.
										</p>
									</div>
									<div className="grid grid-cols-2 gap-4">
										<div>
											<label className="mb-2 block text-xs text-white/60">
												Username
											</label>
											<input
												type="text"
												value={mqtt.username || ""}
												onChange={(e) =>
													onUpdate((prev) => ({
														...prev,
														username: e.target.value,
													}))
												}
												className={fieldClass}
											/>
										</div>
										<div>
											<label className="mb-2 block text-xs text-white/60">
												Password
											</label>
											<input
												type="password"
												value={mqtt.password || ""}
												onChange={(e) =>
													onUpdate((prev) => ({
														...prev,
														password: e.target.value,
													}))
												}
												className={fieldClass}
											/>
										</div>
									</div>
									<div className="grid grid-cols-2 gap-4">
										<div>
											<label className="mb-2 block text-xs text-white/60">
												Keep Alive (secs)
											</label>
											<input
												type="number"
												min={1}
												value={mqtt.keepAliveSecs ?? 30}
												onChange={(e) =>
													onUpdate((prev) => ({
														...prev,
														keepAliveSecs: Math.max(
															1,
															Number(e.target.value) || 30,
														),
													}))
												}
												className={fieldClass}
											/>
										</div>
										<div className="flex items-end">
											<label className="inline-flex h-10 items-center gap-2 text-sm font-medium text-white/72">
												<Checkbox
													checked={mqtt.cleanSession ?? true}
													onChange={(checked) =>
														onUpdate((prev) => ({
															...prev,
															cleanSession: checked,
														}))
													}
												/>
												Clean session
											</label>
										</div>
									</div>
								</section>
							</div>
						)}
					</div>
				</div>

				{activeTab !== "overview" && (
					<>
						<div
							className="group flex w-2 shrink-0 cursor-col-resize items-center justify-center"
							onMouseDown={(e) => {
								e.preventDefault();
								setIsResizing(true);
							}}
						>
							<div className="h-full w-px transition-colors group-hover:bg-accent/50" />
						</div>
						<div className="flex-1 min-w-0 overflow-auto border-l border-white/10 bg-inset">
							<MQTTMessageList
								messages={messageListItems}
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
