import type { Edge, Node } from "@xyflow/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ConditionNodeData,
  LoopNodeData,
  RequestNodeData,
  WorkflowFile,
  WorkflowNodeData,
} from "../../types/workflow";
import { autoSizeTextarea } from "../../utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMethodColor(method: string) {
  switch (method?.toUpperCase()) {
    case "GET":
      return "bg-green/20 text-green";
    case "POST":
      return "bg-blue-500/20 text-blue-400";
    case "PUT":
      return "bg-yellow/20 text-yellow";
    case "DELETE":
      return "bg-red/20 text-red";
    case "PATCH":
      return "bg-purple-500/20 text-purple-400";
    default:
      return "bg-white/10 text-white/60";
  }
}

function getOverrideSummary(node: Node<WorkflowNodeData>) {
  const data = node.data as RequestNodeData;
  if (!data.overrides) return null;
  const parts: string[] = [];
  const activeHeaders =
    data.overrides.headers?.filter((h) => h.enabled && h.key) || [];
  const activeParams =
    data.overrides.params?.filter((p) => p.enabled && p.key) || [];
  if (activeHeaders.length > 0)
    parts.push(
      `${activeHeaders.length} header override${activeHeaders.length > 1 ? "s" : ""}`,
    );
  if (activeParams.length > 0)
    parts.push(
      `${activeParams.length} param override${activeParams.length > 1 ? "s" : ""}`,
    );
  if (data.overrides.auth?.type !== "inherit") parts.push("auth override");
  if (data.overrides.body?.type !== "inherit") parts.push("body override");
  if (data.overrides.url) parts.push("url override");
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// Flow tree types & builder
// ---------------------------------------------------------------------------

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

export function buildFlowTree(
  allNodes: Node<WorkflowNodeData>[],
  allEdges: Edge[],
): FlowStep[] {
  const successors = new Map<string, string[]>();
  for (const e of allEdges) {
    if (!successors.has(e.source)) successors.set(e.source, []);
    successors.get(e.source)?.push(e.target);
  }

  const reachableOrdered = (startId: string | null): string[] => {
    const seen = new Set<string>();
    const order: string[] = [];
    const queue = startId ? [startId] : [];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      for (const n of successors.get(id) || []) {
        queue.push(n);
      }
    }
    return order;
  };

  const loopInfo = new Map<
    string,
    { bodyTarget: string | null; exitTarget: string | null }
  >();
  for (const node of allNodes) {
    if ((node.data as WorkflowNodeData).type !== "loop") continue;
    const outEdges = allEdges.filter((e) => e.source === node.id);
    if (outEdges.length === 0) {
      loopInfo.set(node.id, { bodyTarget: null, exitTarget: null });
      continue;
    }
    if (outEdges.length === 1) {
      loopInfo.set(node.id, {
        bodyTarget: outEdges[0].target,
        exitTarget: null,
      });
      continue;
    }
    const bodyEdge = outEdges.find((e) => e.sourceHandle === "loop");
    const exitEdge = outEdges.find((e) => e.sourceHandle === "exit");
    if (bodyEdge && exitEdge) {
      loopInfo.set(node.id, {
        bodyTarget: bodyEdge.target,
        exitTarget: exitEdge.target,
      });
      continue;
    }
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
    loopInfo.set(node.id, {
      bodyTarget: scored[0].edge.target,
      exitTarget: scored[1]?.edge.target || null,
    });
  }

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
        const startSuccessors: string[] = successors.get(currentId) || [];
        currentId = startSuccessors[0] || null;
        continue;
      }

      localVisited.add(currentId);

      if (data.type === "loop") {
        const info = loopInfo.get(currentId);
        const bodyBoundary = new Set(boundary);
        bodyBoundary.add(currentId);
        const bodySteps = info?.bodyTarget
          ? walk(info.bodyTarget, bodyBoundary)
          : [];
        steps.push({ kind: "loop", node, body: bodySteps });
        currentId = info?.exitTarget || null;
      } else if (data.type === "condition") {
        const outEdges = allEdges.filter((e) => e.source === currentId);
        const trueEdge =
          outEdges.find((e) => e.sourceHandle === "true") || outEdges[0];
        const falseEdge =
          outEdges.find((e) => e.sourceHandle === "false") || outEdges[1];
        const trueTarget = trueEdge?.target || null;
        const falseTarget = falseEdge?.target || null;

        const trueOrder = reachableOrdered(trueTarget);
        const falseReach = new Set(reachableOrdered(falseTarget));
        const mergeId = trueOrder.find((id) => falseReach.has(id)) || null;
        const mergeNode = mergeId
          ? allNodes.find((n) => n.id === mergeId) || null
          : null;

        const branchBoundary = new Set(boundary);
        if (mergeId) branchBoundary.add(mergeId);

        const trueBranch = trueTarget ? walk(trueTarget, branchBoundary) : [];
        const falseBranch = falseTarget
          ? walk(falseTarget, branchBoundary)
          : [];

        steps.push({
          kind: "condition",
          node,
          trueBranch,
          falseBranch,
          mergeNode,
        });
        currentId = mergeId;
      } else {
        steps.push({ kind: "node", node });
        const next = successors.get(currentId) || [];
        currentId =
          next.find((id) => !localVisited.has(id) && !boundary.has(id)) || null;
      }
    }

    return steps;
  }

  const startNode = allNodes.find(
    (n) => (n.data as WorkflowNodeData).type === "start",
  );
  if (!startNode) return [];
  return walk(startNode.id, new Set());
}

