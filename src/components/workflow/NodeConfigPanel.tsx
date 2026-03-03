import { useState, useRef, useEffect, memo, useMemo, useCallback } from "react";
import {
  VscClose,
  VscSettingsGear,
  VscPlay,
  VscChevronRight,
} from "react-icons/vsc";
import type { Node } from "@xyflow/react";
import type {
  WorkflowNodeData,
  RequestNodeData,
  ScriptNodeData,
  ConditionNodeData,
  LoopNodeData,
  NodeOutput,
  RequestOverrides,
} from "../../types/workflow";
import type { RequestFile, Folder } from "../../types/project";
import { CodeEditor, CodeViewer, type CompletionItem } from "../CodeMirror";
import { Checkbox } from "../ui";
import { getMethodColor, getShortMethod } from "../../utils/methodConstants";
import { getStatusColor, STATUS_TEXT } from "../../utils/format";
import { RequestOverrideModal } from "./RequestOverrideModal";
import { useProjectStore } from "../../stores/projectStore";
import { BiLogoTypescript } from "react-icons/bi";

interface InputNodeInfo {
  nodeId: string;
  nodeName: string;
  type: string;
  method?: string;
  output?: NodeOutput;
  requestId?: string;
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

const ScriptOutputViewer = memo(function ScriptOutputViewer({
  output,
}: {
  output: NodeOutput;
}) {
  const formatOutput = (data: unknown): string => {
    if (data === undefined) return "undefined";
    if (data === null) return "null";
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const outputStr = formatOutput(output.body);
  const lineCount = outputStr.split("\n").length;
  const height = Math.min(200, Math.max(60, lineCount * 18 + 40));

  return (
    <div
      className="flex flex-col border-t border-white/10 bg-inset shrink-0"
      style={{ height }}
    >
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0 border-b border-white/5">
        <span className="text-[10px] text-white/40">Return value</span>
        {output.error && (
          <span className="text-[10px] text-red">{output.error}</span>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        <CodeViewer code={outputStr} language="json" />
      </div>
    </div>
  );
});

const OutputViewer = memo(function OutputViewer({
  output,
  height,
  onHeightChange,
  resizable = true,
}: {
  output: NodeOutput;
  height: number;
  onHeightChange: (h: number) => void;
  resizable?: boolean;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState<"raw" | "headers" | "cookies">(
    "raw",
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const formatBody = (body: unknown): string => {
    if (typeof body === "string") return body;
    try {
      return JSON.stringify(body, null, 2);
    } catch {
      return String(body);
    }
  };

  const detectLanguage = (body: unknown): "json" | "xml" | "html" | "text" => {
    const str = typeof body === "string" ? body : JSON.stringify(body);
    if (str.trim().startsWith("{") || str.trim().startsWith("[")) return "json";
    if (str.trim().startsWith("<"))
      return str.includes("<!DOCTYPE html") || str.includes("<html")
        ? "html"
        : "xml";
    return "text";
  };

  const headers = output.headers || {};
  const cookies = output.cookies || {};
  const hasHeaders = Object.keys(headers).length > 0;
  const hasCookies = Object.keys(cookies).length > 0;
  const bodyString =
    output.body !== undefined ? formatBody(output.body) : undefined;
  const responseBytes = bodyString
    ? new TextEncoder().encode(bodyString).length
    : undefined;
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  useEffect(() => {
    if (!resizable || !isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newHeight = rect.bottom - e.clientY;
      onHeightChange(Math.max(120, Math.min(400, newHeight)));
    };
    const handleMouseUp = () => setIsResizing(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, onHeightChange, resizable]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col border-t border-white/10 bg-inset"
      style={{ height }}
    >
      {resizable ? (
        <div
          className="h-[3px] cursor-row-resize hover:bg-accent/50 transition-colors shrink-0"
          onMouseDown={() => setIsResizing(true)}
        />
      ) : null}

      <div className="flex items-center justify-between px-2 py-1.5 shrink-0 border-b border-white/5">
        <div className="flex items-center gap-1 flex-wrap">
          {output.status !== undefined ? (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border border-white/10 ${getStatusColor(output.status)}`}
            >
              {output.status}
              {output.statusText ? ` ${output.statusText}` : ""}
            </span>
          ) : null}
          {output.duration && (
            <span className="text-[10px] text-white/40 px-1">
              {output.duration >= 1000
                ? `${(output.duration / 1000).toFixed(2)}s`
                : `${output.duration.toFixed(0)}ms`}
            </span>
          )}
          {responseBytes !== undefined ? (
            <span className="text-[10px] text-white/40 px-1">
              {formatBytes(responseBytes)}
            </span>
          ) : null}
          {output.error && (
            <span className="text-[10px] text-red truncate max-w-[100px] px-1">
              {output.error}
            </span>
          )}
        </div>
      </div>

      <div className="px-2 py-1.5 border-b border-white/5 shrink-0 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("raw")}
          className={`text-[10px] px-2 py-0.5 rounded transition-colors ${activeTab === "raw" ? "bg-accent/20 text-accent" : "text-white/50 hover:text-white/70"}`}
        >
          Raw
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("headers")}
          className={`text-[10px] px-2 py-0.5 rounded transition-colors ${activeTab === "headers" ? "bg-accent/20 text-accent" : "text-white/50 hover:text-white/70"}`}
        >
          Headers
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("cookies")}
          className={`text-[10px] px-2 py-0.5 rounded transition-colors ${activeTab === "cookies" ? "bg-accent/20 text-accent" : "text-white/50 hover:text-white/70"}`}
        >
          Cookies
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === "raw" ? (
          output.body !== undefined ? (
            <CodeViewer
              code={formatBody(output.body)}
              language={detectLanguage(output.body)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-white/30">
              No body
            </div>
          )
        ) : activeTab === "headers" ? (
          hasHeaders ? (
            <table className="w-full text-xs">
              <tbody>
                {Object.entries(headers).map(([key, value]) => (
                  <tr key={key} className="border-b border-white/5">
                    <td className="px-3 py-2 text-white/45 font-mono align-top w-1/3">
                      {key}
                    </td>
                    <td className="px-3 py-2 text-white/75 font-mono break-all">
                      {String(value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-white/30">
              No headers
            </div>
          )
        ) : hasCookies ? (
          <table className="w-full text-xs">
            <tbody>
              {Object.entries(cookies).map(([key, value]) => (
                <tr key={key} className="border-b border-white/5">
                  <td className="px-3 py-2 text-white/45 font-mono align-top w-1/3">
                    {key}
                  </td>
                  <td className="px-3 py-2 text-white/75 font-mono break-all">
                    {String(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-white/30">
            No cookies
          </div>
        )}
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
      <div className="p-3 space-y-3 flex-1 overflow-auto">
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

      {nodeOutput && (
        <OutputViewer
          output={nodeOutput}
          height={outputHeight}
          onHeightChange={onOutputHeightChange}
        />
      )}

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
                onUpdate({ iterations: parseInt(e.target.value) || 1 })
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
              onUpdate({ delayMs: parseInt(e.target.value) || 0 })
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

function ScriptConfig({
  data,
  onUpdate,
  inputs,
  nodeOutput,
}: {
  data: ScriptNodeData;
  onUpdate: (d: Partial<ScriptNodeData>) => void;
  inputs: InputNodeInfo[];
  nodeOutput?: NodeOutput;
}) {
  const codeRef = useRef<string>(data.code || "");
  const project = useProjectStore((s) => s.getActiveProject());

  const defaultCode = `/* Process data from previous nodes
  Use {{status}}, {{body}}, {{headers}}, {{cookies}}
  Return value becomes this node's output
*/

const data = body;

// Example: transform data
const result = {
  processed: true,
  count: Array.isArray(data?.items) ? data.items.length : 0,
};

return result;`;

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
          placeholder="Transform data"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent/50"
        />
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden border-y border-white/5">
        <div className="px-3 py-1 shrink-0 flex items-center justify-between">
          <span className="text-[10px] text-white/30 flex items-center gap-1">
            <BiLogoTypescript size={14} />
            TypeScript
          </span>
          <span className="text-[10px] text-white/30">
            Type {"{{"} for suggestions
          </span>
        </div>
        <div className="flex-1">
          <CodeEditor
            code={data.code || defaultCode}
            language="typescript"
            onChange={(v) => {
              codeRef.current = v;
              onUpdate({ code: v });
            }}
            completions={completions}
          />
        </div>
      </div>

      {nodeOutput && <ScriptOutputViewer output={nodeOutput} />}
    </div>
  );
}

function EndConfig({
  inputs,
  outputHeight,
  onOutputHeightChange,
}: {
  inputs: InputNodeInfo[];
  outputHeight: number;
  onOutputHeightChange: (h: number) => void;
}) {
  const lastInput = inputs.length > 0 ? inputs[inputs.length - 1] : null;
  const finalOutput = lastInput?.output;

  console.debug("[EndConfig] inputs:", inputs);
  console.debug("[EndConfig] lastInput:", lastInput);
  console.debug("[EndConfig] finalOutput:", finalOutput);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 text-center border-b border-white/10">
        <div className="w-10 h-10 rounded-full bg-red/10 flex items-center justify-center mx-auto mb-2">
          <div className="w-3 h-3 rounded-sm bg-red" />
        </div>
        <div className="text-sm text-white/70">Workflow End</div>
        <div className="text-[10px] text-white/40 mt-1">
          {inputs.length > 0
            ? `Receiving data from ${inputs.length} node${inputs.length > 1 ? "s" : ""}`
            : "Connect a node to complete the workflow"}
        </div>
      </div>

      {finalOutput ? (
        <OutputViewer
          output={finalOutput}
          height={outputHeight}
          onHeightChange={onOutputHeightChange}
        />
      ) : inputs.length > 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-xs text-white/40 mb-2">No output yet</div>
          <div className="text-[10px] text-white/30">
            Run the workflow to see the final output
          </div>
        </div>
      ) : null}
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
  script: "Script",
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
  const [outputHeight, setOutputHeight] = useState(180);
  const panelRef = useRef<HTMLDivElement>(null);

  const [expandedOutputs, setExpandedOutputs] = useState<Set<string>>(
    new Set(),
  );

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
      case "script":
        return (
          <ScriptConfig
            data={nodeData as ScriptNodeData}
            onUpdate={handleUpdate}
            inputs={availableOutputs}
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
                requests and scripts
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
        const inputsWithOutput = availableOutputs.filter((i) => !!i.output);
        const finalOutputSource =
          inputsWithOutput.length > 0
            ? inputsWithOutput[inputsWithOutput.length - 1]
            : null;
        const finalOutput = finalOutputSource?.output;

        return (
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-white/10 shrink-0 space-y-1">
              <div className="text-[10px] text-white/40">Workflow Outputs</div>
              <div className="text-[9px] text-white/30">
                Outputs from connected nodes
              </div>
              {finalOutputSource ? (
                <div className="text-[10px] text-white/60">
                  Output at End Node:{" "}
                  <span className="text-white/80">{finalOutputSource.nodeName}</span>
                </div>
              ) : null}
            </div>

            <div className="flex-1 overflow-auto">
              {finalOutput ? (
                <div className="px-2 pt-2">
                  <div className="text-[10px] text-white/35 px-1 pb-1">
                    Final Output
                  </div>
                  <div className="border border-white/10 rounded-lg overflow-hidden bg-white/[0.02]">
                    <OutputViewer
                      output={finalOutput}
                      height={Math.max(170, Math.min(340, outputHeight))}
                      onHeightChange={setOutputHeight}
                    />
                  </div>
                </div>
              ) : null}

              <div className="px-3 pt-3 pb-1 border-b border-white/5">
                <div className="text-[10px] text-white/35">Node Outputs</div>
              </div>

              {availableOutputs.length === 0 ? (
                <div className="h-full flex items-center justify-center p-4 text-center">
                  <div className="text-sm text-white/40">
                    No connected nodes
                  </div>
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {availableOutputs.map((input) => {
                    const output = input.output;

                    return (
                      <div
                        key={input.nodeId}
                        className="border border-white/10 rounded-lg overflow-hidden bg-white/[0.02]"
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
                          className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/[0.05] transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0 text-left">
                            <span className="text-[10px] font-mono font-bold text-white/60">
                              {input.method || input.type.toUpperCase()}
                            </span>
                            <span className="text-xs text-white/80 truncate">
                              {input.nodeName}
                            </span>
                            {!output ? (
                              <span className="text-[10px] text-white/35">
                                no output
                              </span>
                            ) : null}
                            {output?.status !== undefined ? (
                              <span
                                className={`text-[10px] px-1 rounded ${getStatusColor(output.status)}`}
                              >
                                {output.status}
                              </span>
                            ) : null}
                          </div>
                          <svg
                            className={`w-3 h-3 shrink-0 text-white/40 transition-transform ${expandedOutputs.has(input.nodeId) ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 14l-7 7m0 0l-7-7m7 7V3"
                            />
                          </svg>
                        </button>

                        {expandedOutputs.has(input.nodeId) ? (
                          <div className="border-t border-white/5 p-3 bg-black/20 space-y-2">
                            {output ? (
                              <>
                                <OutputViewer
                                  output={output}
                                  height={220}
                                  onHeightChange={() => {}}
                                  resizable={false}
                                />
                              </>
                            ) : (
                              <div className="text-xs text-white/40">
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
