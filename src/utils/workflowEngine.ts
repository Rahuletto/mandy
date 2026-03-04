import type { Node, Edge } from "@xyflow/react";
import type {
  WorkflowNodeData,
  WorkflowNodeStatus,
  WorkflowExecutionContext,
  RequestNodeData,
  ConditionNodeData,
  LoopNodeData,
  NodeOutput,
  RequestOverrides,
} from "../types/workflow";

function resolveVariables(
  text: string,
  context: WorkflowExecutionContext,
  codeMode = false,
): string {
  if (!text) return text;

  const variableRegex = /\{\{([^}]+)\}\}/g;

  return text.replace(variableRegex, (match, path: string) => {
    const trimmed = path.trim();

    // In code mode, allow full expressions that begin with known runtime roots,
    // e.g. {{index+1}} or {{body?.items}}. Detect the leading identifier first
    // and return the raw expression so it can be used directly in TypeScript code.
    if (codeMode) {
      const idMatch = trimmed.match(/^[A-Za-z_$][\w$]*/);
      const root = idMatch ? idMatch[0] : trimmed.split(".")[0];
      const knownRoots = new Set([
        "status",
        "body",
        "headers",
        "cookies",
        "item",
        "index",
        "totalLength",
        "iterationOutputs",
      ]);
      if (knownRoots.has(root)) {
        return trimmed;
      }
    }

    // Support simple arithmetic expressions in placeholders (non-code mode),
    // e.g. {{index+1}} or {{1+index}}. For safety only evaluate single binary
    // expressions with one identifier and one numeric literal (simple use cases).
    // This enables users to write {{index+1}} to get a 1-based index in templates.
    const simpleBinOp = trimmed.match(
      /^\s*([A-Za-z_$][\w$]*)\s*([\+\-\*\/%])\s*(-?\d+(?:\.\d+)?)\s*$/,
    );
    if (simpleBinOp) {
      const [, ident, op, numStr] = simpleBinOp;
      const identVal = getNestedValue(context, ident);
      if (identVal === undefined) return match;
      const leftNum = Number(identVal);
      const rightNum = Number(numStr);
      if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
        let res: number;
        switch (op) {
          case "+":
            res = leftNum + rightNum;
            break;
          case "-":
            res = leftNum - rightNum;
            break;
          case "*":
            res = leftNum * rightNum;
            break;
          case "/":
            res = leftNum / rightNum;
            break;
          case "%":
            res = leftNum % rightNum;
            break;
          default:
            return match;
        }
        return String(res);
      }
      return match;
    }

    // Also support the reverse ordering: numeric literal op identifier, e.g., {{1+index}}
    const simpleBinOpReverse = trimmed.match(
      /^\s*(-?\d+(?:\.\d+)?)\s*([\+\-\*\/%])\s*([A-Za-z_$][\w$]*)\s*$/,
    );
    if (simpleBinOpReverse) {
      const [, numStr, op, ident] = simpleBinOpReverse;
      const identVal = getNestedValue(context, ident);
      if (identVal === undefined) return match;
      const leftNum = Number(numStr);
      const rightNum = Number(identVal);
      if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
        let res: number;
        switch (op) {
          case "+":
            res = leftNum + rightNum;
            break;
          case "-":
            res = leftNum - rightNum;
            break;
          case "*":
            res = leftNum * rightNum;
            break;
          case "/":
            res = leftNum / rightNum;
            break;
          case "%":
            res = leftNum % rightNum;
            break;
          default:
            return match;
        }
        return String(res);
      }
      return match;
    }

    const value = getNestedValue(context, trimmed);
    if (value === undefined) return match;

    if (codeMode) {
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    }

    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

function getNestedValue(
  context: WorkflowExecutionContext,
  path: string,
): unknown {
  const parts = path.split(".");
  const root = parts[0];

  // Check loop context first
  if (root === "item") {
    let value: unknown = context.loopItem ?? context.variables["item"];
    for (let i = 1; i < parts.length; i++) {
      if (value === null || value === undefined) return undefined;
      if (typeof value !== "object") return undefined;
      value = (value as Record<string, unknown>)[parts[i]];
    }
    return value;
  }
  if (root === "index") return context.loopIndex ?? context.variables["index"];

  // Check lastResponse
  if (context.lastResponse) {
    let value: unknown;

    switch (root) {
      case "body":
        value = context.lastResponse.body;
        break;
      case "headers":
        value = context.lastResponse.headers;
        break;
      case "cookies":
        value = context.lastResponse.cookies;
        break;
      case "status":
        return context.lastResponse.status;
      case "statusText":
        return context.lastResponse.statusText;
      case "error":
        return context.lastResponse.error;
      default:
        // Prefer top-level keys on lastResponse (e.g., iterationOutputs) before falling back to variables
        if ((context.lastResponse as any).hasOwnProperty(root)) {
          value = (context.lastResponse as any)[root];
        } else {
          value = context.variables[root];
        }
    }

    for (let i = 1; i < parts.length; i++) {
      if (value === null || value === undefined) return undefined;
      if (typeof value !== "object") return undefined;
      value = (value as Record<string, unknown>)[parts[i]];
    }

    return value;
  }

  // Fallback to variables
  let value: unknown = context.variables[root];
  for (let i = 1; i < parts.length; i++) {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[parts[i]];
  }

  return value;
}

