import {
  runCodeInSandbox,
  runConditionInSandbox,
  type SandboxContext,
} from "./hardenedsandbox";

export type TSContext = SandboxContext;

/**
 * Execute TypeScript code in a hardened sandbox using SES (Hardened JavaScript).
 * SES provides cryptographic isolation preventing:
 * - Access to globals (fetch, eval, etc)
 * - Prototype pollution
 * - Covert communication channels
 * - Most escape vectors
 */
export async function runTSSandboxed(
  code: string,
  context: TSContext,
  timeoutMs = 30000,
  mode: "script" | "condition" = "script",
): Promise<unknown> {
  return runCodeInSandbox(code, context, timeoutMs, mode);
}

/**
 * Run a condition snippet (expects a boolean-like result).
 * Uses the hardened sandbox and returns a boolean.
 */
export async function runTSConditionSandboxed(
  code: string,
  context: TSContext,
  timeoutMs = 20000,
): Promise<boolean> {
  return runConditionInSandbox(code, context, timeoutMs);
}

/**
 * No-op for backwards compatibility. SES doesn't use workers.
 */
export async function preloadTsWorker(): Promise<void> {
  // SES is synchronous and doesn't require preloading
}

/**
 * No-op for backwards compatibility. SES creates new compartments per execution.
 */
export function terminateAllTSRuns(): void {
  // SES compartments are automatically garbage collected
}
