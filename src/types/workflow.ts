import type { Node, Edge } from "@xyflow/react";

export type WorkflowNodeType =
  | "start"
  | "end"
  | "request"
  | "condition"
  | "loop";

export type WorkflowNodeStatus = "idle" | "running" | "completed" | "error";

export interface BaseWorkflowNodeData {
  label: string;
  status: WorkflowNodeStatus;
  [key: string]: unknown;
}

export interface WorkflowOverrideItem {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type AuthOverrideType =
  | "none"
  | "inherit"
  | "bearer"
  | "basic"
  | "apikey"
  | "cookie";

export interface AuthOverride {
  type: AuthOverrideType;
  value: string;
  headerName?: string;
}

export type BodyOverrideType =
  | "none"
  | "inherit"
  | "json"
  | "variable"
  | "form";

export interface BodyOverride {
  type: BodyOverrideType;
  value: string;
}

export interface RequestOverrides {
  headers: WorkflowOverrideItem[];
  params: WorkflowOverrideItem[];
  auth: AuthOverride;
  body: BodyOverride;
  url?: string;
}

export interface RequestNodeData extends BaseWorkflowNodeData {
  type: "request";
  requestId: string;
  requestName: string;
  method: string;
  overrides?: RequestOverrides;
}

export interface ConditionNodeData extends BaseWorkflowNodeData {
  type: "condition";
  expression: string;
  conditionLanguage?: "typescript";
}

export type LoopType = "count" | "while" | "forEach";

export interface LoopNodeData extends BaseWorkflowNodeData {
  type: "loop";
  loopType?: LoopType;
  iterations: number;
  delayMs: number;
  flashColor?: string;
  flashMs?: number;
  currentIteration?: number;
  whileCondition?: string;
  forEachPath?: string;
  collectResults?: boolean;
}

export interface WorkflowEnvVariable {
  id: string;
  key: string;
  value: string;
}

export interface StartNodeData extends BaseWorkflowNodeData {
  type: "start";
  variables?: Record<string, unknown>;
  envVariables?: WorkflowEnvVariable[];
}

export interface EndNodeData extends BaseWorkflowNodeData {
  type: "end";
}

export type WorkflowNodeData =
  | RequestNodeData
  | ConditionNodeData
  | LoopNodeData
  | StartNodeData
  | EndNodeData;

export interface WorkflowFile {
  id: string;
  type: "workflow";
  name: string;
  description?: string;
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
}

export interface NodeOutput {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
  error?: string;
  duration?: number;
  timing?: {
    total_ms: number;
    dns_lookup_ms?: number;
    tcp_handshake_ms?: number;
    tls_handshake_ms?: number;
    ttfb_ms?: number;
    content_download_ms?: number;
  };
  requestSize?: {
    total_bytes: number;
    headers_bytes: number;
    body_bytes: number;
  };
  responseSize?: {
    total_bytes: number;
    headers_bytes: number;
    body_bytes: number;
  };
  iterationOutputs?: NodeOutput[];
}

export interface WorkflowExecutionContext {
  variables: Record<string, unknown>;
  nodeOutputs: Record<string, NodeOutput>;
  lastResponse: NodeOutput | null;
  currentNodeId: string | null;
  loopIndex?: number;
  loopItem?: unknown;
}

export const DEFAULT_OVERRIDES: RequestOverrides = {
  headers: [],
  params: [],
  auth: { type: "inherit", value: "" },
  body: { type: "inherit", value: "" },
  url: undefined,
};
