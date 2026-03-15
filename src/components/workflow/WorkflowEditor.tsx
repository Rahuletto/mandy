import { useCallback, useMemo, useRef, useState, useEffect, useLayoutEffect } from "react";
import { autoSizeTextarea } from "../../utils";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ConnectionLineType,
  MarkerType,
  type Connection,
  type Node,
  type Edge,
  type NodeChange,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { VscCode } from "react-icons/vsc";
import { HiOutlineCursorClick } from "react-icons/hi";
import { nodeTypes } from "./nodes";
import { RequestPopover } from "./RequestPopover";
import { NodeTypePopover } from "./NodeTypePopover";
import { NodeConfigPanel } from "./NodeConfigPanel";
import type {
  WorkflowFile,
  WorkflowNodeData,
  WorkflowNodeStatus,
  NodeOutput,
  RequestOverrides,
  RequestNodeData,
  ConditionNodeData,
  LoopNodeData,
} from "../../types/workflow";
import type { Folder } from "../../types/project";
import { haptic } from "../../utils/haptics";
import { WorkflowEngine } from "../../utils/workflowEngine";
import { useToastStore } from "../../stores/toastStore";
import {
  runTSConditionSandboxed,
  preloadTsWorker,
  terminateAllTSRuns,
} from "../../utils/tsRunner";

function getMethodColor(method: string) {
  switch (method?.toUpperCase()) {
    case "GET": return "bg-green/20 text-green";
    case "POST": return "bg-blue-500/20 text-blue-400";
    case "PUT": return "bg-yellow/20 text-yellow";
    case "DELETE": return "bg-red/20 text-red";
    case "PATCH": return "bg-purple-500/20 text-purple-400";
    default: return "bg-white/10 text-white/60";
  }
}

type FlowStep =
  | { kind: "node"; node: Node<WorkflowNodeData> }
  | { kind: "loop"; node: Node<WorkflowNodeData>; body: FlowStep[] }
  | {
      kind: "condition";
      node: Node<WorkflowNodeData>;
      trueBranch: FlowStep[];
      falseBranch: FlowStep[];
      mergeNode: Node<WorkflowNodeData> | null;
    };

function buildFlowTree(
  allNodes: Node<WorkflowNodeData>[],
  allEdges: Edge[],
): FlowStep[] {
  const successors = new Map<string, string[]>();
  for (const e of allEdges) {
    if (!successors.has(e.source)) successors.set(e.source, []);
    successors.get(e.source)!.push(e.target);
  }

  // BFS reachability — returns nodes in BFS order so we can find the earliest merge
  const reachableOrdered = (startId: string | null): string[] => {
    const seen = new Set<string>();
    const order: string[] = [];
    const queue = startId ? [startId] : [];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      (successors.get(id) || []).forEach((n) => queue.push(n));
    }
    return order;
  };

  const loopInfo = new Map<string, { bodyTarget: string | null; exitTarget: string | null }>();
  for (const node of allNodes) {
    if ((node.data as WorkflowNodeData).type !== "loop") continue;
    const outEdges = allEdges.filter((e) => e.source === node.id);
    if (outEdges.length === 0) { loopInfo.set(node.id, { bodyTarget: null, exitTarget: null }); continue; }
    if (outEdges.length === 1) { loopInfo.set(node.id, { bodyTarget: outEdges[0].target, exitTarget: null }); continue; }
    const bodyEdge = outEdges.find((e) => e.sourceHandle === "loop");
    const exitEdge = outEdges.find((e) => e.sourceHandle === "exit");
    if (bodyEdge && exitEdge) { loopInfo.set(node.id, { bodyTarget: bodyEdge.target, exitTarget: exitEdge.target }); continue; }
    const scored = [...outEdges].map((edge) => {
      const target = allNodes.find((n) => n.id === edge.target);
      let score = 0;
      if (target) {
        const dy = (target.position.y || 0) - node.position.y;
        if (dy > 0) score += 100 + Math.min(dy, 300);
        if ((target.data as WorkflowNodeData).type !== "end") score += 50;
      }
      return { edge, score };
    });
    scored.sort((a, b) => b.score - a.score);
    loopInfo.set(node.id, { bodyTarget: scored[0].edge.target, exitTarget: scored[1]?.edge.target || null });
  }

  // walk is pure — no shared consumed set, uses boundary to stop
  function walk(startId: string, boundary: Set<string>): FlowStep[] {
    const steps: FlowStep[] = [];
    const localVisited = new Set<string>();
    let currentId: string | null = startId;

    while (currentId) {
      if (boundary.has(currentId) || localVisited.has(currentId)) break;
      const node = allNodes.find((n) => n.id === currentId);
      if (!node) break;

      const data = node.data as WorkflowNodeData;
      if (data.type === "end") break;
      if (data.type === "start") {
        const next = successors.get(currentId) || [];
        currentId = next[0] || null;
        continue;
      }

      localVisited.add(currentId);

      if (data.type === "loop") {
        const info = loopInfo.get(currentId);
        const bodyBoundary = new Set(boundary);
        bodyBoundary.add(currentId);
        const bodySteps = info?.bodyTarget ? walk(info.bodyTarget, bodyBoundary) : [];
        steps.push({ kind: "loop", node, body: bodySteps });
        currentId = info?.exitTarget || null;
      } else if (data.type === "condition") {
        const outEdges = allEdges.filter((e) => e.source === currentId);
        const trueEdge = outEdges.find((e) => e.sourceHandle === "true") || outEdges[0];
        const falseEdge = outEdges.find((e) => e.sourceHandle === "false") || outEdges[1];
        const trueTarget = trueEdge?.target || null;
        const falseTarget = falseEdge?.target || null;

        // Find earliest merge: first node in true-BFS-order that is also reachable from false
        const trueOrder = reachableOrdered(trueTarget);
        const falseReach = new Set(reachableOrdered(falseTarget));
        const mergeId = trueOrder.find((id) => falseReach.has(id)) || null;
        const mergeNode = mergeId ? (allNodes.find((n) => n.id === mergeId) || null) : null;

        const branchBoundary = new Set(boundary);
        if (mergeId) branchBoundary.add(mergeId);

        const trueBranch = trueTarget ? walk(trueTarget, branchBoundary) : [];
        const falseBranch = falseTarget ? walk(falseTarget, branchBoundary) : [];

        steps.push({ kind: "condition", node, trueBranch, falseBranch, mergeNode });
        currentId = mergeId;
      } else {
        steps.push({ kind: "node", node });
        const next = successors.get(currentId) || [];
        currentId = next.find((id) => !localVisited.has(id) && !boundary.has(id)) || null;
      }
    }

    return steps;
  }

  const startNode = allNodes.find((n) => (n.data as WorkflowNodeData).type === "start");
  if (!startNode) return [];
  return walk(startNode.id, new Set());
}

