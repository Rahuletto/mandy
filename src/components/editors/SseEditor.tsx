import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { AuthType } from "../../bindings";
import { useSse } from "../../hooks/useSse";
import { getItemConfig } from "../../registry";
import type { SseFile } from "../../types/project";
import {
	generateSseSnippet,
	SSE_SNIPPET_LANGS,
	type SseSnippetLang,
} from "../../utils/realtimeSnippets";
import { KeyValueTable } from "../KeyValueTable";
import { UrlInput } from "../ui";
import { AuthEditor } from "./AuthEditor";
import { EditorRequestBar, ProtocolEditorLeading } from "./EditorRequestBar";
import {
	EDITOR_DANGER_BUTTON_CLASS,
	EDITOR_PRIMARY_BUTTON_CLASS,
	editorTabButtonClass,
	PANEL_PRIMARY_ACTION_CLASS,
} from "./editorRequestBarStyles";
import { ProtocolOverview } from "./ProtocolOverview";
import { SseEventList } from "./SseEventList";

interface SseEditorProps {
	sse: SseFile;
	onUpdate: (updater: (sse: SseFile) => SseFile) => void;
	availableVariables?: string[];
	projectAuth?: AuthType;
	onOpenProjectSettings?: () => void;
	onStartLoading?: (id: string) => void;
	onStopLoading?: (id: string) => void;
	resolveVariables?: (text: string) => string;
}

type SseTab = "overview" | "connection" | "authorization" | "headers";

export function SseEditor({
	sse,
	onUpdate,
	availableVariables,
	projectAuth,
	onOpenProjectSettings,
	onStartLoading,
	onStopLoading,
	resolveVariables,
}: SseEditorProps) {
	const resolve = resolveVariables ?? ((t: string) => t);
	const config = getItemConfig("sse");

	const handleTreeActivity = useCallback(
		(active: boolean) => {
			if (active) onStartLoading?.(sse.id);
			else onStopLoading?.(sse.id);
		},
		[sse.id, onStartLoading, onStopLoading],
	);

	const { status, connect, disconnect, clearEvents } = useSse({
		sse,
		onUpdate,
		resolveVariables: resolve,
		projectAuth,
		onTreeActivity: handleTreeActivity,
	});

	const [url, setUrl] = useState(sse.url);
	const [activeTab, setActiveTab] = useState<SseTab>("overview");
	const [splitPercent, setSplitPercent] = useState(50);
	const [isResizing, setIsResizing] = useState(false);
	const splitContainerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setUrl(sse.url);
	}, [sse.url]);

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

	const isOverview = activeTab === "overview";
	const isConnected = status === "connected";
	const isConnecting = status === "connecting";

	const tabs: SseTab[] = ["overview", "connection", "authorization", "headers"];

	const lastEventIdFieldId = useId();

	const connectAction = (
		<button
			type="button"
			disabled={!url || isConnecting || isConnected}
			onClick={() => void connect(url)}
			className={PANEL_PRIMARY_ACTION_CLASS}
		>
			{isConnecting ? "Connecting…" : "Connect"}
		</button>
	);

	return (
		<div className="flex h-full flex-col">
			<EditorRequestBar
				loading={isConnecting}
				accentDivider={isConnected}
				leading={<ProtocolEditorLeading type="sse" />}
				urlField={
					<UrlInput
						value={url}
						onChange={handleUrlChange}
						placeholder="https://example.com/events"
						availableVariables={availableVariables ?? []}
						disabled={isConnected || isConnecting}
					/>
				}
				action={
					isConnected ? (
						<button
							type="button"
							onClick={() => void disconnect()}
							className={EDITOR_DANGER_BUTTON_CLASS}
						>
							Disconnect
						</button>
					) : (
						<button
							type="button"
							onClick={() => void connect(url)}
							disabled={!url || isConnecting}
							className={EDITOR_PRIMARY_BUTTON_CLASS}
						>
							{isConnecting ? "Connecting" : "Connect"}
						</button>
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
						width: isOverview ? "100%" : `${splitPercent}%`,
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
							<ProtocolOverview
								name={sse.name}
								description={sse.description || ""}
								onCommitName={(next) =>
									onUpdate((prev) => ({ ...prev, name: next }))
								}
								onDescriptionChange={(desc) =>
									onUpdate((prev) => ({ ...prev, description: desc }))
								}
								panelBadge={config.shortLabel}
								panelBadgeClassName={config.listBadgeClass}
								panelSubtitle={sse.url || "No URL set"}
								snippetLangs={SSE_SNIPPET_LANGS}
								generateSnippet={(lang) =>
									generateSseSnippet(sse, lang as SseSnippetLang)
								}
								action={connectAction}
								leftFooter={
									sse.lastEventId ? (
										<div className="mt-4">
											<h3 className="mb-2 font-semibold text-sm text-white/70">
												Last Event ID
											</h3>
											<p className="font-mono text-white/60 text-xs">
												{sse.lastEventId}
											</p>
										</div>
									) : undefined
								}
							/>
						)}

						{activeTab === "connection" && (
							<div className="flex h-full flex-col p-4">
								<div>
									<label
										htmlFor={lastEventIdFieldId}
										className="mb-1 block font-medium text-white/40 text-xs"
									>
										Last Event ID (resume)
									</label>
									<input
										id={lastEventIdFieldId}
										type="text"
										value={sse.lastEventId || ""}
										onChange={(e) =>
											onUpdate((prev) => ({
												...prev,
												lastEventId: e.target.value,
											}))
										}
										placeholder="Optional — sent as Last-Event-ID on connect"
										className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
									/>
								</div>
							</div>
						)}

						{activeTab === "authorization" && (
							<AuthEditor
								auth={sse.auth || "None"}
								onChange={(auth) => onUpdate((prev) => ({ ...prev, auth }))}
								availableVariables={availableVariables}
								projectAuth={projectAuth}
								isInherited={sse.useInheritedAuth ?? true}
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
								items={sse.headerItems || []}
								onChange={(items) =>
									onUpdate((prev) => ({ ...prev, headerItems: items }))
								}
								availableVariables={availableVariables}
								placeholder={{ key: "Header", value: "Value" }}
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
						<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-white/10 border-l bg-inset">
							<SseEventList
								events={sse.events}
								status={status}
								onClear={clearEvents}
							/>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
