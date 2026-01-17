import { useState, useCallback, useEffect, useRef } from "react";
import type { Methods, ResponseRenderer, HttpProtocol } from "./bindings";
import { TbLayoutSidebar } from "react-icons/tb";
import { isMac } from "./utils/platform";
import {
  sendRequest,
  parseCurlCommand,
  decodeBody,
  decodeBodyAsJson,
  BodyType,
  AuthType,
} from "./reqhelpers/rest";
import { formatBytes, getStatusColor } from "./utils/format";
import { CodeViewer } from "./components/CodeMirror";
import { BodyEditor } from "./components/editors/BodyEditor";
import { AuthEditor } from "./components/editors/AuthEditor";
import { Sidebar } from "./components/Sidebar";
import { Dropdown, MoreButton, UrlInput, ToastContainer, Dialog } from "./components/ui";
import { KeyValueTable } from "./components/KeyValueTable";
import { OverviewModal } from "./components/OverviewModal";
import { MethodSelector } from "./components/MethodSelector";
import { TimingPopover } from "./components/popovers/TimingPopover";
import { SizePopover } from "./components/popovers/SizePopover";
import { ProtocolToggle } from "./components/ProtocolToggle";
import { RequestOverview } from "./components/RequestOverview";
import { useProjectStore } from "./stores/projectStore";
import { useToastStore } from "./stores/toastStore";
import "./App.css";