function FlowNodeInline({ data }: { data: WorkflowNodeData }) {
  if (data.type === "request") {
    const req = data as RequestNodeData;
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${getMethodColor(req.method)}`}>
          {req.method || "GET"}
        </span>
        <span className="text-xs text-white/70 truncate">
          {req.requestName || data.label}
        </span>
      </div>
    );
  }
  if (data.type === "condition") {
    const cond = data as ConditionNodeData;
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 shrink-0">
          IF
        </span>
        <span className="text-xs text-white/50 truncate font-mono">
          {cond.expression || "..."}
        </span>
      </div>
    );
  }
  return null;
}

function FlowStepList({ steps }: { steps: FlowStep[] }) {
  return (
    <>
      {steps.map((step) => {
        if (step.kind === "node") {
          return (
            <div key={step.node.id}>
              <div className="ml-[9px] w-px h-3 bg-white/10" />
              <div className="flex items-center gap-3 py-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0 ml-[5px]" />
                <FlowNodeInline data={step.node.data as WorkflowNodeData} />
              </div>
            </div>
          );
        }

        if (step.kind === "condition") {
          const cond = step.node.data as ConditionNodeData;
          const mergeData = step.mergeNode?.data as WorkflowNodeData | undefined;
          const isEndMerge = mergeData?.type === "end";
          return (
            <div key={step.node.id}>
              <div className="ml-[9px] w-px h-3 bg-white/10" />
              {/* condition header */}
              <div className="flex items-center gap-2 py-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400/60 shrink-0 ml-[5px]" />
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">IF</span>
                <span className="text-[11px] text-white/40 font-mono truncate">{cond.expression || "..."}</span>
              </div>
              {/* diverge line */}
              <div className="ml-[9px] w-px h-2 bg-white/10" />
              <div className="flex gap-2 ml-1">
                <div className="flex-1 rounded-md border border-green/15 bg-green/[0.02] px-2 pt-1.5 pb-1 min-w-0">
                  <p className="text-[10px] font-semibold text-green/50 mb-0.5">true</p>
                  {step.trueBranch.length > 0 ? (
                    <FlowStepList steps={step.trueBranch} />
                  ) : (
                    <p className="text-[11px] text-white/20 py-1 pl-1">—</p>
                  )}
                </div>
                <div className="flex-1 rounded-md border border-red/15 bg-red/[0.02] px-2 pt-1.5 pb-1 min-w-0">
                  <p className="text-[10px] font-semibold text-red/50 mb-0.5">false</p>
                  {step.falseBranch.length > 0 ? (
                    <FlowStepList steps={step.falseBranch} />
                  ) : (
                    <p className="text-[11px] text-white/20 py-1 pl-1">—</p>
                  )}
                </div>
              </div>
              {/* join indicator */}
              {step.mergeNode && !isEndMerge && (
                <>
                  <div className="ml-[9px] w-px h-2 bg-white/10" />
                  <div className="flex items-center gap-2 py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/15 shrink-0 ml-[5px]" />
                    <span className="text-[10px] text-white/25">join</span>
                    <span className="text-[10px] text-white/40">→</span>
                    <FlowNodeInline data={step.mergeNode.data as WorkflowNodeData} />
                  </div>
                </>
              )}
              {step.mergeNode && isEndMerge && (
                <>
                  <div className="ml-[9px] w-px h-2 bg-white/10" />
                  <div className="flex items-center gap-2 py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/15 shrink-0 ml-[5px]" />
                    <span className="text-[10px] text-white/25">join → end</span>
                  </div>
                </>
              )}
            </div>
          );
        }

        const loopData = step.node.data as LoopNodeData;
        const loopLabel =
          loopData.loopType === "count"
            ? `${loopData.iterations}x`
            : loopData.loopType === "forEach"
              ? `forEach`
              : `while`;

        return (
          <div key={step.node.id}>
            <div className="ml-[9px] w-px h-3 bg-white/10" />
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.03] px-3 pt-2 pb-1 ml-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
                  LOOP
                </span>
                <span className="text-[11px] text-white/40">
                  {loopLabel}
                </span>
              </div>
              {step.body.length > 0 ? (
                <div className="ml-1">
                  <FlowStepList steps={step.body} />
                  <div className="ml-[9px] w-px h-2 bg-white/10" />
                </div>
              ) : (
                <p className="text-[11px] text-white/20 py-2 ml-2">No body steps</p>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function getOverrideSummary(node: Node<WorkflowNodeData>) {
  const data = node.data as RequestNodeData;
  if (!data.overrides) return null;
  const parts: string[] = [];
  const activeHeaders = data.overrides.headers?.filter((h) => h.enabled && h.key) || [];
  const activeParams = data.overrides.params?.filter((p) => p.enabled && p.key) || [];
  if (activeHeaders.length > 0) parts.push(`${activeHeaders.length} header override${activeHeaders.length > 1 ? "s" : ""}`);
  if (activeParams.length > 0) parts.push(`${activeParams.length} param override${activeParams.length > 1 ? "s" : ""}`);
  if (data.overrides.auth?.type !== "inherit") parts.push("auth override");
  if (data.overrides.body?.type !== "inherit") parts.push("body override");
  if (data.overrides.url) parts.push("url override");
  return parts.length > 0 ? parts.join(" · ") : null;
}

function WorkflowOverview({
  workflow,
  nodes,
  edges,
  onWorkflowChange,
  onRun,
  isRunning,
  isStopping,
}: {
  workflow: WorkflowFile;
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  onWorkflowChange: (workflow: WorkflowFile) => void;
  onRun: () => void;
  isRunning: boolean;
  isStopping: boolean;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description || "");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setName(workflow.name);
    setDescription(workflow.description || "");
  }, [workflow]);

  useLayoutEffect(() => {
    autoSizeTextarea(descriptionRef.current);
  }, [description]);

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (name.trim() && name !== workflow.name) {
      onWorkflowChange({ ...workflow, name: name.trim() });
    } else {
      setName(workflow.name);
    }
  };

  const requestNodes = useMemo(
    () => nodes.filter((n) => (n.data as WorkflowNodeData).type === "request"),
    [nodes],
  );

  const conditionNodes = useMemo(
    () => nodes.filter((n) => (n.data as WorkflowNodeData).type === "condition"),
    [nodes],
  );

  const loopNodes = useMemo(
    () => nodes.filter((n) => (n.data as WorkflowNodeData).type === "loop"),
    [nodes],
  );

  const flowTree = useMemo(() => buildFlowTree(nodes, edges), [nodes, edges]);

  const stepCount = useMemo(() => {
    function count(steps: FlowStep[]): number {
      let n = 0;
      for (const s of steps) {
        n += 1;
        if (s.kind === "loop") n += count(s.body);
        if (s.kind === "condition") n += count(s.trueBranch) + count(s.falseBranch) + (s.mergeNode ? 1 : 0);
      }
      return n;
    }
    return count(flowTree);
  }, [flowTree]);

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="flex min-h-full max-w-[1600px] mx-auto relative pl-8 pr-4 gap-8">
        <div className="flex-1 py-12 w-[40%]">
          <div className="max-w-3xl">
            {isEditingName ? (
              <input
                autoFocus
                className="text-2xl font-bold bg-transparent border-none outline-none text-white w-full mb-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
              />
            ) : (
              <h1
                className="text-2xl font-bold text-white mb-2 cursor-text hover:text-white/90"
                onClick={() => setIsEditingName(true)}
              >
                {workflow.name}
              </h1>
            )}

            <textarea
              ref={descriptionRef}
              className="w-full bg-transparent border-none outline-none text-sm text-white/60 resize-none overflow-hidden min-h-6 mb-3 placeholder:text-white/20"
              placeholder="Add a description..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                onWorkflowChange({ ...workflow, description: e.target.value });
              }}
            />

            <section className="flex flex-col gap-8">
              {requestNodes.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-white/70 mb-2">
                    Requests
                  </h3>
                  <div className="space-y-1">
                    {requestNodes.map((node) => {
                      const data = node.data as RequestNodeData;
                      const overrides = getOverrideSummary(node);
                      return (
                        <div key={node.id} className="py-2 border-b border-white/5 last:border-0">
                          <div className="flex items-center gap-3">
                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${getMethodColor(data.method)}`}>
                              {data.method || "GET"}
                            </span>
                            <span className="text-xs font-mono text-white font-medium">
                              {data.requestName || data.label}
                            </span>
                          </div>
                          {overrides && (
                            <p className="mt-1 text-[11px] text-white/30">{overrides}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {conditionNodes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-white/70 mb-2">
                    Conditions
                  </h3>
                  <div className="space-y-1">
                    {conditionNodes.map((node) => {
                      const data = node.data as ConditionNodeData;
                      return (
                        <div key={node.id} className="py-2 border-b border-white/5 last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
                              IF
                            </span>
                            <span className="text-xs font-mono text-white/80 truncate">
                              {data.expression || "No expression"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {loopNodes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-white/70 mb-2">
                    Loops
                  </h3>
                  <div className="space-y-1">
                    {loopNodes.map((node) => {
                      const data = node.data as LoopNodeData;
                      return (
                        <div key={node.id} className="py-2 border-b border-white/5 last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
                              LOOP
                            </span>
                            <span className="text-xs font-mono text-white/80">
                              {data.loopType === "count"
                                ? `${data.iterations} iteration${data.iterations !== 1 ? "s" : ""}`
                                : data.loopType === "forEach"
                                  ? `forEach: ${data.forEachPath || "..."}`
                                  : `while: ${data.whileCondition || "..."}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <div className="h-24" />
          </div>
        </div>

        <div className="w-[60%] shrink-0 py-4 self-start sticky top-0 h-[80vh]">
          <div className="h-full rounded-xl bg-background border border-white/5 overflow-hidden flex flex-col">
            <div className="flex shrink-0 items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                  FLOW
                </span>
                <span className="text-xs text-white/40">
                  {stepCount} step{stepCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto px-5 py-4 relative">
              <div>
                <div className="flex items-center gap-3 py-1.5">
                  <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                  </div>
                  <span className="text-xs font-medium text-white/40">Start</span>
                </div>

                <FlowStepList steps={flowTree} />

                <div className="ml-[9px] w-px h-3 bg-white/10" />
                <div className="flex items-center gap-3 py-1.5">
                  <div className="w-5 h-5 rounded-full bg-green/20 flex items-center justify-center shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-green" />
                  </div>
                  <span className="text-xs font-medium text-white/40">End</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onRun}
                className={`flex absolute right-4 bottom-4 cursor-pointer items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold text-card transition-colors z-20 ${
                  isRunning
                    ? isStopping
                      ? "bg-yellow hover:bg-red"
                      : "bg-red hover:bg-red"
                    : "bg-accent hover:bg-accent/90"
                }`}
              >
                {isRunning ? <>{isStopping ? "Force Kill" : "Stop"}</> : <>Run</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface WorkflowEditorProps {
  workflow: WorkflowFile;
  onWorkflowChange: (workflow: WorkflowFile) => void;
  onRunWorkflow: () => void;
  isRunning: boolean;
  onExecuteRequest?: (
    requestId: string,
    context?: any,
    overrides?: RequestOverrides,
  ) => Promise<any>;
  projectRoot?: Folder;
}

function WorkflowEditorInner({
  workflow,
  onWorkflowChange,
  onRunWorkflow,
  isRunning,
  onExecuteRequest,
  projectRoot,
}: WorkflowEditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const workflowEngineRef = useRef<WorkflowEngine | null>(null);
  const forceKilledRef = useRef(false);
  const [runningEdges, setRunningEdges] = useState<Set<string>>(new Set());
  const [completedEdges, setCompletedEdges] = useState<Set<string>>(new Set());
  const [errorEdges, setErrorEdges] = useState<Set<string>>(new Set());
  const [flashingEdges, setFlashingEdges] = useState<Set<string>>(new Set());
  // flashCounters ensures consecutive flashes for the same edge cause distinct style changes
  const [flashCounters, setFlashCounters] = useState<Record<string, number>>(
    {},
  );
  // nodeFlashCounters ensures consecutive flashes for the same node cause distinct style changes
  const [nodeFlashCounters, setNodeFlashCounters] = useState<
    Record<string, number>
  >({});
  // Track which edges are loop body edges (inside a loop)
  const [loopBodyEdges, setLoopBodyEdges] = useState<Set<string>>(new Set());
  // Track which nodes are currently in the active loop path
  const [loopPathNodes, setLoopPathNodes] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [requestPopover, setRequestPopover] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [nodeTypePopover, setNodeTypePopover] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [configPanelWidth, setConfigPanelWidth] = useState(320);
  const [activeTab, setActiveTab] = useState<"overview" | "editor">("overview");
  const [isStopping, setIsStopping] = useState(false);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addToast } = useToastStore();

  const [nodes, setNodes, onNodesChange] = useNodesState(workflow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(workflow.edges);
  const [nodeOutputs, setNodeOutputs] = useState<Record<string, NodeOutput>>(
    {},
  );
  // Undo/redo history for workflow nodes & edges
  const pastRef = useRef<
    Array<{ nodes: Node<WorkflowNodeData>[]; edges: Edge[] }>
  >([]);
  const futureRef = useRef<
    Array<{ nodes: Node<WorkflowNodeData>[]; edges: Edge[] }>
  >([]);
  const actionInProgressRef = useRef(false);
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isApplyingHistoryRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const deepCopy = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj));

  const getViewportCenter = useCallback(() => {
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return { x: 250, y: 200 };
    const rect = wrapper.getBoundingClientRect();
    return screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [screenToFlowPosition]);

  const beginUserAction = useCallback(() => {
    if (isApplyingHistoryRef.current) return;
    if (actionInProgressRef.current) {
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
      actionTimerRef.current = setTimeout(() => {
        actionInProgressRef.current = false;
        actionTimerRef.current = null;
      }, 400);
      return;
    }
    actionInProgressRef.current = true;
    const snapshot = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    const last = pastRef.current[pastRef.current.length - 1];
    if (!last || JSON.stringify(last) !== JSON.stringify(snapshot)) {
      pastRef.current.push(snapshot);
      if (pastRef.current.length > 100) pastRef.current.shift();
      futureRef.current = [];
      setCanUndo(true);
      setCanRedo(false);
    }
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    actionTimerRef.current = setTimeout(() => {
      actionInProgressRef.current = false;
      actionTimerRef.current = null;
    }, 400);
  }, [nodes, edges]);

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;

  const workflowIdRef = useRef(workflow.id);

  useEffect(() => {
    preloadTsWorker();
  }, []);

  useEffect(() => {
    if (workflow.id !== workflowIdRef.current) {
      workflowIdRef.current = workflow.id;
      const sanitizedNodes = workflow.nodes
        .filter((n) => (n.data as any)?.type !== "script")
        .map((n) => {
          const nd = n.data as any;
          if (nd?.type === "condition" && nd.conditionLanguage === "python") {
            return { ...n, data: { ...nd, conditionLanguage: "typescript" } };
          }
          return n;
        });
      const nodeIds = new Set(sanitizedNodes.map((n) => n.id));
      const sanitizedEdges = workflow.edges.filter(
        (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
      );

      setNodes(sanitizedNodes);
      setEdges(sanitizedEdges);
      setNodeOutputs({});
      setSelectedNodeId(null);
    }
  }, [workflow.id, workflow.nodes, workflow.edges, setNodes, setEdges]);

  const defaultEdgeOptions = useMemo(
    () => ({
      type: "smoothstep",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: "rgba(255,255,255,0.3)",
      },
    }),
    [],
  );

  const styledEdges = useMemo(() => {
    return edges.map((edge) => {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);
      const sourceStatus = (sourceNode?.data as WorkflowNodeData)?.status;
      const targetStatus = (targetNode?.data as WorkflowNodeData)?.status;
      const isLoopBodyEdge = loopBodyEdges.has(edge.id);

      // Error takes priority
      if (errorEdges.has(edge.id) || sourceStatus === "error") {
        return {
          ...edge,
          type: "smoothstep",
          style: { stroke: "var(--red)", strokeWidth: 2 },
          animated: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: "var(--red)",
          },
        };
      }

      // Running animation (active execution)
      if (runningEdges.has(edge.id)) {
        const dashArray = isLoopBodyEdge ? "6 3" : undefined;
        return {
          ...edge,
          type: "smoothstep",
          style: {
            stroke: isLoopBodyEdge ? "var(--yellow)" : "#f97316",
            strokeWidth: 2,
            strokeDasharray: dashArray,
          },
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: isLoopBodyEdge ? "var(--yellow)" : "#f97316",
          },
        };
      }

      // Flash effect (iteration complete)
      const _flashCount = flashCounters[edge.id] || 0;
      const _edgeData = (edge.data as any) || {};
      const _flashColor = _edgeData.__flashColor || "var(--yellow)";
      if (flashingEdges.has(edge.id) || _flashCount > 0) {
        const dashArray = isLoopBodyEdge ? "6 3" : undefined;
        return {
          ...edge,
          type: "smoothstep",
          style: {
            stroke: _flashColor,
            strokeWidth: 3,
            strokeDasharray: dashArray,
            filter: `drop-shadow(0 0 6px ${_flashColor})`,
            transition: "stroke 150ms ease, filter 150ms ease",
          },
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: _flashColor,
          },
        };
      }

      // Completed - show green only if both source and target are completed
      if (
        completedEdges.has(edge.id) &&
        sourceStatus === "completed" &&
        targetStatus === "completed"
      ) {
        return {
          ...edge,
          type: "smoothstep",
          style: { stroke: "var(--green)", strokeWidth: 2 },
          animated: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 16,
            height: 16,
            color: "var(--green)",
          },
        };
      }

      // Default inactive state
      return {
        ...edge,
        type: "smoothstep",
        style: { stroke: "rgba(255,255,255,0.15)", strokeWidth: 1.5 },
        animated: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: "rgba(255,255,255,0.2)",
        },
      };
    });
  }, [
    edges,
    nodes,
    runningEdges,
    completedEdges,
    errorEdges,
    flashingEdges,
    flashCounters,
    loopBodyEdges,
  ]);

  const errorNodeRef = useRef<string | null>(null);

  const updateNodeStatus = useCallback(
    (nodeId: string, status: WorkflowNodeStatus, errorMessage?: string) => {
      setNodes((nds) => {
        const node = nds.find((n) => n.id === nodeId);
        if (status === "error" && node && !errorNodeRef.current) {
          errorNodeRef.current = nodeId;
          const nodeName = (node.data as WorkflowNodeData)?.label || nodeId;
          addToast(errorMessage || `Error in node: ${nodeName}`, "error");
          haptic("levelChange");
        }
        return nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, status } } : n,
        );
      });
      if (status === "running") {
        haptic("alignment");
      }
    },
    [setNodes, addToast],
  );

  const updateNodeData = useCallback(
    (nodeId: string, partialData: Partial<WorkflowNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...(n.data as WorkflowNodeData),
                  ...(partialData as any),
                },
              }
            : n,
        ),
      );
    },
    [setNodes],
  );

  const updateEdgeStatus = useCallback(
    (edgeId: string, status: "idle" | "running" | "completed" | "error") => {
      if (status === "running") {
        setRunningEdges((prev) => new Set(prev).add(edgeId));
      } else if (status === "completed") {
        setRunningEdges((prev) => {
          const next = new Set(prev);
          next.delete(edgeId);
          return next;
        });
        setCompletedEdges((prev) => new Set(prev).add(edgeId));
      } else if (status === "error") {
        setRunningEdges((prev) => {
          const next = new Set(prev);
          next.delete(edgeId);
          return next;
        });
        setErrorEdges((prev) => new Set(prev).add(edgeId));
      } else {
        setRunningEdges((prev) => {
          const next = new Set(prev);
          next.delete(edgeId);
          return next;
        });
      }
    },
    [],
  );

  const resetNodeStatuses = useCallback(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...(node.data as WorkflowNodeData),
          status: "idle" as WorkflowNodeStatus,
        },
      })),
    );
    setRunningEdges(new Set());
    setCompletedEdges(new Set());
    setErrorEdges(new Set());
    errorNodeRef.current = null;
  }, [setNodes]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleNodeUpdate = useCallback(
    (nodeId: string, updates: Partial<WorkflowNodeData>) => {
      beginUserAction();
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== nodeId) return node;
          const data = { ...(node.data as WorkflowNodeData), ...updates };
          return {
            ...(node as Node<WorkflowNodeData>),
            data,
          } as Node<WorkflowNodeData>;
        }),
      );
    },
    [setNodes, beginUserAction],
  );

  const getAvailableOutputs = useCallback(() => {
    if (!selectedNodeId) return [];

    const outputs: {
      nodeId: string;
      nodeName: string;
      type: string;
      method?: string;
      output?: NodeOutput;
      requestId?: string;
      isPrimary?: boolean;
    }[] = [];
    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    if (!selectedNode) return [];

    if ((selectedNode.data as WorkflowNodeData).type === "end") {
      const primarySourceIds = new Set(
        edges.filter((e) => e.target === selectedNodeId).map((e) => e.source),
      );

      for (const sourceNode of nodes) {
        if (sourceNode.id === selectedNodeId) continue;
        const nodeData = sourceNode.data as WorkflowNodeData;
        if (nodeData.type === "start" || nodeData.type === "end") continue;

        const outputData: {
          nodeId: string;
          nodeName: string;
          type: string;
          method?: string;
          output?: NodeOutput;
          requestId?: string;
          isPrimary?: boolean;
        } = {
          nodeId: sourceNode.id,
          nodeName: nodeData.label || sourceNode.id,
          type: nodeData.type,
          output: nodeOutputs[sourceNode.id],
          isPrimary: primarySourceIds.has(sourceNode.id),
        };

        if (nodeData.type === "request") {
          const requestData = nodeData as any;
          outputData.method = requestData.method;
          outputData.nodeName =
            requestData.requestName || nodeData.label || sourceNode.id;
          outputData.requestId = requestData.requestId;
        }

        outputs.push(outputData);
      }

      return outputs;
    }

    const incomingEdges = edges.filter((e) => e.target === selectedNodeId);

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (sourceNode) {
        const nodeData = sourceNode.data as WorkflowNodeData;
        const outputData: {
          nodeId: string;
          nodeName: string;
          type: string;
          method?: string;
          output?: NodeOutput;
          requestId?: string;
        } = {
          nodeId: sourceNode.id,
          nodeName: nodeData.label || sourceNode.id,
          type: nodeData.type,
          output: nodeOutputs[sourceNode.id],
        };

        if (nodeData.type === "request") {
          const requestData = nodeData as any;
          outputData.method = requestData.method;
          outputData.nodeName =
            requestData.requestName || nodeData.label || sourceNode.id;
          outputData.requestId = requestData.requestId;
        }

        outputs.push(outputData);
      }
    }

    // If the selected node is reachable from a loop node (i.e., it's inside a loop body),
    // expose loop helper variables so users can autocomplete and use {{item}} and {{index}}
    // in request overrides and condition expressions.
    const isInLoop = (() => {
      if (!selectedNodeId) return false;
      const visited = new Set<string>();
      const stack: string[] = [selectedNodeId];
      while (stack.length > 0) {
        const nid = stack.pop()!;
        const incoming = edges.filter((e) => e.target === nid);
        for (const inc of incoming) {
          if (visited.has(inc.source)) continue;
          visited.add(inc.source);
          const srcNode = nodes.find((n) => n.id === inc.source);
          if (!srcNode) continue;
          if ((srcNode.data as WorkflowNodeData).type === "loop") return true;
          stack.push(srcNode.id);
        }
      }
      return false;
    })();

    if (isInLoop) {
      outputs.push({
        nodeId: "__loop__",
        nodeName: "Loop",
        type: "loop",
        paths: [
          { path: "{{item}}", type: "any" },
          { path: "{{index}}", type: "number" },
        ],
      } as any);
    }

    return outputs;
  }, [selectedNodeId, edges, nodes, nodeOutputs]);

  const forceKillWorkflow = useCallback(() => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    forceKilledRef.current = true;
    workflowEngineRef.current?.stop();
    workflowEngineRef.current = null;
    // Ensure any running TypeScript workers are also terminated immediately.
    terminateAllTSRuns();
    setIsStopping(false);
    setRunningEdges(new Set());
    onRunWorkflow();
    resetNodeStatuses();
    addToast("Workflow force killed", "info");
    haptic("levelChange");
  }, [onRunWorkflow, resetNodeStatuses, addToast]);

  const inferLoopBodyEdgeIds = useCallback(
    (allEdges: Edge[], allNodes: Node<WorkflowNodeData>[]): Set<string> => {
      const loopBodyEdgeIds = new Set<string>();
      const loopNodes = allNodes.filter(
        (n) => (n.data as WorkflowNodeData).type === "loop",
      );

      for (const loopNode of loopNodes) {
        const outgoing = allEdges.filter((e) => e.source === loopNode.id);
        if (outgoing.length === 0) continue;
        if (outgoing.length === 1) {
          loopBodyEdgeIds.add(outgoing[0].id);
          continue;
        }

        const getTargetNode = (edge: Edge) =>
          allNodes.find((n) => n.id === edge.target);
        const bodyScore = (edge: Edge): number => {
          const target = getTargetNode(edge);
          let score = 0;
          if (edge.sourceHandle === "loop") score += 400;
          if ((target?.data as WorkflowNodeData)?.type !== "end") score += 120;
          if (target) {
            const dy = target.position.y - loopNode.position.y;
            const dxAbs = Math.abs(target.position.x - loopNode.position.x);
            if (dy > 0) score += 100 + Math.min(dy, 300) / 8;
            else score -= Math.min(Math.abs(dy), 300) / 5;
            score -= Math.min(dxAbs, 400) / 20;
          }
          return score;
        };
        const exitScore = (edge: Edge): number => {
          const target = getTargetNode(edge);
          let score = 0;
          if (edge.sourceHandle === "exit") score += 400;
          if ((target?.data as WorkflowNodeData)?.type === "end") score += 250;
          if (target) {
            const dx = target.position.x - loopNode.position.x;
            const dyAbs = Math.abs(target.position.y - loopNode.position.y);
            if (dx > 0) score += 90 + Math.min(dx, 300) / 20;
            score += Math.max(0, 100 - dyAbs) / 4;
          }
          return score;
        };

        let bestBody: Edge | undefined;
        let bestExit: Edge | undefined;
        let bestPairScore = Number.NEGATIVE_INFINITY;

        for (const body of outgoing) {
          for (const exit of outgoing) {
            if (body.id === exit.id) continue;
            const pairScore = bodyScore(body) + exitScore(exit);
            if (pairScore > bestPairScore) {
              bestPairScore = pairScore;
              bestBody = body;
              bestExit = exit;
            }
          }
        }

        const loopBody =
          bestBody ||
          [...outgoing].sort((a, b) => bodyScore(b) - bodyScore(a))[0];

        if (loopBody) {
          loopBodyEdgeIds.add(loopBody.id);
        }
      }

      return loopBodyEdgeIds;
    },
    [],
  );

  const handleRunWorkflow = useCallback(async () => {
    if (isRunning) {
      if (isStopping) {
        forceKillWorkflow();
        return;
      }

      setIsStopping(true);
      workflowEngineRef.current?.stop();
      haptic("alignment");

      stopTimeoutRef.current = setTimeout(() => {
        addToast(
          "Stopping takes longer than usual. Click Stop again to force kill.",
          "warning",
        );
      }, 3000);

      return;
    }

    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    setIsStopping(false);

    const hasCycle = (() => {
      const adj = new Map<string, string[]>();
      for (const e of edges) {
        if (!adj.has(e.source)) adj.set(e.source, []);
        adj.get(e.source)!.push(e.target);
      }

      const visited = new Set<string>();
      const stack = new Set<string>();

      function dfs(id: string): boolean {
        if (stack.has(id)) {
          for (const sid of stack) {
            const nd = nodes.find((n) => n.id === sid);
            if ((nd?.data as WorkflowNodeData)?.type === "loop") return false;
          }
          return true;
        }
        if (visited.has(id)) return false;
        visited.add(id);
        stack.add(id);
        const neighbours = adj.get(id) || [];
        for (const n of neighbours) {
          if (dfs(n)) return true;
        }
        stack.delete(id);
        return false;
      }

      for (const n of nodes) {
        if (dfs(n.id)) return true;
      }
      return false;
    })();

    if (hasCycle) {
      addToast(
        "Workflow contains a directed cycle which may cause infinite execution. Remove cycles before running.",
        "warning",
      );
      return;
    }

    resetNodeStatuses();
    setNodeOutputs({});
    setCompletedEdges(new Set());
    setLoopBodyEdges(new Set());
    setLoopPathNodes(new Set());
    forceKilledRef.current = false;
    onRunWorkflow();
    haptic("levelChange");

    setLoopBodyEdges(inferLoopBodyEdgeIds(edges, nodes));

    const engine = new WorkflowEngine(
      nodes,
      edges,
      updateNodeStatus,
      updateEdgeStatus,
      async (requestId: string, context: any, overrides?: RequestOverrides) => {
        if (forceKilledRef.current) {
          throw new Error("Workflow was force killed");
        }
        if (onExecuteRequest) {
          const result = await onExecuteRequest(requestId, context, overrides);
          if (forceKilledRef.current) {
            throw new Error("Workflow was force killed");
          }
          return result;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { status: 200, body: { success: true } };
      },
      async (code: string, context: any) => {
        if (forceKilledRef.current) return false;
        try {
          const result = await runTSConditionSandboxed(code, {
            status: context.lastResponse?.status,
            body: context.lastResponse?.body,
            headers: context.lastResponse?.headers,
            cookies: context.lastResponse?.cookies,
            item: context.loopItem,
            index: context.loopIndex,
            totalLength: context.variables?.totalLength,
          });
          if (forceKilledRef.current) return false;
          return result;
        } catch (err) {
          console.error("Condition evaluation error:", err);
          return false;
        }
      },
      (nodeId: string, output: NodeOutput) => {
        setNodeOutputs((prev) => ({ ...prev, [nodeId]: output }));
      },
      (edgeId: string, opts?: { color?: string; ms?: number }) => {
        const flashMs = opts?.ms ?? 1000;
        const color = opts?.color || "var(--yellow)";

        setFlashCounters((prev) => {
          const next = { ...(prev || {}) };
          next[edgeId] = (next[edgeId] || 0) + 1;
          return next;
        });

        setFlashingEdges((prev) => {
          const next = new Set(prev);
          next.add(edgeId);
          return next;
        });

        setEdges((prev) =>
          prev.map((e) =>
            e.id === edgeId
              ? {
                  ...e,
                  data: {
                    ...(e.data || {}),
                    __flash: Date.now(),
                    __flashColor: color,
                    __flashMs: flashMs,
                  },
                }
              : e,
          ),
        );

        setTimeout(() => {
          setFlashingEdges((prev) => {
            const next = new Set(prev);
            next.delete(edgeId);
            return next;
          });
          setFlashCounters((prev) => {
            const next = { ...(prev || {}) };
            delete next[edgeId];
            return next;
          });
          // clear transient flash marker to let edge return to its normal style
          setEdges((prev) =>
            prev.map((e) =>
              e.id === edgeId
                ? {
                    ...e,
                    data: {
                      ...(e.data || {}),
                      __flash: null,
                      __flashColor: null,
                      __flashMs: null,
                    },
                  }
                : e,
            ),
          );
        }, flashMs);
        // short haptic feedback for each iteration
        haptic("alignment");
      },
      updateNodeData,
      (nodeId: string, opts?: { ms?: number }) => {
        const flashMs = opts?.ms ?? 500;

        setNodeFlashCounters((prev) => {
          const next = { ...(prev || {}) };
          next[nodeId] = (next[nodeId] || 0) + 1;
          return next;
        });

        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...(n.data as WorkflowNodeData),
                    __flashCount: ((n.data as any).__flashCount || 0) + 1,
                  },
                }
              : n,
          ),
        );

        setTimeout(() => {
          setNodeFlashCounters((prev) => {
            const next = { ...(prev || {}) };
            delete next[nodeId];
            return next;
          });
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: { ...(n.data as WorkflowNodeData), __flashCount: 0 },
                  }
                : n,
            ),
          );
        }, flashMs);
      },
      (nodeId: string, isInLoop: boolean) => {
        setLoopPathNodes((prev) => {
          const next = new Set(prev);
          if (isInLoop) {
            next.add(nodeId);
          } else {
            next.delete(nodeId);
          }
          return next;
        });
      },
    );

    workflowEngineRef.current = engine;

    try {
      await engine.run();
      if (forceKilledRef.current) return;
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }
      setIsStopping(false);
      onRunWorkflow();
      addToast("Workflow completed", "success");

      setTimeout(() => {
        const endNode = nodes.find(
          (n) => (n.data as WorkflowNodeData).type === "end",
        );
        if (endNode) {
          setSelectedNodeId(endNode.id);
        }
      }, 0);
    } catch (error: any) {
      if (forceKilledRef.current) return;
      console.error("Workflow execution error:", error);
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }
      setIsStopping(false);
      onRunWorkflow();
      addToast(error?.message || "Workflow failed", "error");
    }
  }, [
    nodes,
    edges,
    isRunning,
    isStopping,
    onRunWorkflow,
    onExecuteRequest,
    updateNodeStatus,
    updateEdgeStatus,
    resetNodeStatuses,
    addToast,
    updateNodeData,
    forceKillWorkflow,
    inferLoopBodyEdgeIds,
  ]);

  useEffect(() => {
    return () => {
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
      }
      // Clean up running TypeScript workers on unmount
      terminateAllTSRuns();
    };
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      beginUserAction();
      setEdges((eds) => {
        if (!params.source || !params.target) return eds;

        const adjacency: Record<string, string[]> = {};
        for (const e of eds) {
          adjacency[e.source] = adjacency[e.source] || [];
          adjacency[e.source].push(e.target);
        }
        adjacency[params.source] = adjacency[params.source] || [];
        adjacency[params.source].push(params.target);

        const stack: string[] = [params.target];
        const visited = new Set<string>();
        let createsCycle = false;

        while (stack.length > 0) {
          const nodeId = stack.pop()!;
          if (nodeId === params.source) {
            createsCycle = true;
            break;
          }
          if (visited.has(nodeId)) continue;
          visited.add(nodeId);
          const neighbours = adjacency[nodeId] || [];
          for (const n of neighbours) {
            if (!visited.has(n)) stack.push(n);
          }
        }

        if (createsCycle) {
          const visitedArray = Array.from(visited);
          const loopInCycle =
            visitedArray.some((id) => {
              const node = nodes.find((n) => n.id === id);
              return (node?.data as WorkflowNodeData)?.type === "loop";
            }) ||
            !!nodes.find(
              (n) =>
                n.id === params.source &&
                (n.data as WorkflowNodeData).type === "loop",
            ) ||
            !!nodes.find(
              (n) =>
                n.id === params.target &&
                (n.data as WorkflowNodeData).type === "loop",
            );
          if (!loopInCycle) {
            addToast("Cannot create cycles in workflow", "warning");
            return eds;
          }
        }

        return addEdge(params, eds);
      });
    },
    [setEdges, addToast, nodes, beginUserAction],
  );

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      const filteredChanges = (changes as NodeChange[]).filter((change) => {
        if (change.type === "remove") {
          const node = nodes.find((n) => n.id === change.id);
          if (
            (node?.data as WorkflowNodeData)?.type === "start" ||
            (node?.data as WorkflowNodeData)?.type === "end"
          ) {
            return false;
          }
        }
        return true;
      });

      // mark action start (debounced) so grouped moves / edits are captured once
      beginUserAction();
      onNodesChange(filteredChanges as Parameters<typeof onNodesChange>[0]);
    },
    [nodes, onNodesChange, beginUserAction],
  );

  const prevNodesRef = useRef(nodes);
  const prevEdgesRef = useRef(edges);
  useEffect(() => {
    const nodesChanged = nodes !== prevNodesRef.current;
    const edgesChanged = edges !== prevEdgesRef.current;

    if (nodesChanged || edgesChanged) {
      prevNodesRef.current = nodes;
      prevEdgesRef.current = edges;
      onWorkflowChange({ ...workflow, nodes, edges });
    }
  }, [nodes, edges, workflow, onWorkflowChange]);

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      // start a user action for edge changes (debounced)
      beginUserAction();
      onEdgesChange(changes);
    },
    [onEdgesChange, beginUserAction],
  );

  // History helpers (undo/redo)
  const applyHistorySnapshot = useCallback(
    (snapshot: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] }) => {
      isApplyingHistoryRef.current = true;
      setNodes(snapshot.nodes as any);
      setEdges(snapshot.edges as any);
      // allow React to settle then re-enable history capturing
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    },
    [setNodes, setEdges],
  );

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current.pop()!;
    futureRef.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    });
    applyHistorySnapshot(prev);
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
  }, [nodes, edges, applyHistorySnapshot]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    pastRef.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    });
    applyHistorySnapshot(next);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  }, [nodes, edges, applyHistorySnapshot]);

  // Keyboard shortcuts: Ctrl/Cmd+Z (undo), Shift+Ctrl/Cmd+Z / Ctrl/Cmd+Y (redo)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const meta = e.metaKey || e.ctrlKey;
      if (isInput) return;
      if (meta && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (
        (meta && e.shiftKey && e.key.toLowerCase() === "z") ||
        (meta && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  const handleNameChange = useCallback(
    (newName: string) => {
      onWorkflowChange({ ...workflow, name: newName });
    },
    [workflow, onWorkflowChange],
  );

  const addConditionNode = useCallback(() => {
    beginUserAction();
    const center = getViewportCenter();
    setNodes((nds) => {
      const newNode: Node<WorkflowNodeData> = {
        id: `condition-${Date.now()}`,
        type: "condition",
        position: center,
        data: {
          type: "condition",
          label: "New Condition",
          status: "idle",
          expression: "return status == 200",
        },
      };
      return [...nds, newNode];
    });
  }, [setNodes, beginUserAction, getViewportCenter]);

  const addLoopNode = useCallback(() => {
    beginUserAction();
    const center = getViewportCenter();
    setNodes((nds) => {
      const newNode: Node<WorkflowNodeData> = {
        id: `loop-${Date.now()}`,
        type: "loop",
        position: center,
        data: {
          type: "loop",
          label: "New Loop",
          status: "idle",
          loopType: "count",
          iterations: 3,
          delayMs: 0,
        },
      };
      return [...nds, newNode];
    });
  }, [setNodes, beginUserAction, getViewportCenter]);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
        <input
          type="text"
          value={workflow.name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="bg-transparent text-white font-medium text-sm border-none outline-none focus:ring-1 focus:ring-accent/50 rounded-md px-2 py-1"
        />
        <div className="flex-1" />
        {activeTab === "editor" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRunWorkflow}
              className={`flex items-center rounded-full px-6 py-2 text-sm font-semibold text-card transition-colors ${
                isRunning
                  ? isStopping
                    ? "bg-yellow hover:bg-red"
                    : "bg-red hover:bg-red"
                  : "bg-accent hover:bg-accent/90"
              }`}
            >
              {isRunning ? <>{isStopping ? "Force Kill" : "Stop"}</> : <>Run</>}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 px-4 py-2 shrink-0">
        {(["overview", "editor"] as const).map((tab) => (
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
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <WorkflowOverview
          workflow={workflow}
          nodes={nodes}
          edges={edges}
          onWorkflowChange={onWorkflowChange}
          onRun={() => {
            setActiveTab("editor");
            handleRunWorkflow();
          }}
          isRunning={isRunning}
          isStopping={isStopping}
        />
      ) : (
      <>
      <div className="flex-1 flex overflow-hidden relative">
        <div ref={reactFlowWrapper} className="flex-1 relative">
          <ReactFlow
            nodes={nodes.map((node) => ({
              ...node,
              className: loopPathNodes.has(node.id) ? "loop-path-node" : "",
            }))}
            edges={styledEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineType={ConnectionLineType.SmoothStep}
            fitView
            proOptions={{ hideAttribution: true }}
            className="bg-transparent"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={3}
              color="rgba(255,255,255,0.1)"
            />
            <Controls className="!bg-card !border-white/10 !rounded-lg [&>button]:!bg-transparent [&>button]:!border-white/10 [&>button]:!text-white/60 [&>button:hover]:!bg-white/10" />
          </ReactFlow>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-card/95 backdrop-blur-sm px-2 py-2 rounded-full border border-white/10">
            {projectRoot && (
              <button
                type="button"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setRequestPopover({ x: rect.left, y: rect.top });
                  setNodeTypePopover(null);
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors"
              >
                <HiOutlineCursorClick size={14} />
                Request
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setNodeTypePopover({ x: rect.left, y: rect.top });
                setRequestPopover(null);
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors"
            >
              <VscCode size={14} />
              Logic
            </button>
          </div>
        </div>

        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            onClose={() => setSelectedNodeId(null)}
            availableOutputs={getAvailableOutputs()}
            nodeOutput={nodeOutputs[selectedNode.id]}
            width={configPanelWidth}
            onWidthChange={setConfigPanelWidth}
          />
        )}
      </div>

      {requestPopover && projectRoot && (
        <RequestPopover
          root={projectRoot}
          position={requestPopover}
          onClose={() => setRequestPopover(null)}
          onAddRequest={(requestId, requestName, method) => {
            beginUserAction();
            const center = getViewportCenter();
            setNodes((nds) => {
              const newNode: Node<WorkflowNodeData> = {
                id: `request-${Date.now()}`,
                type: "request",
                position: center,
                data: {
                  type: "request",
                  label: requestName,
                  status: "idle",
                  requestId,
                  requestName,
                  method,
                },
              };
              return [...nds, newNode];
            });
          }}
        />
      )}

      {nodeTypePopover && (
        <NodeTypePopover
          position={nodeTypePopover}
          onClose={() => setNodeTypePopover(null)}
          onAddCondition={addConditionNode}
          onAddLoop={addLoopNode}
        />
      )}
      </>
      )}
    </div>
  );
}

export function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}

export type { WorkflowEditorProps };