// ---------------------------------------------------------------------------
// FlowNodeInline
// ---------------------------------------------------------------------------

function FlowNodeInline({ data }: { data: WorkflowNodeData }) {
  if (data.type === "request") {
    const req = data as RequestNodeData;
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-bold font-mono text-[10px] ${getMethodColor(req.method)}`}
        >
          {req.method || "GET"}
        </span>
        <span className="truncate text-white/70 text-xs">
          {req.requestName || data.label}
        </span>
      </div>
    );
  }
  if (data.type === "condition") {
    const cond = data as ConditionNodeData;
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded bg-orange-500/20 px-1.5 py-0.5 font-bold font-mono text-[10px] text-orange-400">
          IF
        </span>
        <span className="truncate font-mono text-white/50 text-xs">
          {cond.expression || "..."}
        </span>
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// FlowStepList
// ---------------------------------------------------------------------------

export function FlowStepList({ steps }: { steps: FlowStep[] }) {
  return (
    <>
      {steps.map((step) => {
        if (step.kind === "node") {
          return (
            <div key={step.node.id}>
              <div className="ml-[9px] h-3 w-px bg-white/10" />
              <div className="flex items-center gap-3 py-1.5">
                <div className="ml-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
                <FlowNodeInline data={step.node.data as WorkflowNodeData} />
              </div>
            </div>
          );
        }

        if (step.kind === "condition") {
          const cond = step.node.data as ConditionNodeData;
          const mergeData = step.mergeNode?.data as
            | WorkflowNodeData
            | undefined;
          const isEndMerge = mergeData?.type === "end";
          return (
            <div key={step.node.id}>
              <div className="ml-[9px] h-3 w-px bg-white/10" />
              <div className="flex items-center gap-2 py-1.5">
                <div className="ml-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400/60" />
                <span className="rounded bg-orange-500/20 px-1.5 py-0.5 font-bold font-mono text-[10px] text-orange-400">
                  IF
                </span>
                <span className="truncate font-mono text-[11px] text-white/40">
                  {cond.expression || "..."}
                </span>
              </div>
              <div className="ml-[9px] h-2 w-px bg-white/10" />
              <div className="ml-1 flex gap-2">
                <div className="min-w-0 flex-1 rounded-md border border-green/15 bg-green/2 px-2 pt-1.5 pb-1">
                  <p className="mb-0.5 font-semibold text-[10px] text-green/50">
                    true
                  </p>
                  {step.trueBranch.length > 0 ? (
                    <FlowStepList steps={step.trueBranch} />
                  ) : (
                    <p className="py-1 pl-1 text-[11px] text-white/20">—</p>
                  )}
                </div>
                <div className="min-w-0 flex-1 rounded-md border border-red/15 bg-red/2 px-2 pt-1.5 pb-1">
                  <p className="mb-0.5 font-semibold text-[10px] text-red/50">
                    false
                  </p>
                  {step.falseBranch.length > 0 ? (
                    <FlowStepList steps={step.falseBranch} />
                  ) : (
                    <p className="py-1 pl-1 text-[11px] text-white/20">—</p>
                  )}
                </div>
              </div>
              {step.mergeNode && !isEndMerge && (
                <>
                  <div className="ml-[9px] h-2 w-px bg-white/10" />
                  <div className="flex items-center gap-2 py-1">
                    <div className="ml-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/15" />
                    <span className="text-[10px] text-white/25">join</span>
                    <span className="text-[10px] text-white/40">→</span>
                    <FlowNodeInline
                      data={step.mergeNode.data as WorkflowNodeData}
                    />
                  </div>
                </>
              )}
              {step.mergeNode && isEndMerge && (
                <>
                  <div className="ml-[9px] h-2 w-px bg-white/10" />
                  <div className="flex items-center gap-2 py-1">
                    <div className="ml-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/15" />
                    <span className="text-[10px] text-white/25">
                      join → end
                    </span>
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
            <div className="ml-[9px] h-3 w-px bg-white/10" />
            <div className="ml-1 rounded-lg border border-violet-500/20 bg-violet-500/3 px-3 pt-2 pb-1">
              <div className="mb-0.5 flex items-center gap-2">
                <span className="rounded bg-violet-500/20 px-1.5 py-0.5 font-bold font-mono text-[10px] text-violet-400">
                  LOOP
                </span>
                <span className="text-[11px] text-white/40">{loopLabel}</span>
              </div>
              {step.body.length > 0 ? (
                <div className="ml-1">
                  <FlowStepList steps={step.body} />
                  <div className="ml-[9px] h-2 w-px bg-white/10" />
                </div>
              ) : (
                <p className="ml-2 py-2 text-[11px] text-white/20">
                  No body steps
                </p>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// WorkflowOverview
// ---------------------------------------------------------------------------

interface WorkflowOverviewProps {
  workflow: WorkflowFile;
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  onWorkflowChange: (workflow: WorkflowFile) => void;
  onRun: () => void;
  isRunning: boolean;
  isStopping: boolean;
}

export function WorkflowOverview({
  workflow,
  nodes,
  edges,
  onWorkflowChange,
  onRun,
  isRunning,
  isStopping,
}: WorkflowOverviewProps) {
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
  }, []);

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
    () =>
      nodes.filter((n) => (n.data as WorkflowNodeData).type === "condition"),
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
        if (s.kind === "condition")
          n +=
            count(s.trueBranch) + count(s.falseBranch) + (s.mergeNode ? 1 : 0);
      }
      return n;
    }
    return count(flowTree);
  }, [flowTree]);

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="relative mx-auto flex min-h-full max-w-[1600px] gap-8 pr-4 pl-8">
        <div className="w-[40%] flex-1 py-12">
          <div className="max-w-3xl">
            {isEditingName ? (
              <input
                className="mb-2 w-full border-none bg-transparent font-bold text-2xl text-white outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
              />
            ) : (
              <h1
                className="mb-2 cursor-text font-bold text-2xl text-white hover:text-white/90"
                onClick={() => setIsEditingName(true)}
              >
                {workflow.name}
              </h1>
            )}

            <textarea
              ref={descriptionRef}
              className="mb-3 min-h-6 w-full resize-none overflow-hidden border-none bg-transparent text-sm text-white/60 outline-none placeholder:text-white/20"
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
                  <h3 className="mb-2 font-semibold text-sm text-white/70">
                    Requests
                  </h3>
                  <div className="space-y-1">
                    {requestNodes.map((node) => {
                      const data = node.data as RequestNodeData;
                      const overrides = getOverrideSummary(node);
                      return (
                        <div
                          key={node.id}
                          className="border-white/5 border-b py-2 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`rounded px-1.5 py-0.5 font-bold font-mono text-[10px] ${getMethodColor(data.method)}`}
                            >
                              {data.method || "GET"}
                            </span>
                            <span className="font-medium font-mono text-white text-xs">
                              {data.requestName || data.label}
                            </span>
                          </div>
                          {overrides && (
                            <p className="mt-1 text-[11px] text-white/30">
                              {overrides}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {conditionNodes.length > 0 && (
                <div>
                  <h3 className="mb-2 font-semibold text-sm text-white/70">
                    Conditions
                  </h3>
                  <div className="space-y-1">
                    {conditionNodes.map((node) => {
                      const data = node.data as ConditionNodeData;
                      return (
                        <div
                          key={node.id}
                          className="border-white/5 border-b py-2 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <span className="rounded bg-orange-500/20 px-1.5 py-0.5 font-bold font-mono text-[10px] text-orange-400">
                              IF
                            </span>
                            <span className="truncate font-mono text-white/80 text-xs">
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
                  <h3 className="mb-2 font-semibold text-sm text-white/70">
                    Loops
                  </h3>
                  <div className="space-y-1">
                    {loopNodes.map((node) => {
                      const data = node.data as LoopNodeData;
                      return (
                        <div
                          key={node.id}
                          className="border-white/5 border-b py-2 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <span className="rounded bg-violet-500/20 px-1.5 py-0.5 font-bold font-mono text-[10px] text-violet-400">
                              LOOP
                            </span>
                            <span className="font-mono text-white/80 text-xs">
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

        <div className="sticky top-0 h-[80vh] w-[60%] shrink-0 self-start py-4">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/5 bg-background">
            <div className="flex shrink-0 items-center justify-between border-white/5 border-b bg-white/5 px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-accent/20 px-1.5 py-0.5 font-bold font-mono text-[10px] text-accent">
                  FLOW
                </span>
                <span className="text-white/40 text-xs">
                  {stepCount} step{stepCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-auto px-5 py-4">
              <div>
                <div className="flex items-center gap-3 py-1.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                  </div>
                  <span className="font-medium text-white/40 text-xs">
                    Start
                  </span>
                </div>

                <FlowStepList steps={flowTree} />

                <div className="ml-[9px] h-3 w-px bg-white/10" />
                <div className="flex items-center gap-3 py-1.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green/20">
                    <div className="h-1.5 w-1.5 rounded-full bg-green" />
                  </div>
                  <span className="font-medium text-white/40 text-xs">End</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onRun}
                className={`absolute right-4 bottom-4 z-20 flex cursor-pointer items-center gap-2 rounded-full px-4 py-1.5 font-semibold text-card text-sm transition-colors ${
                  isRunning
                    ? isStopping
                      ? "bg-yellow hover:bg-red"
                      : "bg-red hover:bg-red"
                    : "bg-accent hover:bg-accent/90"
                }`}
              >
                {isRunning ? isStopping ? "Force Kill" : "Stop" : <>Run</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
