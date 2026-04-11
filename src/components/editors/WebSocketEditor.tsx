import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthType } from "../../bindings";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useExclusiveWebSocketOwnerId } from "../../realtime/wsExclusiveLock";
import type { WebSocketFile } from "../../types/project";
import { KeyValueTable } from "../KeyValueTable";
import { UrlInput } from "../ui";
import { Tooltip } from "../ui/Tooltip";
import { AuthEditor } from "./AuthEditor";
import { EditorRequestBar, ProtocolEditorLeading } from "./EditorRequestBar";
import {
	EDITOR_DANGER_BUTTON_CLASS,
	EDITOR_PRIMARY_BUTTON_CLASS,
	editorTabButtonClass,
} from "./editorRequestBarStyles";
import { WebSocketMessageComposer } from "./WebSocketMessageComposer";
import { WebSocketMessageList } from "./WebSocketMessageList";
import { WebSocketOverview } from "./WebSocketOverview";

interface WebSocketEditorProps {
	ws: WebSocketFile;
	onUpdate: (updater: (ws: WebSocketFile) => WebSocketFile) => void;
	availableVariables?: string[];
	projectAuth?: AuthType;
	onOpenProjectSettings?: () => void;
	onStartLoading?: (id: string) => void;
	onStopLoading?: (id: string) => void;
	resolveVariables?: (text: string) => string;
}

type WsTab =
	| "overview"
	| "message"
	| "params"
	| "authorization"
	| "headers"
	| "cookies";

export function WebSocketEditor({
	ws,
	onUpdate,
	availableVariables,
	projectAuth,
	onOpenProjectSettings,
	onStartLoading,
	onStopLoading,
	resolveVariables,
}: WebSocketEditorProps) {
	const resolve = resolveVariables ?? ((t: string) => t);

	const handleTreeActivity = useCallback(
		(active: boolean) => {
			if (active) onStartLoading?.(ws.id);
			else onStopLoading?.(ws.id);
		},
		[ws.id, onStartLoading, onStopLoading],
	);

	const exclusiveOwnerId = useExclusiveWebSocketOwnerId();
	const blockedByOtherWs =
		exclusiveOwnerId !== null && exclusiveOwnerId !== ws.id;

	const { status, connect, disconnect, sendMessage, clearMessages } =
		useWebSocket({
			ws,
			onUpdate,
			resolveVariables: resolve,
			onTreeActivity: handleTreeActivity,
		});

	const [url, setUrl] = useState(ws.url);
	const [activeTab, setActiveTab] = useState<WsTab>("overview");
	const [splitPercent, setSplitPercent] = useState(50);
	const [isResizing, setIsResizing] = useState(false);
	const splitContainerRef = useRef<HTMLDivElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setUrl(ws.url);
	}, [ws.url]);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

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

	const handleUrlChange = useCallback(
		(newUrl: string) => {
			setUrl(newUrl);
			onUpdate((prev) => ({ ...prev, url: newUrl }));
		},
		[onUpdate],
	);

	const tabs: WsTab[] = [
		"overview",
		"message",
		"params",
		"authorization",
		"headers",
		"cookies",
	];

	const isOverview = activeTab === "overview";

	const headerConnectTooltip = !url
		? "Enter a WebSocket URL to connect"
		: blockedByOtherWs
			? "Only one WebSocket can be active at a time. Disconnect the other WebSocket first, then connect here."
			: status === "connecting"
				? "Connecting..."
				: undefined;

	const headerConnectDisabled =
		!url || status === "connecting" || blockedByOtherWs;

	return (
		<div className="flex h-full flex-col">
			<EditorRequestBar
				loading={status === "connecting"}
				accentDivider={status === "connected"}
				leading={<ProtocolEditorLeading type="websocket" />}
				urlField={
					<UrlInput
						value={url}
						onChange={handleUrlChange}
						placeholder="ws://localhost:8080 or wss://..."
						availableVariables={availableVariables ?? []}
						disabled={status === "connected" || status === "connecting"}
					/>
				}
				action={
					status === "connected" ? (
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
								onClick={() => connect(url)}
								disabled={headerConnectDisabled}
								className={EDITOR_PRIMARY_BUTTON_CLASS}
							>
								Connect
							</button>
						</Tooltip>
					)
				}
			/>

			<div ref={splitContainerRef} className="flex flex-1 overflow-hidden">
				<div
					className="flex flex-col overflow-hidden p-2 pl-4"
					style={{
						width: !isOverview ? `${splitPercent}%` : "100%",
					}}
				>
					<div className="flex shrink-0 items-center gap-1 py-2">
						{tabs.map((tab) => (
							<button
								key={tab}
								type="button"
								onClick={() => setActiveTab(tab)}
								className={editorTabButtonClass(activeTab === tab)}
							>
								{tab === "overview"
									? "Overview"
									: tab === "authorization"
										? "Authorization"
										: tab.charAt(0).toUpperCase() + tab.slice(1)}
							</button>
						))}
					</div>

					<div className="relative min-h-0 flex-1 overflow-auto">
						{activeTab === "overview" && (
							<WebSocketOverview
								ws={ws}
								onUpdate={onUpdate}
								onConnect={() => connect(url)}
								status={status}
								blockedByOtherConnection={blockedByOtherWs}
							/>
						)}

						{activeTab === "message" && (
							<WebSocketMessageComposer status={status} onSend={sendMessage} />
						)}

						{activeTab === "params" && (
							<KeyValueTable
								items={ws.params || []}
								onChange={(items) =>
									onUpdate((prev) => ({
										...prev,
										params: items,
									}))
								}
								availableVariables={availableVariables}
								placeholder={{ key: "Key", value: "Value" }}
							/>
						)}

						{activeTab === "authorization" && (
							<AuthEditor
								auth={ws.auth || "None"}
								onChange={(auth) => onUpdate((prev) => ({ ...prev, auth }))}
								availableVariables={availableVariables}
								projectAuth={projectAuth}
								isInherited={ws.useInheritedAuth ?? true}
								onInheritChange={(inherit) =>
									onUpdate((prev) => ({
										...prev,
										useInheritedAuth: inherit,
									}))
								}
								onOpenProjectSettings={onOpenProjectSettings}
							/>
						)}

						{activeTab === "headers" && (
							<KeyValueTable
								items={ws.headerItems || []}
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

						{activeTab === "cookies" && (
							<KeyValueTable
								items={ws.cookies || []}
								onChange={(items) =>
									onUpdate((prev) => ({
										...prev,
										cookies: items,
									}))
								}
								availableVariables={availableVariables}
								placeholder={{ key: "Cookie", value: "Value" }}
							/>
						)}
					</div>
				</div>

				{!isOverview && (
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

						<div className="flex min-h-0 flex-1 flex-col overflow-hidden border-white/10 border-l bg-inset">
							<WebSocketMessageList
								messages={ws.messages}
								status={status}
								onClear={clearMessages}
							/>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
