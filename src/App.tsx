import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { TbLayoutSidebar } from "react-icons/tb";
import type { Cookie } from "./bindings";
import {
	RestRequestEditor,
	type RestRequestEditorHandle,
} from "./components/editors/RestRequestEditor";
import { ProjectOverview } from "./components/ProjectOverview";
import { Sidebar } from "./components/Sidebar";
import {
	Dialog,
	Dropdown,
	ExportModal,
	ImportModal,
	Logo,
	NewProjectModal,
	ToastContainer,
} from "./components/ui";
import { WelcomePage } from "./components/WelcomePage";
import { WorkflowEditor } from "./components/workflow/WorkflowEditor";
import {
	isLegacyProject,
	mandyFileBackupPath,
	parseMandyJsonWithMigration,
	projectNeedsMigration,
} from "./migration";
import { shutdownAllRealtimeTransports } from "./realtime/globalRealtimeBridge";
import {
	isProtocolRequestItem,
	renderProtocolEditor,
} from "./registry/editorViews";
import { sendRequest } from "./reqhelpers/rest";
import { useProjectStore } from "./stores/projectStore";
import { useToastStore } from "./stores/toastStore";
import type { RequestItem, RequestType, TreeItem } from "./types/project";
import type {
	NodeOutput,
	RequestOverrides,
	WorkflowExecutionContext,
} from "./types/workflow";
import { getErrorMessage } from "./utils/errorHelpers";
import {
	exportToMandyJSON,
	generateInsomniaExport,
	generateOpenAPISpec,
	generatePostmanCollection,
	parseInsomniaExport,
	parseMandyJSON,
	parseOpenAPISpec,
	parsePostmanCollection,
} from "./utils/migration";
import { isMac } from "./utils/platform";
import { findRequestFileById } from "./utils/projectTree";
import { playSuccessChime } from "./utils/sounds";
import "./App.css";

