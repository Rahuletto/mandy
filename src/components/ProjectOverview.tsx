import React, { useState, useMemo, useRef, useEffect } from "react";
import type { Project, Folder, RequestFile } from "../types/project";
import type { AuthType } from "../bindings";
import { HiChevronRight, HiChevronDown, HiTrash } from "react-icons/hi";
import {
  TabView,
  getIconComponent,
  IconPicker,
  Dialog,
  Dropdown,
  TypeLabel,
} from "./ui";
import { CodeViewer } from "./CodeMirror";
import { generateSnippet } from "../utils/snippets";
import { KeyValueTable } from "./KeyValueTable";
import { AuthEditor } from "./editors/AuthEditor";
import { useProjectStore } from "../stores/projectStore";
import { hexToRgba } from "../utils/format";
import {
  METHOD_COLORS_TAILWIND,
  getMethodColorTailwind,
} from "../utils/methodConstants";

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
}

type TabType = "overview" | "configuration" | "variables";

function collectRequests(folder: Folder): RequestFile[] {
  const results: RequestFile[] = [];
  for (const child of folder.children) {
    if (child.type === "request") {
      results.push(child);
    } else {
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
}: {
  request: RequestFile;
  onSelect: () => void;
  onRun?: () => void;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
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
    if (selectedLanguage === "python") return "python";
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
      className={`group/card flex flex-col bg-white/[0.02] border-x border-b first:border-t border-white/5 ${borderRadiusClasses} overflow-hidden hover:bg-white/[0.04] transition-all relative`}
    >
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 ${colors.bg.replace("/10", "/40")} `}
      />

      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-stretch cursor-pointer text-left overflow-hidden h-10"
      >
        <div
          className={`flex items-center justify-start px-4 ${colors.bg} ${colors.text} shrink-0 min-w-[69px] transition-colors`}
        >
          <span className="text-xs font-semibold font-mono text-left">
            {request.request.method}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-between px-4 min-w-0">
          <div className="flex flex-col">
            <span className="text-sm text-white/90 font-semibold truncate">
              {request.name}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            <span className="text-[10px] text-white/40 font-mono truncate max-w-[200px] group-hover/card:text-white/60 transition-colors">
              {request.request.url || "/"}
            </span>
            {expanded ? (
              <HiChevronDown
                size={14}
                className="text-white/20 group-hover/card:text-white/50 transition-colors"
              />
            ) : (
              <HiChevronRight
                size={14}
                className="text-white/20 group-hover/card:text-white/50 transition-colors"
              />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/5 bg-white/[0.01]">
          <div className="flex flex-col md:flex-row">
            <div className="flex flex-col flex-1 p-4 border-b md:border-b-0 md:border-r border-white/5 space-y-4">
              <div className="flex-1 space-y-8">
                <div className="flex-1 space-y-2">
                  <h3 className="text-xl font-bold text-white">
                    {request.name}
                  </h3>
                  <p className="text-sm text-white/50 italic">
                    {request.description || "No description"}
                  </p>
                </div>
                {queryParams.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-white/70 mb-2">
                      Query Parameters
                    </h4>
                    <div className="space-y-1.5 font-mono">
                      {queryParams.map(([key, value]) => (
                        <div key={key} className="flex items-baseline gap-2">
                          <span className="text-sm text-white/90 font-medium">
                            {key}
                          </span>
                          <span className="text-[10px] text-blue-400">
                            string
                          </span>
                          <span className="text-white/40 text-[10px] truncate">
                            {value || "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {bodyProperties.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-white/70 mb-2">
                      Request Body
                    </h4>
                    <div className="space-y-1.5 font-mono">
                      {bodyProperties.map(([key, value]) => (
                        <div key={key} className="flex items-baseline gap-2">
                          <span className="text-sm text-white/90 font-medium">
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
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
                className="text-xs text-accent text-left hover:text-accent/80 font-medium cursor-pointer pt-2"
              >
                Open Request →
              </button>
            </div>
            <div className="flex-1 flex flex-col min-h-[200px] relative">
              <div className="absolute inset-0 overflow-auto">
                <CodeViewer code={snippetCode} language={currentLang} />
              </div>
              {onRun && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRun();
                  }}
                  className="absolute bottom-3 right-3 px-4 py-1.5 bg-accent hover:bg-accent/90 text-background text-xs font-semibold rounded-lg transition-colors cursor-pointer z-10"
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

const FolderSection = React.memo(function FolderSection({
  folder,
  depth = 0,
  expandedIds,
  toggleFolder,
  onSelectRequest,
  onRunRequest,
}: {
  folder: Folder;
  depth?: number;
  expandedIds: Set<string>;
  toggleFolder: (id: string) => void;
  onSelectRequest: (id: string) => void;
  onRunRequest?: (id: string) => void;
}) {
  const isExpanded = expandedIds.has(folder.id);

  return (
    <div className="w-full">
      <button
        onClick={() => toggleFolder(folder.id)}
        className="w-full px-2 py-2 flex items-center gap-2 hover:bg-white/5 rounded transition-colors cursor-pointer text-left mt-3 mb-1 group"
      >
        {isExpanded ? (
          <HiChevronDown
            size={14}
            className="text-white/20 group-hover:text-white/40 shrink-0"
          />
        ) : (
          <HiChevronRight
            size={14}
            className="text-white/20 group-hover:text-white/40 shrink-0"
          />
        )}
        <span className="text-xs font-medium text-white/50 group-hover:text-white/70 truncate">
          {depth === 0 ? "/ (root)" : folder.name}
        </span>
        <span className="text-[10px] text-white/20 ml-auto shrink-0 font-medium group-hover:text-white/40 pr-1">
          {folder.children.length}
        </span>
      </button>

      {isExpanded && (
        <div
          className={`flex flex-col gap-2 ${depth > 0 ? "ml-3 border-l border-white/10 pl-4 mb-1 mt-1" : ""}`}
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
                  onRunRequest={onRunRequest}
                />
              );
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
  onRunRequest,
  onAddEnvironment,
  onUpdateEnvironment,
  onDeleteEnvironment,
  onAddEnvVar,
  onUpdateEnvVar,
  onDeleteEnvVar,
  onDeleteProject,
  initialTab = "overview",
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
    <div className="h-full flex flex-col overflow-hidden">
      <div>
        <div
          className="flex items-center gap-4 border-b border-white/5 pb-3 p-4"
          data-tauri-drag-region
        >
          <button
            ref={iconButtonRef}
            onClick={() => setShowIconPicker(true)}
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
            style={{
              color: project.iconColor || "rgba(255, 255, 255, 0.6)",
              backgroundColor: project.iconColor
                ? hexToRgba(project.iconColor, 0.05)
                : "rgba(255, 255, 255, 0.05)",
            }}
          >
            <IconComponent size={24} />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="font-semibold">{project.name}</h1>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`relative transition-all duration-300 ease-out origin-right ${
                isLangSelectorSticky
                  ? "opacity-100 scale-100 w-auto"
                  : "opacity-0 scale-95 w-0 overflow-hidden"
              }`}
            >
              <button
                onClick={() => setShowLangDropdown(!showLangDropdown)}
                className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/5 rounded-lg text-xs text-white/50 hover:text-white/90 transition-all cursor-pointer group whitespace-nowrap"
              >
                <span>
                  {LANGUAGES.find((l) => l.id === selectedLanguage)?.label}
                </span>
                <HiChevronDown
                  size={14}
                  className="text-white/20 group-hover:text-white/40 transition-colors mt-0.5"
                />
              </button>
              {showLangDropdown && (
                <Dropdown
                  className="right-0 top-full mt-1"
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
              onClick={onExport}
              className="px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
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
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <input
                    autoFocus
                    className="text-2xl font-bold bg-transparent border-none outline-none text-white w-full"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={handleNameBlur}
                    onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
                  />
                ) : (
                  <h1
                    className="text-2xl font-bold text-white cursor-text hover:text-white/90"
                    onClick={() => setEditingName(true)}
                  >
                    {project.name}
                  </h1>
                )}

                {editingDescription ? (
                  <textarea
                    autoFocus
                    className="text-sm text-white/50 bg-transparent border-none outline-none w-full mt-2 resize-none"
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
                    className="text-sm text-white/40 mt-2 whitespace-pre-wrap cursor-text hover:text-white/60"
                    onClick={() => setEditingDescription(true)}
                  >
                    {project.description || "Add a description..."}
                  </p>
                )}
              </div>

              <div
                className={`flex flex-col items-end shrink-0 relative transition-all duration-300 ease-out ${
                  isLangSelectorSticky
                    ? "opacity-0 pointer-events-none"
                    : "opacity-100"
                }`}
                ref={langSelectorRef}
              >
                <button
                  onClick={() => setShowLangDropdown(!showLangDropdown)}
                  className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/5 rounded-lg text-xs text-white/50 hover:text-white/90 transition-all cursor-pointer group"
                >
                  <span>
                    {LANGUAGES.find((l) => l.id === selectedLanguage)?.label}
                  </span>
                  <HiChevronDown
                    size={14}
                    className="text-white/20 group-hover:text-white/40 transition-colors mt-0.5"
                  />
                </button>
                {showLangDropdown && (
                  <Dropdown
                    className="right-0 top-full mt-1"
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
                onRunRequest={onRunRequest}
              />

              {allRequests.length === 0 && (
                <div className="text-center py-12 text-white/30 text-sm">
                  No requests yet. Create one to get started.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "configuration" && (
          <div className="space-y-6 max-w-xl">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2">
                Base URL
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                onBlur={() => onUpdateProject({ baseUrl })}
                placeholder="https://api.example.com"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent/50"
              />
              <p className="text-[10px] text-white/30 mt-1">
                Prepended to relative URLs
              </p>
            </div>

            <div className="pt-6 border-t border-white/5">
              <label className="block text-xs font-medium text-white/50 mb-2">
                Project Authorization
              </label>
              <p className="text-[10px] text-white/30 mb-4">
                Set default authorization for all requests in this project.
                Requests can inherit this auth or override it with their own.
              </p>
              <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
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

            <div className="pt-6 border-t border-white/5">
              <h3 className="text-sm font-semibold text-white mb-1">
                Danger Zone
              </h3>
              <p className="text-xs text-white/30 mb-4">
                Once you delete a project, there is no going back. Please be
                certain.
              </p>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-semibold rounded-lg border border-red-500/20 transition-all cursor-pointer"
              >
                Delete Project
              </button>
            </div>
          </div>
        )}

        {activeTab === "variables" && (
          <div className="space-y-4">
            <div className="flex gap-2 w-full">
              <input
                type="text"
                value={newEnvName}
                onChange={(e) => setNewEnvName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddEnv()}
                placeholder="Add new environment..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent/50"
              />
              <button
                onClick={handleAddEnv}
                disabled={!newEnvName.trim()}
                className="px-6 py-2.5 text-sm font-bold bg-accent hover:bg-accent/90 disabled:opacity-50 text-background rounded-full transition-all cursor-pointer"
              >
                Create
              </button>
            </div>

            <div className="space-y-2">
              {project.environments.map((env) => (
                <div
                  key={env.id}
                  className={`border rounded-xl overflow-hidden transition-all ${env.id === project.activeEnvironmentId ? "border-accent/30" : "border-white/10"}`}
                >
                  <div
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${env.id === project.activeEnvironmentId ? "bg-accent/5" : "hover:bg-white/5"}`}
                    onClick={() =>
                      setExpandedEnvId(expandedEnvId === env.id ? null : env.id)
                    }
                  >
                    <span
                      className={`text-[10px] w-4 ${env.id === project.activeEnvironmentId ? "text-accent" : "text-white/30"}`}
                    >
                      {expandedEnvId === env.id ? "▼" : "▶"}
                    </span>

                    <input
                      type="text"
                      value={
                        editingEnvId === env.id ? editingEnvName : env.name
                      }
                      onClick={(e) => e.stopPropagation()}
                      autoFocus={editingEnvId === env.id}
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
                      className={`text-sm flex-1 bg-transparent border-none focus:outline-none transition-colors px-1 py-0.5 rounded focus:bg-white/5 ${env.id === project.activeEnvironmentId ? "text-accent font-semibold" : "text-white/70"}`}
                    />

                    <span
                      className={`text-xs ml-1 mr-auto font-medium ${env.id === project.activeEnvironmentId ? "text-accent/60" : "text-white/20"}`}
                    >
                      ({env.variables.length})
                    </span>

                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onDeleteEnvironment?.(env.id)}
                        disabled={project.environments.length <= 1}
                        className="p-1.5 rounded text-white/20 hover:text-red-400 hover:bg-red-400/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        <HiTrash size={14} />
                      </button>
                    </div>
                  </div>

                  {expandedEnvId === env.id && (
                    <div className="border-t border-white/5">
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
                <div className="text-center py-12 text-white/20 text-sm border border-dashed border-white/10 rounded-lg">
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
        description={`Are you sure you want to delete "${project.name}" ? All requests, folders, and environments will be permanently removed.This action cannot be undone.`}
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
