import type { Node } from "@xyflow/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BiLogoTypescript } from "react-icons/bi";
import { VscChevronRight, VscClose, VscSettingsGear } from "react-icons/vsc";
import { useProjectStore } from "../../stores/projectStore";
import type { Folder, RequestFile } from "../../types/project";
import type {
	ConditionNodeData,
	LoopNodeData,
	NodeOutput,
	RequestNodeData,
	RequestOverrides,
	WorkflowNodeData,
} from "../../types/workflow";
import { formatBytes, getStatusColor, STATUS_TEXT } from "../../utils/format";
import { getMethodColor, getShortMethod } from "../../utils/methodConstants";
import { getNodeOutputDurationMs } from "../../utils/workflowMetrics";
import { CodeEditor, CodeViewer, type CompletionItem } from "../CodeMirror";
import { SizePopover } from "../popovers/SizePopover";
import { TimingPopover } from "../popovers/TimingPopover";
import { Checkbox } from "../ui";
import { RequestOverrideModal } from "./RequestOverrideModal";

interface InputNodeInfo {
	nodeId: string;
	nodeName: string;
	type: string;
	method?: string;
	output?: NodeOutput;
	requestId?: string;
	isPrimary?: boolean;
	/** When set (e.g. loop context), overrides auto-derived template paths. */
	paths?: { path: string; type: string }[];
}

interface NodeConfigPanelProps {
	node: Node<WorkflowNodeData>;
	onUpdate: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
	onClose: () => void;
	availableOutputs: InputNodeInfo[];
	nodeOutput?: NodeOutput;
	width: number;
	onWidthChange: (width: number) => void;
}

function normalizeOverrides(raw?: Partial<RequestOverrides>): RequestOverrides {
	return {
		headers: Array.isArray(raw?.headers) ? raw.headers : [],
		params: Array.isArray(raw?.params) ? raw.params : [],
		auth: raw?.auth?.type ? raw.auth : { type: "inherit", value: "" },
		body: raw?.body?.type ? raw.body : { type: "inherit", value: "" },
		url: raw?.url ?? undefined,
	};
}

function findRequestById(root: Folder, requestId: string): RequestFile | null {
	for (const child of root.children) {
		if (child.type === "request" && child.id === requestId) return child;
		if (child.type === "folder") {
			const found = findRequestById(child, requestId);
			if (found) return found;
		}
	}
	return null;
}

const EndResponseViewer = memo(function EndResponseViewer({
	output,
}: {
	output?: NodeOutput;
}) {
	const [viewMode, setViewMode] = useState<"raw" | "json">("json");

	const formatBody = (body: unknown): string => {
		if (typeof body === "string") return body;
		try {
			return JSON.stringify(body, null, 2);
		} catch {
			return String(body);
		}
	};

	const toJsonString = (body: unknown): string | null => {
		if (body === undefined) return null;
		if (typeof body === "string") {
			try {
				return JSON.stringify(JSON.parse(body), null, 2);
			} catch {
				return null;
			}
		}
		try {
			return JSON.stringify(body, null, 2);
		} catch {
			return null;
		}
	};

	const rawString =
		output && output.body !== undefined ? formatBody(output.body) : "";
	const jsonString = output ? toJsonString(output.body) : null;
	const code =
		viewMode === "json"
			? jsonString || "// No JSON response body"
			: rawString || "// No response body";

	return (
		<div className="border-y border-white/10 overflow-hidden bg-inset">
			<div className="flex items-center justify-between p-2 px-4 shrink-0 border-b border-white/10">
				<span className="text-xs font-medium text-white">Response</span>
				<div className="flex gap-1">
					<button
						type="button"
						onClick={() => setViewMode("raw")}
						className={`text-xs font-medium px-2 py-0.5 rounded-md transition-colors ${
							viewMode === "raw"
								? "text-accent bg-accent/10"
								: "text-white/60 hover:text-white/50"
						}`}
					>
						Raw
					</button>
					<button
						type="button"
						onClick={() => setViewMode("json")}
						className={`text-xs font-medium px-2 py-0.5 rounded-md transition-colors ${
							viewMode === "json"
								? "text-accent bg-accent/10"
								: "text-white/60 hover:text-white/50"
						}`}
					>
						JSON
					</button>
				</div>
			</div>

			<div className="h-[340px] overflow-auto">
				<CodeViewer
					code={code}
					language={viewMode === "json" && jsonString ? "json" : "text"}
				/>
			</div>
		</div>
	);
});

