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
    <div className="overflow-hidden border-white/10 border-y bg-inset">
      <div className="flex shrink-0 items-center justify-between border-white/10 border-b p-2 px-4">
        <span className="font-medium text-white text-xs">Response</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setViewMode("raw")}
            className={`rounded-md px-2 py-0.5 font-medium text-xs transition-colors ${
              viewMode === "raw"
                ? "bg-accent/10 text-accent"
                : "text-white/60 hover:text-white/50"
            }`}
          >
            Raw
          </button>
          <button
            type="button"
            onClick={() => setViewMode("json")}
            className={`rounded-md px-2 py-0.5 font-medium text-xs transition-colors ${
              viewMode === "json"
                ? "bg-accent/10 text-accent"
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
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-3 p-3">
        <div className="flex items-center gap-2 rounded-lg bg-white/2 p-2.5">
          <span
            className="font-bold font-mono text-xs"
            style={{ color: getMethodColor(data.method || "GET") }}
          >
            {getShortMethod(data.method || "GET")}
          </span>
          <span className="flex-1 truncate text-sm text-white/80">
            {data.requestName || "Unnamed"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowOverrideModal(true)}
          className={`flex w-full items-center gap-2 rounded-lg border p-2.5 text-left transition-colors ${
            hasOverrides
              ? "border-accent/30 bg-accent/5"
              : "border-white/10 bg-white/2 hover:bg-white/4"
          }`}
        >
          <VscSettingsGear
            size={14}
            className={hasOverrides ? "text-accent" : "text-white/40"}
          />
          <div className="min-w-0 flex-1">
            <div className="text-white/80 text-xs">
              {hasOverrides ? "Overrides configured" : "Configure overrides"}
            </div>
            {hasOverrides && (
              <div className="truncate text-[10px] text-white/40">
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
          <VscChevronRight size={12} className="shrink-0 text-white/30" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="overflow-auto" style={{ height: `${outputHeight}%` }}>
          {nodeOutput && <EndResponseViewer output={nodeOutput} />}
        </div>

        <div
          className="h-[2px] shrink-0 cursor-row-resize bg-white/10 transition-colors"
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
          <div className="flex shrink-0 items-center gap-1 border-white/5 border-b p-2">
            <span className="rounded-md bg-accent/10 px-2 py-0.5 font-medium text-accent text-xs">
              Console
            </span>
          </div>

          {inputs.length === 0 ? (
            <div className="p-3 text-white/35 text-xs">No connected inputs</div>
          ) : (
            <div className="border-white/10 border-b">
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
                    className="overflow-hidden border-white/10 border-b last:border-b-0"
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
                      className="flex w-full items-center justify-between px-3 py-2.5 transition-colors hover:bg-white/5"
                    >
                      <div className="flex min-w-0 items-center gap-2 text-left">
                        {input.method ? (
                          <span
                            className="font-bold font-mono text-[10px]"
                            style={{ color: getMethodColor(input.method) }}
                          >
                            {input.method}
                          </span>
                        ) : null}
                        <span className="truncate text-white/80 text-xs">
                          {input.nodeName}
                        </span>
                        {!output ? (
                          <span className="text-[10px] text-white/35">
                            no output
                          </span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {output?.status !== undefined ? (
                          <span className="group relative">
                            <span
                              className="rounded px-2 py-0.5 font-bold text-[10px]"
                              style={{
                                color: getStatusColor(output.status),
                                backgroundColor: `${getStatusColor(output.status)}20`,
                              }}
                            >
                              {output.status}
                            </span>
                            <span className="pointer-events-none absolute top-full right-0 z-20 mt-1 whitespace-nowrap rounded border border-white/10 bg-card px-2 py-1 text-[10px] text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
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
                      <div className="border-white/5 border-t bg-black/20">
                        {output ? (
                          <>
                            <div className="flex shrink-0 items-center justify-between border-white/10 border-b bg-inset pr-2">
                              <div className="flex items-center gap-1">
                                <span
                                  className="flex items-center gap-1.5 px-3 py-2 font-bold text-xs"
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
                                  className="cursor-default rounded px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
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
                                  className="cursor-default rounded px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
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
                            <div className="max-h-[220px] overflow-auto border-white/10 border-t bg-black/20">
                              <CodeViewer
                                code={JSON.stringify(output, null, 2)}
                                language="json"
                              />
                            </div>
                          </>
                        ) : (
                          <div className="p-2 text-white/40 text-xs">
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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 p-3">
        <label className="mb-1 block px-1 text-[10px] text-white/30">
          Name
        </label>
        <input
          type="text"
          value={data.label || ""}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Check response"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white text-xs focus:border-accent/50 focus:outline-none"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-white/5 border-y px-3 py-1.5">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[10px] text-white/30">
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
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-auto p-3">
        <div>
          <label className="mb-1 block px-1 text-[10px] text-white/30">
            Name
          </label>
          <input
            type="text"
            value={data.label || ""}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="Process items"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white text-xs focus:border-accent/50 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block px-1 text-[10px] text-white/30">
            Type
          </label>
          <div className="flex gap-1">
            {(["count", "forEach", "while"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onUpdate({ loopType: type })}
                className={`flex-1 rounded-lg px-3 py-2 text-xs transition-colors ${
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
            <label className="mb-1 block px-1 text-[10px] text-white/30">
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
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white text-xs focus:border-accent/50 focus:outline-none"
            />
          </div>
        )}

        {loopType === "forEach" && (
          <div>
            <label className="mb-1 block px-1 text-[10px] text-white/30">
              Array path
            </label>
            <input
              type="text"
              value={data.forEachPath || ""}
              onChange={(e) => onUpdate({ forEachPath: e.target.value })}
              placeholder="body.items"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-white text-xs focus:border-accent/50 focus:outline-none"
            />
            <p className="mt-1.5 px-1 text-[10px] text-white/30">
              Access current item with{" "}
              <code className="text-accent">{"{{item}}"}</code>, index with{" "}
              <code className="text-accent">{"{{index}}"}</code> (one-based:{" "}
              <code className="text-accent">{"{{index+1}}"}</code>)
            </p>
          </div>
        )}

        {loopType === "while" && (
          <div>
            <label className="mb-1 block px-1 text-[10px] text-white/30">
              Condition (TypeScript)
            </label>
            <input
              type="text"
              value={data.whileCondition || ""}
              onChange={(e) => onUpdate({ whileCondition: e.target.value })}
              placeholder="return !!body?.hasMore"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-white text-xs focus:border-accent/50 focus:outline-none"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block px-1 text-[10px] text-white/30">
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
          <label className="mb-1 block px-1 text-[10px] text-white/30">
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
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white text-xs focus:border-accent/50 focus:outline-none"
          />
        </div>

        {data.collectResults && nodeOutput && (
          <div>
            <label className="mb-1 block px-1 text-[10px] text-white/30">
              Aggregated output preview
            </label>
            <div className="mt-2 border-white/10 border-t pt-2">
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
          <div className="flex h-full flex-col">
            <div className="shrink-0 border-white/10 border-b p-3">
              <div className="mb-2 text-[10px] text-white/40">
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
                <div className="flex h-full items-center justify-center p-4 text-center">
                  <div className="text-sm text-white/40">
                    No variables defined
                  </div>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 border-white/10 border-b bg-card">
                    <tr>
                      <th className="border-white/10 border-r px-3 py-2 text-left font-medium text-white/40">
                        Key
                      </th>
                      <th className="flex-1 border-white/10 border-r px-3 py-2 text-left font-medium text-white/40">
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
                          className="border-white/5 border-b hover:bg-white/2"
                        >
                          <td className="border-white/5 border-r px-3 py-2">
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
                              className="w-full bg-transparent font-mono text-white/80 text-xs placeholder:text-white/20 focus:outline-none"
                            />
                          </td>
                          <td className="border-white/5 border-r px-3 py-2">
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
                              className="w-full bg-transparent font-mono text-white/60 text-xs placeholder:text-white/20 focus:outline-none"
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
                              className="rounded p-0.5 text-white/40 transition-colors hover:bg-red/10 hover:text-red"
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

            <div className="shrink-0 border-white/10 border-t p-3">
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
                className="w-full rounded border border-white/10 bg-white/5 px-3 py-1.5 text-white/80 text-xs transition-colors hover:bg-white/10"
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
          <div className="flex h-full flex-col">
            <div className="flex flex-1 flex-col overflow-hidden">
              <div
                className="overflow-auto"
                style={{ height: `${outputHeight}%` }}
              >
                <EndResponseViewer output={finalOutput} />
              </div>

              <div
                className="h-[2px] shrink-0 cursor-row-resize bg-white/10 transition-colors"
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
                <div className="flex shrink-0 items-center gap-1 border-white/5 border-b p-2">
                  <span className="rounded-md bg-accent/10 px-2 py-0.5 font-medium text-accent text-xs">
                    Console
                  </span>
                </div>

                {availableOutputs.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-4 text-center">
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
                          className="overflow-hidden border-white/10 border-b last:border-b-0"
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
                            className="flex w-full items-center justify-between px-3 py-2.5 transition-colors hover:bg-white/5"
                          >
                            <div className="flex min-w-0 items-center gap-2 text-left">
                              {input.method ? (
                                <span
                                  className="font-bold font-mono text-[10px]"
                                  style={{
                                    color: getMethodColor(input.method),
                                  }}
                                >
                                  {input.method}
                                </span>
                              ) : null}
                              <span className="truncate text-white/80 text-xs">
                                {input.nodeName}
                              </span>
                              {!output ? (
                                <span className="text-[10px] text-white/35">
                                  no output
                                </span>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {output?.status !== undefined ? (
                                <span className="group relative">
                                  <span
                                    className="rounded px-2 py-0.5 font-bold text-[10px]"
                                    style={{
                                      color: getStatusColor(output.status),
                                      backgroundColor: `${getStatusColor(output.status)}20`,
                                    }}
                                  >
                                    {output.status}
                                  </span>
                                  <span className="pointer-events-none absolute top-full right-0 z-20 mt-1 whitespace-nowrap rounded border border-white/10 bg-card px-2 py-1 text-[10px] text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
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
                            <div className="border-white/5 border-t bg-black/20">
                              {output ? (
                                <>
                                  <div className="flex shrink-0 items-center justify-between border-white/10 border-b bg-inset pr-2">
                                    <div className="flex items-center gap-1">
                                      <span
                                        className="flex items-center gap-1.5 px-3 py-2 font-bold text-xs"
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
                                        className="cursor-default rounded px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
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
                                        className="cursor-default rounded px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
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
                                  <div className="max-h-[220px] overflow-auto border-white/10 border-t bg-black/20">
                                    <CodeViewer
                                      code={JSON.stringify(output, null, 2)}
                                      language="json"
                                    />
                                  </div>
                                </>
                              ) : (
                                <div className="p-2 text-white/40 text-xs">
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
        className="group flex w-2 shrink-0 cursor-col-resize items-center justify-center"
        onMouseDown={handleMouseDown}
      >
        <div
          className={`h-full w-px transition-colors ${isResizing ? "bg-accent" : "group-hover:bg-accent/50"}`}
        />
      </div>

      <div
        ref={panelRef}
        className="flex flex-col overflow-hidden border-white/10 border-l bg-inset"
        style={{ width }}
      >
        <div className="flex shrink-0 items-center justify-between border-white/10 border-b px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${config.color}`} />
            <span className="font-medium text-white/90 text-xs">
              {NODE_TITLES[nodeData.type] || "Node"}
            </span>
            <span className={`text-[10px] ${config.text}`}>{config.label}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-white/10"
          >
            <VscClose size={14} className="text-white/40" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {renderConfig()}
        </div>
      </div>
    </>
  );
}
