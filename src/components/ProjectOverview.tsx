import React, { useEffect, useMemo, useRef, useState } from "react";
import { HiChevronDown, HiChevronRight, HiTrash } from "react-icons/hi";
import type { AuthType } from "../bindings";
import { getItemConfig, RequestTypeIcon } from "../registry";
import { useProjectStore } from "../stores/projectStore";
import type {
	Folder,
	GraphQLFile,
	MQTTFile,
	Project,
	RequestFile,
	SocketIOFile,
	WebSocketFile,
} from "../types/project";
import type { WorkflowFile } from "../types/workflow";
import { hexToRgba } from "../utils/format";
import { getMethodColorTailwind } from "../utils/methodConstants";
import { generateSnippet } from "../utils/snippets";
import { CodeViewer } from "./CodeMirror";
import { AuthEditor } from "./editors/AuthEditor";
import { KeyValueTable } from "./KeyValueTable";
import {
	Dialog,
	Dropdown,
	getIconComponent,
	IconPicker,
	TabView,
	TypeLabel,
} from "./ui";

const LANGUAGES = [
	{ id: "shell", label: "Shell cURL" },
	{ id: "javascript", label: "JavaScript Fetch" },
	{ id: "python", label: "Python Requests" },
	{ id: "go", label: "Go Native" },
	{ id: "rust", label: "Rust Reqwest" },
	{ id: "java", label: "Java HttpClient" },
	{ id: "php", label: "PHP Guzzle" },
];

interface ProjectOverviewProps {
	project: Project;
	onUpdateProject: (updates: Partial<Project>) => void;
	onExport: () => void;
	onSelectRequest: (requestId: string) => void;
	onSelectWorkflow?: (workflowId: string) => void;
	onSelectWebSocket?: (webSocketId: string) => void;
	onSelectGraphQL?: (graphqlId: string) => void;
	onSelectSocketIO?: (socketIoId: string) => void;
	onSelectMqtt?: (mqttId: string) => void;
	onRunRequest?: (requestId: string) => void;
	onAddEnvironment?: (name: string) => void;
	onUpdateEnvironment?: (envId: string, name: string) => void;
	onDeleteEnvironment?: (envId: string) => void;
	onAddEnvVar?: (envId: string, key: string, value: string) => void;
	onUpdateEnvVar?: (
		envId: string,
		varId: string,
		key: string,
		value: string,
		enabled: boolean,
	) => void;
	onDeleteEnvVar?: (envId: string, varId: string) => void;
	onDeleteProject?: () => void;
	initialTab?: TabType;
	/** Item ids with active work (same as REST “Sending” shimmer): connect, GraphQL run, etc. */
	loadingItems?: ReadonlySet<string>;
}

type TabType = "overview" | "configuration" | "variables";

function collectRequests(folder: Folder): RequestFile[] {
	const results: RequestFile[] = [];
	for (const child of folder.children) {
		if (child.type === "request") {
			results.push(child);
		} else if (child.type === "folder") {
			results.push(...collectRequests(child));
		}
	}
	return results;
}

function getFirstFolderAtEachDepth(
	folder: Folder,
	depth: number = 0,
): string[] {
	const ids: string[] = [];
	for (const child of folder.children) {
		if (child.type === "folder") {
			if (depth === 0) {
				ids.push(child.id);
			}
			ids.push(...getFirstFolderAtEachDepth(child, depth + 1));
		}
	}
	return ids;
}