function RequestConfig({
	data,
	onUpdate,
	inputs,
	nodeOutput,
	outputHeight,
	onOutputHeightChange,
}: {
	data: RequestNodeData;
	onUpdate: (d: Partial<RequestNodeData>) => void;
	inputs: InputNodeInfo[];
	nodeOutput?: NodeOutput;
	outputHeight: number;
	onOutputHeightChange: (h: number) => void;
}) {
	const [showOverrideModal, setShowOverrideModal] = useState(false);
	const [expandedConsole, setExpandedConsole] = useState<Set<string>>(
		new Set(),
	);
	const [hoverTimingId, setHoverTimingId] = useState<string | null>(null);
	const [hoverSizeId, setHoverSizeId] = useState<string | null>(null);
	const timingRefs = useRef<Record<string, HTMLButtonElement | null>>({});
	const sizeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
	const overrides = normalizeOverrides(data.overrides);
	const project = useProjectStore((s) => s.getActiveProject());

	const requestFile = useMemo(() => {
		if (!project || !data.requestId) return null;
		return findRequestById(project.root, data.requestId);
	}, [project, data.requestId]);

	const hasOverrides =
		overrides.headers.length > 0 ||
		overrides.params.length > 0 ||
		overrides.auth.type !== "inherit" ||
		overrides.body.type !== "inherit";

	const availableVariables = useMemo(() => {
		return inputs
			.filter((i) => i.type !== "start")
			.map((input) => {
				if (input.type === "loop" && input.paths?.length) {
					return {
						nodeId: input.nodeId,
						nodeName: input.nodeName,
						method: input.method,
						paths: input.paths.map((p) => ({ ...p })),
					};
				}
				const paths: { path: string; type: string }[] = [
					{ path: "{{status}}", type: "number" },
					{ path: "{{headers}}", type: "object" },
					{ path: "{{cookies}}", type: "object" },
				];
				const inputRequest =
					input.requestId && project
						? findRequestById(project.root, input.requestId)
						: null;
				let responseBody = input.output?.body;
				if (!responseBody && inputRequest?.response?.body_base64) {
					try {
						const decoded = atob(inputRequest.response.body_base64);
						responseBody = JSON.parse(decoded);
					} catch {
						responseBody = undefined;
					}
				}
				if (responseBody && typeof responseBody === "object") {
					const addPaths = (
						obj: Record<string, unknown>,
						prefix: string,
						depth = 0,
					) => {
						if (depth > 4) return;
						for (const [key, value] of Object.entries(obj)) {
							const path = prefix ? `${prefix}.${key}` : key;
							const type = Array.isArray(value) ? "array" : typeof value;
							paths.push({ path: `{{body.${path}}}`, type });
							if (value && typeof value === "object" && !Array.isArray(value)) {
								addPaths(value as Record<string, unknown>, path, depth + 1);
							}
							if (
								Array.isArray(value) &&
								value.length > 0 &&
								typeof value[0] === "object"
							) {
								addPaths(
									value[0] as Record<string, unknown>,
									`${path}[0]`,
									depth + 1,
								);
							}
						}
					};
					addPaths(responseBody as Record<string, unknown>, "");
				}
				return {
					nodeId: input.nodeId,
					nodeName: input.nodeName,
					method: input.method,
					paths,
				};
			});
	}, [inputs, project]);

	return (
		<div className="flex flex-col h-full">
			<div className="p-3 space-y-3 shrink-0">
				<div className="flex items-center gap-2 p-2.5 bg-white/[0.02] rounded-lg">
					<span
						className="text-xs font-mono font-bold"
						style={{ color: getMethodColor(data.method || "GET") }}
					>
						{getShortMethod(data.method || "GET")}
					</span>
					<span className="text-sm text-white/80 truncate flex-1">
						{data.requestName || "Unnamed"}
					</span>
				</div>

				<button
					type="button"
					onClick={() => setShowOverrideModal(true)}
					className={`w-full flex items-center gap-2 p-2.5 rounded-lg border transition-colors text-left ${
						hasOverrides
							? "border-accent/30 bg-accent/5"
							: "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
					}`}
				>
					<VscSettingsGear
						size={14}
						className={hasOverrides ? "text-accent" : "text-white/40"}
					/>
					<div className="flex-1 min-w-0">
						<div className="text-xs text-white/80">
							{hasOverrides ? "Overrides configured" : "Configure overrides"}
						</div>
						{hasOverrides && (
							<div className="text-[10px] text-white/40 truncate">
								{[
									overrides.headers.length > 0 &&
										`${overrides.headers.length} headers`,
									overrides.params.length > 0 &&
										`${overrides.params.length} params`,
									overrides.auth.type !== "inherit" && "auth",
									overrides.body.type !== "inherit" && "body",
								]
									.filter(Boolean)
									.join(", ")}
							</div>
						)}
					</div>
					<VscChevronRight size={12} className="text-white/30 shrink-0" />
				</button>
			</div>

			<div className="flex-1 min-h-0 overflow-hidden flex flex-col">
				<div className="overflow-auto" style={{ height: `${outputHeight}%` }}>
					{nodeOutput && <EndResponseViewer output={nodeOutput} />}
				</div>

				<div
					className="h-[2px] bg-white/10 cursor-row-resize transition-colors shrink-0"
					onMouseDown={(e) => {
						e.preventDefault();
						const startY = e.clientY;
						const start = outputHeight;
						const onMove = (ev: MouseEvent) => {
							const delta = ev.clientY - startY;
							const pctDelta = (delta / window.innerHeight) * 100;
							const next = Math.max(35, Math.min(80, start + pctDelta));
							onOutputHeightChange(next);
						};
						const onUp = () => {
							document.removeEventListener("mousemove", onMove);
							document.removeEventListener("mouseup", onUp);
						};
						document.addEventListener("mousemove", onMove);
						document.addEventListener("mouseup", onUp);
					}}
				/>

				<div
					className="overflow-auto bg-card"
					style={{ height: `${100 - outputHeight}%` }}
				>
					<div className="flex items-center gap-1 p-2 shrink-0 border-b border-white/5">
						<span className="text-xs px-2 py-0.5 rounded-md font-medium text-accent bg-accent/10">
							Console
						</span>
					</div>

					{inputs.length === 0 ? (
						<div className="p-3 text-xs text-white/35">No connected inputs</div>
					) : (
						<div className="border-b border-white/10">
							{inputs.map((input) => {
								const output = input.output;
								const outputBodyString = output
									? JSON.stringify(output.body ?? null)
									: "";
								const outputBytes = outputBodyString
									? new TextEncoder().encode(outputBodyString).length
									: 0;
								const timingInfo = output?.timing || {
									total_ms: getNodeOutputDurationMs(output),
									dns_lookup_ms: 0,
									tcp_handshake_ms: 0,
									tls_handshake_ms: 0,
									ttfb_ms: getNodeOutputDurationMs(output),
									content_download_ms: 0,
								};
								const responseSize = output?.responseSize || {
									total_bytes: outputBytes,
									headers_bytes: 0,
									body_bytes: outputBytes,
								};
								const requestSize = output?.requestSize || {
									total_bytes: 0,
									headers_bytes: 0,
									body_bytes: 0,
								};

								return (
									<div
										key={input.nodeId}
										className="border-b border-white/10 overflow-hidden last:border-b-0"
									>
										<button
											type="button"
											onClick={() => {
												setExpandedConsole((prev) => {
													const next = new Set(prev);
													if (next.has(input.nodeId)) next.delete(input.nodeId);
													else next.add(input.nodeId);
													return next;
												});
											}}
											className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-white/[0.05] transition-colors"
										>
											<div className="flex items-center gap-2 min-w-0 text-left">
												{input.method ? (
													<span
														className="text-[10px] font-mono font-bold"
														style={{ color: getMethodColor(input.method) }}
													>
														{input.method}
													</span>
												) : null}
												<span className="text-xs text-white/80 truncate">
													{input.nodeName}
												</span>
												{!output ? (
													<span className="text-[10px] text-white/35">
														no output
													</span>
												) : null}
											</div>
											<div className="flex items-center gap-2 shrink-0">
												{output?.status !== undefined ? (
													<span className="relative group">
														<span
															className="text-[10px] font-bold px-2 py-0.5 rounded"
															style={{
																color: getStatusColor(output.status),
																backgroundColor: `${getStatusColor(output.status)}20`,
															}}
														>
															{output.status}
														</span>
														<span className="absolute right-0 top-full mt-1 whitespace-nowrap text-[10px] px-2 py-1 rounded bg-card border border-white/10 text-white/80 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20">
															{output.status}{" "}
															{STATUS_TEXT[output.status] || "Unknown Status"}
														</span>
													</span>
												) : null}
												<VscChevronRight
													size={12}
													className={`shrink-0 text-white/40 transition-transform ${expandedConsole.has(input.nodeId) ? "rotate-90" : ""}`}
												/>
											</div>
										</button>

										{expandedConsole.has(input.nodeId) ? (
											<div className="border-t border-white/5 bg-black/20">
												{output ? (
													<>
														<div className="flex items-center justify-between bg-inset border-b border-white/10 shrink-0 pr-2">
															<div className="flex items-center gap-1">
																<span
																	className="text-xs font-bold px-3 py-2 flex items-center gap-1.5"
																	style={{
																		color: getStatusColor(output.status || 0),
																		backgroundColor: `${getStatusColor(output.status || 0)}20`,
																	}}
																>
																	{output.status || 0}{" "}
																	{STATUS_TEXT[output.status || 0] || "Unknown"}
																</span>
																<button
																	type="button"
																	ref={(el) => {
																		timingRefs.current[input.nodeId] = el;
																	}}
																	onMouseEnter={() => {
																		setHoverSizeId(null);
																		setHoverTimingId(input.nodeId);
																	}}
																	onMouseLeave={() => setHoverTimingId(null)}
																	className="text-[11px] text-white/50 hover:text-white/80 px-2 py-1 rounded hover:bg-white/5 transition-colors cursor-default"
																>
																	{getNodeOutputDurationMs(output) >= 1000
																		? `${(getNodeOutputDurationMs(output) / 1000).toFixed(2)} s`
																		: `${getNodeOutputDurationMs(output).toFixed(0)} ms`}
																</button>
																<span className="text-white/20">•</span>
																<button
																	type="button"
																	ref={(el) => {
																		sizeRefs.current[input.nodeId] = el;
																	}}
																	onMouseEnter={() => {
																		setHoverTimingId(null);
																		setHoverSizeId(input.nodeId);
																	}}
																	onMouseLeave={() => setHoverSizeId(null)}
																	className="text-[11px] text-white/50 hover:text-white/80 px-2 py-1 rounded hover:bg-white/5 transition-colors cursor-default"
																>
																	{formatBytes(outputBytes)}
																</button>
															</div>
														</div>
														{timingRefs.current[input.nodeId] && (
															<TimingPopover
																timing={timingInfo as any}
																anchorRef={{
																	current: timingRefs.current[
																		input.nodeId
																	] as HTMLElement | null,
																}}
																open={hoverTimingId === input.nodeId}
																onClose={() => setHoverTimingId(null)}
																onMouseEnter={() =>
																	setHoverTimingId(input.nodeId)
																}
																onMouseLeave={() => setHoverTimingId(null)}
															/>
														)}
														{sizeRefs.current[input.nodeId] && (
															<SizePopover
																requestSize={requestSize as any}
																responseSize={responseSize as any}
																anchorRef={{
																	current: sizeRefs.current[
																		input.nodeId
																	] as HTMLElement | null,
																}}
																open={hoverSizeId === input.nodeId}
																onClose={() => setHoverSizeId(null)}
																onMouseEnter={() =>
																	setHoverSizeId(input.nodeId)
																}
																onMouseLeave={() => setHoverSizeId(null)}
															/>
														)}
														<div className="max-h-[220px] overflow-auto border-t border-white/10 bg-black/20">
															<CodeViewer
																code={JSON.stringify(output, null, 2)}
																language="json"
															/>
														</div>
													</>
												) : (
													<div className="text-xs text-white/40 p-2">
														Run the workflow to see this node output
													</div>
												)}
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>

			<RequestOverrideModal
				isOpen={showOverrideModal}
				onClose={() => setShowOverrideModal(false)}
				overrides={overrides}
				onSave={(newOverrides) => onUpdate({ overrides: newOverrides })}
				availableVariables={availableVariables}
				requestName={data.requestName || "Unnamed"}
				method={data.method || "GET"}
				requestFile={requestFile}
			/>
		</div>
	);
}

function ConditionConfig({
	data,
	onUpdate,
	inputs,
}: {
	data: ConditionNodeData;
	onUpdate: (d: Partial<ConditionNodeData>) => void;
	inputs: InputNodeInfo[];
}) {
	const codeRef = useRef<string>(data.expression || "");
	const project = useProjectStore((s) => s.getActiveProject());

	const defaultCode = `# Return True or False to control flow
# Use {{status}}, {{body}}, {{headers}}, {{cookies}}

return status == 200 and body.get("success") == True`;

	const completions = useMemo((): CompletionItem[] => {
		const items: CompletionItem[] = [];
		const hasDataInputs = inputs.some((i) => i.type !== "start");

		items.push(
			{ label: "{{item}}", type: "variable", detail: "loop item" },
			{ label: "{{index}}", type: "variable", detail: "loop index" },
		);

		for (const input of inputs) {
			if (input.type === "start") continue;
			const inputRequest =
				input.requestId && project
					? findRequestById(project.root, input.requestId)
					: null;
			let responseBody = input.output?.body;
			if (!responseBody && inputRequest?.response?.body_base64) {
				try {
					responseBody = JSON.parse(atob(inputRequest.response.body_base64));
				} catch {}
			}

			if (hasDataInputs && items.length <= 2) {
				items.push(
					{ label: "{{status}}", type: "variable", detail: "number" },
					{ label: "{{headers}}", type: "variable", detail: "object" },
					{ label: "{{cookies}}", type: "variable", detail: "object" },
				);
			}

			if (responseBody && typeof responseBody === "object") {
				const addPaths = (
					obj: Record<string, unknown>,
					prefix: string,
					depth = 0,
				) => {
					if (depth > 4) return;
					for (const [key, value] of Object.entries(obj)) {
						const path = prefix ? `${prefix}.${key}` : key;
						const type = Array.isArray(value) ? "array" : typeof value;
						items.push({
							label: `{{body.${path}}}`,
							type: "property",
							detail: type,
						});
						if (value && typeof value === "object" && !Array.isArray(value)) {
							addPaths(value as Record<string, unknown>, path, depth + 1);
						}
						if (
							Array.isArray(value) &&
							value.length > 0 &&
							typeof value[0] === "object"
						) {
							addPaths(
								value[0] as Record<string, unknown>,
								`${path}[0]`,
								depth + 1,
							);
						}
					}
				};
				addPaths(responseBody as Record<string, unknown>, "");
			}
		}
		return items;
	}, [inputs, project]);

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="p-3 shrink-0">
				<label className="block text-[10px] text-white/30 mb-1 px-1">
					Name
				</label>
				<input
					type="text"
					value={data.label || ""}
					onChange={(e) => onUpdate({ label: e.target.value })}
					placeholder="Check response"
					className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent/50"
				/>
			</div>

			<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
				<div className="px-3 py-1.5 flex items-center justify-between shrink-0 border-y border-white/5">
					<div className="flex items-center gap-3">
						<span className="text-[10px] text-white/30 flex items-center gap-1">
							<BiLogoTypescript size={14} />
							TypeScript
						</span>
					</div>
					<span className="text-[10px] text-white/30">
						Type {"{{"} for suggestions
					</span>
				</div>
				<div className="flex-1">
					<CodeEditor
						code={data.expression || defaultCode}
						language="typescript"
						onChange={(v) => {
							codeRef.current = v;
							onUpdate({ expression: v });
						}}
						completions={completions}
					/>
				</div>
			</div>
		</div>
	);
}

function LoopConfig({
	data,
	onUpdate,
	nodeOutput,
}: {
	data: LoopNodeData;
	onUpdate: (d: Partial<LoopNodeData>) => void;
	nodeOutput?: NodeOutput;
}) {
	const loopType = data.loopType || "count";

	return (
		<div className="flex flex-col h-full">
			<div className="p-3 space-y-3 flex-1 overflow-auto">
				<div>
					<label className="block text-[10px] text-white/30 mb-1 px-1">
						Name
					</label>
					<input
						type="text"
						value={data.label || ""}
						onChange={(e) => onUpdate({ label: e.target.value })}
						placeholder="Process items"
						className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent/50"
					/>
				</div>

				<div>
					<label className="block text-[10px] text-white/30 mb-1 px-1">
						Type
					</label>
					<div className="flex gap-1">
						{(["count", "forEach", "while"] as const).map((type) => (
							<button
								key={type}
								type="button"
								onClick={() => onUpdate({ loopType: type })}
								className={`flex-1 px-3 py-2 text-xs rounded-lg transition-colors ${
									loopType === type
										? "bg-accent/10 text-accent"
										: "bg-white/5 text-white/60 hover:bg-white/10"
								}`}
							>
								{type === "count"
									? "Count"
									: type === "forEach"
										? "For Each"
										: "While"}
							</button>
						))}
					</div>
				</div>

				{loopType === "count" && (
					<div>
						<label className="block text-[10px] text-white/30 mb-1 px-1">
							Iterations
						</label>
						<input
							type="number"
							value={data.iterations || 5}
							onChange={(e) =>
								onUpdate({ iterations: parseInt(e.target.value, 10) || 1 })
							}
							min={1}
							max={1000}
							className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent/50"
						/>
					</div>
				)}

				{loopType === "forEach" && (
					<div>
						<label className="block text-[10px] text-white/30 mb-1 px-1">
							Array path
						</label>
						<input
							type="text"
							value={data.forEachPath || ""}
							onChange={(e) => onUpdate({ forEachPath: e.target.value })}
							placeholder="body.items"
							className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-accent/50"
						/>
						<p className="text-[10px] text-white/30 mt-1.5 px-1">
							Access current item with{" "}
							<code className="text-accent">{"{{item}}"}</code>, index with{" "}
							<code className="text-accent">{"{{index}}"}</code> (one-based:{" "}
							<code className="text-accent">{"{{index+1}}"}</code>)
						</p>
					</div>
				)}

				{loopType === "while" && (
					<div>
						<label className="block text-[10px] text-white/30 mb-1 px-1">
							Condition (TypeScript)
						</label>
						<input
							type="text"
							value={data.whileCondition || ""}
							onChange={(e) => onUpdate({ whileCondition: e.target.value })}
							placeholder="return !!body?.hasMore"
							className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-accent/50"
						/>
					</div>
				)}

				<div>
					<label className="block text-[10px] text-white/30 mb-1 px-1">
						Collect results
					</label>
					<div className="flex items-center gap-3">
						<Checkbox
							checked={!!data.collectResults}
							onChange={(v: boolean) => onUpdate({ collectResults: v })}
						/>
						<div className="text-[10px] text-white/40">
							Collect the last response body from each iteration into an array
							and make it available as the loop's body after completion
						</div>
					</div>
				</div>

				<div>
					<label className="block text-[10px] text-white/30 mb-1 px-1">
						Delay (ms)
					</label>
					<input
						type="number"
						value={data.delayMs || 0}
						onChange={(e) =>
							onUpdate({ delayMs: parseInt(e.target.value, 10) || 0 })
						}
						min={0}
						max={60000}
						step={100}
						className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent/50"
					/>
				</div>

				{data.collectResults && nodeOutput && (
					<div>
						<label className="block text-[10px] text-white/30 mb-1 px-1">
							Aggregated output preview
						</label>
						<div className="border-t border-white/10 mt-2 pt-2">
							<CodeViewer
								code={JSON.stringify(
									{
										body: nodeOutput.body,
										iterationOutputs: nodeOutput.iterationOutputs,
									},
									null,
									2,
								)}
								language="json"
							/>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

const STATUS_CONFIG = {
	running: { color: "bg-accent", text: "text-accent", label: "Running" },
	completed: { color: "bg-green", text: "text-green", label: "Completed" },
	error: { color: "bg-red", text: "text-red", label: "Error" },
	idle: { color: "bg-white/20", text: "text-white/40", label: "Idle" },
};

const NODE_TITLES: Record<string, string> = {
	request: "Request",
	condition: "Condition",
	loop: "Loop",
	start: "Start",
	end: "End",
};

export function NodeConfigPanel({
	node,
	onUpdate,
	onClose,
	availableOutputs,
	nodeOutput,
	width,
	onWidthChange,
}: NodeConfigPanelProps) {
	const nodeData = node.data as WorkflowNodeData;
	const handleUpdate = (updates: Partial<WorkflowNodeData>) =>
		onUpdate(node.id, updates);
	const status = nodeData.status || "idle";
	const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;

	const [isResizing, setIsResizing] = useState(false);
	const [outputHeight, setOutputHeight] = useState(58);
	const panelRef = useRef<HTMLDivElement>(null);

	const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(
		new Set(),
	);
	const [hoverTimingId, setHoverTimingId] = useState<string | null>(null);
	const [hoverSizeId, setHoverSizeId] = useState<string | null>(null);
	const timingRefs = useRef<Record<string, HTMLButtonElement | null>>({});
	const sizeRefs = useRef<Record<string, HTMLButtonElement | null>>({});

	const [envVars, setEnvVars] = useState<
		Array<{ id: string; key: string; value: string }>
	>(() => {
		const vars = (nodeData as any).envVariables || [];
		return Array.isArray(vars)
			? vars.filter((v: any) => v && typeof v === "object")
			: [];
	});

	useEffect(() => {
		if (nodeData.type === "start") {
			const vars = (nodeData as any).envVariables || [];
			setEnvVars(
				Array.isArray(vars)
					? vars.filter((v: any) => v && typeof v === "object")
					: [],
			);
		}
	}, [nodeData.type, (nodeData as any).envVariables]);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizing(true);
	}, []);

	useEffect(() => {
		if (!isResizing) return;

		const handleMouseMove = (e: MouseEvent) => {
			const newWidth = window.innerWidth - e.clientX;
			onWidthChange(Math.max(280, Math.min(600, newWidth)));
		};

		const handleMouseUp = () => setIsResizing(false);

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isResizing, onWidthChange]);

	const renderConfig = () => {
		switch (nodeData.type) {
			case "request":
				return (
					<RequestConfig
						data={nodeData as RequestNodeData}
						onUpdate={handleUpdate}
						inputs={availableOutputs}
						nodeOutput={nodeOutput}
						outputHeight={outputHeight}
						onOutputHeightChange={setOutputHeight}
					/>
				);
			case "condition":
				return (
					<ConditionConfig
						data={nodeData as ConditionNodeData}
						onUpdate={handleUpdate}
						inputs={availableOutputs}
					/>
				);
			case "loop":
				return (
					<LoopConfig
						data={nodeData as LoopNodeData}
						onUpdate={handleUpdate}
						nodeOutput={nodeOutput}
					/>
				);
			case "start":
				return (
					<div className="flex flex-col h-full">
						<div className="p-3 border-b border-white/10 shrink-0">
							<div className="text-[10px] text-white/40 mb-2">
								Environment Variables
							</div>
							<div className="text-[9px] text-white/30">
								Define variables for this workflow accessible as{" "}
								<code className="text-accent">{"{{ KEY }}"}</code> in all
								requests
							</div>
						</div>

						<div className="flex-1 overflow-auto">
							{envVars.length === 0 ? (
								<div className="h-full flex items-center justify-center p-4 text-center">
									<div className="text-sm text-white/40">
										No variables defined
									</div>
								</div>
							) : (
								<table className="w-full text-xs">
									<thead className="sticky top-0 z-10 bg-card border-b border-white/10">
										<tr>
											<th className="text-left px-3 py-2 font-medium text-white/40 border-r border-white/10">
												Key
											</th>
											<th className="text-left px-3 py-2 font-medium text-white/40 border-r border-white/10 flex-1">
												Value
											</th>
											<th className="w-8 px-2 py-2" />
										</tr>
									</thead>
									<tbody>
										{envVars
											.filter(
												(v): v is (typeof envVars)[0] =>
													v && typeof v === "object" && "id" in v,
											)
											.map((ev) => (
												<tr
													key={ev.id}
													className="border-b border-white/5 hover:bg-white/[0.02]"
												>
													<td className="px-3 py-2 border-r border-white/5">
														<input
															type="text"
															value={ev?.key || ""}
															onChange={(e) => {
																const updated = envVars.map((v) =>
																	v && "id" in v && v.id === ev.id
																		? { ...v, key: e.target.value }
																		: v,
																);
																setEnvVars(updated);
																handleUpdate({ envVariables: updated });
															}}
															placeholder="Variable name"
															className="w-full bg-transparent text-white/80 placeholder:text-white/20 focus:outline-none text-xs font-mono"
														/>
													</td>
													<td className="px-3 py-2 border-r border-white/5">
														<input
															type="text"
															value={ev?.value || ""}
															onChange={(e) => {
																const updated = envVars.map((v) =>
																	v && "id" in v && v.id === ev.id
																		? { ...v, value: e.target.value }
																		: v,
																);
																setEnvVars(updated);
																handleUpdate({ envVariables: updated });
															}}
															placeholder="Value or {{expression}}"
															className="w-full bg-transparent text-white/60 placeholder:text-white/20 focus:outline-none text-xs font-mono"
														/>
													</td>
													<td className="px-2 py-2 text-center">
														<button
															type="button"
															onClick={() => {
																const updated = envVars.filter(
																	(v) => !v || !("id" in v) || v.id !== ev.id,
																);
																setEnvVars(updated);
																handleUpdate({ envVariables: updated });
															}}
															className="p-0.5 hover:bg-red/10 rounded transition-colors text-white/40 hover:text-red"
														>
															<VscClose size={12} />
														</button>
													</td>
												</tr>
											))}
									</tbody>
								</table>
							)}
						</div>

						<div className="p-3 border-t border-white/10 shrink-0">
							<button
								type="button"
								onClick={() => {
									const newVar = {
										id: Math.random().toString(36).substring(2, 9),
										key: "",
										value: "",
									};
									const updated = [...envVars, newVar];
									setEnvVars(updated);
									handleUpdate({ envVariables: updated });
								}}
								className="w-full px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-colors text-white/80"
							>
								+ Add Variable
							</button>
						</div>
					</div>
				);
			case "end": {
				const finalOutputSource =
					availableOutputs.find((i) => i.isPrimary && !!i.output) ||
					availableOutputs.filter((i) => !!i.output).slice(-1)[0] ||
					null;
				const finalOutput = finalOutputSource?.output;

				return (
					<div className="flex flex-col h-full">
						<div className="flex-1 overflow-hidden flex flex-col">
							<div
								className="overflow-auto"
								style={{ height: `${outputHeight}%` }}
							>
								<EndResponseViewer output={finalOutput} />
							</div>

							<div
								className="h-[2px] bg-white/10 cursor-row-resize transition-colors shrink-0"
								onMouseDown={(e) => {
									e.preventDefault();
									const startY = e.clientY;
									const start = outputHeight;
									const onMove = (ev: MouseEvent) => {
										const delta = ev.clientY - startY;
										const pctDelta = (delta / window.innerHeight) * 100;
										const next = Math.max(35, Math.min(80, start + pctDelta));
										setOutputHeight(next);
									};
									const onUp = () => {
										document.removeEventListener("mousemove", onMove);
										document.removeEventListener("mouseup", onUp);
									};
									document.addEventListener("mousemove", onMove);
									document.addEventListener("mouseup", onUp);
								}}
							/>

							<div
								className="overflow-auto bg-card"
								style={{ height: `${100 - outputHeight}%` }}
							>
								<div className="flex items-center gap-1 p-2 shrink-0 border-b border-white/5">
									<span className="text-xs px-2 py-0.5 rounded-md font-medium text-accent bg-accent/10">
										Console
									</span>
								</div>

								{availableOutputs.length === 0 ? (
									<div className="h-full flex items-center justify-center p-4 text-center">
										<div className="text-sm text-white/40">
											No connected nodes
										</div>
									</div>
								) : (
									<div>
										{availableOutputs.map((input) => {
											const output = input.output;
											const outputBodyString = output
												? JSON.stringify(output.body ?? null)
												: "";
											const outputBytes = outputBodyString
												? new TextEncoder().encode(outputBodyString).length
												: 0;
											const timingInfo = output?.timing || {
												total_ms: getNodeOutputDurationMs(output),
												dns_lookup_ms: 0,
												tcp_handshake_ms: 0,
												tls_handshake_ms: 0,
												ttfb_ms: getNodeOutputDurationMs(output),
												content_download_ms: 0,
											};
											const responseSize = output?.responseSize || {
												total_bytes: outputBytes,
												headers_bytes: 0,
												body_bytes: outputBytes,
											};
											const requestSize = output?.requestSize || {
												total_bytes: 0,
												headers_bytes: 0,
												body_bytes: 0,
											};

											return (
												<div
													key={input.nodeId}
													className="border-b border-white/10 overflow-hidden last:border-b-0"
												>
													<button
														type="button"
														onClick={() => {
															setExpandedOutputs((prev) => {
																const next = new Set(prev);
																if (next.has(input.nodeId)) {
																	next.delete(input.nodeId);
																} else {
																	next.add(input.nodeId);
																}
																return next;
															});
														}}
														className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-white/[0.05] transition-colors"
													>
														<div className="flex items-center gap-2 min-w-0 text-left">
															{input.method ? (
																<span
																	className="text-[10px] font-mono font-bold"
																	style={{
																		color: getMethodColor(input.method),
																	}}
																>
																	{input.method}
																</span>
															) : null}
															<span className="text-xs text-white/80 truncate">
																{input.nodeName}
															</span>
															{!output ? (
																<span className="text-[10px] text-white/35">
																	no output
																</span>
															) : null}
														</div>
														<div className="flex items-center gap-2 shrink-0">
															{output?.status !== undefined ? (
																<span className="relative group">
																	<span
																		className="text-[10px] font-bold px-2 py-0.5 rounded"
																		style={{
																			color: getStatusColor(output.status),
																			backgroundColor: `${getStatusColor(output.status)}20`,
																		}}
																	>
																		{output.status}
																	</span>
																	<span className="absolute right-0 top-full mt-1 whitespace-nowrap text-[10px] px-2 py-1 rounded bg-card border border-white/10 text-white/80 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20">
																		{output.status}{" "}
																		{STATUS_TEXT[output.status] ||
																			"Unknown Status"}
																	</span>
																</span>
															) : null}
															<VscChevronRight
																size={12}
																className={`shrink-0 text-white/40 transition-transform ${expandedOutputs.has(input.nodeId) ? "rotate-90" : ""}`}
															/>
														</div>
													</button>

													{expandedOutputs.has(input.nodeId) ? (
														<div className="border-t border-white/5 bg-black/20">
															{output ? (
																<>
																	<div className="flex items-center justify-between bg-inset border-b border-white/10 shrink-0 pr-2">
																		<div className="flex items-center gap-1">
																			<span
																				className="text-xs font-bold px-3 py-2 flex items-center gap-1.5"
																				style={{
																					color: getStatusColor(
																						output.status || 0,
																					),
																					backgroundColor: `${getStatusColor(output.status || 0)}20`,
																				}}
																			>
																				{output.status || 0}{" "}
																				{STATUS_TEXT[output.status || 0] ||
																					"Unknown"}
																			</span>
																			<button
																				type="button"
																				ref={(el) => {
																					timingRefs.current[input.nodeId] = el;
																				}}
																				onMouseEnter={() => {
																					setHoverSizeId(null);
																					setHoverTimingId(input.nodeId);
																				}}
																				onMouseLeave={() =>
																					setHoverTimingId(null)
																				}
																				className="text-[11px] text-white/50 hover:text-white/80 px-2 py-1 rounded hover:bg-white/5 transition-colors cursor-default"
																			>
																				{getNodeOutputDurationMs(output) >= 1000
																					? `${(getNodeOutputDurationMs(output) / 1000).toFixed(2)} s`
																					: `${getNodeOutputDurationMs(output).toFixed(0)} ms`}
																			</button>
																			<span className="text-white/20">•</span>
																			<button
																				type="button"
																				ref={(el) => {
																					sizeRefs.current[input.nodeId] = el;
																				}}
																				onMouseEnter={() => {
																					setHoverTimingId(null);
																					setHoverSizeId(input.nodeId);
																				}}
																				onMouseLeave={() =>
																					setHoverSizeId(null)
																				}
																				className="text-[11px] text-white/50 hover:text-white/80 px-2 py-1 rounded hover:bg-white/5 transition-colors cursor-default"
																			>
																				{formatBytes(outputBytes)}
																			</button>
																		</div>
																	</div>
																	{timingRefs.current[input.nodeId] && (
																		<TimingPopover
																			timing={timingInfo as any}
																			anchorRef={{
																				current: timingRefs.current[
																					input.nodeId
																				] as HTMLElement | null,
																			}}
																			open={hoverTimingId === input.nodeId}
																			onClose={() => setHoverTimingId(null)}
																			onMouseEnter={() =>
																				setHoverTimingId(input.nodeId)
																			}
																			onMouseLeave={() =>
																				setHoverTimingId(null)
																			}
																		/>
																	)}
																	{sizeRefs.current[input.nodeId] && (
																		<SizePopover
																			requestSize={requestSize as any}
																			responseSize={responseSize as any}
																			anchorRef={{
																				current: sizeRefs.current[
																					input.nodeId
																				] as HTMLElement | null,
																			}}
																			open={hoverSizeId === input.nodeId}
																			onClose={() => setHoverSizeId(null)}
																			onMouseEnter={() =>
																				setHoverSizeId(input.nodeId)
																			}
																			onMouseLeave={() => setHoverSizeId(null)}
																		/>
																	)}
																	<div className="max-h-[220px] overflow-auto border-t border-white/10 bg-black/20">
																		<CodeViewer
																			code={JSON.stringify(output, null, 2)}
																			language="json"
																		/>
																	</div>
																</>
															) : (
																<div className="text-xs text-white/40 p-2">
																	Run the workflow to see this node output
																</div>
															)}
														</div>
													) : null}
												</div>
											);
										})}
									</div>
								)}
							</div>
						</div>
					</div>
				);
			}
			default:
				return null;
		}
	};

	return (
		<>
			<div
				className="w-2 cursor-col-resize flex items-center justify-center shrink-0 group"
				onMouseDown={handleMouseDown}
			>
				<div
					className={`w-px h-full transition-colors ${isResizing ? "bg-accent" : "group-hover:bg-accent/50"}`}
				/>
			</div>

			<div
				ref={panelRef}
				className="flex flex-col overflow-hidden bg-inset border-l border-white/10"
				style={{ width }}
			>
				<div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 shrink-0">
					<div className="flex items-center gap-2">
						<div className={`w-2 h-2 rounded-full ${config.color}`} />
						<span className="text-xs font-medium text-white/90">
							{NODE_TITLES[nodeData.type] || "Node"}
						</span>
						<span className={`text-[10px] ${config.text}`}>{config.label}</span>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1 hover:bg-white/10 rounded transition-colors"
					>
						<VscClose size={14} className="text-white/40" />
					</button>
				</div>

				<div className="flex-1 overflow-hidden flex flex-col">
					{renderConfig()}
				</div>
			</div>
		</>
	);
}
