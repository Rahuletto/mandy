import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
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
} from "../../types/workflow";
import type { Folder } from "../../types/project";
import { haptic } from "../../utils/haptics";
import { WorkflowEngine } from "../../utils/workflowEngine";
import { useToastStore } from "../../stores/toastStore";
import {
  runTSSandboxed,
  runTSConditionSandboxed,
  preloadTsWorker,
  terminateAllTSRuns,
} from "../../utils/tsRunner";

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
      setNodes(
        workflow.nodes.map((n) => {
          const nd = n.data as any;
          if (nd?.type === "script" && nd.language === "python") {
            return { ...n, data: { ...nd, language: "typescript" } };
          }
          if (nd?.type === "condition" && nd.conditionLanguage === "python") {
            return { ...n, data: { ...nd, conditionLanguage: "typescript" } };
          }
          return n;
        }),
      );
      setEdges(workflow.edges);
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
    }[] = [];
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
    // in overrides and scripts.
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

    // Identify loop body edges (edges from loop nodes with "loop" handle)
    const loopEdges = edges.filter((e) => {
      const sourceNode = nodes.find((n) => n.id === e.source);
      return (
        (sourceNode?.data as WorkflowNodeData)?.type === "loop" &&
        e.sourceHandle === "loop"
      );
    });
    setLoopBodyEdges(new Set(loopEdges.map((e) => e.id)));

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
        if (forceKilledRef.current) {
          return {
            status: 0,
            body: undefined,
            error: "Workflow was force killed",
          };
        }

        try {
          const result = await runTSSandboxed(code, {
            status: context.lastResponse?.status,
            body: context.lastResponse?.body,
            headers: context.lastResponse?.headers,
            cookies: context.lastResponse?.cookies,
            item: context.loopItem,
            index: context.loopIndex,
          });
          if (forceKilledRef.current) {
            return {
              status: 0,
              body: undefined,
              error: "Workflow was force killed",
            };
          }
          return { status: 200, body: result };
        } catch (err: any) {
          console.error("Script execution error:", err);
          return {
            status: 0,
            body: undefined,
            error: err?.message || "Script execution failed",
          };
        }
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

  const addScriptNode = useCallback(() => {
    beginUserAction();
    setNodes((nds) => {
      const newNode: Node<WorkflowNodeData> = {
        id: `script-${Date.now()}`,
        type: "script",
        position: { x: 250, y: nds.length * 100 + 100 },
        data: {
          type: "script",
          label: "New Script",
          status: "idle",
          language: "typescript",
          code: "",
        },
      };
      return [...nds, newNode];
    });
  }, [setNodes, beginUserAction]);

  const addConditionNode = useCallback(() => {
    beginUserAction();
    setNodes((nds) => {
      const newNode: Node<WorkflowNodeData> = {
        id: `condition-${Date.now()}`,
        type: "condition",
        position: { x: 250, y: nds.length * 100 + 100 },
        data: {
          type: "condition",
          label: "New Condition",
          status: "idle",
          expression: "return status == 200",
        },
      };
      return [...nds, newNode];
    });
  }, [setNodes, beginUserAction]);

  const addLoopNode = useCallback(() => {
    beginUserAction();
    setNodes((nds) => {
      const newNode: Node<WorkflowNodeData> = {
        id: `loop-${Date.now()}`,
        type: "loop",
        position: { x: 250, y: nds.length * 100 + 100 },
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
  }, [setNodes, beginUserAction]);

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
      </div>

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
              Script
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
            setNodes((nds) => {
              const newNode: Node<WorkflowNodeData> = {
                id: `request-${Date.now()}`,
                type: "request",
                position: { x: 250, y: nds.length * 80 + 100 },
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
          onAddScript={addScriptNode}
          onAddCondition={addConditionNode}
          onAddLoop={addLoopNode}
        />
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
