import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { TbRefresh, TbBrandGraphql } from "react-icons/tb";
import { buildClientSchema, printSchema } from "graphql";
import type { GraphQLSchema, IntrospectionQuery } from "graphql";
import type { AuthType } from "../../bindings";
import { commands } from "../../bindings";
import type { GraphQLFile, GraphQLKeyValue } from "../../types/project";
import { KeyValueTable, type KeyValueItem } from "../KeyValueTable";
import { AuthEditor } from "./AuthEditor";
import { GraphQLOverview } from "./GraphQLOverview";
import { CodeEditor, CodeViewer, GraphQLCodeEditor } from "../CodeMirror";
import { SchemaExplorer } from "./SchemaExplorer";
import { TimingPopover } from "../popovers/TimingPopover";
import { SizePopover } from "../popovers/SizePopover";
import { formatBytes, getStatusColor, STATUS_TEXT } from "../../utils/format";

interface GraphQLEditorProps {
  gql: GraphQLFile;
  onUpdate: (updater: (gql: GraphQLFile) => void) => void;
  onSendQuery: () => void;
  loading?: boolean;
  availableVariables?: string[];
  projectAuth?: AuthType;
  onOpenProjectSettings?: () => void;
  onStartLoading?: (id: string) => void;
  onStopLoading?: (id: string) => void;
}

type GqlTab = "overview" | "query" | "variables" | "authorization" | "headers";
type SchemaViewMode = "pretty" | "raw";

function toKeyValueItems(items: GraphQLKeyValue[]): KeyValueItem[] {
  return items.map((item) => ({
    id: item.id,
    key: item.key,
    value: item.value,
    description: item.description,
    enabled: item.enabled,
  }));
}

function fromKeyValueItems(items: KeyValueItem[]): GraphQLKeyValue[] {
  return items.map((item) => ({
    id: item.id,
    key: item.key,
    value: item.value,
    description: item.description,
    enabled: item.enabled,
  }));
}

function tryBuildSchema(schemaJSON: string | undefined): GraphQLSchema | null {
  if (!schemaJSON) return null;
  try {
    const introspection: IntrospectionQuery = JSON.parse(schemaJSON);
    return buildClientSchema(introspection);
  } catch {
    return null;
  }
}

