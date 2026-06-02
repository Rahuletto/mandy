import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { type AuthType, commands } from "../../bindings";
import { usePopoverHover } from "../../hooks/usePopoverHover";
import { getItemConfig } from "../../registry";
import { useToastStore } from "../../stores/toastStore";
import type { GrpcFile, GrpcResponse } from "../../types/project";
import { resolveEffectiveAuth } from "../../utils/effectiveAuth";
import {
	formatBytes,
	getGrpcStatusColor,
	getGrpcStatusLabel,
} from "../../utils/format";
import { buildHeaderMap } from "../../utils/protocolHeaders";
import {
	GRPC_SNIPPET_LANGS,
	type GrpcSnippetLang,
	generateGrpcSnippet,
} from "../../utils/realtimeSnippets";
import { CodeEditor, CodeViewer } from "../CodeMirror";
import { KeyValueTable } from "../KeyValueTable";
import { SizePopover } from "../popovers/SizePopover";
import { StatusPopover } from "../popovers/StatusPopover";
import { TimingPopover } from "../popovers/TimingPopover";
import { UrlInput } from "../ui";
import { AuthEditor } from "./AuthEditor";
import { EditorRequestBar, ProtocolEditorLeading } from "./EditorRequestBar";
import {
	EDITOR_PRIMARY_BUTTON_CLASS,
	editorTabButtonClass,
	PANEL_PRIMARY_ACTION_CLASS,
} from "./editorRequestBarStyles";
import { MetadataRows } from "./MetadataRows";
import { ProtocolOverview } from "./ProtocolOverview";

interface GrpcEditorProps {
	grpc: GrpcFile;
	onUpdate: (updater: (grpc: GrpcFile) => GrpcFile) => void;
	availableVariables?: string[];
	projectAuth?: AuthType;
	onOpenProjectSettings?: () => void;
	onStartLoading?: (id: string) => void;
	onStopLoading?: (id: string) => void;
	resolveVariables?: (text: string) => string;
}

type GrpcTab = "overview" | "request" | "service" | "authorization" | "headers";

