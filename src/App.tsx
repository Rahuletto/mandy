import { useState, useCallback, useEffect, useRef } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import { TbLayoutSidebar } from "react-icons/tb";
import { isMac } from "./utils/platform";
import { sendRequest } from "./reqhelpers/rest";
import { playSuccessChime } from "./utils/sounds";
import { Sidebar } from "./components/Sidebar";
import {
  Dropdown,
  ToastContainer,
  Dialog,
  ExportModal,
  ImportModal,
  NewProjectModal,
  Logo,
} from "./components/ui";

import {
  RestRequestEditor,
  type RestRequestEditorHandle,
} from "./components/editors/RestRequestEditor";
import { ProjectOverview } from "./components/ProjectOverview";
import { WelcomePage } from "./components/WelcomePage";
import { WorkflowEditor } from "./components/workflow/WorkflowEditor";

import {
  parseOpenAPISpec,
  generateOpenAPISpec,
  exportToMandyJSON,
  parseMandyJSON,
  generatePostmanCollection,
  parsePostmanCollection,
  generateInsomniaExport,
  parseInsomniaExport,
} from "./utils/migration";
import { useProjectStore } from "./stores/projectStore";
import type { RequestItem, RequestType, TreeItem } from "./types/project";
import { useToastStore } from "./stores/toastStore";
import {
  isProtocolRequestItem,
  renderProtocolEditor,
} from "./registry/editorViews";
import "./App.css";