export function GraphQLEditor({
  gql,
  onUpdate,
  onSendQuery,
  loading,
  availableVariables,
  projectAuth,
  onOpenProjectSettings,
}: GraphQLEditorProps) {
  const [activeTab, setActiveTab] = useState<GqlTab>("overview");
  const [schemaViewMode, setSchemaViewMode] =
    useState<SchemaViewMode>("pretty");
  const [schemaFilter, setSchemaFilter] = useState("");
  // schema pane split: percentage of the query column height given to the editor
  const [schemaSplitY, setSchemaSplitY] = useState(55);
  const [isResizingSchema, setIsResizingSchema] = useState(false);
  const queryColumnRef = useRef<HTMLDivElement>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const fetchedUrlRef = useRef<string | null>(null);

  const [responseSplitY, setResponseSplitY] = useState(60);
  const [isResizingResponse, setIsResizingResponse] = useState(false);
  const responsePanelRef = useRef<HTMLDivElement>(null);
  const [responseDetailTab, setResponseDetailTab] = useState<
    "headers" | "cookies"
  >("headers");

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

  const handleResponseMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingResponse(true);
  }, []);

  const [url, setUrl] = useState(gql.url);

  useEffect(() => {
    setUrl(gql.url);
  }, [gql.id]);

  const graphqlSchema = useMemo(
    () => tryBuildSchema(gql.schemaJSON),
    [gql.schemaJSON],
  );

  const schemaSdl = useMemo(() => {
    if (!graphqlSchema) return null;
    try {
      return printSchema(graphqlSchema);
    } catch {
      return null;
    }
  }, [graphqlSchema]);

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
        setResponseSplitY(Math.max(20, Math.min(80, newPercent)));
      }
      if (isResizingSchema && queryColumnRef.current) {
        const rect = queryColumnRef.current.getBoundingClientRect();
        const newPercent = ((e.clientY - rect.top) / rect.height) * 100;
        setSchemaSplitY(Math.max(20, Math.min(80, newPercent)));
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      setIsResizingResponse(false);
      setIsResizingSchema(false);
    };
    if (isResizing || isResizingResponse || isResizingSchema) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = isResizing ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, isResizingResponse, isResizingSchema]);

  const handleUrlChange = useCallback(
    (newUrl: string) => {
      setUrl(newUrl);
      onUpdate((prev) => ({ ...prev, url: newUrl }));
    },
    [onUpdate],
  );

  const fetchSchema = useCallback(
    async (targetUrl?: string) => {
      const urlToFetch = targetUrl || gql.url;
      if (!urlToFetch) return;
      onStartLoading?.(gql.id);
      setSchemaLoading(true);
      setSchemaError(null);

      try {
        const headers: Record<string, string> = {};

        (gql.headerItems || [])
          .filter((h) => h.enabled && h.key)
          .forEach((h) => {
            headers[h.key] = h.value;
          });

        const result = await commands.graphqlIntrospect({
          url: urlToFetch,
          headers,
        });

        if (result.status === "error") {
          throw new Error(result.error);
        }

        const { schema_json, error } = result.data;

        if (error) {
          throw new Error(error);
        }

        if (!schema_json) {
          throw new Error("No schema returned from server");
        }

        const introspectionData = JSON.parse(schema_json) as IntrospectionQuery;
        const schemaObj = buildClientSchema(introspectionData);
        const sdl = printSchema(schemaObj);

        fetchedUrlRef.current = urlToFetch;
        onUpdate((prev) => ({
          ...prev,
          schemaJSON: schema_json,
          schema: sdl,
          schemaLastFetched: Date.now(),
        }));
      } catch (err: any) {
        setSchemaError(err.message || "Failed to fetch schema");
      } finally {
        setSchemaLoading(false);
        onStopLoading?.();
      }
    },
    [gql.url, gql.headerItems, onUpdate, onStartLoading, onStopLoading],
  );

  useEffect(() => {
    if (!gql.url || gql.schemaJSON || schemaLoading) return;
    try {
      new URL(gql.url);
    } catch {
      return;
    }
    fetchSchema(gql.url);
  }, [gql.url, gql.schemaJSON]);

  useEffect(() => {
    if (!gql.url || schemaLoading) return;
    if (
      fetchedUrlRef.current &&
      fetchedUrlRef.current !== gql.url &&
      gql.schemaJSON
    ) {
      try {
        new URL(gql.url);
      } catch {
        return;
      }
      fetchedUrlRef.current = null;
      onUpdate((prev) => ({
        ...prev,
        schemaJSON: undefined,
        schema: undefined,
        schemaLastFetched: undefined,
      }));
    }
  }, [gql.url]);

  const tabs: GqlTab[] = [
    "overview",
    "query",
    "variables",
    "authorization",
    "headers",
  ];
  const isOverview = activeTab === "overview";
  const showResponsePanel = activeTab !== "overview" && gql.response;
  const response = gql.response;

  const responseBody = response
    ? (() => {
        try {
          return atob(response.body_base64 || "");
        } catch {
          return "";
        }
      })()
    : "";

  const formattedResponse = responseBody
    ? (() => {
        try {
          return JSON.stringify(JSON.parse(responseBody), null, 2);
        } catch {
          return responseBody;
        }
      })()
    : "";

  const tabLabel = (tab: GqlTab) => {
    switch (tab) {
      case "authorization":
        return "Authorization";
      case "variables":
        return "Variables";
      default:
        return tab.charAt(0).toUpperCase() + tab.slice(1);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* URL bar */}
      <div className="flex gap-4 border-b border-text/15 p-4">
        <div
          className={`flex-1 flex items-center bg-inputbox rounded-lg overflow-hidden relative transition-opacity ${loading ? "shimmer-loading opacity-80" : ""}`}
        >
          {loading && (
            <div className="absolute inset-0 z-10 bg-background/30 cursor-not-allowed" />
          )}
          <span className="px-4 py-2.5 flex items-center text-fuchsia-400">
            <TbBrandGraphql size={18} />
          </span>
          <div className="w-px h-5 bg-white/10" />
          <input
            type="text"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://api.example.com/graphql"
            className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20"
            disabled={loading}
          />
          {schemaLoading && (
            <span className="w-3 h-3 mr-3 border-2 border-fuchsia-400/30 border-t-fuchsia-400 rounded-full animate-spin shrink-0" />
          )}
        </div>
        <button
          onClick={onSendQuery}
          disabled={loading || !gql.url}
          className="px-6 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 rounded-full text-background font-semibold transition-all"
        >
          {loading ? "Sending" : "Run"}
        </button>
      </div>

      <div ref={splitContainerRef} className="flex flex-1 overflow-hidden">
        <div
          className="flex flex-col overflow-hidden"
          style={{
            width: isOverview
              ? "100%"
              : showResponsePanel
                ? `${splitPercent}%`
                : "100%",
          }}
        >
          {/* Top-level tabs */}
          <div className="flex items-center gap-1 py-2 px-4 shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-2 py-0.5 text-xs cursor-pointer font-medium rounded-md transition-colors ${
                  activeTab === tab
                    ? "text-accent bg-accent/10"
                    : "text-white/80 hover:text-white/60"
                }`}
              >
                {tabLabel(tab)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden relative">
            {loading && activeTab !== "overview" && (
              <div className="absolute inset-0 z-10 bg-background/30 cursor-not-allowed" />
            )}

            {/* Overview */}
            {activeTab === "overview" && (
              <div className="h-full overflow-auto px-2 pl-4">
                <GraphQLOverview
                  gql={gql}
                  onUpdate={onUpdate}
                  onRun={() => {
                    onSendQuery();
                    setActiveTab("query");
                  }}
                />
              </div>
            )}

            {/* Query tab — editor top, schema pane bottom, resizable */}
            {activeTab === "query" && (
              <div
                ref={queryColumnRef}
                className="flex flex-col h-full overflow-hidden"
              >
                {/* Query editor */}
                <div
                  className="min-h-0 flex flex-col"
                  style={{ height: `${schemaSplitY}%` }}
                >
                  <div className="flex-1 min-h-0">
                    <GraphQLCodeEditor
                      code={gql.query}
                      onChange={(value) =>
                        onUpdate((prev) => ({ ...prev, query: value }))
                      }
                      schema={graphqlSchema}
                    />
                  </div>
                </div>

                {/* Drag handle */}
                <div
                  className="h-[3px] cursor-row-resize shrink-0 bg-white/5 hover:bg-accent/40 active:bg-accent/60 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizingSchema(true);
                  }}
                />

                {/* Schema pane */}
                <div
                  className="flex flex-col overflow-hidden"
                  style={{ height: `${100 - schemaSplitY}%` }}
                >
                  {/* Header: filter left, reload + Pretty/Raw right */}
                  <div className="flex w-full flex-row shrink-0 border-y border-white/10">
                    <span className="text-xs font-bold px-3 py-2 flex items-center gap-1.5 bg-fuchsia-500/20 text-fuchsia-400">
                      SCHEMA
                    </span>
                    <div className="flex flex-1 items-center gap-2 px-3 py-1.5 bg-inset min-w-0">
                      <input
                        type="text"
                        value={schemaFilter}
                        onChange={(e) => setSchemaFilter(e.target.value)}
                        placeholder="Filter types and fields..."
                        className="flex-1 bg-transparent w-full text-xs text-white outline-none placeholder:text-white/20 min-w-0"
                      />

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Reload button */}
                        <button
                          type="button"
                          onClick={() => fetchSchema()}
                          disabled={schemaLoading || !gql.url}
                          title="Reload schema"
                          className="p-0.5 rounded transition-colors text-white/40 hover:text-white/80 disabled:opacity-30"
                        >
                          <TbRefresh
                            size={13}
                            className={schemaLoading ? "animate-spin" : ""}
                          />
                        </button>

                        <div className="w-px h-3 bg-white/10 mx-0.5" />

                        {/* Pretty / Raw — same style as response renderer buttons */}
                        {(["pretty", "raw"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setSchemaViewMode(mode)}
                            className={`text-xs font-medium px-2 py-0.5 rounded-md transition-colors ${
                              schemaViewMode === mode
                                ? "text-accent bg-accent/10"
                                : "text-white/60 hover:text-white/50"
                            }`}
                          >
                            {mode === "pretty" ? "Pretty" : "Raw"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Schema body */}
                  <div className="flex-1 min-h-0 overflow-auto bg-card">
                    {schemaError && (
                      <div className="m-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
                        {schemaError}
                      </div>
                    )}

                    {!graphqlSchema && !schemaError && (
                      <div className="flex flex-col items-center justify-center h-full text-white/20 text-xs gap-2">
                        <p>No schema loaded</p>
                        <p className="text-white/10">
                          Enter a GraphQL endpoint URL to auto-fetch
                        </p>
                      </div>
                    )}

                    {graphqlSchema && schemaViewMode === "pretty" && (
                      <SchemaExplorer
                        schema={graphqlSchema}
                        filter={schemaFilter}
                      />
                    )}

                    {graphqlSchema && schemaViewMode === "raw" && schemaSdl && (
                      <CodeViewer code={schemaSdl} language="graphql" />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Variables — top-level tab */}
            {activeTab === "variables" && (
              <div className="h-full px-2 pl-4">
                <CodeEditor
                  code={gql.variables}
                  language="json"
                  onChange={(value) =>
                    onUpdate((prev) => ({ ...prev, variables: value }))
                  }
                />
              </div>
            )}

            {/* Authorization */}
            {activeTab === "authorization" && (
              <div className="h-full overflow-auto px-2 pl-4">
                <AuthEditor
                  auth={gql.auth || "None"}
                  onChange={(auth) => onUpdate((prev) => ({ ...prev, auth }))}
                  availableVariables={availableVariables}
                  projectAuth={projectAuth}
                  isInherited={gql.useInheritedAuth ?? true}
                  onInheritChange={(inherit) =>
                    onUpdate((prev) => ({
                      ...prev,
                      useInheritedAuth: inherit,
                    }))
                  }
                  onOpenProjectSettings={onOpenProjectSettings}
                />
              </div>
            )}

            {/* Headers */}
            {activeTab === "headers" && (
              <div className="h-full px-2 pl-4">
                <KeyValueTable
                  items={toKeyValueItems(gql.headerItems || [])}
                  onChange={(items) =>
                    onUpdate((prev) => ({
                      ...prev,
                      headerItems: fromKeyValueItems(items),
                    }))
                  }
                  availableVariables={availableVariables}
                  placeholder={{ key: "Header", value: "Value" }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Response panel */}
        {showResponsePanel && response && (
          <>
            <div
              className="w-2 cursor-col-resize flex items-center justify-center shrink-0 group"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizing(true);
              }}
            >
              <div className="w-px h-full group-hover:bg-accent/50 transition-colors" />
            </div>

            <div
              ref={responsePanelRef}
              className="flex-1 flex flex-col overflow-hidden bg-inset border-l border-white/10"
            >
              <div className="flex items-center justify-between p-2 px-4 shrink-0">
                <span className="text-xs font-medium text-white">Response</span>
              </div>

              <div
                className="overflow-auto"
                style={{ height: `${responseSplitY}%` }}
              >
                <div className="h-full">
                  <CodeViewer code={formattedResponse} language="json" />
                </div>
              </div>

              <div className="flex items-center justify-between bg-inset border-y border-white/10 shrink-0 pr-2">
                <div className="flex items-center gap-1">
                  <span
                    className="text-xs font-bold px-3 py-2 flex items-center gap-1.5"
                    style={{
                      color: getStatusColor(response.status),
                      backgroundColor: `${getStatusColor(response.status)}20`,
                    }}
                  >
                    {response.status}{" "}
                    {STATUS_TEXT[response.status] || response.status_text}
                  </span>

                  {response.timing && (
                    <>
                      <button
                        ref={timingRef}
                        type="button"
                        onMouseEnter={handleTimingEnter}
                        onMouseLeave={handleTimingLeave}
                        className="text-[11px] text-white/50 hover:text-white/80 px-2 py-1 rounded hover:bg-white/5 transition-colors cursor-default"
                      >
                        {(() => {
                          const ms = response.timing?.total_ms ?? 0;
                          return ms >= 1000
                            ? `${(ms / 1000).toFixed(2)} s`
                            : `${ms.toFixed(2)} ms`;
                        })()}
                      </button>
                      <span className="text-white/20">&bull;</span>
                    </>
                  )}

                  {response.response_size && (
                    <button
                      ref={sizeRef}
                      type="button"
                      onMouseEnter={handleSizeEnter}
                      onMouseLeave={handleSizeLeave}
                      className="text-[11px] text-white/50 hover:text-white/80 px-2 py-1 rounded hover:bg-white/5 transition-colors cursor-default"
                    >
                      {formatBytes(response.response_size.total_bytes || 0)}
                    </button>
                  )}
                </div>
              </div>

              {timingRef.current && response.timing && (
                <TimingPopover
                  timing={response.timing}
                  anchorRef={timingRef as React.RefObject<HTMLElement>}
                  open={showTimingPopover}
                  onClose={() => setShowTimingPopover(false)}
                  onMouseEnter={handleTimingEnter}
                  onMouseLeave={handleTimingLeave}
                />
              )}

              {sizeRef.current && response.response_size && (
                <SizePopover
                  requestSize={response.request_size}
                  responseSize={response.response_size}
                  anchorRef={sizeRef as React.RefObject<HTMLElement>}
                  open={showSizePopover}
                  onClose={() => setShowSizePopover(false)}
                  onMouseEnter={handleSizeEnter}
                  onMouseLeave={handleSizeLeave}
                />
              )}

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
                    className={`text-xs px-2 py-0.5 rounded-md font-medium transition-colors ${
                      responseDetailTab === "headers"
                        ? "text-accent bg-accent/10"
                        : "text-white/60 hover:text-white/50"
                    }`}
                  >
                    Headers
                  </button>
                  <button
                    type="button"
                    onClick={() => setResponseDetailTab("cookies")}
                    className={`text-xs px-2 py-0.5 rounded-md font-medium transition-colors ${
                      responseDetailTab === "cookies"
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
                          {Object.entries(
                            (response.headers || {}) as Record<string, string>,
                          ).map(([k, v]) => (
                            <tr
                              key={k}
                              className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                            >
                              <td className="px-3 py-2 text-white/40 border-r border-white/5 w-1/3 min-w-[120px] align-top">
                                {k}
                              </td>
                              <td className="px-3 py-2 text-white/60 break-all align-top whitespace-pre-wrap">
                                {v ?? ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {responseDetailTab === "cookies" && (
                    <div className="flex-1 min-h-0">
                      {response.cookies && response.cookies.length > 0 ? (
                        <KeyValueTable
                          items={response.cookies.map(
                            (
                              c: {
                                name: string;
                                value: string;
                                domain?: string | null;
                                path?: string | null;
                              },
                              i: number,
                            ) => ({
                              id: `${i}`,
                              key: c.name,
                              value: c.value,
                              description:
                                `${c.domain || ""} ${c.path || ""}`.trim(),
                              enabled: true,
                            }),
                          )}
                          onChange={() => {}}
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
    </div>
  );
}