export class WorkflowEngine {
  private nodes: Node<WorkflowNodeData>[];
  private edges: Edge[];
  private onNodeStatusChange: (
    nodeId: string,
    status: WorkflowNodeStatus,
  ) => void;
  private onEdgeStatusChange: (
    edgeId: string,
    status: "idle" | "running" | "completed" | "error",
  ) => void;
  private onNodeOutput?: (nodeId: string, output: NodeOutput) => void;
  private onEdgeFlash?: (
    edgeId: string,
    opts?: { color?: string; ms?: number },
  ) => void;
  private onNodeDataUpdate?: (
    nodeId: string,
    partialData: Partial<WorkflowNodeData>,
  ) => void;
  private onIterationComplete?: (
    nodeId: string,
    opts?: { ms?: number },
  ) => void;
  private onLoopPathChange?: (nodeId: string, isInLoop: boolean) => void;
  private executeRequest: (
    requestId: string,
    context: WorkflowExecutionContext,
    overrides?: RequestOverrides,
  ) => Promise<NodeOutput>;
  private evaluateCondition: (
    code: string,
    context: WorkflowExecutionContext,
  ) => Promise<boolean>;
  private stopped = false;

  constructor(
    nodes: Node<WorkflowNodeData>[],
    edges: Edge[],
    onNodeStatusChange: (nodeId: string, status: WorkflowNodeStatus) => void,
    onEdgeStatusChange: (
      edgeId: string,
      status: "idle" | "running" | "completed" | "error",
    ) => void,
    executeRequest: (
      requestId: string,
      context: WorkflowExecutionContext,
      overrides?: RequestOverrides,
    ) => Promise<NodeOutput>,
    evaluateCondition: (
      code: string,
      context: WorkflowExecutionContext,
    ) => Promise<boolean>,
    onNodeOutput?: (nodeId: string, output: NodeOutput) => void,
    onEdgeFlash?: (
      edgeId: string,
      opts?: { color?: string; ms?: number },
    ) => void,
    onNodeDataUpdate?: (
      nodeId: string,
      partialData: Partial<WorkflowNodeData>,
    ) => void,
    onIterationComplete?: (nodeId: string, opts?: { ms?: number }) => void,
    onLoopPathChange?: (nodeId: string, isInLoop: boolean) => void,
  ) {
    this.nodes = nodes;
    this.edges = edges;
    this.onNodeStatusChange = onNodeStatusChange;
    this.onEdgeStatusChange = onEdgeStatusChange;
    this.executeRequest = executeRequest;
    this.evaluateCondition = evaluateCondition;
    this.onNodeOutput = onNodeOutput;
    this.onEdgeFlash = onEdgeFlash;
    this.onNodeDataUpdate = onNodeDataUpdate;
    this.onIterationComplete = onIterationComplete;
    this.onLoopPathChange = onLoopPathChange;
  }

  async run(): Promise<void> {
    this.stopped = false;
    const startNode = this.findStartNode();

    if (!startNode) {
      throw new Error("No start node found in workflow");
    }
    const initialVariables = (startNode.data as any)?.variables || {};

    const envVars = (startNode.data as any)?.envVariables || [];
    const envVariablesMap: Record<string, unknown> = {};
    for (const envVar of envVars) {
      envVariablesMap[envVar.key] = envVar.value;
    }

    const context: WorkflowExecutionContext = {
      variables: { ...initialVariables, ...envVariablesMap },
      nodeOutputs: {},
      lastResponse: null,
      currentNodeId: null,
    };

    try {
      await this.executeFromNode(startNode.id, context);
    } catch (error) {
      if (!this.stopped) {
        throw error;
      }
    }
  }

  stop(): void {
    this.stopped = true;
  }