function App() {
  const {
    projects,
    activeItemId,
    unsavedChanges,
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
    markSaved,
    clipboard,
    copyToClipboard,
    cutToClipboard,
    pasteItem,
    selectedItemId,
    setSelectedItem,
    openItemById,
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
      for (const child of children as { id: string; type: string; children?: unknown[] }[]) {
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

  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const [completedItems, setCompletedItems] = useState<Set<string>>(
    new Set(),
  );
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

  // Handle opening .mandy.json files
  useEffect(() => {
    const unlistenPromise = listen<string>("open-mandy-file", async (event) => {
      try {
        const filePath = event.payload;
        const content = await readTextFile(filePath);
        const imported = parseMandyJSON(content);
        if (imported) {
          createProjectFromImport(imported);
          addToast(`Opened project: ${imported.name}`, "success");
        } else {
          addToast("Invalid Mandy project file", "error");
        }
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

      if (isCmdOrCtrl && e.key === "s") {
        e.preventDefault();
        if (activeItemId) {
          markSaved(activeItemId);
        }
        return;
      }

      if (isCmdOrCtrl && e.key === "Enter") {
        e.preventDefault();
        if (
          activeItem?.type === "request" &&
          activeRequest?.request.url
        ) {
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
    activeItemId,
    activeItem,
    markSaved,
    activeRequest,
    activeProject,
    addItem,
    cutToClipboard,
    copyToClipboard,
    pasteItem,
    duplicateItem,
    deleteItem,
    selectedItemId,
  ]);

  async function handleSendGraphQL() {
    if (!activeGraphQL || !activeGraphQL.url) return;
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
        activeGraphQL.useInheritedAuth && hasProjectAuth
          ? activeProject!.authorization!
          : activeGraphQL.auth;

      if (effectiveAuth && effectiveAuth !== "None") {
        if ("Bearer" in effectiveAuth) {
          headers["Authorization"] =
            `Bearer ${resolveVariables(effectiveAuth.Bearer.token)}`;
        } else if ("Basic" in effectiveAuth) {
          headers["Authorization"] =
            `Basic ${btoa(`${resolveVariables(effectiveAuth.Basic.username)}:${resolveVariables(effectiveAuth.Basic.password)}`)}`;
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
    } catch (err: any) {
      const errorMessage = err?.message || err?.toString() || "Unknown error";
      addToast(`GraphQL request failed: ${errorMessage}`, "error");
    } finally {
      stopLoading(gqlId);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-glass text-text select-none">
      <header
        className="h-10 flex items-center px-4 bg-transparent shrink-0 group"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-0 ml-[70px] no-drag">
          <button
            type="button"
            onClick={() => {
              setIsSidebarCollapsed(!isSidebarCollapsed);
            }}
            className="h-6 flex items-center justify-center rounded-md text-white hover:bg-white/20 cursor-pointer transition-all duration-200 ease-out w-0 opacity-0 overflow-hidden group-hover:w-6 group-hover:opacity-50 group-hover:mr-2"
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
              className="text-sm font-semibold px-2 py-1 rounded-md bg-white/5 text-white hover:bg-white/10 transition-colors flex items-center gap-1"
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
            <div className="relative flex items-center gap-1 ml-3">
              <button
                type="button"
                onClick={() => {
                  setShowEnvDropdown(!showEnvDropdown);
                  setShowProjectDropdown(false);
                }}
                className="px-3 py-0.5 lowercase rounded-full text-xs text-accent bg-accent/10 font-medium transition-colors hover:bg-accent/20"
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
        <button
          type="button"
          onClick={() => {
            setActiveItem(null);
            setShowProjectOverview(false);
          }}
          className="h-6 flex items-center justify-center rounded-md text-white hover:bg-white/20 cursor-pointer transition-all duration-200 ease-out w-6 opacity-30 hover:opacity-50 overflow-hidden "
          title="Homepage"
        >
          <Logo className="shrink-0 w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {isSidebarCollapsed && (
          <div
            className="absolute left-0 top-0 bottom-0 w-6 z-50 bg-transparent"
            onMouseEnter={() => setIsPeeking(true)}
          />
        )}

        <div
          className="shrink-0 h-full overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ width: isSidebarCollapsed ? 0 : sidebarWidth }}
        >
          <Sidebar
            activeProject={activeProject}
            unsavedIds={unsavedChanges}
            onSelect={handleTreeItemSelect}
            selectedItemId={
              showProjectOverview ? null : activeItemId
            }
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
          />
        </div>

        <div
          className={`absolute left-2 top-2 bottom-2 z-40 rounded-xl bg-card/90 backdrop-blur-2xl border border-border shadow-2xl transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isPeeking && isSidebarCollapsed
              ? "opacity-100 translate-x-0 scale-100"
              : "opacity-0 -translate-x-4 scale-[0.98] pointer-events-none"
          }`}
          style={{ width: sidebarWidth }}
          onMouseLeave={() => setIsPeeking(false)}
        >
          <Sidebar
            activeProject={activeProject}
            unsavedIds={unsavedChanges}
            onSelect={handleTreeItemSelect}
            selectedItemId={
              showProjectOverview ? null : activeItemId
            }
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
          />
        </div>

        <main
          className={`flex-1 bg-background m-1 mt-0 flex flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${!isSidebarCollapsed ? "rounded-tl-2xl rounded-xl" : "rounded-xl"}`}
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
                workflowContext?: any,
                overrides?: any,
              ) => {
                const findRequest = (folder: any): any => {
                  for (const item of folder.children) {
                    if (item.id === requestId && item.type === "request") {
                      return item;
                    }
                    if (item.type === "folder") {
                      const found = findRequest(item);
                      if (found) return found;
                    }
                  }
                  return null;
                };

                if (!activeProject)
                  return { status: 0, error: "No active project" };
                const request = findRequest(activeProject.root);
                if (!request) return { status: 0, error: "Request not found" };

                const resolveWorkflowVar = (text: string): string => {
                  if (!text || !workflowContext) return text;
                  return text.replace(
                    /\{\{([^}]+)\}\}/g,
                    (match, path: string) => {
                      const parts = path.split(".");
                      const root = parts[0];
                      let value: any;

                      if (root === "status")
                        value = workflowContext.lastResponse?.status;
                      else if (root === "body") {
                        value = workflowContext.lastResponse?.body;
                        for (let i = 1; i < parts.length && value; i++) {
                          value = value[parts[i]];
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
                      if (typeof value === "object")
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
                        resolvedHeaders["Authorization"] =
                          `Bearer ${authValue}`;
                      } else if (overrides.auth.type === "basic") {
                        resolvedHeaders["Authorization"] =
                          `Basic ${btoa(authValue)}`;
                      } else if (overrides.auth.type === "apikey") {
                        const headerName =
                          overrides.auth.headerName || "X-API-Key";
                        resolvedHeaders[headerName] = authValue;
                      } else if (overrides.auth.type === "cookie") {
                        resolvedHeaders["Cookie"] = authValue;
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
                    headers: resp.headers,
                    cookies: resp.cookies?.reduce(
                      (acc: Record<string, string>, c: any) => {
                        acc[c.name] = c.value;
                        return acc;
                      },
                      {},
                    ),
                    body,
                    params: resolvedParams,
                    duration: resp.timing?.total_ms ?? 0,
                    timing: resp.timing,
                    requestSize: resp.request_size,
                    responseSize: resp.response_size,
                  };
                } catch (err: any) {
                  console.error("Request failed:", err);
                  return {
                    status: 0,
                    error: err?.message || "Request failed",
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
          if (project && project.root) {
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
          } catch (err: any) {
            addToast(
              err.message || "Failed to parse Postman collection",
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
          } catch (err: any) {
            addToast(err.message || "Failed to parse Insomnia export", "error");
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
          } catch (e: any) {
            addToast(e.message || "Import failed", "error");
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
          } catch (e: any) {
            addToast(e.message || "Import failed", "error");
          }
        }}
      />
    </div>
  );
}

export default App;