function App() {
  const {
    projects,
    activeRequestId,
    unsavedChanges,
    setActiveRequestId,
    selectProject,
    createProject,
    renameProject,
    deleteProject,
    getActiveProject,
    setActiveEnvironment,
    addEnvironment,
    updateEnvironment,
    deleteEnvironment,
    addEnvironmentVariable,
    updateEnvironmentVariable,
    deleteEnvironmentVariable,
    resolveVariables,
    getActiveEnvironmentVariables,
    addRequest,
    addFolder,
    renameItem,
    deleteItem,
    duplicateItem,
    toggleFolder,
    sortFolder,
    moveItem,
    updateRequest,
    setRequestResponse,
    getActiveRequest,
    markSaved,
    clipboard,
    copyToClipboard,
    cutToClipboard,
    pasteItem,
    selectedItemId,
    setSelectedItem,
  } = useProjectStore();

  const activeProject = getActiveProject();
  const activeRequest = getActiveRequest();
  const { addToast } = useToastStore();

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "params" | "authorization" | "body" | "headers" | "cookies"
  >("overview");
  const [responseTab, setResponseTab] = useState<ResponseRenderer>("Raw");
  const [responseDetailTab, setResponseDetailTab] = useState<
    "headers" | "cookies"
  >("headers");
  const [curlInput, setCurlInput] = useState("");
  const [showCurlImport, setShowCurlImport] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);

  const [mainSplitX, setMainSplitX] = useState(50);
  const [responseSplitY, setResponseSplitY] = useState(60);
  const [isResizingMain, setIsResizingMain] = useState(false);
  const [isResizingResponse, setIsResizingResponse] = useState(false);
  const mainPanelRef = useRef<HTMLDivElement>(null);
  const responsePanelRef = useRef<HTMLDivElement>(null);

  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showEnvDropdown, setShowEnvDropdown] = useState(false);
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [showOverview, setShowOverview] = useState(false);
  const [overviewProjectId, setOverviewProjectId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const [disabledItems, setDisabledItems] = useState<Set<string>>(new Set());

  const [showTimingPopover, setShowTimingPopover] = useState(false);
  const [showSizePopover, setShowSizePopover] = useState(false);
  const timingRef = useRef<HTMLButtonElement>(null);
  const sizeRef = useRef<HTMLButtonElement>(null);
  const timingTimeoutRef = useRef<number | null>(null);
  const sizeTimeoutRef = useRef<number | null>(null);

  const handleTimingEnter = () => {
    if (timingTimeoutRef.current) {
      clearTimeout(timingTimeoutRef.current);
      timingTimeoutRef.current = null;
    }
    setShowSizePopover(false);
    setShowTimingPopover(true);
  };

  const handleTimingLeave = () => {
    timingTimeoutRef.current = window.setTimeout(() => {
      setShowTimingPopover(false);
    }, 200);
  };

  const handleSizeEnter = () => {
    if (sizeTimeoutRef.current) {
      clearTimeout(sizeTimeoutRef.current);
      sizeTimeoutRef.current = null;
    }
    setShowTimingPopover(false);
    setShowSizePopover(true);
  };

  const handleSizeLeave = () => {
    sizeTimeoutRef.current = window.setTimeout(() => {
      setShowSizePopover(false);
    }, 200);
  };

  const [requestProtocol, setRequestProtocol] = useState<HttpProtocol>("Tcp");

  const isItemEnabled = (type: "param" | "header" | "cookie", key: string) => {
    if (!activeRequestId) return true;
    return !disabledItems.has(`${activeRequestId}:${type}:${key}`);
  };

  const getComputedHeaders = useCallback(() => {
    if (!activeRequest) return [];
    const computed = [];

    const body = activeRequest.request.body;
    let contentType = null;
    if (body !== "None") {
      if ("Raw" in body) contentType = body.Raw.content_type;
      else if ("FormUrlEncoded" in body) contentType = "application/x-www-form-urlencoded";
      else if ("Multipart" in body) contentType = "multipart/form-data";
      else if ("Binary" in body) contentType = "application/octet-stream";
    }

    if (contentType) {
      computed.push({
        id: "computed:content-type",
        key: "Content-Type",
        value: contentType,
        description: "Generated from body",
        enabled: true,
        locked: true,
        onValueClick: () => setActiveTab("body"),
      });
    }

    if (activeRequest.request.cookies.length > 0) {
      const enabledCookies = activeRequest.request.cookies.filter(c => isItemEnabled("cookie", c.name));
      if (enabledCookies.length > 0) {
        computed.push({
          id: "computed:cookie",
          key: "Cookie",
          value: `${enabledCookies.length} cookie${enabledCookies.length > 1 ? 's' : ''}`,
          description: "Generated from cookies",
          enabled: true,
          locked: true,
          onValueClick: () => setActiveTab("cookies"),
        });
      }
    }

    const auth = activeRequest.request.auth;
    if (auth !== "None") {
      let authValue = "";
      let authTypeLabel = "";
      if ("Basic" in auth) {
        authValue = `Basic user:pass`;
        authTypeLabel = "Basic Auth";
      } else if ("Bearer" in auth) {
        authValue = `Bearer ${auth.Bearer.token ? (auth.Bearer.token.substring(0, 10) + '...') : ''}`;
        authTypeLabel = "Bearer Token";
      } else if ("ApiKey" in auth && auth.ApiKey.add_to === "Header") {
        computed.push({
          id: "computed:auth",
          key: auth.ApiKey.key || "API-Key",
          value: auth.ApiKey.value || "",
          description: "Generated from Auth",
          enabled: true,
          locked: true,
          onValueClick: () => setActiveTab("authorization"),
        });
      }

      if (authValue) {
        computed.push({
          id: "computed:auth",
          key: "Authorization",
          value: authValue,
          description: `Generated from ${authTypeLabel}`,
          enabled: true,
          locked: true,
          onValueClick: () => setActiveTab("authorization"),
        });
      }
    }

    return computed;
  }, [activeRequest, disabledItems]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement as HTMLElement | null;
      const isInput = activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        activeEl?.isContentEditable;
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl && e.key === "s") {
        e.preventDefault();
        if (activeRequestId) {
          markSaved(activeRequestId);
        }
        return;
      }

      if (isCmdOrCtrl && e.key === "Enter") {
        e.preventDefault();
        if (activeRequestId && activeRequest?.request.url) {
          handleSend();
        }
        return;
      }

      if (isInput) return;

      if (isCmdOrCtrl && e.key === "n") {
        e.preventDefault();
        if (activeProject) {
          addRequest(activeProject.root.id);
        }
      }

      const isRename = isMac ? e.key === "Enter" : e.key === "F2";
      if (isRename) {
        if (isInput) return;
        if (selectedItemId) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('trigger-rename', { detail: { itemId: selectedItemId } }));
        }
      }

      if (isCmdOrCtrl && e.key === "d") {
        e.preventDefault();
        if (selectedItemId) {
          duplicateItem(selectedItemId);
        }
      }

      const isDelete = isMac
        ? (isCmdOrCtrl && (e.key === "Backspace" || e.key === "Delete"))
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
  }, [activeRequestId, markSaved, activeRequest, activeProject, addRequest, cutToClipboard, copyToClipboard, pasteItem, duplicateItem, deleteItem, selectedItemId]);

  const handleMainMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingMain(true);
  }, []);

  const handleResponseMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingResponse(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingMain && mainPanelRef.current) {
        const rect = mainPanelRef.current.getBoundingClientRect();
        const newPercent = ((e.clientX - rect.left) / rect.width) * 100;
        setMainSplitX(Math.max(30, Math.min(70, newPercent)));
      }
      if (isResizingResponse && responsePanelRef.current) {
        const rect = responsePanelRef.current.getBoundingClientRect();
        const newPercent = ((e.clientY - rect.top) / rect.height) * 100;
        setResponseSplitY(Math.max(20, Math.min(80, newPercent)));
      }
    };

    const handleMouseUp = () => {
      setIsResizingMain(false);
      setIsResizingResponse(false);
    };

    if (isResizingMain || isResizingResponse) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = isResizingMain ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingMain, isResizingResponse]);

  async function handleSend() {
    if (!activeRequest) return;
    setLoading(true);
    try {

      const resolvedUrl = resolveVariables(activeRequest.request.url);

      const resolvedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(
        activeRequest.request.headers,
      )) {
        if (isItemEnabled("header", key)) {
          resolvedHeaders[key] = resolveVariables(value || "");
        }
      }

      const resolvedCookies = activeRequest.request.cookies
        .filter(c => isItemEnabled("cookie", c.name))
        .map(c => ({ ...c }));

      const isGet = activeRequest.request.method === "GET";

      const resolvedRequest = {
        ...activeRequest.request,
        url: resolvedUrl,
        headers: resolvedHeaders,
        cookies: resolvedCookies,
        query_params: {},
        body: isGet ? "None" : activeRequest.request.body,
      };
      const resp = await sendRequest(resolvedRequest);
      setRequestResponse(activeRequest.id, resp);

      if (resp.status < 200 || resp.status >= 300) {
        addToast(`Request failed: ${resp.status} ${resp.status_text}`, "error");
      }

      const preferred: ResponseRenderer[] = ["Json", "Xml", "Html", "HtmlPreview", "Image", "Audio", "Video", "Pdf"];
      const bestRenderer = preferred.find(r => resp.available_renderers.includes(r)) || resp.available_renderers[0] || "Raw";
      setResponseTab(bestRenderer);

      if (activeTab === "overview") {
        setActiveTab("body");
      }
    } catch (err: any) {
      console.error(err);
      addToast(err.toString(), "error");
    } finally {
      setLoading(false);
    }
  }

  function handleImportCurl() {
    if (!activeRequest) return;
    const parsed = parseCurlCommand(curlInput);
    updateRequest(activeRequest.id, (r) => ({
      ...r,
      request: {
        ...r.request,
        ...parsed,
        headers: { ...r.request.headers, ...parsed.headers },
      },
    }));
    setShowCurlImport(false);
    setCurlInput("");
  }

  function handleAutoImportCurl(command: string) {
    if (!activeRequest) return;
    try {
      const parsed = parseCurlCommand(command);
      updateRequest(activeRequest.id, (r) => ({
        ...r,
        request: {
          ...r.request,
          ...parsed,
          headers: { ...r.request.headers, ...parsed.headers },
        },
      }));
      addToast("Imported from cURL", "success");
    } catch (err) {
      addToast("Failed to parse cURL command", "error");
    }
  }

  function updateUrl(url: string) {
    if (!activeRequest) return;
    updateRequest(activeRequest.id, (r) => ({
      ...r,
      request: { ...r.request, url },
    }));
    syncUrlToQueryParams();
  }

  function updateMethod(method: Methods) {
    if (!activeRequest) return;
    updateRequest(activeRequest.id, (r) => ({
      ...r,
      request: { ...r.request, method },
    }));

    if (method === "GET" && activeTab === "body") {
      setActiveTab("params");
    }
  }

  function updateBody(body: BodyType) {
    if (!activeRequest) return;
    updateRequest(activeRequest.id, (r) => ({
      ...r,
      request: { ...r.request, body },
    }));
  }

  function updateAuth(auth: AuthType) {
    if (!activeRequest) return;
    updateRequest(activeRequest.id, (r) => ({
      ...r,
      request: { ...r.request, auth },
    }));
  }

  function buildQueryString(params: Record<string, string | undefined>, disabledKeys: Set<string> = new Set()): string {
    const enabledParams = Object.entries(params).filter(([key, value]) => !disabledKeys.has(key) && value !== undefined) as [string, string][];

    if (enabledParams.length === 0) return '';

    const queryParts = enabledParams
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        const encodedKey = encodeURIComponent(key);
        const rawValue = value || '';

        if (rawValue.includes('{{')) {

          let result = '';
          let lastIndex = 0;
          const regex = /\{\{[^}]+\}\}/g;
          let match;
          while ((match = regex.exec(rawValue)) !== null) {
            result += encodeURIComponent(rawValue.slice(lastIndex, match.index));
            result += match[0];
            lastIndex = regex.lastIndex;
          }
          result += encodeURIComponent(rawValue.slice(lastIndex));
          return `${encodedKey}=${result}`;
        } else {
          return `${encodedKey}=${encodeURIComponent(rawValue)}`;
        }
      });

    return queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  }

  function syncUrlToQueryParams() {
    if (!activeRequest) return;
    try {
      const urlStr = activeRequest.request.url;
      const queryIndex = urlStr.indexOf('?');
      if (queryIndex === -1) {

        updateRequest(activeRequest.id, (r) => ({
          ...r,
          request: {
            ...r.request,
            query_params: {},
          },
        }));
        return;
      }

      const queryString = urlStr.slice(queryIndex + 1);
      const params: Record<string, string> = {};

      queryString.split('&').forEach(part => {
        const eqIndex = part.indexOf('=');
        if (eqIndex === -1) {
          params[decodeURIComponent(part)] = '';
        } else {
          const key = decodeURIComponent(part.slice(0, eqIndex));

          const rawValue = part.slice(eqIndex + 1);

          if (rawValue.includes('{{')) {
            params[key] = rawValue;
          } else {
            params[key] = decodeURIComponent(rawValue);
          }
        }
      });

      updateRequest(activeRequest.id, (r) => ({
        ...r,
        request: {
          ...r.request,
          query_params: params,
        },
      }));
    } catch {

    }
  }

  function renderResponseBody() {
    if (!activeRequest?.response) return null;

    const body = decodeBody(activeRequest.response);
    const response = activeRequest.response;
    const requestId = activeRequest.id;

    switch (responseTab) {
      case "Json": {
        const json = decodeBodyAsJson(response);
        const formatted = json ? JSON.stringify(json, null, 2) : body;
        return (
          <div className="flex-1 min-h-0 h-full">
            <CodeViewer key={`${requestId}-json`} code={formatted} language="json" />
          </div>
        );
      }
      case "Xml":
        return (
          <div className="flex-1 min-h-0 h-full">
            <CodeViewer key={`${requestId}-xml`} code={body} language="xml" />
          </div>
        );
      case "Html":
        return (
          <div className="flex-1 min-h-0 h-full">
            <CodeViewer key={`${requestId}-html`} code={body} language="html" />
          </div>
        );
      case "HtmlPreview": {

        const requestUrl = activeRequest.request.url;
        let baseUrl = "";
        try {
          const url = new URL(requestUrl.startsWith("http") ? requestUrl : `https://${requestUrl}`);
          baseUrl = `${url.protocol}//${url.host}`;
        } catch {

        }

        let previewHtml = body;
        if (baseUrl && !body.includes("<base")) {

          if (body.includes("<head>")) {
            previewHtml = body.replace("<head>", `<head><base href="${baseUrl}/">`);
          } else if (body.includes("<head ")) {
            previewHtml = body.replace(/<head\s[^>]*>/, `$&<base href="${baseUrl}/">`);
          } else if (body.includes("<!DOCTYPE") || body.includes("<!doctype") || body.includes("<html")) {
            previewHtml = body.replace(/(<html[^>]*>)/i, `$1<head><base href="${baseUrl}/"></head>`);
          } else {
            previewHtml = `<base href="${baseUrl}/">${body}`;
          }
        }

        return (
          <div className="flex-1 min-h-0 h-full bg-white rounded overflow-hidden">
            <iframe
              key={`${requestId}-preview`}
              srcDoc={previewHtml}
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts"
              title="HTML Preview"
            />
          </div>
        );
      }
      case "Image": {
        const base64 = response.body_base64;
        const contentType = response.detected_content_type || "image/png";
        return (
          <div className="flex-1 min-h-0 h-full flex items-center justify-center p-4">
            <img
              src={`data:${contentType};base64,${base64}`}
              alt="Response"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        );
      }
      case "Audio": {
        const base64 = response.body_base64;
        const contentType = response.detected_content_type || "audio/mpeg";
        return (
          <div className="flex-1 min-h-0 h-full flex items-center justify-center p-4">
            <audio controls className="w-full max-w-md">
              <source src={`data:${contentType};base64,${base64}`} type={contentType} />
              Your browser does not support audio playback.
            </audio>
          </div>
        );
      }
      case "Video": {
        const base64 = response.body_base64;
        const contentType = response.detected_content_type || "video/mp4";
        return (
          <div className="flex-1 min-h-0 h-full flex items-center justify-center p-4">
            <video controls className="max-w-full max-h-full">
              <source src={`data:${contentType};base64,${base64}`} type={contentType} />
              Your browser does not support video playback.
            </video>
          </div>
        );
      }
      case "Pdf": {
        const base64 = response.body_base64;
        return (
          <div className="flex-1 min-h-0 h-full">
            <iframe
              src={`data:application/pdf;base64,${base64}`}
              className="w-full h-full border-0"
              title="PDF Preview"
            />
          </div>
        );
      }
      case "Raw":
      default:
        return (
          <div className="flex-1 min-h-0 h-full overflow-auto">
            <pre className="p-4 text-sm font-mono text-white/80 whitespace-pre-wrap break-all" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              {body}
            </pre>
          </div>
        );
    }
  }

  function getRendererLabel(renderer: ResponseRenderer): string {
    switch (renderer) {
      case "Raw": return "Raw";
      case "Json": return "JSON";
      case "Xml": return "XML";
      case "Html": return "HTML";
      case "HtmlPreview": return "Preview";
      case "Image": return "Image";
      case "Audio": return "Audio";
      case "Video": return "Video";
      case "Pdf": return "PDF";
      default: return renderer;
    }
  }

  return (
    <div className="h-screen flex flex-col bg-transparent text-text select-none">

      <header
        className="h-10 flex items-center px-4 bg-transparent shrink-0 group"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-0 ml-[70px] no-drag">

          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="h-6 flex items-center justify-center rounded-md text-white hover:bg-white/20 cursor-pointer transition-all duration-200 ease-out w-0 opacity-0 overflow-hidden group-hover:w-6 group-hover:opacity-50 group-hover:mr-2"
            title={isSidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
          >
            <TbLayoutSidebar size={14} className="shrink-0" />
          </button>

          <div className="relative transition-all duration-200 ease-out group-hover:translate-x-0">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setShowProjectDropdown(!showProjectDropdown);
                  setShowEnvDropdown(false);
                  setProjectMenuId(null);
                }}
                className="text-sm font-semibold px-2 py-0.5 rounded-md bg-white/5 text-white hover:bg-white/10 transition-colors flex items-center gap-1"
              >
                {activeProject?.name || "Workspace Name"}
              </button>
            </div>

            {showProjectDropdown && (
              <Dropdown
                className="top-full left-0 mt-2"
                onClose={() => setShowProjectDropdown(false)}
                items={[
                  ...(projects || []).map((p) => ({
                    label: p.name,
                    active: p.id === activeProject?.id,
                    onClick: () => selectProject(p.id),
                    rightAction: (
                      <MoreButton
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectMenuId(p.id);
                        }}
                      />
                    )
                  })),
                  { label: "", onClick: () => { }, divider: true },
                  {
                    label: "+ Create Project",
                    onClick: () => {
                      const name = prompt("Project name:");
                      if (name?.trim()) {
                        createProject(name.trim());
                      }
                    },
                  },
                ]}
              />
            )}

            {projectMenuId && (
              <Dropdown
                width="min-w-[140px]"
                className="top-full left-32 mt-2"
                onClose={() => setProjectMenuId(null)}
                items={[
                  {
                    label: "Rename Project...",
                    onClick: () => {
                      setOverviewProjectId(projectMenuId);
                      setShowOverview(true);
                      setProjectMenuId(null);
                    },
                  },
                  {
                    label: "Delete Project",
                    danger: true,
                    onClick: () => {
                      const p = projects.find(proj => proj.id === projectMenuId);
                      if (confirm(`Are you sure you want to delete "${p?.name}"?`)) {
                        deleteProject(projectMenuId);
                      }
                      setProjectMenuId(null);
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
                  className="top-full left-0 mt-2"
                  onClose={() => setShowEnvDropdown(false)}
                  items={[
                    ...activeProject.environments.map((env) => ({
                      label: env.name,
                      active: env.id === activeProject.activeEnvironmentId,
                      onClick: () => setActiveEnvironment(activeProject.id, env.id),
                    })),
                    { label: "", onClick: () => { }, divider: true },
                    {
                      label: "Manage Environments...",
                      onClick: () => {
                        setOverviewProjectId(activeProject.id);
                        setShowOverview(true);
                      },
                    },
                  ]}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex-1" />

      </header >

      <div className="flex-1 flex overflow-hidden relative">
        {isSidebarCollapsed && (
          <div
            className="absolute left-0 top-0 bottom-0 w-6 z-50 bg-transparent"
            onMouseEnter={() => setIsPeeking(true)}
          />
        )}

        <div
          className="shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ width: isSidebarCollapsed ? 0 : sidebarWidth }}
        >
          <Sidebar
            activeProject={activeProject}
            unsavedIds={unsavedChanges}
            onSelect={(id, isFolder) => {
              setSelectedItem(id);
              if (!isFolder) {
                setActiveRequestId(id);
              }
            }}
            selectedItemId={selectedItemId}
            onToggleFolder={toggleFolder}
            onAddRequest={addRequest}
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
            className="relative"
          />
        </div>

        <div
          className={`absolute left-2 top-2 bottom-2 z-40 rounded-xl bg-[#1a1a1a]/98 backdrop-blur-2xl border border-white/10 shadow-2xl transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${isPeeking && isSidebarCollapsed
            ? "opacity-100 translate-x-0 scale-100"
            : "opacity-0 -translate-x-4 scale-[0.98] pointer-events-none"
            }`}
          style={{ width: sidebarWidth }}
          onMouseLeave={() => setIsPeeking(false)}
        >
          <Sidebar
            activeProject={activeProject}
            unsavedIds={unsavedChanges}
            onSelect={(id, isFolder) => {
              setSelectedItem(id);
              if (!isFolder) {
                setActiveRequestId(id);
              }
            }}
            selectedItemId={selectedItemId}
            onToggleFolder={toggleFolder}
            onAddRequest={addRequest}
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
            className="h-full"
          />
        </div>


        <main
          className={`flex-1 bg-background m-1 mt-0 flex flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${!isSidebarCollapsed ? "rounded-tl-2xl rounded-xl" : "rounded-xl"}`}
        >
          {activeRequest ? (
            <>
              <div className="flex gap-4 border-b border-text/15 p-4">
                <div className={`flex-1 flex items-center bg-inputbox rounded-lg overflow-hidden relative transition-opacity ${loading ? "shimmer-loading opacity-80" : ""}`}>
                  {loading && (
                    <div className="absolute inset-0 z-10 bg-background/30 cursor-not-allowed" />
                  )}
                  <MethodSelector
                    value={activeRequest.request.method}
                    onChange={updateMethod}
                  />
                  <div className="w-px h-5 bg-white/10" />
                  <UrlInput
                    value={activeRequest.request.url}
                    onChange={(v) => updateUrl(v)}
                    onCurlPaste={handleAutoImportCurl}
                    onInvalidInput={(msg) => addToast(msg, "info")}
                    placeholder="Enter URL or paste cURL"
                    availableVariables={getActiveEnvironmentVariables().map(v => v.key)}
                    disabled={loading}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={loading || !activeRequest.request.url}
                  className="px-6 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 rounded-full text-background font-semibold transition-all"
                >
                  {loading ? "Sending" : "Send"}
                </button>
              </div>

              <div
                ref={mainPanelRef}
                className=" flex-1 flex overflow-hidden"
              >

                <div
                  className="flex p-2 pl-4 flex-col overflow-hidden"
                  style={{ width: activeRequest.response && activeTab !== "overview" ? `${mainSplitX}%` : "100%" }}
                >

                  <div className="flex items-center gap-1 py-2 shrink-0">
                    {(["overview", "params", "authorization", "body", "headers", "cookies"] as const)
                      .filter(tab => tab !== "body" || activeRequest.request.method !== "GET")
                      .map(
                        (tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`px-2 py-0.5 text-xs cursor-pointer font-medium rounded-md transition-colors ${activeTab === tab
                              ? "text-accent bg-accent/10"
                              : "text-white/80 hover:text-white/60"
                              }`}
                          >
                            {tab === "overview"
                              ? "Overview"
                              : tab.charAt(0).toUpperCase() + tab.slice(1)}
                          </button>
                        ),
                      )}
                  </div>


                  <div className="flex-1 overflow-auto relative">
                    {loading && (
                      <div className="absolute inset-0 z-10 bg-background/30 cursor-not-allowed" />
                    )}
                    {activeTab === "authorization" && (
                      <AuthEditor
                        auth={activeRequest.request.auth}
                        onChange={updateAuth}
                        availableVariables={getActiveEnvironmentVariables().map(v => v.key)}
                      />
                    )}
                    {activeTab === "params" && (
                      <div className="flex-1 flex flex-col min-h-0">
                        <KeyValueTable
                          title="Query Params"
                          items={Object.entries(activeRequest.request.query_params).map(([key, value]) => ({
                            id: key,
                            key: key,
                            value: value || "",
                            description: "",
                            enabled: isItemEnabled("param", key),
                          }))}
                          onChange={(items) => {
                            const newQueryParams: Record<string, string> = {};
                            const newDisabledItems = new Set(disabledItems);
                            const activeId = activeRequest.id;

                            items.forEach((item) => {
                              if (item.key.trim() || item.value.trim()) {
                                newQueryParams[item.key] = item.value;
                                const disabledKey = `${activeId}:param:${item.key}`;
                                if (item.enabled) {
                                  newDisabledItems.delete(disabledKey);
                                } else {
                                  newDisabledItems.add(disabledKey);
                                }
                              }
                            });

                            Object.keys(activeRequest.request.query_params).forEach(oldKey => {
                              if (!newQueryParams[oldKey]) {
                                newDisabledItems.delete(`${activeId}:param:${oldKey}`);
                              }
                            });

                            setDisabledItems(newDisabledItems);
                            updateRequest(activeId, (r) => {
                              const baseUrl = r.request.url.split("?")[0];
                              const prefix = `${activeId}:param:`;
                              const currentDisabledKeys = new Set(
                                Array.from(newDisabledItems)
                                  .filter(k => k.startsWith(prefix))
                                  .map(k => k.slice(prefix.length))
                              );
                              const queryString = buildQueryString(newQueryParams, currentDisabledKeys);
                              return {
                                ...r,
                                request: {
                                  ...r.request,
                                  query_params: newQueryParams,
                                  url: baseUrl + queryString,
                                },
                              };
                            });
                          }}
                          availableVariables={getActiveEnvironmentVariables().map(v => v.key)}
                          placeholder={{
                            key: "Param",
                            value: "Value"
                          }}
                        />
                      </div>
                    )}
                    {activeTab === "headers" && (
                      <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex items-center px-4 py-1.5 border-b border-white/5 bg-white/5">
                          <span className="text-xs text-white/30">Headers</span>
                        </div>
                        <KeyValueTable
                          items={[
                            ...getComputedHeaders(),
                            ...Object.entries(activeRequest.request.headers).map(([key, value]) => ({
                              id: key,
                              key: key,
                              value: value || "",
                              description: "",
                              enabled: isItemEnabled("header", key),
                            }))
                          ]}
                          onChange={(items) => {
                            const userItems = items.filter(i => !i.id.startsWith("computed:"));
                            const newHeaders: Record<string, string> = {};
                            const newDisabledItems = new Set(disabledItems);
                            const activeId = activeRequest.id;

                            userItems.forEach((item) => {
                              if (item.key.trim() || item.value.trim()) {
                                newHeaders[item.key] = item.value;
                                const disabledKey = `${activeId}:header:${item.key}`;
                                if (item.enabled) {
                                  newDisabledItems.delete(disabledKey);
                                } else {
                                  newDisabledItems.add(disabledKey);
                                }
                              }
                            });

                            Object.keys(activeRequest.request.headers).forEach(oldKey => {
                              if (!newHeaders[oldKey]) {
                                newDisabledItems.delete(`${activeId}:header:${oldKey}`);
                              }
                            });

                            setDisabledItems(newDisabledItems);
                            updateRequest(activeId, (r) => ({
                              ...r,
                              request: { ...r.request, headers: newHeaders }
                            }));
                          }}
                          availableVariables={getActiveEnvironmentVariables().map(v => v.key)}
                          placeholder={{
                            key: "Header",
                            value: "Value"
                          }}
                        />
                      </div>
                    )}
                    {activeTab === "cookies" && (
                      <div className="flex-1 flex flex-col min-h-0">
                        <KeyValueTable
                          title="Cookies"
                          items={activeRequest.request.cookies.map((cookie, idx) => ({
                            id: cookie.name || `${idx}`,
                            key: cookie.name,
                            value: cookie.value,
                            description: `${cookie.domain || ""} ${cookie.path || ""}`.trim(),
                            enabled: isItemEnabled("cookie", cookie.name),
                          }))}
                          onChange={(items) => {
                            const activeId = activeRequest.id;
                            const newDisabledItems = new Set(disabledItems);

                            const newCookies = items.map(i => {
                              const disabledKey = `${activeId}:cookie:${i.key}`;
                              if (i.enabled) {
                                newDisabledItems.delete(disabledKey);
                              } else {
                                newDisabledItems.add(disabledKey);
                              }

                              return {
                                name: i.key,
                                value: i.value,
                                domain: null,
                                path: null,
                                expires: null,
                                http_only: null,
                                secure: null
                              };
                            });

                            Object.keys(activeRequest.request.cookies).forEach(idx => {
                              const oldCookie = activeRequest.request.cookies[Number(idx)];
                              if (!newCookies.find(c => c.name === oldCookie.name)) {
                                newDisabledItems.delete(`${activeId}:cookie:${oldCookie.name}`);
                              }
                            });

                            setDisabledItems(newDisabledItems);
                            updateRequest(activeId, (r) => ({
                              ...r,
                              request: { ...r.request, cookies: newCookies }
                            }));
                          }}
                          showDescription={false}
                          placeholder={{
                            key: "Cookie",
                            value: "value"
                          }}
                        />

                      </div>
                    )}
                    {activeTab === "body" && (
                      <BodyEditor
                        body={activeRequest.request.body}
                        onChange={updateBody}
                        availableVariables={getActiveEnvironmentVariables().map(v => v.key)}
                      />
                    )}
                    {activeTab === "overview" && (
                      <RequestOverview
                        activeRequest={activeRequest}
                        onRun={() => {
                          handleSend();
                          setActiveTab("body");
                        }}
                        onUpdateName={(name) => renameItem(activeRequest.id, name)}
                        onUpdateDescription={(description) => {
                          updateRequest(activeRequest.id, (r) => ({ ...r, description }));
                        }}
                        onUpdatePropertyDescription={(key, description) => {
                          updateRequest(activeRequest.id, (r) => ({
                            ...r,
                            propertyDescriptions: {
                              ...(r.propertyDescriptions || {}),
                              [key]: description
                            }
                          }));
                        }}
                        onSwitchToBody={() => setActiveTab("body")}
                      />
                    )}
                  </div>
                </div>

                {activeRequest.response && activeTab !== "overview" && (
                  <>

                    <div
                      className="w-2 cursor-col-resize flex items-center justify-center shrink-0 group"
                      onMouseDown={handleMainMouseDown}
                    >
                      <div className="w-px h-full  group-hover:bg-accent/50 transition-colors" />
                    </div>


                    <div
                      ref={responsePanelRef}
                      className="flex-1 flex flex-col overflow-hidden bg-inset border-l border-white/10"
                    >

                      <div className="flex items-center justify-between p-2 px-4 shrink-0">
                        <span className="text-xs font-medium text-white">
                          Response
                        </span>
                        <div className="flex gap-1">
                          {(activeRequest.response?.available_renderers || ["Raw"]).map((renderer) => (
                            <button
                              key={renderer}
                              type="button"
                              onClick={() => setResponseTab(renderer)}
                              className={`text-xs font-medium px-2 py-0.5 rounded-md transition-colors ${responseTab === renderer
                                ? "text-accent bg-accent/10"
                                : "text-white/60 hover:text-white/50"
                                }`}
                            >
                              {getRendererLabel(renderer)}
                            </button>
                          ))}
                        </div>
                      </div>


                      <div
                        className="overflow-auto "
                        style={{ height: `${responseSplitY}%` }}
                      >
                        <div className="h-full">{renderResponseBody()}</div>
                      </div>


                      <div className="flex items-center justify-between bg-inset border-y border-white/10 shrink-0 pr-2">

                        <div className="flex items-center gap-1">
                          <div className="hidden">
                            <span className="bg-[#22c55e]/20" />
                            <span className="bg-[#eab308]/20" />
                            <span className="bg-[#f97316]/20" />
                            <span className="bg-[#ef4444]/20" />
                          </div>
                          <span
                            className={`text-xs font-bold px-3 py-2 bg-[${getStatusColor(activeRequest.response?.status || 0)}]/20`}
                            style={{
                              color: getStatusColor(activeRequest.response?.status || 0),
                            }}
                          >
                            {activeRequest.response?.status}{" "}
                            {activeRequest.response?.status_text}
                          </span>

                          <button
                            ref={timingRef}
                            type="button"
                            onMouseEnter={handleTimingEnter}
                            onMouseLeave={handleTimingLeave}
                            className="text-[11px] text-white/50 hover:text-white/80 px-2 py-1 rounded hover:bg-white/5 transition-colors cursor-default"
                          >
                            {
                              (() => {
                                const ms = activeRequest.response?.timing?.total_ms ?? 0
                                return ms >= 1000
                                  ? `${(ms / 1000).toFixed(2)} s`
                                  : `${ms.toFixed(2)} ms`
                              })()
                            }

                          </button>
                          <span className="text-white/20">•</span>

                          <button
                            ref={sizeRef}
                            type="button"
                            onMouseEnter={handleSizeEnter}
                            onMouseLeave={handleSizeLeave}
                            className="text-[11px] text-white/50 hover:text-white/80 px-2 py-1 rounded hover:bg-white/5 transition-colors cursor-default"
                          >
                            {formatBytes(activeRequest.response?.response_size?.total_bytes || 0)}
                          </button>
                        </div>


                        <ProtocolToggle
                          value={requestProtocol}
                          onChange={setRequestProtocol}
                        />


                        {timingRef.current && activeRequest.response?.timing && (
                          <TimingPopover
                            timing={activeRequest.response.timing}
                            anchorRef={timingRef as React.RefObject<HTMLElement>}
                            open={showTimingPopover}
                            onClose={() => setShowTimingPopover(false)}
                            onMouseEnter={handleTimingEnter}
                            onMouseLeave={handleTimingLeave}
                          />
                        )}

                        {sizeRef.current && activeRequest.response?.response_size && (
                          <SizePopover
                            requestSize={activeRequest.response.request_size}
                            responseSize={activeRequest.response.response_size}
                            anchorRef={sizeRef as React.RefObject<HTMLElement>}
                            open={showSizePopover}
                            onClose={() => setShowSizePopover(false)}
                            onMouseEnter={handleSizeEnter}
                            onMouseLeave={handleSizeLeave}
                          />
                        )}
                      </div>


                      <div
                        className="h-[1px] bg-white/10 cursor-row-resize transition-colors shrink-0"
                        onMouseDown={handleResponseMouseDown}
                      />


                      <div
                        className="flex flex-col overflow-hidden bg-card"
                        style={{ height: `${100 - responseSplitY}%` }}
                      >

                        <div className="flex items-center gap-1 p-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setResponseDetailTab("headers")}
                            className={`text-xs px-2 py-0.5 rounded-md font-medium transition-colors ${responseDetailTab === "headers"
                              ? "text-accent bg-accent/10"
                              : "text-white/60 hover:text-white/50"
                              }`}
                          >
                            Headers
                          </button>
                          <button
                            type="button"
                            onClick={() => setResponseDetailTab("cookies")}
                            className={`text-xs px-2 py-0.5 rounded-md font-medium transition-colors ${responseDetailTab === "cookies"
                              ? "text-accent bg-accent/10"
                              : "text-white/60 hover:text-white/50"
                              }`}
                          >
                            Cookies
                          </button>
                        </div>


                        <div className="flex-1 overflow-auto">
                          {responseDetailTab === "headers" && (
                            <div className="flex-1 min-h-0">
                              <table className="w-full text-xs font-mono border-collapse">
                                <tbody>
                                  {Object.entries(activeRequest.response?.headers || {}).map(([k, v]) => (
                                    <tr
                                      key={k}
                                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                                    >
                                      <td className="px-3 py-2 text-white/40 border-r border-white/5 w-1/3 min-w-[120px] align-top">
                                        {k}
                                      </td>
                                      <td className="px-3 py-2 text-white/60 break-all align-top whitespace-pre-wrap">
                                        {v}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {responseDetailTab === "cookies" && (
                            <div className="flex-1 min-h-0">
                              {activeRequest.response?.cookies && activeRequest.response.cookies.length > 0 ? (
                                <KeyValueTable
                                  items={activeRequest.response.cookies.map((c, i) => ({
                                    id: `${i}`,
                                    key: c.name,
                                    value: c.value,
                                    description: `${c.domain || ""} ${c.path || ""}`.trim(),
                                    enabled: true
                                  }))}
                                  onChange={() => { }}
                                  readOnly={true}
                                  showDescription={false}
                                />
                              ) : (
                                <div className="p-3 text-xs text-white/30">
                                  No cookies
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-white/20 text-sm">
              Select a request or create a new one
            </div>
          )}
        </main>
      </div>


      {
        showOverview && overviewProjectId && (
          <OverviewModal
            projectId={overviewProjectId}
            onClose={() => setShowOverview(false)}
            onUpdateProject={(updates) => renameProject(overviewProjectId, updates.name || "")}
            onAddEnvironment={(name) => addEnvironment(overviewProjectId, name)}
            onUpdateEnvironment={(envId, name) => updateEnvironment(overviewProjectId, envId, name)}
            onDeleteEnvironment={(envId) => deleteEnvironment(overviewProjectId, envId)}
            onSetActiveEnvironment={(envId) => setActiveEnvironment(overviewProjectId, envId)}
            onAddEnvVar={addEnvironmentVariable}
            onUpdateEnvVar={updateEnvironmentVariable}
            onDeleteEnvVar={deleteEnvironmentVariable}
          />
        )
      }


      {
        showCurlImport && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-[#1a1a1a] rounded-xl p-5 w-full max-w-xl border border-white/10">
              <div className="text-sm font-medium mb-4">Import cURL Command</div>
              <textarea
                value={curlInput}
                onChange={(e) => setCurlInput(e.target.value)}
                placeholder="curl https://api.example.com -H 'Content-Type: application/json'"
                className="w-full h-40 bg-[#0d0d0d] border border-white/10 rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:border-accent/50"
              />
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => setShowCurlImport(false)}
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/15 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportCurl}
                  disabled={!activeRequest}
                  className="px-4 py-2 text-sm bg-accent hover:bg-accent/90 disabled:opacity-50 rounded-lg transition-colors"
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        )
      }
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
    </div>
  );
}

export default App;