function App() {
	const {
		projects,
		activeItemId,
		setActiveItem,
		selectProject,
		createProject,
		createProjectFromImport,
		importToFolder,
		processItemForSecrets,
		renameProject,
		updateProjectIcon,
		updateProjectIconColor,
		deleteProject,
		updateProjectConfig,
		setActiveEnvironment,
		addEnvironment,
		updateEnvironment,
		deleteEnvironment,
		addEnvironmentVariable,
		updateEnvironmentVariable,
		deleteEnvironmentVariable,
		resolveVariables,
		getActiveEnvironmentVariables,
		addItem,
		addFolder,
		renameItem,
		deleteItem,
		duplicateItem,
		toggleFolder,
		sortFolder,
		moveItem,
		updateItem,
		setRequestResponse,
		clipboard,
		copyToClipboard,
		cutToClipboard,
		pasteItem,
		selectedItemId,
		setSelectedItem,
		openItemById,
		migrateLegacyProjects,
	} = useProjectStore();

	const activeProject = useProjectStore(
		(state) =>
			state.projects.find((p) => p.id === state.activeProjectId) || null,
	);

	const activeItem = useProjectStore((state) => {
		const project = state.projects.find((p) => p.id === state.activeProjectId);
		if (!project || !state.activeItemId) return null;

		const walk = (root: { id: string; children?: unknown[] }): unknown => {
			if (root.id === state.activeItemId) return root;
			const children = root.children;
			if (!children) return null;
			for (const child of children as {
				id: string;
				type: string;
				children?: unknown[];
			}[]) {
				if (child.id === state.activeItemId) return child;
				if (child.type === "folder") {
					const found = walk(child);
					if (found) return found;
				}
			}
			return null;
		};

		return walk(project.root) as RequestItem | null;
	});

	const activeRequest = activeItem?.type === "request" ? activeItem : null;
	const activeWorkflow = activeItem?.type === "workflow" ? activeItem : null;
	const activeGraphQL = activeItem?.type === "graphql" ? activeItem : null;

	const { addToast } = useToastStore();

	const [schemaMigrationGateOpen, setSchemaMigrationGateOpen] = useState(false);
	const [schemaMigrationError, setSchemaMigrationError] = useState<
		string | null
	>(null);

	const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
	const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
	const startLoading = useCallback((id: string) => {
		setLoadingItems((prev) => new Set(prev).add(id));
	}, []);
	const stopLoading = useCallback((id: string) => {
		setLoadingItems((prev) => {
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	}, []);

	const handleTreeItemSelect = useCallback(
		(id: string, type: TreeItem["type"]) => {
			setSelectedItem(id);
			if (type !== "folder") {
				setActiveItem(id);
				setShowProjectOverview(false);
			}
		},
		[setSelectedItem, setActiveItem],
	);

	const openItemFromProjectOverview = useCallback(
		(id: string) => {
			openItemById(id);
			setShowProjectOverview(false);
		},
		[openItemById],
	);

	const loading = activeRequest ? loadingItems.has(activeRequest.id) : false;
	const restEditorRef = useRef<RestRequestEditorHandle>(null);

	const [sidebarWidth, setSidebarWidth] = useState(260);
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
	const [isPeeking, setIsPeeking] = useState(false);

	const [showProjectDropdown, setShowProjectDropdown] = useState(false);
	const [showEnvDropdown, setShowEnvDropdown] = useState(false);

	const [showProjectOverview, setShowProjectOverview] = useState(false);
	const [projectOverviewTab, setProjectOverviewTab] = useState<
		"overview" | "configuration" | "variables"
	>("overview");
	const [showImportModal, setShowImportModal] = useState(false);
	const [showExportModal, setShowExportModal] = useState(false);
	const [showNewProjectModal, setShowNewProjectModal] = useState(false);
	const [itemToDelete, setItemToDelete] = useState<string | null>(null);
	const [isWorkflowRunning, setIsWorkflowRunning] = useState(false);

	const pendingUpdateRef = useRef<Update | null>(null);
	/** Set when `check()` finds a newer version; header chip + optional install dialog. */
	const [updateAvailable, setUpdateAvailable] = useState<{
		version: string;
		body?: string;
	} | null>(null);
	const [updateModal, setUpdateModal] = useState<{
		open: boolean;
		installing: boolean;
	}>({ open: false, installing: false });

	const handleWelcomeNewItem = useCallback(
		(type: RequestType) => {
			if (activeProject) {
				addItem(type, activeProject.root.id);
			} else {
				setShowNewProjectModal(true);
			}
		},
		[activeProject, addItem],
	);

	useEffect(() => {
		const openGateIfNeeded = () => {
			if (projectNeedsMigration(useProjectStore.getState().projects)) {
				setSchemaMigrationGateOpen(true);
			}
		};
		if (useProjectStore.persist.hasHydrated()) {
			openGateIfNeeded();
		}
		return useProjectStore.persist.onFinishHydration(() => {
			openGateIfNeeded();
		});
	}, []);

	useEffect(() => {
		if (!import.meta.env.PROD) return;

		let cancelled = false;
		const timer = window.setTimeout(() => {
			void (async () => {
				try {
					const { check } = await import("@tauri-apps/plugin-updater");
					const update = await check();
					if (cancelled || !update) return;
					pendingUpdateRef.current = update;
					setUpdateAvailable({
						version: update.version,
						body: update.body,
					});
				} catch {
					/* Web preview, offline, or updater unavailable */
				}
			})();
		}, 5000);

		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, []);

	useEffect(() => {
		const onPageHide = () => {
			void shutdownAllRealtimeTransports();
		};
		window.addEventListener("pagehide", onPageHide);

		let unlistenClose: (() => void) | undefined;
		void (async () => {
			try {
				const { getCurrentWindow } = await import("@tauri-apps/api/window");
				unlistenClose = await getCurrentWindow().onCloseRequested(() => {
					void shutdownAllRealtimeTransports();
				});
			} catch {
				/* Vite / non-Tauri */
			}
		})();

		return () => {
			window.removeEventListener("pagehide", onPageHide);
			unlistenClose?.();
		};
	}, []);

	const handleWorkspaceSchemaMigration = useCallback(() => {
		setSchemaMigrationError(null);
		const ok = migrateLegacyProjects();
		if (ok) {
			setSchemaMigrationGateOpen(false);
		} else {
			setSchemaMigrationError(
				"Migration failed for one or more projects. Your original data is unchanged.",
			);
		}
	}, [migrateLegacyProjects]);

	// Handle opening .mandy.json files
	useEffect(() => {
		const unlistenPromise = listen<string>("open-mandy-file", async (event) => {
			try {
				const filePath = event.payload;
				const content = await readTextFile(filePath);
				const parsed = parseMandyJsonWithMigration(content, {
					preserveStructureIds: true,
				});
				if (!parsed) {
					addToast("Invalid Mandy project file", "error");
					return;
				}
				if (parsed.wasLegacyFormat) {
					try {
						await writeTextFile(mandyFileBackupPath(filePath), content);
						await writeTextFile(filePath, exportToMandyJSON(parsed.project));
					} catch (writeErr) {
						console.error(writeErr);
						addToast(
							"Could not write backup or upgraded file; opened in memory only.",
							"warning",
						);
					}
				}
				createProjectFromImport(parsed.project);
				addToast(
					parsed.wasLegacyFormat
						? `Opened ${parsed.project.name} (upgraded to current format; backup saved beside file).`
						: `Opened project: ${parsed.project.name}`,
					"success",
				);
			} catch (err) {
				console.error(err);
				addToast("Failed to open project", "error");
			}
		});

		return () => {
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, [createProjectFromImport, addToast]);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const activeEl = document.activeElement as HTMLElement | null;
			const isInput =
				activeEl?.tagName === "INPUT" ||
				activeEl?.tagName === "TEXTAREA" ||
				activeEl?.isContentEditable;
			const isCmdOrCtrl = e.metaKey || e.ctrlKey;

			if (isCmdOrCtrl && e.key === "Enter") {
				e.preventDefault();
				if (activeItem?.type === "request" && activeRequest?.request.url) {
					restEditorRef.current?.send();
				}
				return;
			}

			if (isInput) return;

			if (isCmdOrCtrl && e.key === "n") {
				e.preventDefault();
				if (activeProject) {
					addItem("request", activeProject.root.id);
				}
			}

			const isRename = isMac ? e.key === "Enter" : e.key === "F2";
			if (isRename) {
				if (isInput) return;
				if (selectedItemId) {
					e.preventDefault();
					window.dispatchEvent(
						new CustomEvent("trigger-rename", {
							detail: { itemId: selectedItemId },
						}),
					);
				}
			}

			if (isCmdOrCtrl && e.key === "d") {
				e.preventDefault();
				if (selectedItemId) {
					duplicateItem(selectedItemId);
				}
			}

			const isDelete = isMac
				? isCmdOrCtrl && (e.key === "Backspace" || e.key === "Delete")
				: e.key === "Delete";

			if (isDelete) {
				if (isInput) return;
				if (selectedItemId) {
					e.preventDefault();
					setItemToDelete(selectedItemId);
				}
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		activeItem,
		activeRequest,
		activeProject,
		addItem,
		duplicateItem,
		selectedItemId,
	]);

	async function handleSendGraphQL() {
		if (!activeGraphQL?.url) return;
		const gqlId = activeGraphQL.id;
		startLoading(gqlId);
		try {
			const resolvedUrl = resolveVariables(activeGraphQL.url);
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};

			(activeGraphQL.headerItems || [])
				.filter((h) => h.enabled && h.key)
				.forEach((h) => {
					headers[h.key] = resolveVariables(h.value);
				});

			const hasProjectAuth =
				activeProject?.authorization && activeProject.authorization !== "None";
			const effectiveAuth =
				activeGraphQL.useInheritedAuth &&
				hasProjectAuth &&
				activeProject != null
					? activeProject.authorization
					: activeGraphQL.auth;

			if (effectiveAuth && effectiveAuth !== "None") {
				if ("Bearer" in effectiveAuth) {
					headers.Authorization = `Bearer ${resolveVariables(effectiveAuth.Bearer.token)}`;
				} else if ("Basic" in effectiveAuth) {
					headers.Authorization = `Basic ${btoa(`${resolveVariables(effectiveAuth.Basic.username)}:${resolveVariables(effectiveAuth.Basic.password)}`)}`;
				} else if ("ApiKey" in effectiveAuth) {
					if (effectiveAuth.ApiKey.add_to === "Header") {
						headers[effectiveAuth.ApiKey.key] = resolveVariables(
							effectiveAuth.ApiKey.value,
						);
					}
				}
			}

			let variables: Record<string, unknown> = {};
			try {
				if (activeGraphQL.variables && activeGraphQL.variables.trim() !== "") {
					variables = JSON.parse(activeGraphQL.variables);
				}
			} catch {
				// invalid JSON variables, send as-is
			}

			const body = JSON.stringify({
				query: activeGraphQL.query,
				variables,
			});

			const resp = await sendRequest({
				method: "POST",
				url: resolvedUrl,
				headers,
				body: { Raw: { content: body, content_type: "application/json" } },
				auth: "None",
				query_params: {},
				cookies: [],
				timeout_ms: null,
				follow_redirects: null,
				max_redirects: null,
				verify_ssl: null,
				proxy: null,
				protocol: null,
				request_label: activeGraphQL.name,
			});

			updateItem(gqlId, "graphql", (prev) => ({ ...prev, response: resp }));

			if (resp.status < 200 || resp.status >= 300) {
				addToast(
					`GraphQL request failed: ${resp.status} ${resp.status_text}`,
					"error",
				);
			} else {
				playSuccessChime();
			}
		} catch (err: unknown) {
			addToast(`GraphQL request failed: ${getErrorMessage(err)}`, "error");
		} finally {
			stopLoading(gqlId);
		}
	}

	return (
		<div className="flex h-screen select-none flex-col bg-glass text-text">
			<header
				className="group flex h-10 shrink-0 items-center bg-transparent px-4"
				data-tauri-drag-region
			>
				<div className="no-drag ml-[70px] flex items-center gap-0">
					<button
						type="button"
						onClick={() => {
							setIsSidebarCollapsed(!isSidebarCollapsed);
						}}
						className="flex h-6 w-0 cursor-pointer items-center justify-center overflow-hidden rounded-md text-white opacity-0 transition-all duration-200 ease-out hover:bg-white/20 group-hover:mr-2 group-hover:w-6 group-hover:opacity-50"
						title={isSidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
					>
						<TbLayoutSidebar size={14} className="shrink-0" />
					</button>

					<div className="relative">
						<button
							type="button"
							onClick={() => {
								setShowProjectDropdown(!showProjectDropdown);
								setShowEnvDropdown(false);
							}}
							className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 font-semibold text-sm text-white transition-colors hover:bg-white/10"
						>
							{activeProject?.name || "Workspace Name"}
						</button>

						{showProjectDropdown && (
							<Dropdown
								className="top-[32px] left-0 mt-1"
								onClose={() => {
									setShowProjectDropdown(false);
								}}
								items={[
									...(projects || []).map((p) => ({
										label: p.name,
										active: p.id === activeProject?.id,
										onClick: () => {
											selectProject(p.id);
											setShowProjectDropdown(false);
											setActiveItem(null);
											setProjectOverviewTab("overview");
											setShowProjectOverview(true);
										},
									})),
									{ label: "", onClick: () => {}, divider: true },
									{
										label: "+ Create Project",
										onClick: () => {
											setShowNewProjectModal(true);
											setShowProjectDropdown(false);
										},
									},
								]}
							/>
						)}
					</div>

					{activeProject && (
						<div className="relative ml-3 flex items-center gap-1">
							<button
								type="button"
								onClick={() => {
									setShowEnvDropdown(!showEnvDropdown);
									setShowProjectDropdown(false);
								}}
								className="rounded-full bg-accent/10 px-3 py-0.5 font-medium text-accent text-xs lowercase transition-colors hover:bg-accent/20"
							>
								{activeProject.environments.find(
									(e) => e.id === activeProject.activeEnvironmentId,
								)?.name || "preview"}
							</button>

							{showEnvDropdown && (
								<Dropdown
									className="top-[32px] left-0 mt-1"
									onClose={() => setShowEnvDropdown(false)}
									items={[
										...activeProject.environments.map((env) => ({
											label: env.name,
											active: env.id === activeProject.activeEnvironmentId,
											onClick: () =>
												setActiveEnvironment(activeProject.id, env.id),
										})),
										{ label: "", onClick: () => {}, divider: true },
										{
											label: "Manage Environments...",
											onClick: () => {
												setProjectOverviewTab("variables");
												setShowProjectOverview(true);
												setActiveItem(null);
											},
										},
									]}
								/>
							)}
						</div>
					)}
				</div>

				<div className="flex-1" />
				<div className="no-drag flex shrink-0 items-center gap-2">
					{updateAvailable && (
						<button
							type="button"
							onClick={() => setUpdateModal({ open: true, installing: false })}
							className="cursor-pointer rounded-full bg-accent/15 px-2.5 py-0.5 font-medium text-accent text-xs transition-colors hover:bg-accent/25"
							title={`Mandy v${updateAvailable.version} is available`}
						>
							Update available
						</button>
					)}
					<button
						type="button"
						onClick={() => {
							setActiveItem(null);
							setShowProjectOverview(false);
						}}
						className="flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-md text-white opacity-30 transition-all duration-200 ease-out hover:bg-white/20 hover:opacity-50"
						title="Homepage"
					>
						<Logo className="h-4 w-4 shrink-0" />
					</button>
				</div>
			</header>

			<div className="relative flex flex-1 overflow-hidden">
				{isSidebarCollapsed && (
					<>
						{/* Hover-only peek hit target; no separate keyboard action (sidebar is toggled elsewhere). */}
						{/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only sidebar peek strip */}
						<div
							className="absolute top-0 bottom-0 left-0 z-50 w-6 bg-transparent"
							onMouseEnter={() => setIsPeeking(true)}
						/>
					</>
				)}

				<div
					className="h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
					style={{ width: isSidebarCollapsed ? 0 : sidebarWidth }}
				>
					<Sidebar
						activeProject={activeProject}
						onSelect={handleTreeItemSelect}
						selectedItemId={showProjectOverview ? null : activeItemId}
						onToggleFolder={toggleFolder}
						onAddItem={addItem}
						onAddFolder={addFolder}
						onRename={renameItem}
						onDelete={setItemToDelete}
						onDuplicate={duplicateItem}
						onSort={sortFolder}
						onMoveItem={moveItem}
						onCut={cutToClipboard}
						onCopy={copyToClipboard}
						onPaste={pasteItem}
						clipboard={clipboard}
						width={sidebarWidth}
						onWidthChange={setSidebarWidth}
						onProjectClick={() => {
							setActiveItem(null);
							setProjectOverviewTab("overview");
							setShowProjectOverview(true);
						}}
						onIconChange={(icon) =>
							activeProject && updateProjectIcon(activeProject.id, icon)
						}
						onIconColorChange={(color) =>
							activeProject && updateProjectIconColor(activeProject.id, color)
						}
						onImportClick={() => setShowImportModal(true)}
						showProjectOverview={showProjectOverview}
						className="relative"
						loadingItems={loadingItems}
						completedItems={completedItems}
						legacyProjectSchema={
							activeProject != null && isLegacyProject(activeProject)
						}
					/>
				</div>

				{/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only peek overlay dismiss */}
				<div
					className={`absolute top-2 bottom-2 left-2 z-40 rounded-xl border border-border bg-card/90 shadow-2xl backdrop-blur-2xl transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
						isPeeking && isSidebarCollapsed
							? "translate-x-0 scale-100 opacity-100"
							: "pointer-events-none -translate-x-4 scale-[0.98] opacity-0"
					}`}
					style={{ width: sidebarWidth }}
					onMouseLeave={() => setIsPeeking(false)}
				>
					<Sidebar
						activeProject={activeProject}
						onSelect={handleTreeItemSelect}
						selectedItemId={showProjectOverview ? null : activeItemId}
						onToggleFolder={toggleFolder}
						onAddItem={addItem}
						onAddFolder={addFolder}
						onRename={renameItem}
						onDelete={setItemToDelete}
						onDuplicate={duplicateItem}
						onSort={sortFolder}
						onMoveItem={moveItem}
						onCut={cutToClipboard}
						onCopy={copyToClipboard}
						onPaste={pasteItem}
						clipboard={clipboard}
						width={sidebarWidth}
						onWidthChange={setSidebarWidth}
						onProjectClick={() => {
							setActiveItem(null);
							setProjectOverviewTab("overview");
							setShowProjectOverview(true);
						}}
						onIconChange={(icon) =>
							activeProject && updateProjectIcon(activeProject.id, icon)
						}
						onIconColorChange={(color) =>
							activeProject && updateProjectIconColor(activeProject.id, color)
						}
						onImportClick={() => setShowImportModal(true)}
						showProjectOverview={showProjectOverview}
						className="h-full"
						loadingItems={loadingItems}
						completedItems={completedItems}
						legacyProjectSchema={
							activeProject != null && isLegacyProject(activeProject)
						}
					/>
				</div>

				<main
					className={`m-1 mt-0 flex flex-1 flex-col overflow-hidden bg-background transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${!isSidebarCollapsed ? "rounded-xl rounded-tl-2xl" : "rounded-xl"}`}
				>
					{showProjectOverview && activeProject ? (
						<ProjectOverview
							project={activeProject}
							initialTab={projectOverviewTab}
							onUpdateProject={(updates) => {
								if (updates.name) renameProject(activeProject.id, updates.name);
								if (updates.icon)
									updateProjectIcon(activeProject.id, updates.icon);
								if (updates.iconColor)
									updateProjectIconColor(activeProject.id, updates.iconColor);
								if (
									updates.description !== undefined ||
									updates.baseUrl !== undefined ||
									updates.authorization !== undefined
								) {
									updateProjectConfig(activeProject.id, {
										description: updates.description,
										baseUrl: updates.baseUrl,
										authorization: updates.authorization,
									});
								}
							}}
							onExport={() => setShowExportModal(true)}
							onSelectRequest={openItemFromProjectOverview}
							onSelectWorkflow={openItemFromProjectOverview}
							onSelectWebSocket={openItemFromProjectOverview}
							onSelectGraphQL={openItemFromProjectOverview}
							onSelectSocketIO={openItemFromProjectOverview}
							onSelectMqtt={openItemFromProjectOverview}
							onRunRequest={(id) => {
								openItemFromProjectOverview(id);
								setTimeout(() => restEditorRef.current?.send(), 100);
							}}
							onAddEnvironment={(name) =>
								addEnvironment(activeProject.id, name)
							}
							onUpdateEnvironment={(envId, name) =>
								updateEnvironment(activeProject.id, envId, name)
							}
							onDeleteEnvironment={(envId) =>
								deleteEnvironment(activeProject.id, envId)
							}
							onAddEnvVar={addEnvironmentVariable}
							onUpdateEnvVar={updateEnvironmentVariable}
							onDeleteEnvVar={deleteEnvironmentVariable}
							onDeleteProject={() => {
								deleteProject(activeProject.id);
								setShowProjectOverview(false);
							}}
							loadingItems={loadingItems}
						/>
					) : activeWorkflow && !showProjectOverview ? (
						<WorkflowEditor
							workflow={activeWorkflow}
							onWorkflowChange={(updated) => {
								updateItem(updated.id, "workflow", () => updated);
							}}
							onRunWorkflow={() => {
								setIsWorkflowRunning((prev) => !prev);
							}}
							isRunning={isWorkflowRunning}
							projectRoot={activeProject?.root}
							onExecuteRequest={async (
								requestId: string,
								workflowContext: WorkflowExecutionContext,
								overrides?: RequestOverrides,
							): Promise<NodeOutput> => {
								if (!activeProject)
									return { status: 0, error: "No active project" };
								const request = findRequestFileById(
									activeProject.root,
									requestId,
								);
								if (!request) return { status: 0, error: "Request not found" };

								const resolveWorkflowVar = (text: string): string => {
									if (!text) return text;
									return text.replace(
										/\{\{([^}]+)\}\}/g,
										(match, path: string) => {
											const parts = path.split(".");
											const root = parts[0];
											let value: unknown;

											if (root === "status")
												value = workflowContext.lastResponse?.status;
											else if (root === "body") {
												value = workflowContext.lastResponse?.body;
												for (
													let i = 1;
													i < parts.length && value != null;
													i++
												) {
													if (typeof value !== "object") break;
													value = (value as Record<string, unknown>)[parts[i]];
												}
											} else if (root === "headers") {
												value =
													parts.length > 1
														? workflowContext.lastResponse?.headers?.[parts[1]]
														: workflowContext.lastResponse?.headers;
											} else if (root === "cookies") {
												value =
													parts.length > 1
														? workflowContext.lastResponse?.cookies?.[parts[1]]
														: workflowContext.lastResponse?.cookies;
											}

											if (value === undefined) return match;
											if (typeof value === "object" && value !== null)
												return JSON.stringify(value);
											return String(value);
										},
									);
								};

								try {
									// First, apply URL override if present (only the path part)
									let resolvedUrl = request.request.url;
									if (overrides?.url) {
										const overridePath = resolveWorkflowVar(overrides.url);
										try {
											const originalUrl = new URL(request.request.url);
											originalUrl.pathname = "";
											originalUrl.search = "";
											resolvedUrl =
												originalUrl.toString().slice(0, -1) + overridePath;
										} catch {
											resolvedUrl = overridePath;
										}
									} else {
										resolvedUrl = resolveVariables(resolvedUrl);
									}

									const resolvedHeaders: Record<string, string> = {};
									const resolvedParams: Record<string, string> = {};

									for (const [key, value] of Object.entries(
										request.request.headers,
									)) {
										resolvedHeaders[key] = resolveVariables(
											(value as string) || "",
										);
									}

									for (const [key, value] of Object.entries(
										request.request.query_params || {},
									)) {
										resolvedParams[key] = resolveVariables(
											(value as string) || "",
										);
									}

									console.log("[Workflow] Request execution:", {
										requestId,
										hasOverrides: !!overrides,
										hasContext: !!workflowContext,
									});

									if (overrides) {
										console.log(
											"[Workflow] Overrides received:",
											JSON.stringify(overrides, null, 2),
										);
										console.log("[Workflow] Context:", workflowContext);
										console.log(
											"[Workflow] Last response body:",
											workflowContext?.lastResponse?.body,
										);

										if (overrides.params?.length > 0) {
											for (const param of overrides.params) {
												console.log(
													`[Workflow] Processing param: key="${param.key}", value="${param.value}", enabled=${param.enabled}`,
												);
												if (param.enabled && param.key) {
													const resolved = resolveWorkflowVar(param.value);
													console.log(
														`[Workflow] Param resolved: ${param.key} = "${param.value}" -> "${resolved}"`,
													);
													resolvedParams[param.key] = resolved;
												}
											}
										}

										if (overrides.headers?.length > 0) {
											for (const header of overrides.headers) {
												if (header.enabled && header.key) {
													resolvedHeaders[header.key] = resolveWorkflowVar(
														header.value,
													);
												}
											}
										}

										if (overrides.auth && overrides.auth.type !== "inherit") {
											const authValue = resolveWorkflowVar(
												overrides.auth.value || "",
											);
											if (overrides.auth.type === "bearer") {
												resolvedHeaders.Authorization = `Bearer ${authValue}`;
											} else if (overrides.auth.type === "basic") {
												resolvedHeaders.Authorization = `Basic ${btoa(authValue)}`;
											} else if (overrides.auth.type === "apikey") {
												const headerName =
													overrides.auth.headerName || "X-API-Key";
												resolvedHeaders[headerName] = authValue;
											} else if (overrides.auth.type === "cookie") {
												resolvedHeaders.Cookie = authValue;
											}
										}
									}

									let finalBody = request.request.body;
									if (
										overrides?.body &&
										overrides.body.type !== "inherit" &&
										overrides.body.type !== "none"
									) {
										const bodyValue = resolveWorkflowVar(
											overrides.body.value || "",
										);
										if (
											overrides.body.type === "json" ||
											overrides.body.type === "variable"
										) {
											finalBody = {
												Raw: {
													content: bodyValue,
													content_type: "application/json",
												},
											};
										}
									} else if (overrides?.body?.type === "none") {
										finalBody = "None";
									}

									console.log(
										"[Workflow] Final params being sent:",
										resolvedParams,
									);
									console.log(
										"[Workflow] Final headers being sent:",
										resolvedHeaders,
									);

									const resp = await sendRequest({
										...request.request,
										url: resolvedUrl,
										headers: resolvedHeaders,
										query_params: resolvedParams,
										body: finalBody,
										request_label: request.name,
									});

									setRequestResponse(requestId, resp);

									const bodyText = atob(resp.body_base64 || "");
									let body: unknown;
									try {
										body = JSON.parse(bodyText);
									} catch {
										body = bodyText;
									}

									return {
										status: resp.status,
										statusText: resp.status_text,
										headers: resp.headers as Record<string, string>,
										cookies: resp.cookies?.reduce(
											(acc: Record<string, string>, c: Cookie) => {
												acc[c.name] = c.value;
												return acc;
											},
											{} as Record<string, string>,
										),
										body,
										params: resolvedParams,
										duration: resp.timing?.total_ms ?? 0,
										timing: resp.timing,
										requestSize: resp.request_size,
										responseSize: resp.response_size,
									};
								} catch (err: unknown) {
									console.error("Request failed:", err);
									return {
										status: 0,
										error: getErrorMessage(err) || "Request failed",
									};
								}
							}}
						/>
					) : isProtocolRequestItem(activeItem) && !showProjectOverview ? (
						renderProtocolEditor(activeItem, {
							activeProject,
							getEnvKeys: () =>
								getActiveEnvironmentVariables().map((v) => v.key),
							resolveVariables,
							updateItem,
							startLoading,
							stopLoading,
							onOpenProjectSettings: () => {
								setProjectOverviewTab("configuration");
								setShowProjectOverview(true);
							},
							onSendGraphQL: handleSendGraphQL,
							loadingItems,
						})
					) : !showProjectOverview &&
						activeItem?.type !== "request" &&
						activeItem?.type !== "workflow" &&
						activeItem?.type !== "websocket" &&
						activeItem?.type !== "graphql" &&
						activeItem?.type !== "socketio" &&
						activeItem?.type !== "mqtt" ? (
						<WelcomePage
							onNewItem={handleWelcomeNewItem}
							onNewFolder={() => {
								if (activeProject) {
									addFolder(activeProject.root.id, "New Folder");
								} else {
									setShowNewProjectModal(true);
								}
							}}
							onImportClick={() => setShowImportModal(true)}
							recentRequests={activeProject?.recentRequests || []}
							onSelectRecent={(id) => {
								setShowProjectOverview(false);
								openItemById(id);
							}}
							projects={projects}
							activeProjectId={activeProject?.id || null}
							onSelectProject={(id) => {
								selectProject(id);
							}}
							onNewProject={() => setShowNewProjectModal(true)}
						/>
					) : activeRequest ? (
						<RestRequestEditor
							ref={restEditorRef}
							key={activeRequest.id}
							activeRequest={activeRequest}
							activeProject={activeProject}
							loading={loading}
							startLoading={startLoading}
							stopLoading={stopLoading}
							onSendSuccess={(requestId) => {
								setCompletedItems((prev) => new Set(prev).add(requestId));
								setTimeout(() => {
									setCompletedItems((prev) => {
										const next = new Set(prev);
										next.delete(requestId);
										return next;
									});
								}, 2000);
							}}
							onOpenProjectSettings={() => {
								setProjectOverviewTab("configuration");
								setShowProjectOverview(true);
							}}
						/>
					) : (
						<WelcomePage
							onNewItem={handleWelcomeNewItem}
							onNewFolder={() => {
								if (activeProject) {
									addFolder(activeProject.root.id, "New Folder");
								} else {
									setShowNewProjectModal(true);
								}
							}}
							onImportClick={() => setShowImportModal(true)}
							recentRequests={activeProject?.recentRequests || []}
							onSelectRecent={(id) => {
								setShowProjectOverview(false);
								openItemById(id);
							}}
							projects={projects}
							activeProjectId={activeProject?.id || null}
							onSelectProject={(id) => {
								selectProject(id);
							}}
							onNewProject={() => setShowNewProjectModal(true)}
						/>
					)}
				</main>
			</div>

			<Dialog
				isOpen={!!itemToDelete}
				title="Delete Item"
				description="Are you sure you want to delete this item? This action cannot be undone."
				confirmLabel="Delete"
				isDestructive
				onConfirm={() => {
					if (itemToDelete) {
						deleteItem(itemToDelete);
						setItemToDelete(null);
					}
				}}
				onCancel={() => setItemToDelete(null)}
			/>
			<Dialog
				isOpen={updateModal.open}
				title={
					updateModal.installing
						? "Installing update"
						: `Update available (v${updateAvailable?.version ?? ""})`
				}
				description={
					updateModal.installing
						? "Download and install are in progress. The app will restart when finished."
						: updateAvailable?.body?.trim() ||
							"A newer version of Mandy is available from GitHub releases."
				}
				confirmLabel={
					updateModal.installing ? "Please wait…" : "Install and restart"
				}
				cancelLabel="Not now"
				dismissible={!updateModal.installing}
				confirmDisabled={updateModal.installing}
				onConfirm={() => {
					const pending = pendingUpdateRef.current;
					if (!pending || updateModal.installing) return;
					setUpdateModal({ open: true, installing: true });
					void (async () => {
						try {
							await pending.downloadAndInstall();
							const { relaunch } = await import("@tauri-apps/plugin-process");
							await relaunch();
						} catch (err) {
							console.error(err);
							addToast(`Update failed: ${getErrorMessage(err)}`, "error");
							pendingUpdateRef.current = null;
							setUpdateAvailable(null);
							setUpdateModal({ open: false, installing: false });
						}
					})();
				}}
				onCancel={() => {
					if (updateModal.installing) return;
					setUpdateModal({ open: false, installing: false });
				}}
			/>
			<Dialog
				dismissible={false}
				isOpen={schemaMigrationGateOpen}
				title="Workspace format update required"
				description={
					schemaMigrationError
						? `${schemaMigrationError} Tap Retry to try again.`
						: "We detected an older Mandy project format (before schema v1). A backup of each project is taken in memory, then data is upgraded and verified. You must continue before using the app."
				}
				confirmLabel={schemaMigrationError ? "Retry" : "Continue"}
				onConfirm={handleWorkspaceSchemaMigration}
				onCancel={() => {}}
			/>
			<ToastContainer />

			{/* Export Modal */}
			<ExportModal
				isOpen={showExportModal}
				onClose={() => setShowExportModal(false)}
				onExportOpenAPI={async () => {
					if (activeProject) {
						try {
							const spec = generateOpenAPISpec(activeProject, resolveVariables);
							const content = JSON.stringify(spec, null, 2);

							const filePath = await save({
								filters: [
									{
										name: "OpenAPI JSON",
										extensions: ["json"],
									},
								],
								defaultPath: `${activeProject.name}-openapi.json`,
							});

							if (filePath) {
								await writeTextFile(filePath, content);
								addToast("Exported as OpenAPI JSON", "success");
							}
						} catch (err) {
							console.error(err);
							addToast("Failed to export OpenAPI spec", "error");
						}
					}
				}}
				onExportMandy={async () => {
					if (activeProject) {
						try {
							const json = exportToMandyJSON(activeProject);

							const filePath = await save({
								filters: [
									{
										name: "Mandy Project",
										extensions: ["mandy.json"],
									},
								],
								defaultPath: `${activeProject.name}.mandy.json`,
							});

							if (filePath) {
								await writeTextFile(filePath, json);
								addToast("Exported project", "success");
							}
						} catch (err) {
							console.error(err);
							addToast("Failed to export project", "error");
						}
					}
				}}
				onExportPostman={async () => {
					if (activeProject) {
						try {
							const collection = generatePostmanCollection(activeProject);
							const content = JSON.stringify(collection, null, 2);

							const filePath = await save({
								filters: [
									{
										name: "Postman Collection",
										extensions: ["json"],
									},
								],
								defaultPath: `${activeProject.name}.postman_collection.json`,
							});

							if (filePath) {
								await writeTextFile(filePath, content);
								addToast("Exported as Postman Collection", "success");
							}
						} catch (err) {
							console.error(err);
							addToast("Failed to export Postman Collection", "error");
						}
					}
				}}
				onExportInsomnia={async () => {
					if (activeProject) {
						try {
							const data = generateInsomniaExport(activeProject);
							const content = JSON.stringify(data, null, 2);

							const filePath = await save({
								filters: [
									{
										name: "Insomnia Export",
										extensions: ["json"],
									},
								],
								defaultPath: `${activeProject.name}.insomnia.json`,
							});

							if (filePath) {
								await writeTextFile(filePath, content);
								addToast("Exported as Insomnia Export", "success");
							}
						} catch (err) {
							console.error(err);
							addToast("Failed to export Insomnia Export", "error");
						}
					}
				}}
			/>

			{/* Import Modal */}
			<ImportModal
				isOpen={showImportModal}
				onClose={() => setShowImportModal(false)}
				onImportMandy={(json) => {
					const project = parseMandyJSON(json);
					if (project?.root) {
						const results = processItemForSecrets(project.root);
						if (activeProject) {
							const importedFolder = {
								...project.root,
								name: project.name || "Imported",
							};
							importToFolder(activeProject.root.id, importedFolder);
							addToast(
								`Imported into current project${results.detected > 0 ? ` (${results.detected} secrets secured)` : ""}`,
								"success",
							);
						} else {
							createProjectFromImport(project);
							addToast(
								`Project imported successfully${results.detected > 0 ? ` (${results.detected} secrets secured)` : ""}`,
								"success",
							);
						}
					} else {
						addToast("Failed to parse Mandy JSON", "error");
					}
				}}
				onImportOpenAPI={(spec) => {
					const partialProject = parseOpenAPISpec(spec);
					if (partialProject.name && partialProject.root) {
						const results = processItemForSecrets(partialProject.root);
						if (activeProject) {
							const importedFolder = {
								...partialProject.root,
								name: partialProject.name,
							};
							importToFolder(activeProject.root.id, importedFolder);
							addToast(
								`Imported ${partialProject.name} as folder${results.detected > 0 ? ` (${results.detected} secrets secured)` : ""}`,
								"success",
							);
						} else {
							createProjectFromImport(partialProject);
							addToast(
								`Imported ${partialProject.name}${results.detected > 0 ? ` (${results.detected} secrets secured)` : ""}`,
								"success",
							);
						}
					} else {
						addToast("Failed to parse OpenAPI spec", "error");
					}
				}}
				onImportPostman={(collection) => {
					try {
						const partialProject = parsePostmanCollection(collection);
						if (partialProject.name && partialProject.root) {
							const results = processItemForSecrets(partialProject.root);
							if (activeProject) {
								const importedFolder = {
									...partialProject.root,
									name: partialProject.name,
								};
								importToFolder(activeProject.root.id, importedFolder);
								addToast(
									`Imported ${partialProject.name} as folder${results.detected > 0 ? ` (${results.detected} secrets secured)` : ""}`,
									"success",
								);
							} else {
								createProjectFromImport(partialProject);
								addToast(
									`Imported ${partialProject.name}${results.detected > 0 ? ` (${results.detected} secrets secured)` : ""}`,
									"success",
								);
							}
						} else {
							addToast("Failed to parse Postman collection", "error");
						}
					} catch (err: unknown) {
						addToast(
							getErrorMessage(err) || "Failed to parse Postman collection",
							"error",
						);
					}
				}}
				onImportInsomnia={(data) => {
					try {
						const partialProject = parseInsomniaExport(data);
						if (partialProject.name && partialProject.root) {
							const results = processItemForSecrets(partialProject.root);
							if (activeProject) {
								const importedFolder = {
									...partialProject.root,
									name: partialProject.name,
								};
								importToFolder(activeProject.root.id, importedFolder);
								addToast(
									`Imported ${partialProject.name} as folder${results.detected > 0 ? ` (${results.detected} secrets secured)` : ""}`,
									"success",
								);
							} else {
								createProjectFromImport(partialProject);
								addToast(
									`Imported ${partialProject.name}${results.detected > 0 ? ` (${results.detected} secrets secured)` : ""}`,
									"success",
								);
							}
						} else {
							addToast("Failed to parse Insomnia export", "error");
						}
					} catch (err: unknown) {
						addToast(
							getErrorMessage(err) || "Failed to parse Insomnia export",
							"error",
						);
					}
				}}
			/>

			<NewProjectModal
				isOpen={showNewProjectModal}
				onClose={() => setShowNewProjectModal(false)}
				onCreateBlank={(name: string) => {
					const id = createProject(name);
					selectProject(id);
					addToast(`Project "${name}" created`, "success");
				}}
				onCreateFromPostman={(collection: object) => {
					try {
						const partialProject = parsePostmanCollection(collection);
						if (partialProject.name && partialProject.root) {
							const results = processItemForSecrets(partialProject.root);
							const id = createProjectFromImport(partialProject);
							selectProject(id);
							addToast(
								`Imported ${partialProject.name} from Postman${results.detected > 0 ? ` (${results.detected} secrets secured)` : ""}`,
								"success",
							);
						} else {
							addToast("Failed to parse Postman collection", "error");
						}
					} catch (e: unknown) {
						addToast(getErrorMessage(e) || "Import failed", "error");
					}
				}}
				onCreateFromInsomnia={(data: object) => {
					try {
						const partialProject = parseInsomniaExport(data);
						if (partialProject.name && partialProject.root) {
							const results = processItemForSecrets(partialProject.root);
							const id = createProjectFromImport(partialProject);
							selectProject(id);
							addToast(
								`Imported ${partialProject.name} from Insomnia${results.detected > 0 ? ` (${results.detected} secrets secured)` : ""}`,
								"success",
							);
						} else {
							addToast("Failed to parse Insomnia export", "error");
						}
					} catch (e: unknown) {
						addToast(getErrorMessage(e) || "Import failed", "error");
					}
				}}
			/>
		</div>
	);
}

export default App;