function getValueType(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

const RequestDetails = React.memo(function RequestDetails({
	request,
	onSelect,
	onRun,
	isFirstInGroup,
	isLastInGroup,
	isLoading,
}: {
	request: RequestFile;
	onSelect: () => void;
	onRun?: () => void;
	isFirstInGroup?: boolean;
	isLastInGroup?: boolean;
	isLoading?: boolean;
}) {
	const [expanded, setExpanded] = useState(true);

	const colors = getMethodColorTailwind(request.request.method);

	const queryParams = Object.entries(request.request.query_params);
	const body = request.request.body;
	const hasBody = body !== "None";

	let bodyProperties: [string, unknown][] = [];
	if (
		hasBody &&
		typeof body === "object" &&
		"Raw" in body &&
		body.Raw.content_type?.includes("json")
	) {
		try {
			const parsed = JSON.parse(body.Raw.content);
			if (typeof parsed === "object" && parsed !== null) {
				bodyProperties = Object.entries(parsed);
			}
		} catch {}
	}

	const selectedLanguage = useProjectStore((state) => state.selectedLanguage);
	const snippetCode = generateSnippet(selectedLanguage, request.request);

	const currentLang = useMemo(() => {
		if (selectedLanguage === "javascript") return "javascript";
		// Render Python snippets as plain text so we don't re-introduce Python editor mode
		if (selectedLanguage === "python") return "text";
		if (selectedLanguage === "go") return "go";
		if (selectedLanguage === "rust") return "rust";
		if (selectedLanguage === "java") return "java";
		if (selectedLanguage === "php") return "php";
		return "shell";
	}, [selectedLanguage]);

	const borderRadiusClasses =
		isFirstInGroup && isLastInGroup
			? "rounded-xl"
			: isFirstInGroup
				? "rounded-t-xl rounded-md"
				: isLastInGroup
					? "rounded-b-xl rounded-md"
					: "rounded-md";

	return (
		<div
			className={`group/card flex flex-col border-white/5 border-x border-b bg-white/2 first:border-t ${borderRadiusClasses} relative overflow-hidden transition-all hover:bg-white/4 ${isLoading ? "shimmer-loading opacity-80" : ""}`}
		>
			{isLoading ? (
				<div className="absolute inset-0 z-10 bg-background/30" aria-hidden />
			) : null}
			<div
				className={`absolute top-0 bottom-0 left-0 w-1 ${colors.bg.replace("/10", "/40")} `}
			/>

			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex h-10 w-full cursor-pointer items-stretch overflow-hidden text-left"
			>
				<div
					className={`flex items-center justify-start px-4 ${colors.bg} ${colors.text} min-w-[69px] shrink-0 transition-colors`}
				>
					<span className="text-left font-mono font-semibold text-xs">
						{request.request.method}
					</span>
				</div>
				<div className="flex min-w-0 flex-1 items-center justify-between px-4">
					<div className="flex flex-col">
						<span className="truncate font-semibold text-sm text-white/90">
							{request.name}
						</span>
					</div>
					<div className="ml-4 flex shrink-0 items-center gap-3">
						<span className="max-w-[200px] truncate font-mono text-[10px] text-white/40 transition-colors group-hover/card:text-white/60">
							{request.request.url || "/"}
						</span>
						{expanded ? (
							<HiChevronDown
								size={14}
								className="text-white/20 transition-colors group-hover/card:text-white/50"
							/>
						) : (
							<HiChevronRight
								size={14}
								className="text-white/20 transition-colors group-hover/card:text-white/50"
							/>
						)}
					</div>
				</div>
			</button>

			{expanded && (
				<div className="border-white/5 border-t bg-white/1">
					<div className="flex flex-col md:flex-row">
						<div className="flex flex-1 flex-col space-y-4 border-white/5 border-b p-4 md:border-r md:border-b-0">
							<div className="flex-1 space-y-8">
								<div className="flex-1 space-y-2">
									<h3 className="font-bold text-white text-xl">
										{request.name}
									</h3>
									<p className="text-sm text-white/50 italic">
										{request.description || "No description"}
									</p>
								</div>
								{queryParams.length > 0 && (
									<div>
										<h4 className="mb-2 font-semibold text-white/70 text-xs">
											Query Parameters
										</h4>
										<div className="space-y-1.5 font-mono">
											{queryParams.map(([key, value]) => (
												<div key={key} className="flex items-baseline gap-2">
													<span className="font-medium text-sm text-white/90">
														{key}
													</span>
													<span className="text-[10px] text-blue-400">
														string
													</span>
													<span className="truncate text-[10px] text-white/40">
														{value || "—"}
													</span>
												</div>
											))}
										</div>
									</div>
								)}
								{bodyProperties.length > 0 && (
									<div>
										<h4 className="mb-2 font-semibold text-white/70 text-xs">
											Request Body
										</h4>
										<div className="space-y-1.5 font-mono">
											{bodyProperties.map(([key, value]) => (
												<div key={key} className="flex items-baseline gap-2">
													<span className="font-medium text-sm text-white/90">
														{key}
													</span>
													<TypeLabel type={getValueType(value)} />
												</div>
											))}
										</div>
									</div>
								)}
							</div>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onSelect();
								}}
								className="cursor-pointer pt-2 text-left font-medium text-accent text-xs hover:text-accent/80"
							>
								Open Request →
							</button>
						</div>
						<div className="relative flex min-h-[200px] flex-1 flex-col">
							<div className="absolute inset-0 overflow-auto">
								<CodeViewer code={snippetCode} language={currentLang} />
							</div>
							{onRun && (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onRun();
									}}
									className="absolute right-3 bottom-3 z-10 cursor-pointer rounded-lg bg-accent px-4 py-1.5 font-semibold text-background text-xs transition-colors hover:bg-accent/90"
								>
									Run
								</button>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
});

type ProtocolOverviewItem =
	| WebSocketFile
	| GraphQLFile
	| SocketIOFile
	| MQTTFile;

/** WebSocket / GraphQL / Socket.IO / MQTT — same chrome as workflow cards in project overview. */
const ProtocolOverviewCard = React.memo(function ProtocolOverviewCard({
	item,
	onSelect,
	isFirstInGroup,
	isLastInGroup,
	isLoading,
}: {
	item: ProtocolOverviewItem;
	onSelect: () => void;
	isFirstInGroup?: boolean;
	isLastInGroup?: boolean;
	isLoading?: boolean;
}) {
	const borderRadiusClasses =
		isFirstInGroup && isLastInGroup
			? "rounded-xl"
			: isFirstInGroup
				? "rounded-t-xl rounded-md"
				: isLastInGroup
					? "rounded-b-xl rounded-md"
					: "rounded-md";

	const cfg = getItemConfig(item.type);

	return (
		<div
			className={`group/card flex flex-col border-white/5 border-x border-b bg-white/2 first:border-t ${borderRadiusClasses} relative overflow-hidden transition-all hover:bg-white/4 ${isLoading ? "shimmer-loading opacity-80" : ""}`}
		>
			{isLoading ? (
				<div className="absolute inset-0 z-10 bg-background/30" aria-hidden />
			) : null}
			<div
				className={`absolute top-0 bottom-0 left-0 w-1 ${cfg.overviewStripeClass ?? ""}`}
			/>
			<div className="flex h-10 w-full items-stretch">
				<div
					className={`flex min-w-[69px] shrink-0 items-center justify-center px-4 ${cfg.overviewSidebarCellClass ?? ""}`}
				>
					<RequestTypeIcon type={item.type} size={18} />
				</div>
				<div className="flex min-w-0 flex-1 items-center justify-between px-4">
					<span className="truncate font-semibold text-sm text-white/90">
						{item.name}
					</span>
					<div className="ml-4 flex shrink-0 items-center gap-3">
						<span className="max-w-[200px] truncate font-mono text-[10px] text-white/40 transition-colors group-hover/card:text-white/60">
							{item.url || "/"}
						</span>
					</div>
				</div>
			</div>
			<div className="flex items-center justify-between gap-4 border-white/5 border-t bg-white/1 px-4 py-3">
				<p className="min-w-0 text-sm text-white/40 italic">
					{item.description || "No description"}
				</p>
				<button
					type="button"
					onClick={onSelect}
					className="shrink-0 cursor-pointer text-left font-medium text-accent text-xs hover:text-accent/80"
				>
					{`Open ${cfg.label} →`}
				</button>
			</div>
		</div>
	);
});

const WorkflowCard = React.memo(function WorkflowCard({
	workflow,
	onSelect,
	isFirstInGroup,
	isLastInGroup,
}: {
	workflow: WorkflowFile;
	onSelect: () => void;
	isFirstInGroup?: boolean;
	isLastInGroup?: boolean;
}) {
	const borderRadiusClasses =
		isFirstInGroup && isLastInGroup
			? "rounded-xl"
			: isFirstInGroup
				? "rounded-t-xl rounded-md"
				: isLastInGroup
					? "rounded-b-xl rounded-md"
					: "rounded-md";

	const nodeCount = workflow.nodes?.length ?? 0;
	const wfCfg = getItemConfig("workflow");

	return (
		<div
			className={`group/card flex flex-col border-white/5 border-x border-b bg-white/2 first:border-t ${borderRadiusClasses} relative overflow-hidden transition-all hover:bg-white/4`}
		>
			<div
				className={`absolute top-0 bottom-0 left-0 w-1 ${wfCfg.overviewStripeClass ?? ""}`}
			/>
			<div className="flex h-10 w-full items-stretch">
				<div
					className={`flex min-w-[69px] shrink-0 items-center justify-center px-4 ${wfCfg.overviewSidebarCellClass ?? ""}`}
				>
					<RequestTypeIcon type="workflow" size={18} />
				</div>
				<div className="flex min-w-0 flex-1 items-center justify-between px-4">
					<span className="truncate font-semibold text-sm text-white/90">
						{workflow.name}
					</span>
					<div className="ml-4 flex shrink-0 items-center gap-3">
						<span className="font-mono text-[10px] text-white/40">
							{nodeCount} node{nodeCount !== 1 ? "s" : ""}
						</span>
					</div>
				</div>
			</div>
			<div className="flex items-center justify-between border-white/5 border-t bg-white/1 px-4 py-3">
				<p className="text-sm text-white/40 italic">
					{workflow.description || "No description"}
				</p>
				<button
					type="button"
					onClick={onSelect}
					className="ml-4 shrink-0 cursor-pointer text-left font-medium text-accent text-xs hover:text-accent/80"
				>
					Open Workflow →
				</button>
			</div>
		</div>
	);
});

const FolderSection = React.memo(function FolderSection({
	folder,
	depth = 0,
	expandedIds,
	toggleFolder,
	onSelectRequest,
	onSelectWorkflow,
	onSelectWebSocket,
	onSelectGraphQL,
	onSelectSocketIO,
	onSelectMqtt,
	onRunRequest,
	loadingItems,
}: {
	folder: Folder;
	depth?: number;
	expandedIds: Set<string>;
	toggleFolder: (id: string) => void;
	onSelectRequest: (id: string) => void;
	onSelectWorkflow?: (id: string) => void;
	onSelectWebSocket?: (id: string) => void;
	onSelectGraphQL?: (id: string) => void;
	onSelectSocketIO?: (id: string) => void;
	onSelectMqtt?: (id: string) => void;
	onRunRequest?: (id: string) => void;
	loadingItems?: ReadonlySet<string>;
}) {
	const isExpanded = expandedIds.has(folder.id);

	return (
		<div className="w-full">
			<button
				type="button"
				onClick={() => toggleFolder(folder.id)}
				className="group mt-3 mb-1 flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left transition-colors hover:bg-white/5"
			>
				{isExpanded ? (
					<HiChevronDown
						size={14}
						className="shrink-0 text-white/20 group-hover:text-white/40"
					/>
				) : (
					<HiChevronRight
						size={14}
						className="shrink-0 text-white/20 group-hover:text-white/40"
					/>
				)}
				<span className="truncate font-medium text-white/50 text-xs group-hover:text-white/70">
					{depth === 0 ? "/ (root)" : folder.name}
				</span>
				<span className="ml-auto shrink-0 pr-1 font-medium text-[10px] text-white/20 group-hover:text-white/40">
					{folder.children.length}
				</span>
			</button>

			{isExpanded && (
				<div
					className={`flex flex-col gap-2 ${depth > 0 ? "mt-1 mb-1 ml-3 border-white/10 border-l pl-4" : ""}`}
				>
					{folder.children.map((child, index) => {
						if (child.type === "folder") {
							return (
								<FolderSection
									key={child.id}
									folder={child}
									depth={depth + 1}
									expandedIds={expandedIds}
									toggleFolder={toggleFolder}
									onSelectRequest={onSelectRequest}
									onSelectWorkflow={onSelectWorkflow}
									onSelectWebSocket={onSelectWebSocket}
									onSelectGraphQL={onSelectGraphQL}
									onSelectSocketIO={onSelectSocketIO}
									onSelectMqtt={onSelectMqtt}
									onRunRequest={onRunRequest}
									loadingItems={loadingItems}
								/>
							);
						}

						if (child.type === "workflow") {
							const prev = folder.children[index - 1];
							const next = folder.children[index + 1];
							return (
								<WorkflowCard
									key={child.id}
									workflow={child}
									onSelect={() => onSelectWorkflow?.(child.id)}
									isFirstInGroup={!prev || prev.type !== "workflow"}
									isLastInGroup={!next || next.type !== "workflow"}
								/>
							);
						}

						if (
							child.type === "websocket" ||
							child.type === "graphql" ||
							child.type === "socketio" ||
							child.type === "mqtt"
						) {
							const prev = folder.children[index - 1];
							const next = folder.children[index + 1];
							const t = child.type;
							const onSelect =
								t === "websocket"
									? () => onSelectWebSocket?.(child.id)
									: t === "graphql"
										? () => onSelectGraphQL?.(child.id)
										: t === "socketio"
											? () => onSelectSocketIO?.(child.id)
											: () => onSelectMqtt?.(child.id);
							return (
								<ProtocolOverviewCard
									key={child.id}
									item={child}
									onSelect={onSelect}
									isFirstInGroup={!prev || prev.type !== t}
									isLastInGroup={!next || next.type !== t}
									isLoading={loadingItems?.has(child.id)}
								/>
							);
						}

						if (child.type !== "request") {
							return null;
						}

						const prev = folder.children[index - 1];
						const next = folder.children[index + 1];
						const isFirstInGroup = !prev || prev.type !== "request";
						const isLastInGroup = !next || next.type !== "request";

						return (
							<RequestDetails
								key={child.id}
								request={child}
								onSelect={() => onSelectRequest(child.id)}
								onRun={onRunRequest ? () => onRunRequest(child.id) : undefined}
								isFirstInGroup={isFirstInGroup}
								isLastInGroup={isLastInGroup}
								isLoading={loadingItems?.has(child.id)}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
});

export function ProjectOverview({
	project,
	onUpdateProject,
	onExport,
	onSelectRequest,
	onSelectWorkflow,
	onSelectWebSocket,
	onSelectGraphQL,
	onSelectSocketIO,
	onSelectMqtt,
	onRunRequest,
	onAddEnvironment,
	onUpdateEnvironment,
	onDeleteEnvironment,
	onAddEnvVar,
	onUpdateEnvVar,
	onDeleteEnvVar,
	onDeleteProject,
	initialTab = "overview",
	loadingItems,
}: ProjectOverviewProps) {
	const [activeTab, setActiveTab] = useState<TabType>(initialTab);

	useEffect(() => {
		setActiveTab(initialTab);
	}, [initialTab]);
	const [editingName, setEditingName] = useState(false);
	const [editingDescription, setEditingDescription] = useState(false);
	useEffect(() => {
		setName(project.name);
	}, [project.name]);

	useEffect(() => {
		setDescription(project.description || "");
	}, [project.description]);

	useEffect(() => {
		setBaseUrl(project.baseUrl || "");
	}, [project.baseUrl]);

	const [name, setName] = useState(project.name);
	const [description, setDescription] = useState(project.description || "");
	const allRequests = useMemo(
		() => collectRequests(project.root),
		[project.root],
	);
	const [expandedIds, setExpandedIds] = useState<Set<string>>(
		new Set([project.root.id, ...getFirstFolderAtEachDepth(project.root)]),
	);
	const [baseUrl, setBaseUrl] = useState(project.baseUrl || "");
	const [showIconPicker, setShowIconPicker] = useState(false);
	const [showLangDropdown, setShowLangDropdown] = useState(false);
	const [newEnvName, setNewEnvName] = useState("");
	const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
	const [editingEnvName, setEditingEnvName] = useState("");
	const [expandedEnvId, setExpandedEnvId] = useState<string | null>(
		project.activeEnvironmentId,
	);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [isLangSelectorSticky, setIsLangSelectorSticky] = useState(false);
	const iconButtonRef = useRef<HTMLButtonElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const langSelectorRef = useRef<HTMLDivElement>(null);

	const selectedLanguage = useProjectStore((state) => state.selectedLanguage);
	const setSelectedLanguage = useProjectStore(
		(state) => state.setSelectedLanguage,
	);

	useEffect(() => {
		const scrollContainer = scrollContainerRef.current;
		const langSelector = langSelectorRef.current;
		if (!scrollContainer || !langSelector) return;

		const handleScroll = () => {
			const rect = langSelector.getBoundingClientRect();
			const containerRect = scrollContainer.getBoundingClientRect();

			// If selector top is above container top + header height, show sticky
			const isHidden = rect.top < containerRect.top + 10;
			setIsLangSelectorSticky(isHidden);
		};

		scrollContainer.addEventListener("scroll", handleScroll);
		return () => scrollContainer.removeEventListener("scroll", handleScroll);
	}, []);

	const handleNameBlur = () => {
		setEditingName(false);
		if (name.trim() && name !== project.name) {
			onUpdateProject({ name: name.trim() });
		} else {
			setName(project.name);
		}
	};

	const handleDescriptionBlur = () => {
		setEditingDescription(false);
		if (description !== (project.description || "")) {
			onUpdateProject({ description: description || undefined });
		}
	};

	const toggleFolder = (id: string) => {
		const newExpanded = new Set(expandedIds);
		if (newExpanded.has(id)) {
			newExpanded.delete(id);
		} else {
			newExpanded.add(id);
		}
		setExpandedIds(newExpanded);
	};

	const handleAddEnv = () => {
		if (newEnvName.trim() && onAddEnvironment) {
			onAddEnvironment(newEnvName.trim());
			setNewEnvName("");
		}
	};

	const handleEnvRename = (envId: string) => {
		if (editingEnvName.trim() && onUpdateEnvironment) {
			onUpdateEnvironment(envId, editingEnvName.trim());
		}
		setEditingEnvId(null);
		setEditingEnvName("");
	};

	const IconComponent = getIconComponent(project.icon);

	const tabs = [
		{ id: "overview", label: "Overview" },
		{ id: "configuration", label: "Config" },
		{ id: "variables", label: "Variables" },
	];

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div>
				<div
					className="flex items-center gap-4 border-white/5 border-b p-4 pb-3"
					data-tauri-drag-region
				>
					<button
						type="button"
						ref={iconButtonRef}
						onClick={() => setShowIconPicker(true)}
						className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg transition-colors"
						style={{
							color: project.iconColor || "rgba(255, 255, 255, 0.6)",
							backgroundColor: project.iconColor
								? hexToRgba(project.iconColor, 0.05)
								: "rgba(255, 255, 255, 0.05)",
						}}
					>
						<IconComponent size={24} />
					</button>

					<div className="min-w-0 flex-1">
						<h1 className="font-semibold">{project.name}</h1>
					</div>

					<div className="flex items-center gap-2">
						<div
							className={`relative origin-right transition-all duration-300 ease-out ${
								isLangSelectorSticky
									? "w-auto scale-100 opacity-100"
									: "w-0 scale-95 overflow-hidden opacity-0"
							}`}
						>
							<button
								type="button"
								onClick={() => setShowLangDropdown(!showLangDropdown)}
								className="group flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-white/50 text-xs transition-all hover:bg-white/5 hover:text-white/90"
							>
								<span>
									{LANGUAGES.find((l) => l.id === selectedLanguage)?.label}
								</span>
								<HiChevronDown
									size={14}
									className="mt-0.5 text-white/20 transition-colors group-hover:text-white/40"
								/>
							</button>
							{showLangDropdown && (
								<Dropdown
									className="top-full right-0 mt-1"
									onClose={() => setShowLangDropdown(false)}
									width="min-w-[180px]"
									items={LANGUAGES.map((lang) => ({
										label: lang.label,
										active: selectedLanguage === lang.id,
										onClick: () => setSelectedLanguage(lang.id),
									}))}
								/>
							)}
						</div>
						<button
							type="button"
							onClick={onExport}
							className="cursor-pointer rounded-lg bg-white/5 px-3 py-1.5 font-medium text-white/60 text-xs transition-colors hover:bg-white/10 hover:text-white"
						>
							Export
						</button>
					</div>
				</div>

				<div className="my-3 px-4">
					<TabView
						tabs={tabs}
						activeTab={activeTab}
						onTabChange={(id) => setActiveTab(id as TabType)}
						variant="pill"
						size="sm"
					/>
				</div>
			</div>

			<IconPicker
				selectedIcon={project.icon}
				onSelect={(icon) => {
					onUpdateProject({ icon });
				}}
				selectedColor={project.iconColor}
				onSelectColor={(iconColor) => {
					onUpdateProject({ iconColor });
				}}
				isOpen={showIconPicker}
				onClose={() => setShowIconPicker(false)}
				anchorRef={iconButtonRef}
			/>

			<div className="flex-1 overflow-y-auto p-6" ref={scrollContainerRef}>
				{activeTab === "overview" && (
					<div className="space-y-6 p-3">
						<div className="flex items-start justify-between">
							<div className="min-w-0 flex-1">
								{editingName ? (
									<input
										className="w-full border-none bg-transparent font-bold text-2xl text-white outline-none"
										value={name}
										onChange={(e) => setName(e.target.value)}
										onBlur={handleNameBlur}
										onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
									/>
								) : (
									<h1
										className="cursor-text font-bold text-2xl text-white hover:text-white/90"
										onClick={() => setEditingName(true)}
									>
										{project.name}
									</h1>
								)}

								{editingDescription ? (
									<textarea
										className="mt-2 w-full resize-none border-none bg-transparent text-sm text-white/50 outline-none"
										value={description}
										onChange={(e) => setDescription(e.target.value)}
										onBlur={handleDescriptionBlur}
										onKeyDown={(e) => {
											if (e.key === "Enter" && !e.shiftKey) {
												e.preventDefault();
												handleDescriptionBlur();
											}
										}}
										placeholder="Add a description..."
										rows={description.split("\n").length || 1}
									/>
								) : (
									<p
										className="mt-2 cursor-text whitespace-pre-wrap text-sm text-white/40 hover:text-white/60"
										onClick={() => setEditingDescription(true)}
									>
										{project.description || "Add a description..."}
									</p>
								)}
							</div>

							<div
								className={`relative flex shrink-0 flex-col items-end transition-all duration-300 ease-out ${
									isLangSelectorSticky
										? "pointer-events-none opacity-0"
										: "opacity-100"
								}`}
								ref={langSelectorRef}
							>
								<button
									type="button"
									onClick={() => setShowLangDropdown(!showLangDropdown)}
									className="group flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-white/50 text-xs transition-all hover:bg-white/5 hover:text-white/90"
								>
									<span>
										{LANGUAGES.find((l) => l.id === selectedLanguage)?.label}
									</span>
									<HiChevronDown
										size={14}
										className="mt-0.5 text-white/20 transition-colors group-hover:text-white/40"
									/>
								</button>
								{showLangDropdown && (
									<Dropdown
										className="top-full right-0 mt-1"
										onClose={() => setShowLangDropdown(false)}
										width="min-w-[180px]"
										items={LANGUAGES.map((lang) => ({
											label: lang.label,
											active: selectedLanguage === lang.id,
											onClick: () => setSelectedLanguage(lang.id),
										}))}
									/>
								)}
							</div>
						</div>

						<div className="space-y-4">
							<FolderSection
								folder={project.root}
								depth={0}
								expandedIds={expandedIds}
								toggleFolder={toggleFolder}
								onSelectRequest={onSelectRequest}
								onSelectWorkflow={onSelectWorkflow}
								onSelectWebSocket={onSelectWebSocket}
								onSelectGraphQL={onSelectGraphQL}
								onSelectSocketIO={onSelectSocketIO}
								onSelectMqtt={onSelectMqtt}
								onRunRequest={onRunRequest}
								loadingItems={loadingItems}
							/>

							{allRequests.length === 0 && (
								<div className="py-12 text-center text-sm text-white/30">
									No requests yet. Create one to get started.
								</div>
							)}
						</div>
					</div>
				)}

				{activeTab === "configuration" && (
					<div className="max-w-xl space-y-6">
						<div>
							<label className="mb-2 block font-medium text-white/50 text-xs">
								Base URL
							</label>
							<input
								type="text"
								value={baseUrl}
								onChange={(e) => setBaseUrl(e.target.value)}
								onBlur={() => onUpdateProject({ baseUrl })}
								placeholder="https://api.example.com"
								className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-accent/50 focus:outline-none"
							/>
							<p className="mt-1 text-[10px] text-white/30">
								Prepended to relative URLs
							</p>
						</div>

						<div className="border-white/5 border-t pt-6">
							<label className="mb-2 block font-medium text-white/50 text-xs">
								Project Authorization
							</label>
							<p className="mb-4 text-[10px] text-white/30">
								Set default authorization for all requests in this project.
								Requests can inherit this auth or override it with their own.
							</p>
							<div className="overflow-hidden rounded-xl border border-white/10 bg-white/2">
								<AuthEditor
									auth={project.authorization || "None"}
									onChange={(auth: AuthType) =>
										onUpdateProject({ authorization: auth })
									}
									isProject={true}
									availableVariables={
										project.environments
											.find((e) => e.id === project.activeEnvironmentId)
											?.variables.map((v) => v.key) || []
									}
								/>
							</div>
						</div>

						<div className="border-white/5 border-t pt-6">
							<h3 className="mb-1 font-semibold text-sm text-white">
								Danger Zone
							</h3>
							<p className="mb-4 text-white/30 text-xs">
								Once you delete a project, there is no going back. Please be
								certain.
							</p>
							<button
								type="button"
								onClick={() => setShowDeleteConfirm(true)}
								className="cursor-pointer rounded-lg border border-red/20 bg-red/10 px-4 py-2 font-semibold text-red text-xs transition-all hover:bg-red/20"
							>
								Delete Project
							</button>
						</div>
					</div>
				)}

				{activeTab === "variables" && (
					<div className="space-y-4">
						<div className="flex w-full gap-2">
							<input
								type="text"
								value={newEnvName}
								onChange={(e) => setNewEnvName(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && handleAddEnv()}
								placeholder="Add new environment..."
								className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-accent/50 focus:outline-none"
							/>
							<button
								type="button"
								onClick={handleAddEnv}
								disabled={!newEnvName.trim()}
								className="cursor-pointer rounded-full bg-accent px-6 py-2.5 font-bold text-background text-sm transition-all hover:bg-accent/90 disabled:opacity-50"
							>
								Create
							</button>
						</div>

						<div className="space-y-2">
							{project.environments.map((env) => (
								<div
									key={env.id}
									className={`overflow-hidden rounded-xl border transition-all ${env.id === project.activeEnvironmentId ? "border-accent/30" : "border-white/10"}`}
								>
									<div
										className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors ${env.id === project.activeEnvironmentId ? "bg-accent/5" : "hover:bg-white/5"}`}
										onClick={() =>
											setExpandedEnvId(expandedEnvId === env.id ? null : env.id)
										}
									>
										<span
											className={`w-4 text-[10px] ${env.id === project.activeEnvironmentId ? "text-accent" : "text-white/30"}`}
										>
											{expandedEnvId === env.id ? "▼" : "▶"}
										</span>

										<input
											type="text"
											value={
												editingEnvId === env.id ? editingEnvName : env.name
											}
											onClick={(e) => e.stopPropagation()}
											onChange={(e) => {
												if (editingEnvId === env.id) {
													setEditingEnvName(e.target.value);
												} else {
													setEditingEnvId(env.id);
													setEditingEnvName(e.target.value);
												}
											}}
											onBlur={() => handleEnvRename(env.id)}
											onKeyDown={(e) =>
												e.key === "Enter" && handleEnvRename(env.id)
											}
											className={`flex-1 rounded border-none bg-transparent px-1 py-0.5 text-sm transition-colors focus:bg-white/5 focus:outline-none ${env.id === project.activeEnvironmentId ? "font-semibold text-accent" : "text-white/70"}`}
										/>

										<span
											className={`mr-auto ml-1 font-medium text-xs ${env.id === project.activeEnvironmentId ? "text-accent/60" : "text-white/20"}`}
										>
											({env.variables.length})
										</span>

										<div
											className="flex items-center gap-2"
											onClick={(e) => e.stopPropagation()}
										>
											<button
												type="button"
												onClick={() => onDeleteEnvironment?.(env.id)}
												disabled={project.environments.length <= 1}
												className="cursor-pointer rounded p-1.5 text-white/20 transition-colors hover:bg-red/10 hover:text-red disabled:cursor-not-allowed disabled:opacity-30"
											>
												<HiTrash size={14} />
											</button>
										</div>
									</div>

									{expandedEnvId === env.id && (
										<div className="border-white/5 border-t">
											<KeyValueTable
												items={env.variables
													.filter((v) => v.key.trim() || v.value.trim())
													.map((v) => ({
														id: v.id,
														key: v.key,
														value: v.value,
														description: "",
														enabled: v.enabled !== false,
													}))}
												onChange={(items) => {
													const validItems = items.filter(
														(i) => i.key.trim() || i.value.trim(),
													);
													const existingIds = new Set(
														env.variables.map((v) => v.id),
													);
													const newIds = new Set(validItems.map((i) => i.id));

													env.variables.forEach((v) => {
														if (!newIds.has(v.id))
															onDeleteEnvVar?.(env.id, v.id);
													});

													validItems.forEach((i) => {
														if (existingIds.has(i.id)) {
															const old = env.variables.find(
																(v) => v.id === i.id,
															);
															if (
																old &&
																(old.key !== i.key ||
																	old.value !== i.value ||
																	old.enabled !== i.enabled)
															) {
																onUpdateEnvVar?.(
																	env.id,
																	i.id,
																	i.key,
																	i.value,
																	i.enabled,
																);
															}
														} else {
															onAddEnvVar?.(env.id, i.key, i.value);
														}
													});
												}}
												showDescription={false}
												placeholder={{ key: "VARIABLE_NAME", value: "value" }}
											/>
										</div>
									)}
								</div>
							))}
							{project.environments.length === 0 && (
								<div className="rounded-lg border border-white/10 border-dashed py-12 text-center text-sm text-white/20">
									No environments defined. Add one above.
								</div>
							)}
						</div>
					</div>
				)}
			</div>

			<Dialog
				isOpen={showDeleteConfirm}
				title="Delete Project"
				description={`Are you sure you want to delete "${project.name}" ? All requests, folders, and environments will be permanently removed. This action cannot be undone.`}
				confirmLabel="Delete Project"
				isDestructive
				onConfirm={() => {
					onDeleteProject?.();
					setShowDeleteConfirm(false);
				}}
				onCancel={() => setShowDeleteConfirm(false)}
			/>
		</div>
	);
}
