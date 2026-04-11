import {
	addEdge,
	Background,
	BackgroundVariant,
	type Connection,
	ConnectionLineType,
	Controls,
	type Edge,
	MarkerType,
	type Node,
	type NodeChange,
	ReactFlow,
	ReactFlowProvider,
	useEdgesState,
	useNodesState,
	useReactFlow,
} from "@xyflow/react";
import {
	type MutableRefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import "@xyflow/react/dist/style.css";
import { HiOutlineCursorClick } from "react-icons/hi";
import { VscCode } from "react-icons/vsc";
import { useWorkflowHistory } from "../../hooks/useWorkflowHistory";
import { useToastStore } from "../../stores/toastStore";
import type { Folder } from "../../types/project";
import type {
	NodeOutput,
	RequestNodeData,
	RequestOverrides,
	WorkflowEdgeFlashData,
	WorkflowExecuteRequestHandler,
	WorkflowExecutionContext,
	WorkflowFile,
	WorkflowNodeData,
	WorkflowNodeFlashData,
	WorkflowNodeStatus,
} from "../../types/workflow";
import { getErrorMessage } from "../../utils/errorHelpers";
import { haptic } from "../../utils/haptics";
import {
	preloadTsWorker,
	runTSConditionSandboxed,
	terminateAllTSRuns,
} from "../../utils/tsRunner";
import { WorkflowEngine } from "../../utils/workflowEngine";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { NodeTypePopover } from "./NodeTypePopover";
import { nodeTypes } from "./nodes";
import { RequestPopover } from "./RequestPopover";
import { WorkflowNodeOutputsContext } from "./WorkflowNodeOutputsContext";
import { WorkflowOverview } from "./WorkflowOverview";

type WorkflowNodeDataWithTransient = WorkflowNodeData & WorkflowNodeFlashData;

type WorkflowAvailableOutput = {
	nodeId: string;
	nodeName: string;
	type: string;
	method?: string;
	output?: NodeOutput;
	requestId?: string;
	isPrimary?: boolean;
	paths?: { path: string; type: string }[];
};

interface WorkflowEditorProps {
	workflow: WorkflowFile;
	onWorkflowChange: (workflow: WorkflowFile) => void;
	onRunWorkflow: () => void;
	isRunning: boolean;
	onExecuteRequest?: WorkflowExecuteRequestHandler;
	projectRoot?: Folder;
	/** When set, assigned to a function that force-kills a running workflow (header activity menu). */
	forceKillRef?: MutableRefObject<(() => void) | null>;
	/** Fired when run state changes so the shell can show the running workflow in the activity UI. */
	onRunningWorkflowMetaChange?: (
		meta: { id: string; name: string } | null,
	) => void;
}

function WorkflowEditorInner({
	workflow,
	onWorkflowChange,
	onRunWorkflow,
	isRunning,
	onExecuteRequest,
	projectRoot,
	forceKillRef,
	onRunningWorkflowMetaChange,
}: WorkflowEditorProps) {
	const reactFlowWrapper = useRef<HTMLDivElement>(null);
	const { screenToFlowPosition } = useReactFlow();
	const workflowEngineRef = useRef<WorkflowEngine | null>(null);
	const forceKilledRef = useRef(false);
	const [runningEdges, setRunningEdges] = useState<Set<string>>(new Set());
	const [completedEdges, setCompletedEdges] = useState<Set<string>>(new Set());
	const [errorEdges, setErrorEdges] = useState<Set<string>>(new Set());
	const [flashingEdges, setFlashingEdges] = useState<Set<string>>(new Set());
	const [flashCounters, setFlashCounters] = useState<Record<string, number>>(
		{},
	);
	const [, setNodeFlashCounters] = useState<Record<string, number>>({});
	const [loopBodyEdges, setLoopBodyEdges] = useState<Set<string>>(new Set());
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

	const { beginUserAction } = useWorkflowHistory({
		nodes,
		edges,
		setNodes,
		setEdges,
	});

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
				.filter((n) => (n.data as { type?: string }).type !== "script")
				.map((n) => {
					const nd = n.data as WorkflowNodeData;
					if (
						nd.type === "condition" &&
						(nd as { conditionLanguage?: string }).conditionLanguage ===
							"python"
					) {
						return {
							...n,
							data: {
								...nd,
								conditionLanguage: "typescript",
							} as WorkflowNodeData,
						};
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

			const _flashCount = flashCounters[edge.id] || 0;
			const _edgeData = (edge.data ?? {}) as WorkflowEdgeFlashData;
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
			if (status === "running") haptic("alignment");
		},
		[setNodes, addToast],
	);

	const updateNodeData = useCallback(
		(
			nodeId: string,
			partialData: Partial<WorkflowNodeData & WorkflowNodeFlashData>,
		) => {
			setNodes((nds) =>
				nds.map((n) => {
					if (n.id !== nodeId) return n;
					const data = {
						...(n.data as WorkflowNodeDataWithTransient),
						...partialData,
					} as WorkflowNodeDataWithTransient;
					return { ...n, data };
				}),
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

	const getViewportCenter = useCallback(() => {
		const wrapper = reactFlowWrapper.current;
		if (!wrapper) return { x: 250, y: 200 };
		const rect = wrapper.getBoundingClientRect();
		return screenToFlowPosition({
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2,
		});
	}, [screenToFlowPosition]);

	const getAvailableOutputs = useCallback((): WorkflowAvailableOutput[] => {
		if (!selectedNodeId) return [];

		const outputs: WorkflowAvailableOutput[] = [];
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
				const outputData: WorkflowAvailableOutput = {
					nodeId: sourceNode.id,
					nodeName: nodeData.label || sourceNode.id,
					type: nodeData.type,
					output: nodeOutputs[sourceNode.id],
					isPrimary: primarySourceIds.has(sourceNode.id),
				};
				if (nodeData.type === "request") {
					const requestData = nodeData as RequestNodeData;
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
				const outputData: WorkflowAvailableOutput = {
					nodeId: sourceNode.id,
					nodeName: nodeData.label || sourceNode.id,
					type: nodeData.type,
					output: nodeOutputs[sourceNode.id],
				};
				if (nodeData.type === "request") {
					const requestData = nodeData as RequestNodeData;
					outputData.method = requestData.method;
					outputData.nodeName =
						requestData.requestName || nodeData.label || sourceNode.id;
					outputData.requestId = requestData.requestId;
				}
				outputs.push(outputData);
			}
		}

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
					{ path: "{{item}}", type: "unknown" },
					{ path: "{{index}}", type: "number" },
				],
			});
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
		terminateAllTSRuns();
		setIsStopping(false);
		setRunningEdges(new Set());
		onRunWorkflow();
		resetNodeStatuses();
		addToast("Workflow force killed", "info");
		haptic("levelChange");
	}, [onRunWorkflow, resetNodeStatuses, addToast]);

	useEffect(() => {
		if (!forceKillRef) return;
		forceKillRef.current = () => {
			if (isRunning) forceKillWorkflow();
		};
		return () => {
			forceKillRef.current = null;
		};
	}, [forceKillRef, isRunning, forceKillWorkflow]);

	useEffect(() => {
		onRunningWorkflowMetaChange?.(
			isRunning ? { id: workflow.id, name: workflow.name } : null,
		);
	}, [isRunning, workflow.id, workflow.name, onRunningWorkflowMetaChange]);

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
				let bestPairScore = Number.NEGATIVE_INFINITY;
				for (const body of outgoing) {
					for (const exit of outgoing) {
						if (body.id === exit.id) continue;
						const pairScore = bodyScore(body) + exitScore(exit);
						if (pairScore > bestPairScore) {
							bestPairScore = pairScore;
							bestBody = body;
						}
					}
				}
				const loopBody =
					bestBody ||
					[...outgoing].sort((a, b) => bodyScore(b) - bodyScore(a))[0];
				if (loopBody) loopBodyEdgeIds.add(loopBody.id);
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
				adj.get(e.source)?.push(e.target);
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
				for (const n of adj.get(id) || []) {
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
			async (
				requestId: string,
				context: WorkflowExecutionContext,
				overrides?: RequestOverrides,
			) => {
				if (forceKilledRef.current)
					throw new Error("Workflow was force killed");
				if (onExecuteRequest) {
					const result = await onExecuteRequest(requestId, context, overrides);
					if (forceKilledRef.current)
						throw new Error("Workflow was force killed");
					return result;
				}
				await new Promise((resolve) => setTimeout(resolve, 500));
				return { status: 200, body: { success: true } };
			},
			async (code: string, context: WorkflowExecutionContext) => {
				if (forceKilledRef.current) return false;
				try {
					const result = await runTSConditionSandboxed(code, {
						status: context.lastResponse?.status,
						body: context.lastResponse?.body,
						headers: context.lastResponse?.headers,
						cookies: context.lastResponse?.cookies,
						item: context.loopItem,
						index: context.loopIndex,
						totalLength:
							typeof context.variables?.totalLength === "number"
								? context.variables.totalLength
								: undefined,
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
					const next = { ...prev };
					next[edgeId] = (next[edgeId] || 0) + 1;
					return next;
				});
				setFlashingEdges((prev) => new Set(prev).add(edgeId));
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
						const next = { ...prev };
						delete next[edgeId];
						return next;
					});
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
				haptic("alignment");
			},
			updateNodeData,
			(nodeId: string, opts?: { ms?: number }) => {
				const flashMs = opts?.ms ?? 500;
				setNodeFlashCounters((prev) => {
					const next = { ...prev };
					next[nodeId] = (next[nodeId] || 0) + 1;
					return next;
				});
				setNodes((prev) =>
					prev.map((n) => {
						if (n.id !== nodeId) return n;
						const d = n.data as WorkflowNodeDataWithTransient;
						return {
							...n,
							data: {
								...d,
								__flashCount: (d.__flashCount || 0) + 1,
							},
						};
					}),
				);
				setTimeout(() => {
					setNodeFlashCounters((prev) => {
						const next = { ...prev };
						delete next[nodeId];
						return next;
					});
					setNodes((prev) =>
						prev.map((n) => {
							if (n.id !== nodeId) return n;
							const d = n.data as WorkflowNodeDataWithTransient;
							return { ...n, data: { ...d, __flashCount: 0 } };
						}),
					);
				}, flashMs);
			},
			(nodeId: string, isInLoop: boolean) => {
				setLoopPathNodes((prev) => {
					const next = new Set(prev);
					if (isInLoop) next.add(nodeId);
					else next.delete(nodeId);
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
				if (endNode) setSelectedNodeId(endNode.id);
			}, 0);
		} catch (error: unknown) {
			if (forceKilledRef.current) return;
			console.error("Workflow execution error:", error);
			if (stopTimeoutRef.current) {
				clearTimeout(stopTimeoutRef.current);
				stopTimeoutRef.current = null;
			}
			setIsStopping(false);
			onRunWorkflow();
			addToast(getErrorMessage(error) || "Workflow failed", "error");
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
		setNodes,
		setEdges,
	]);

	useEffect(() => {
		return () => {
			if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
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
					for (const n of adjacency[nodeId] || []) {
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
					)
						return false;
				}
				return true;
			});
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
			beginUserAction();
			onEdgesChange(changes);
		},
		[onEdgesChange, beginUserAction],
	);

	const handleNameChange = useCallback(
		(newName: string) => {
			onWorkflowChange({ ...workflow, name: newName });
		},
		[workflow, onWorkflowChange],
	);

	const addConditionNode = useCallback(() => {
		beginUserAction();
		const center = getViewportCenter();
		setNodes((nds) => [
			...nds,
			{
				id: `condition-${Date.now()}`,
				type: "condition",
				position: center,
				data: {
					type: "condition",
					label: "New Condition",
					status: "idle",
					expression: "return status == 200",
				},
			} as Node<WorkflowNodeData>,
		]);
	}, [setNodes, beginUserAction, getViewportCenter]);

	const addLoopNode = useCallback(() => {
		beginUserAction();
		const center = getViewportCenter();
		setNodes((nds) => [
			...nds,
			{
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
			} as Node<WorkflowNodeData>,
		]);
	}, [setNodes, beginUserAction, getViewportCenter]);

	return (
		<div className="flex h-full flex-col bg-background">
			<div className="flex items-center gap-2 border-white/10 border-b px-4 py-3">
				<input
					type="text"
					value={workflow.name}
					onChange={(e) => handleNameChange(e.target.value)}
					className="rounded-md border-none bg-transparent px-2 py-1 font-medium text-sm text-white outline-none focus:ring-1 focus:ring-accent/50"
				/>
				<div className="flex-1" />
				{activeTab === "editor" && (
					<button
						type="button"
						onClick={handleRunWorkflow}
						className={`flex items-center rounded-full px-6 py-2 font-semibold text-card text-sm transition-colors ${
							isRunning
								? isStopping
									? "bg-yellow hover:bg-red"
									: "bg-red hover:bg-red"
								: "bg-accent hover:bg-accent/90"
						}`}
					>
						{isRunning ? isStopping ? "Force Kill" : "Stop" : <>Run</>}
					</button>
				)}
			</div>

			<div className="flex shrink-0 items-center gap-1 px-4 py-2">
				{(["overview", "editor"] as const).map((tab) => (
					<button
						key={tab}
						type="button"
						onClick={() => setActiveTab(tab)}
						className={`cursor-pointer rounded-md px-2 py-0.5 font-medium text-xs transition-colors ${
							activeTab === tab
								? "bg-accent/10 text-accent"
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
					<div className="relative flex flex-1 overflow-hidden">
						<div ref={reactFlowWrapper} className="relative flex-1">
							<WorkflowNodeOutputsContext.Provider value={nodeOutputs}>
								<ReactFlow
									nodes={nodes.map((node) => ({
										...node,
										className: loopPathNodes.has(node.id)
											? "loop-path-node"
											: "",
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
							</WorkflowNodeOutputsContext.Provider>

							<div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-card/95 px-2 py-2 backdrop-blur-sm">
								{projectRoot && (
									<button
										type="button"
										onClick={(e) => {
											const rect = e.currentTarget.getBoundingClientRect();
											setRequestPopover({ x: rect.left, y: rect.top });
											setNodeTypePopover(null);
										}}
										className="flex items-center gap-1.5 rounded-full bg-white/5 px-4 py-2 text-white/80 text-xs transition-colors hover:bg-white/10 hover:text-white"
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
									className="flex items-center gap-1.5 rounded-full bg-white/5 px-4 py-2 text-white/80 text-xs transition-colors hover:bg-white/10 hover:text-white"
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
								setNodes((nds) => [
									...nds,
									{
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
									} as Node<WorkflowNodeData>,
								]);
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
