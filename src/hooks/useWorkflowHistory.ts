import { useCallback, useEffect, useRef, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNodeData } from "../types/workflow";

type Snapshot = { nodes: Node<WorkflowNodeData>[]; edges: Edge[] };

interface UseWorkflowHistoryOptions {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  setNodes: (nodes: Node<WorkflowNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
}

export function useWorkflowHistory({
  nodes,
  edges,
  setNodes,
  setEdges,
}: UseWorkflowHistoryOptions) {
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const actionInProgressRef = useRef(false);
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isApplyingHistoryRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const applySnapshot = useCallback(
    (snapshot: Snapshot) => {
      isApplyingHistoryRef.current = true;
      setNodes(snapshot.nodes as any);
      setEdges(snapshot.edges as any);
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    },
    [setNodes, setEdges],
  );

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
    const snapshot: Snapshot = {
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

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current.pop()!;
    futureRef.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    });
    applySnapshot(prev);
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
  }, [nodes, edges, applySnapshot]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.pop()!;
    pastRef.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    });
    applySnapshot(next);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  }, [nodes, edges, applySnapshot]);

  // Keyboard shortcuts: Cmd/Ctrl+Z (undo), Shift+Cmd/Ctrl+Z or Cmd/Ctrl+Y (redo)
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

  return { beginUserAction, undo, redo, canUndo, canRedo };
}