  private async executeFromNode(
    nodeId: string,
    context: WorkflowExecutionContext,
    callStack: Set<string> = new Set(),
  ): Promise<void> {
    if (this.stopped) return;

    if (callStack.has(nodeId)) {
      const existing = this.nodes.find((n) => n.id === nodeId);

      const hasLoopInStack = Array.from(callStack).some((sid) => {
        const nd = this.nodes.find((n) => n.id === sid);
        return !!nd && (nd.data as WorkflowNodeData).type === "loop";
      });

      if (
        (existing && (existing.data as WorkflowNodeData).type === "loop") ||
        hasLoopInStack
      ) {
        console.debug(
          `[WorkflowEngine] Detected cycle involving loop node; allowing re-entry for node ${nodeId}`,
        );
        return;
      }

      const path = Array.from(callStack).concat([nodeId]).join(" -> ");
      this.onNodeStatusChange(nodeId, "error");
      throw new Error(`Detected cycle in workflow execution: ${path}`);
    }
    callStack.add(nodeId);

    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) {
      callStack.delete(nodeId);
      return;
    }

    context.currentNodeId = nodeId;
    this.onNodeStatusChange(nodeId, "running");
    this.onLoopPathChange?.(nodeId, true);

    try {
      const nodeData = node.data;

      switch (nodeData.type) {
        case "start":
          this.onNodeStatusChange(nodeId, "completed");
          break;

        case "end":
          this.onNodeStatusChange(nodeId, "completed");
          return;

        case "request": {
          const requestData = nodeData as RequestNodeData;
          const rawOverrides = requestData.overrides || {
            headers: [],
            params: [],
            auth: { type: "inherit", value: "" },
            body: { type: "inherit", value: "" },
          };
          const resolvedOverrides: RequestOverrides = {
            headers: Array.isArray(rawOverrides.headers)
              ? rawOverrides.headers.map((h) => ({
                  ...h,
                  value: resolveVariables(h.value || "", context, false),
                }))
              : [],
            params: Array.isArray(rawOverrides.params)
              ? rawOverrides.params.map((p) => ({
                  ...p,
                  value: resolveVariables(p.value || "", context, false),
                }))
              : [],
            auth: rawOverrides.auth
              ? {
                  ...rawOverrides.auth,
                  value: resolveVariables(
                    (rawOverrides.auth as any).value || "",
                    context,
                    false,
                  ),
                }
              : { type: "inherit", value: "" },
            body: rawOverrides.body
              ? {
                  ...rawOverrides.body,
                  value: resolveVariables(
                    (rawOverrides.body as any).value || "",
                    context,
                    false,
                  ),
                }
              : { type: "inherit", value: "" },
            url:
              typeof rawOverrides.url === "string"
                ? resolveVariables(rawOverrides.url, context, false)
                : undefined,
          };
          const output = await this.executeRequest(
            requestData.requestId,
            context,
            resolvedOverrides,
          );
          context.nodeOutputs[nodeId] = output;
          context.lastResponse = output;
          this.onNodeOutput?.(nodeId, output);
          if (output.error) {
            this.onNodeStatusChange(nodeId, "error");
            throw new Error(output.error);
          }
          this.onNodeStatusChange(nodeId, "completed");
          break;
        }

        case "condition": {
          const conditionData = nodeData as ConditionNodeData;
          const resolvedCode = resolveVariables(
            conditionData.expression,
            context,
            true,
          );
          console.debug(
            `[WorkflowEngine] Evaluating condition node ${nodeId}:`,
            resolvedCode,
          );
          const result = await this.evaluateCondition(resolvedCode, context);
          console.debug(
            `[WorkflowEngine] Condition result for node ${nodeId}:`,
            result,
          );

          // For true conditions, pass through the incoming payload so downstream nodes
          // can consume the same data the condition evaluated.
          if (result) {
            let passthrough: NodeOutput;
            try {
              passthrough = JSON.parse(
                JSON.stringify(
                  context.lastResponse ?? {
                    status: 200,
                    body: null,
                  },
                ),
              );
            } catch {
              passthrough = context.lastResponse ?? { status: 200, body: null };
            }
            context.nodeOutputs[nodeId] = passthrough;
            this.onNodeOutput?.(nodeId, passthrough);
          }

          this.onNodeStatusChange(nodeId, "completed");

          const outgoingEdges = this.getOutgoingEdges(nodeId);
          const targetEdge = this.resolveConditionEdge(
            nodeId,
            outgoingEdges,
            result,
          );

          if (!targetEdge) {
            console.warn(
              `[WorkflowEngine] No outgoing edge for condition node ${nodeId} (result: ${result}). Execution will stop here.`,
            );
            return;
          }

          if (targetEdge && !this.stopped) {
            this.onEdgeStatusChange(targetEdge.id, "running");
            const targetNode = this.nodes.find(
              (n) => n.id === targetEdge.target,
            );
            if (
              callStack.has(targetEdge.target) &&
              (targetNode?.data as WorkflowNodeData)?.type === "loop"
            ) {
              console.debug(
                `[WorkflowEngine] Skipping re-entry into loop node ${targetEdge.target} via edge ${targetEdge.id} (condition node ${nodeId})`,
              );
              this.onEdgeStatusChange(targetEdge.id, "completed");
            } else {
              await this.executeFromNode(targetEdge.target, context, callStack);
              this.onEdgeStatusChange(targetEdge.id, "completed");
            }
          }
          return;
        }

        case "loop": {
          const loopData = nodeData as LoopNodeData;
          const loopType = loopData.loopType || "count";
          const delayMs = loopData.delayMs || 0;
          let lastIterationOutput: NodeOutput | undefined;

          const outgoingEdges = this.getOutgoingEdges(nodeId);
          const { loopBodyEdge, exitEdge } = this.resolveLoopEdges(
            nodeId,
            outgoingEdges,
          );
          console.debug(
            `[WorkflowEngine] Loop node ${nodeId} has outgoing edges:`,
            outgoingEdges.map((e) => ({
              id: e.id,
              sourceHandle: e.sourceHandle,
              target: e.target,
            })),
          );

          const collect = !!(loopData as any).collectResults;
          const resultsBodies: unknown[] = [];
          const resultsOutputs: NodeOutput[] = [];
          console.debug(
            `[WorkflowEngine] Loop node ${nodeId} - loopBodyEdge:`,
            loopBodyEdge,
            "exitEdge:",
            exitEdge,
          );

          if (loopType === "count") {
            const iterations = loopData.iterations || 1;

            for (let i = 0; i < iterations && !this.stopped; i++) {
              context.loopIndex = i;
              context.variables["__loopIndex"] = i;
              context.variables["__loopIteration"] = i + 1;
              context.variables["totalLength"] = iterations;

              this.onNodeDataUpdate?.(nodeId, { currentIteration: i + 1 });

              if (loopBodyEdge) {
                this.onEdgeStatusChange(loopBodyEdge.id, "running");
                this.onLoopPathChange?.(loopBodyEdge.target, true);
                await this.executeFromNode(
                  loopBodyEdge.target,
                  context,
                  callStack,
                );
                if (context.lastResponse) {
                  try {
                    lastIterationOutput = JSON.parse(
                      JSON.stringify(context.lastResponse),
                    );
                  } catch {
                    lastIterationOutput = context.lastResponse;
                  }
                }
                this.onLoopPathChange?.(loopBodyEdge.target, false);

                if (collect) {
                  try {
                    resultsBodies.push(
                      JSON.parse(JSON.stringify(context.lastResponse?.body)),
                    );
                  } catch (e) {
                    resultsBodies.push(context.lastResponse?.body ?? null);
                  }
                  try {
                    resultsOutputs.push(
                      JSON.parse(JSON.stringify(context.lastResponse ?? null)),
                    );
                  } catch (e) {
                    // If deep clone fails for some reason, fall back to pushing the raw value
                    resultsOutputs.push(
                      context.lastResponse ?? { status: undefined, body: null },
                    );
                  }
                }

                // Keep loop body edge running for next iteration
                try {
                  this.onEdgeFlash?.(loopBodyEdge.id);
                } catch (e) {
                  // ignore errors from optional flash callback
                }
              }

              // Flash the loop node to indicate iteration completion
              try {
                this.onIterationComplete?.(nodeId, { ms: loopData.flashMs });
              } catch (e) {
                // ignore errors from optional flash callback
              }

              if (i < iterations - 1 && delayMs > 0) {
                await this.delay(delayMs);
              }
            }

            // If collection is enabled, expose aggregated results on loop completion
            if (collect) {
              const aggregatedOutput: NodeOutput = {
                status: 200,
                body: resultsBodies,
                iterationOutputs: resultsOutputs,
              };
              context.nodeOutputs[nodeId] = aggregatedOutput;
              context.lastResponse = aggregatedOutput;
              this.onNodeOutput?.(nodeId, aggregatedOutput);
            } else if (lastIterationOutput) {
              context.nodeOutputs[nodeId] = lastIterationOutput;
              context.lastResponse = lastIterationOutput;
              this.onNodeOutput?.(nodeId, lastIterationOutput);
            }
          } else if (loopType === "forEach" && loopData.forEachPath) {
            // Strip {{ and }} if present, also handle old [ ] syntax
            const arrayPath = loopData.forEachPath
              .replace(/^\{\{|\}\}$/g, "")
              .replace(/^\[|\]$/g, "")
              .trim();
            const items = getNestedValue(context, arrayPath);

            if (Array.isArray(items)) {
              for (let i = 0; i < items.length && !this.stopped; i++) {
                context.loopIndex = i;
                context.loopItem = items[i];
                context.variables["__loopIndex"] = i;
                context.variables["__loopItem"] = items[i];
                context.variables["totalLength"] = items.length;

                this.onNodeDataUpdate?.(nodeId, { currentIteration: i + 1 });

                if (loopBodyEdge) {
                  this.onEdgeStatusChange(loopBodyEdge.id, "running");
                  this.onLoopPathChange?.(loopBodyEdge.target, true);
                  await this.executeFromNode(
                    loopBodyEdge.target,
                    context,
                    callStack,
                  );
                  if (context.lastResponse) {
                    try {
                      lastIterationOutput = JSON.parse(
                        JSON.stringify(context.lastResponse),
                      );
                    } catch {
                      lastIterationOutput = context.lastResponse;
                    }
                  }
                  this.onLoopPathChange?.(loopBodyEdge.target, false);
                  if (collect) {
                    try {
                      resultsBodies.push(
                        JSON.parse(JSON.stringify(context.lastResponse?.body)),
                      );
                    } catch (e) {
                      resultsBodies.push(context.lastResponse?.body ?? null);
                    }
                    try {
                      resultsOutputs.push(
                        JSON.parse(
                          JSON.stringify(context.lastResponse ?? null),
                        ),
                      );
                    } catch (e) {
                      // If deep clone fails for some reason, fall back to pushing the raw value
                      resultsOutputs.push(
                        context.lastResponse ?? {
                          status: undefined,
                          body: null,
                        },
                      );
                    }
                  }
                  // Keep loop body edge running for next iteration
                  try {
                    this.onEdgeFlash?.(loopBodyEdge.id);
                  } catch (e) {
                    // ignore errors from optional flash callback
                  }
                }

                // Flash the loop node to indicate iteration completion
                try {
                  this.onIterationComplete?.(nodeId, { ms: loopData.flashMs });
                } catch (e) {
                  // ignore errors from optional flash callback
                }

                if (i < items.length - 1 && delayMs > 0) {
                  await this.delay(delayMs);
                }
              }
            }
            // If collection is enabled, expose aggregated results on loop completion
            if (collect) {
              const aggregatedOutput: NodeOutput = {
                status: 200,
                body: resultsBodies,
                iterationOutputs: resultsOutputs,
              };
              context.nodeOutputs[nodeId] = aggregatedOutput;
              context.lastResponse = aggregatedOutput;
              this.onNodeOutput?.(nodeId, aggregatedOutput);
            } else if (lastIterationOutput) {
              context.nodeOutputs[nodeId] = lastIterationOutput;
              context.lastResponse = lastIterationOutput;
              this.onNodeOutput?.(nodeId, lastIterationOutput);
            }
          } else if (loopType === "while" && loopData.whileCondition) {
            let maxIterations = 1000;
            let i = 0;

            // Re-evaluate condition each iteration
            while (!this.stopped && i < maxIterations) {
              const resolvedWhile = resolveVariables(
                loopData.whileCondition,
                context,
                true,
              );
              console.debug(
                `[WorkflowEngine] Evaluating while condition for node ${nodeId} iteration ${i}:`,
                resolvedWhile,
              );
              const shouldContinue = await this.evaluateCondition(
                resolvedWhile,
                context,
              );
              console.debug(
                `[WorkflowEngine] While condition result for node ${nodeId} iteration ${i}:`,
                shouldContinue,
              );
              if (!shouldContinue) break;

              context.loopIndex = i;
              context.variables["__loopIndex"] = i;
              context.variables["__loopIteration"] = i + 1;
              context.variables["index"] = i;
              context.variables["totalLength"] = maxIterations;

              this.onNodeDataUpdate?.(nodeId, { currentIteration: i + 1 });

              if (loopBodyEdge) {
                this.onEdgeStatusChange(loopBodyEdge.id, "running");
                this.onLoopPathChange?.(loopBodyEdge.target, true);
                await this.executeFromNode(
                  loopBodyEdge.target,
                  context,
                  callStack,
                );
                if (context.lastResponse) {
                  try {
                    lastIterationOutput = JSON.parse(
                      JSON.stringify(context.lastResponse),
                    );
                  } catch {
                    lastIterationOutput = context.lastResponse;
                  }
                }
                this.onLoopPathChange?.(loopBodyEdge.target, false);
                if (collect) {
                  try {
                    resultsBodies.push(
                      JSON.parse(JSON.stringify(context.lastResponse?.body)),
                    );
                  } catch (e) {
                    resultsBodies.push(context.lastResponse?.body ?? null);
                  }
                  try {
                    resultsOutputs.push(
                      JSON.parse(JSON.stringify(context.lastResponse ?? null)),
                    );
                  } catch (e) {
                    // Fallback if deep clone fails; still collect the value
                    resultsOutputs.push(
                      context.lastResponse ?? { status: undefined, body: null },
                    );
                  }
                }
                // Keep loop body edge running for next iteration
                try {
                  this.onEdgeFlash?.(loopBodyEdge.id);
                } catch (e) {
                  // ignore errors from optional flash callback
                }
              }

              // Flash the loop node to indicate iteration completion
              try {
                this.onIterationComplete?.(nodeId, { ms: loopData.flashMs });
              } catch (e) {
                // ignore errors from optional flash callback
              }

              if (delayMs > 0) {
                await this.delay(delayMs);
              }
              i++;
            }

            if (i >= maxIterations) {
              this.onNodeStatusChange(nodeId, "error");
              const errMsg = `While loop exceeded max iterations (${maxIterations}) in node ${nodeId}`;
              console.error(`[WorkflowEngine] ${errMsg}`);
              throw new Error(errMsg);
            }

            console.debug(
              `[WorkflowEngine] Finished while loop for node ${nodeId}, iterations: ${i}`,
            );
            if (collect) {
              const aggregatedOutput: NodeOutput = {
                status: 200,
                body: resultsBodies,
                iterationOutputs: resultsOutputs,
              };
              context.nodeOutputs[nodeId] = aggregatedOutput;
              context.lastResponse = aggregatedOutput;
              this.onNodeOutput?.(nodeId, aggregatedOutput);
            } else if (lastIterationOutput) {
              context.nodeOutputs[nodeId] = lastIterationOutput;
              context.lastResponse = lastIterationOutput;
              this.onNodeOutput?.(nodeId, lastIterationOutput);
            }
          }

          delete context.loopIndex;
          delete context.loopItem;
          delete context.variables["item"];
          delete context.variables["index"];
          delete context.variables["__loopIndex"];
          delete context.variables["__loopItem"];
          delete context.variables["__loopIteration"];

          this.onNodeDataUpdate?.(nodeId, { currentIteration: undefined });

          // Mark loop body edge as completed now that loop is done
          if (loopBodyEdge) {
            this.onEdgeStatusChange(loopBodyEdge.id, "completed");
          }

          this.onNodeStatusChange(nodeId, "completed");

          if (exitEdge && !this.stopped) {
            this.onEdgeStatusChange(exitEdge.id, "running");
            await this.executeFromNode(exitEdge.target, context, callStack);
            this.onEdgeStatusChange(exitEdge.id, "completed");
          }
          return;
        }
      }

      const outgoingEdges = this.getOutgoingEdges(nodeId);

      // Run outgoing edges in parallel. Each branch gets an isolated shallow copy
      // of the execution context so branches can run concurrently without
      // interfering with each other's variables/state.
      if (outgoingEdges.length > 0) {
        const branchPromises = outgoingEdges.map((edge) =>
          (async () => {
            if (this.stopped) return;
            const targetNode = this.nodes.find((n) => n.id === edge.target);
            if (
              callStack.has(edge.target) &&
              (targetNode?.data as WorkflowNodeData)?.type === "loop"
            ) {
              console.debug(
                `[WorkflowEngine] Skipping re-entry into loop node ${edge.target} via edge ${edge.id} (from node ${nodeId})`,
              );
              this.onEdgeStatusChange(edge.id, "running");
              this.onEdgeStatusChange(edge.id, "completed");
              return;
            }

            this.onEdgeStatusChange(edge.id, "running");

            // Create an isolated branch context (shallow clone)
            const branchContext: WorkflowExecutionContext = {
              variables: { ...(context.variables || {}) },
              nodeOutputs: { ...(context.nodeOutputs || {}) },
              lastResponse: context.lastResponse
                ? JSON.parse(JSON.stringify(context.lastResponse))
                : null,
              currentNodeId: null,
              loopIndex: context.loopIndex,
              loopItem: context.loopItem,
            };

            try {
              // Use a copy of the call stack for each branch
              await this.executeFromNode(
                edge.target,
                branchContext,
                new Set(callStack),
              );
              this.onEdgeStatusChange(edge.id, "completed");
            } catch (err) {
              this.onEdgeStatusChange(edge.id, "error");
              throw err;
            }
          })(),
        );

        // Wait for all branches to settle. If any branch failed, propagate the error.
        const results = await Promise.allSettled(branchPromises);
        const rejected = results.find(
          (r) => (r as PromiseRejectedResult).status === "rejected",
        ) as PromiseRejectedResult | undefined;
        if (rejected) {
          this.onNodeStatusChange(nodeId, "error");
          throw rejected.reason;
        }
      }
    } catch (error) {
      this.onNodeStatusChange(nodeId, "error");
      throw error;
    } finally {
      this.onLoopPathChange?.(nodeId, false);
      callStack.delete(nodeId);
    }
  }

  private findStartNode(): Node<WorkflowNodeData> | undefined {
    return this.nodes.find((node) => node.data.type === "start");
  }

  private getOutgoingEdges(nodeId: string): Edge[] {
    return this.edges.filter((edge) => edge.source === nodeId);
  }

  private resolveConditionEdge(
    conditionNodeId: string,
    outgoingEdges: Edge[],
    result: boolean,
  ): Edge | undefined {
    if (outgoingEdges.length === 0) return undefined;
    if (outgoingEdges.length === 1) return outgoingEdges[0];

    const conditionNode = this.nodes.find((n) => n.id === conditionNodeId);
    const getTargetNode = (edge: Edge) =>
      this.nodes.find((n) => n.id === edge.target);

    const scoreEdge = (edge: Edge): number => {
      const target = getTargetNode(edge);
      const handle = edge.sourceHandle;
      let score = 0;

      if (result) {
        if (handle === "true") score += 500;
        if (handle === "false") score -= 500;
      } else {
        if (handle === "false") score += 500;
        if (handle === "true") score -= 500;
      }

      if (conditionNode && target) {
        const dx = target.position.x - conditionNode.position.x;
        const dy = target.position.y - conditionNode.position.y;
        const dyAbs = Math.abs(dy);

        if (dx > 0) score += 40 + Math.min(dx, 300) / 15;

        if (result) {
          // True handle is placed higher on the node, so prefer upper branch targets.
          if (dy < 0) score += 120 + Math.min(Math.abs(dy), 300) / 8;
          else score -= Math.min(dy, 300) / 6;
        } else {
          // False handle is placed lower on the node, so prefer lower branch targets.
          if (dy > 0) score += 120 + Math.min(dy, 300) / 8;
          else score -= Math.min(Math.abs(dy), 300) / 6;
        }

        // Prefer cleaner vertical separation between true/false branches when unlabeled.
        score += Math.min(dyAbs, 250) / 20;
      }

      const targetType = (target?.data as WorkflowNodeData | undefined)?.type;
      if (result && targetType !== "end") score += 20;
      if (!result && targetType === "end") score += 20;

      return score;
    };

    const sorted = [...outgoingEdges].sort((a, b) => scoreEdge(b) - scoreEdge(a));
    const chosen = sorted[0];

    console.debug(
      `[WorkflowEngine] Resolved condition edge for ${conditionNodeId} result=${result}: ${chosen?.id ?? "none"}`,
      sorted.map((e) => ({
        id: e.id,
        sourceHandle: e.sourceHandle,
        target: e.target,
      })),
    );

    return chosen;
  }

  private resolveLoopEdges(
    loopNodeId: string,
    outgoingEdges: Edge[],
  ): { loopBodyEdge?: Edge; exitEdge?: Edge } {
    const loopNode = this.nodes.find((n) => n.id === loopNodeId);
    const getTargetNode = (edge: Edge) =>
      this.nodes.find((n) => n.id === edge.target);
    const bodyScore = (edge: Edge): number => {
      const target = getTargetNode(edge);
      let score = 0;
      if (edge.sourceHandle === "loop") score += 400;
      if ((target?.data as WorkflowNodeData)?.type !== "end") score += 120;
      if (loopNode && target) {
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
      if (loopNode && target) {
        const dx = target.position.x - loopNode.position.x;
        const dyAbs = Math.abs(target.position.y - loopNode.position.y);
        if (dx > 0) score += 90 + Math.min(dx, 300) / 20;
        score += Math.max(0, 100 - dyAbs) / 4;
      }
      return score;
    };
    if (outgoingEdges.length === 0) return {};
    if (outgoingEdges.length === 1) {
      return { loopBodyEdge: outgoingEdges[0], exitEdge: undefined };
    }

    let bestBody: Edge | undefined;
    let bestExit: Edge | undefined;
    let bestPairScore = Number.NEGATIVE_INFINITY;

    for (const body of outgoingEdges) {
      for (const exit of outgoingEdges) {
        if (body.id === exit.id) continue;
        const pairScore = bodyScore(body) + exitScore(exit);
        if (pairScore > bestPairScore) {
          bestPairScore = pairScore;
          bestBody = body;
          bestExit = exit;
        }
      }
    }

    const sortedByBody = [...outgoingEdges].sort(
      (a, b) => bodyScore(b) - bodyScore(a),
    );
    const sortedByExit = [...outgoingEdges].sort(
      (a, b) => exitScore(b) - exitScore(a),
    );

    const loopBodyEdge = bestBody || sortedByBody[0];
    const exitEdge =
      bestExit || sortedByExit.find((e) => e.id !== loopBodyEdge?.id);

    console.debug(
      `[WorkflowEngine] Resolved loop edges for ${loopNodeId}: body=${loopBodyEdge?.id ?? "none"} exit=${exitEdge?.id ?? "none"}`,
    );

    return { loopBodyEdge, exitEdge };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Helper for tests: aggregates per-iteration outputs the same way the loop node does.
 * Accepts an array of NodeOutput values (one per iteration) and returns an aggregated NodeOutput
 * with `body` being an array of iteration bodies and `iterationOutputs` the array of full outputs.
 */
export function aggregateLoopResultsForTest(
  outputs: Array<NodeOutput | null | undefined>,
): NodeOutput {
  const bodies: unknown[] = [];
  const iterationOutputs: NodeOutput[] = [];

  for (const out of outputs) {
    try {
      bodies.push(JSON.parse(JSON.stringify(out?.body)));
    } catch {
      bodies.push(out?.body ?? null);
    }

    try {
      iterationOutputs.push(JSON.parse(JSON.stringify(out ?? null)));
    } catch {
      iterationOutputs.push(out ?? { status: undefined, body: null });
    }
  }

  return {
    status: 200,
    body: bodies,
    iterationOutputs,
  };
}

/**
 * Executable test helper (dev only): runs a minimal workflow containing a count loop
 * with a request-like step in the loop body that returns `{ i: index }` (test-only behavior).
 *
 * Returns an object { success, output } where `output` is the aggregated loop NodeOutput.
 *
 * You can call this function from the browser console (e.g., when importing the module in dev tooling)
 * or import it from the module in a test runner.
 */
export async function testLoopCollectionExample(): Promise<{
  success: boolean;
  output?: NodeOutput;
  error?: unknown;
}> {
  const nodes: Node<WorkflowNodeData>[] = [
    {
      id: "start",
      position: { x: 0, y: 0 },
      data: { type: "start", label: "Start", status: "idle" } as any,
    },
    {
      id: "loop1",
      position: { x: 0, y: 0 },
      data: {
        type: "loop",
        label: "Loop",
        loopType: "count",
        iterations: 3,
        delayMs: 0,
        collectResults: true,
        status: "idle",
      } as any,
    },
    {
      id: "request1",
      position: { x: 0, y: 0 },
      data: {
        type: "request",
        requestId: "request1",
        requestName: "Loop Body",
        method: "GET",
        label: "Loop Body",
        status: "idle",
      } as any,
    },
    {
      id: "end",
      position: { x: 0, y: 0 },
      data: { type: "end", label: "End", status: "idle" } as any,
    },
  ];

  const edges: Edge[] = [
    { id: "e1", source: "start", target: "loop1" } as any,
    {
      id: "e2",
      source: "loop1",
      sourceHandle: "loop",
      target: "request1",
    } as any,
    { id: "e3", source: "loop1", sourceHandle: "exit", target: "end" } as any,
  ];

  let loopOutput: NodeOutput | undefined = undefined;

  const engine = new WorkflowEngine(
    nodes,
    edges,
    () => {}, // onNodeStatusChange
    () => {}, // onEdgeStatusChange
    async (_requestId, ctx) => ({ status: 200, body: { i: ctx.loopIndex } }), // executeRequest
    async () => false, // evaluateCondition (unused)
    (nodeId, output) => {
      if (nodeId === "loop1") loopOutput = output;
    },
  );

  try {
    await engine.run();
    let success = false;
    if (loopOutput) {
      const outAny = loopOutput as any;
      const bodiesOk =
        Array.isArray(outAny.body) && (outAny.body as unknown[]).length === 3;
      const outputsOk =
        Array.isArray(outAny.iterationOutputs) &&
        (outAny.iterationOutputs as NodeOutput[]).length === 3;
      success = bodiesOk && outputsOk;
    }

    console.debug(
      "[testLoopCollectionExample] success:",
      success,
      "output:",
      loopOutput,
    );
    return { success, output: loopOutput };
  } catch (err) {
    console.error("[testLoopCollectionExample] failed:", err);
    return { success: false, error: err };
  }
}

export function testIndexPlusOneResolution(indexValue: number = 0) {
  const ctx: WorkflowExecutionContext = {
    variables: {},
    nodeOutputs: {},
    lastResponse: null,
    currentNodeId: null,
    loopIndex: indexValue,
  };

  const textResolved = resolveVariables("{{index+1}}", ctx, false);
  const codeResolved = resolveVariables("{{index+1}}", ctx, true);

  // Attempt to evaluate the code-mode expression for simple arithmetic by substituting `index`.
  // This is a small, safe helper for quick verification only.
  let codeEval: number | undefined;
  try {
    const expr = codeResolved.replace(/\bindex\b/g, String(indexValue));
    if (/^[0-9+\-*/%().\s]+$/.test(expr)) {
      // eslint-disable-next-line no-new-func
      codeEval = Function('"use strict"; return (' + expr + ")")();
    }
  } catch {
    codeEval = undefined;
  }

  return { indexValue, textResolved, codeResolved, codeEval };
}

export { resolveVariables, getNestedValue };