export function GrpcEditor({
	grpc,
	onUpdate,
	availableVariables,
	projectAuth,
	onOpenProjectSettings,
	onStartLoading,
	onStopLoading,
	resolveVariables,
}: GrpcEditorProps) {
	const resolve = resolveVariables ?? ((t: string) => t);
	const { addToast } = useToastStore();
	const config = getItemConfig("grpc");

	const [activeTab, setActiveTab] = useState<GrpcTab>("overview");
	const [splitPercent, setSplitPercent] = useState(50);
	const [isResizing, setIsResizing] = useState(false);
	const [isCalling, setIsCalling] = useState(false);
	const splitContainerRef = useRef<HTMLDivElement>(null);
	const [responseSplitY, setResponseSplitY] = useState(60);
	const [isResizingResponse, setIsResizingResponse] = useState(false);
	const [responseDetailTab, setResponseDetailTab] = useState<
		"headers" | "trailers"
	>("headers");
	const responsePanelRef = useRef<HTMLDivElement>(null);
	const timingHover = usePopoverHover();
	const sizeHover = usePopoverHover();
	const statusHover = usePopoverHover();
	const timingRef = useRef<HTMLButtonElement>(null);
	const sizeRef = useRef<HTMLButtonElement>(null);
	const statusRef = useRef<HTMLButtonElement>(null);
	const serviceFieldId = useId();
	const methodFieldId = useId();
	const protoFieldId = useId();

	const handleTimingEnter = () => {
		statusHover.setOpen(false);
		sizeHover.setOpen(false);
		timingHover.onEnter();
	};
	const handleTimingLeave = timingHover.onLeave;
	const handleSizeEnter = () => {
		statusHover.setOpen(false);
		timingHover.setOpen(false);
		sizeHover.onEnter();
	};
	const handleSizeLeave = sizeHover.onLeave;
	const handleStatusEnter = () => {
		timingHover.setOpen(false);
		sizeHover.setOpen(false);
		statusHover.onEnter();
	};
	const handleStatusLeave = statusHover.onLeave;

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (isResizing && splitContainerRef.current) {
				const rect = splitContainerRef.current.getBoundingClientRect();
				const newPercent = ((e.clientX - rect.left) / rect.width) * 100;
				setSplitPercent(Math.max(30, Math.min(70, newPercent)));
			}
			if (isResizingResponse && responsePanelRef.current) {
				const rect = responsePanelRef.current.getBoundingClientRect();
				const newPercent = ((e.clientY - rect.top) / rect.height) * 100;
				setResponseSplitY(Math.max(30, Math.min(80, newPercent)));
			}
		};
		const handleMouseUp = () => {
			setIsResizing(false);
			setIsResizingResponse(false);
		};
		if (isResizing || isResizingResponse) {
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = isResizingResponse
				? "row-resize"
				: "col-resize";
			document.body.style.userSelect = "none";
		}
		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
	}, [isResizing, isResizingResponse]);

	const handleResponseMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizingResponse(true);
	}, []);

	const handleUrlChange = useCallback(
		(newUrl: string) => {
			onUpdate((prev) => ({ ...prev, url: newUrl }));
		},
		[onUpdate],
	);

	const call = useCallback(async () => {
		if (!grpc.url || isCalling) return;
		setIsCalling(true);
		onStartLoading?.(grpc.id);

		try {
			const headers = buildHeaderMap(grpc.headerItems, grpc.headers, resolve);
			const auth = resolveEffectiveAuth(
				grpc.auth,
				grpc.useInheritedAuth,
				projectAuth,
			);

			const result = await commands.grpcCall({
				url: resolve(grpc.url),
				proto: resolve(grpc.proto),
				service: resolve(grpc.service),
				method: resolve(grpc.method),
				body: resolve(grpc.requestBody || "{}"),
				headers,
				auth,
			});

			if (result.status === "error") {
				addToast(`gRPC call failed: ${result.error}`, "error");
				return;
			}

			const data = result.data;
			const response: GrpcResponse = {
				statusCode: data.status_code,
				statusMessage: data.status_message,
				body: data.body,
				timingMs: data.timing_ms,
				timing: data.timing,
				requestSize: data.request_size,
				responseSize: data.response_size,
				headers: Object.fromEntries(
					Object.entries(data.headers ?? {}).filter(
						(entry): entry is [string, string] => entry[1] != null,
					),
				),
				trailers: Object.fromEntries(
					Object.entries(data.trailers ?? {}).filter(
						(entry): entry is [string, string] => entry[1] != null,
					),
				),
				error: data.error,
			};

			onUpdate((prev) => ({ ...prev, response }));

			if (data.error) {
				addToast(data.error, "error");
			} else {
				addToast("gRPC call completed", "success");
			}
		} catch (err) {
			addToast(
				`gRPC call failed: ${err instanceof Error ? err.message : String(err)}`,
				"error",
			);
		} finally {
			setIsCalling(false);
			onStopLoading?.(grpc.id);
		}
	}, [
		grpc,
		isCalling,
		resolve,
		projectAuth,
		onUpdate,
		addToast,
		onStartLoading,
		onStopLoading,
	]);

	const isOverview = activeTab === "overview";
	const showResponsePanel = grpc.response != null;
	const response = grpc.response;

	const grpcStatusColor = useMemo(
		() =>
			response
				? getGrpcStatusColor(
						response.error && response.statusCode === 0
							? 2
							: response.statusCode,
					)
				: "#6b7280",
		[response],
	);
	const grpcStatusLabel = useMemo(
		() =>
			response
				? getGrpcStatusLabel(
						response.statusCode,
						response.error && response.statusCode === 0
							? response.error
							: response.statusMessage,
					)
				: "",
		[response],
	);
	const timingLabel = useMemo(() => {
		if (!response) return "";
		const ms = response.timing?.total_ms ?? response.timingMs;
		return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(2)} ms`;
	}, [response]);
	const metadataRows = useMemo((): [string, string][] => {
		if (!response) return [];
		const record =
			responseDetailTab === "headers"
				? (response.headers ?? {})
				: (response.trailers ?? {});
		return Object.entries(record);
	}, [response, responseDetailTab]);

	const tabs: GrpcTab[] = [
		"overview",
		"request",
		"service",
		"authorization",
		"headers",
	];

	const tabLabel = (tab: GrpcTab) => {
		if (tab === "overview") return "Overview";
		if (tab === "authorization") return "Authorization";
		return tab.charAt(0).toUpperCase() + tab.slice(1);
	};

	const leftFooter = (
		<div className="mt-4 space-y-2">
			<div className="border-white/5 border-b py-2">
				<span className="text-white/40 text-xs">Service</span>
				<p className="mt-1 font-mono text-white/80 text-xs">
					{grpc.service || "—"} / {grpc.method || "—"}
				</p>
			</div>
		</div>
	);

	return (
		<div className="flex h-full flex-col">
			<EditorRequestBar
				loading={isCalling}
				leading={<ProtocolEditorLeading type="grpc" />}
				urlField={
					<UrlInput
						value={grpc.url}
						onChange={handleUrlChange}
						placeholder="localhost:50051"
						availableVariables={availableVariables ?? []}
						disabled={isCalling}
					/>
				}
				action={
					<button
						type="button"
						onClick={() => void call()}
						disabled={!grpc.url || isCalling}
						className={EDITOR_PRIMARY_BUTTON_CLASS}
					>
						{isCalling ? "Calling…" : "Call"}
					</button>
				}
			/>

			<div
				ref={splitContainerRef}
				className="flex min-h-0 flex-1 overflow-hidden"
			>
				<div
					className="flex min-h-0 flex-col overflow-hidden p-2 pl-4"
					style={{
						width: isOverview
							? "100%"
							: showResponsePanel
								? `${splitPercent}%`
								: "100%",
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
								{tabLabel(tab)}
							</button>
						))}
					</div>

					<div className="relative min-h-0 flex-1 overflow-auto">
						{activeTab === "overview" && (
							<ProtocolOverview
								name={grpc.name}
								description={grpc.description || ""}
								onCommitName={(next) =>
									onUpdate((prev) => ({ ...prev, name: next }))
								}
								onDescriptionChange={(desc) =>
									onUpdate((prev) => ({ ...prev, description: desc }))
								}
								panelBadge={config.shortLabel}
								panelBadgeClassName={config.listBadgeClass}
								panelSubtitle={grpc.url || "No endpoint set"}
								snippetLangs={GRPC_SNIPPET_LANGS}
								generateSnippet={(lang) =>
									generateGrpcSnippet(grpc, lang as GrpcSnippetLang)
								}
								action={
									<button
										type="button"
										disabled={!grpc.url || isCalling}
										onClick={() => void call()}
										className={PANEL_PRIMARY_ACTION_CLASS}
									>
										{isCalling ? "Calling…" : "Call"}
									</button>
								}
								leftFooter={leftFooter}
							/>
						)}

						{activeTab === "request" && (
							<div className="flex h-full min-h-0 flex-col">
								<CodeEditor
									code={grpc.requestBody}
									language="json"
									onChange={(value) =>
										onUpdate((prev) => ({ ...prev, requestBody: value }))
									}
									placeholder='{ "name": "world" }'
								/>
							</div>
						)}

						{activeTab === "service" && (
							<div className="flex h-full min-h-0 flex-col gap-3 p-4">
								<div className="grid shrink-0 grid-cols-2 gap-3">
									<div>
										<label
											htmlFor={serviceFieldId}
											className="mb-1 block font-medium text-white/40 text-xs"
										>
											Service
										</label>
										<input
											id={serviceFieldId}
											type="text"
											value={grpc.service}
											onChange={(e) =>
												onUpdate((prev) => ({
													...prev,
													service: e.target.value,
												}))
											}
											placeholder="ExampleService"
											className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
										/>
									</div>
									<div>
										<label
											htmlFor={methodFieldId}
											className="mb-1 block font-medium text-white/40 text-xs"
										>
											Method
										</label>
										<input
											id={methodFieldId}
											type="text"
											value={grpc.method}
											onChange={(e) =>
												onUpdate((prev) => ({
													...prev,
													method: e.target.value,
												}))
											}
											placeholder="ExampleMethod"
											className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
										/>
									</div>
								</div>
								<div className="flex min-h-0 flex-1 flex-col">
									<span
										id={protoFieldId}
										className="mb-1 block shrink-0 font-medium text-white/40 text-xs"
									>
										Protocol Buffer definition
									</span>
									<div className="min-h-0 flex-1">
										<CodeEditor
											code={grpc.proto}
											language="protobuf"
											onChange={(value) =>
												onUpdate((prev) => ({ ...prev, proto: value }))
											}
										/>
									</div>
								</div>
							</div>
						)}

						{activeTab === "authorization" && (
							<AuthEditor
								auth={grpc.auth || "None"}
								onChange={(auth) => onUpdate((prev) => ({ ...prev, auth }))}
								availableVariables={availableVariables}
								projectAuth={projectAuth}
								isInherited={grpc.useInheritedAuth ?? true}
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
								items={grpc.headerItems || []}
								onChange={(items) =>
									onUpdate((prev) => ({ ...prev, headerItems: items }))
								}
								availableVariables={availableVariables}
								placeholder={{ key: "Header", value: "Value" }}
							/>
						)}
					</div>
				</div>

				{showResponsePanel && response && (
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
						<div
							ref={responsePanelRef}
							className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-white/10 border-l bg-inset"
						>
							<div className="flex shrink-0 items-center justify-between p-2 px-4">
								<span className="font-medium text-white text-xs">Response</span>
							</div>

							<div
								className="overflow-auto"
								style={{ height: `${responseSplitY}%` }}
							>
								{response.error && !response.body ? (
									<pre className="whitespace-pre-wrap p-4 font-mono text-red-400/90 text-sm">
										{response.error}
									</pre>
								) : (
									<div className="h-full">
										<CodeViewer code={response.body || ""} language="json" />
									</div>
								)}
							</div>

							<div className="flex shrink-0 items-center justify-between border-white/10 border-y bg-inset pr-2">
								<div className="flex items-center gap-1">
									<button
										ref={statusRef}
										type="button"
										onMouseEnter={handleStatusEnter}
										onMouseLeave={handleStatusLeave}
										className="flex items-center gap-1.5 px-3 py-2 font-bold text-xs"
										style={{
											color: grpcStatusColor,
											backgroundColor: `${grpcStatusColor}20`,
										}}
									>
										{grpcStatusLabel}
									</button>
									<button
										ref={timingRef}
										type="button"
										onMouseEnter={handleTimingEnter}
										onMouseLeave={handleTimingLeave}
										className="cursor-default rounded px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
									>
										{timingLabel}
									</button>
									<span className="text-white/20">•</span>
									<button
										ref={sizeRef}
										type="button"
										onMouseEnter={handleSizeEnter}
										onMouseLeave={handleSizeLeave}
										className="cursor-default rounded px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
									>
										{formatBytes(response.responseSize?.total_bytes ?? 0)}
									</button>
								</div>
							</div>

							{response.timing && (
								<TimingPopover
									timing={response.timing}
									anchorRef={timingRef}
									open={timingHover.open}
									onClose={() => timingHover.setOpen(false)}
									onMouseEnter={handleTimingEnter}
									onMouseLeave={handleTimingLeave}
								/>
							)}

							{response.requestSize && response.responseSize && (
								<SizePopover
									requestSize={response.requestSize}
									responseSize={response.responseSize}
									anchorRef={sizeRef}
									open={sizeHover.open}
									onClose={() => sizeHover.setOpen(false)}
									onMouseEnter={handleSizeEnter}
									onMouseLeave={handleSizeLeave}
								/>
							)}
							{statusRef.current && (
								<StatusPopover
									statusCode={response.statusCode}
									statusText={response.statusMessage}
									protocol="grpc"
									anchorRef={statusRef}
									open={statusHover.open}
									onClose={() => statusHover.setOpen(false)}
									onMouseEnter={handleStatusEnter}
									onMouseLeave={handleStatusLeave}
								/>
							)}

							<div
								className="h-px shrink-0 cursor-row-resize bg-white/10 transition-colors"
								onMouseDown={handleResponseMouseDown}
							/>

							<div
								className="flex flex-col overflow-hidden bg-card"
								style={{ height: `${100 - responseSplitY}%` }}
							>
								<div className="flex shrink-0 items-center gap-1 p-2">
									<button
										type="button"
										onClick={() => setResponseDetailTab("headers")}
										className={`rounded-md px-2 py-0.5 font-medium text-xs transition-colors ${
											responseDetailTab === "headers"
												? "bg-accent/10 text-accent"
												: "text-white/60 hover:text-white/50"
										}`}
									>
										Headers
									</button>
									<button
										type="button"
										onClick={() => setResponseDetailTab("trailers")}
										className={`rounded-md px-2 py-0.5 font-medium text-xs transition-colors ${
											responseDetailTab === "trailers"
												? "bg-accent/10 text-accent"
												: "text-white/60 hover:text-white/50"
										}`}
									>
										Trailers
									</button>
								</div>

								<div className="flex-1 overflow-auto">
									<MetadataRows
										rows={metadataRows}
										emptyLabel={responseDetailTab}
									/>
								</div>
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
