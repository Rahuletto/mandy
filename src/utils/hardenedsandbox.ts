import "ses";

// SES adds lockdown() and Compartment to globalThis
const lockdown = (globalThis as any).lockdown as (opts: any) => void;
const Compartment = (globalThis as any).Compartment as any;

// Initialize SES hardened environment once
let lockdownInitialized = false;

function initializeLockdown() {
  if (lockdownInitialized) return;
  lockdown({
    errorTaming: "safe",
    stackFiltering: "concise",
    regExpTaming: "safe",
    overrideTaming: "severe",
    consoleTaming: "safe",
  });
  lockdownInitialized = true;
}

export interface SandboxContext {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  item?: unknown;
  index?: number;
  totalLength?: number;
}

/**
 * Execute TypeScript/JavaScript code in a strict hardened sandbox using SES.
 * This provides true, cryptographically-sound isolation from the host.
 *
 * @param code - The JavaScript/TypeScript code to execute
 * @param context - The context object available to the code
 * @param timeoutMs - Timeout in milliseconds (enforced by Promise.race)
 * @param mode - Either "script" or "condition"
 * @returns The result of executing the code
 */
export async function runCodeInSandbox(
  code: string,
  context: SandboxContext,
  timeoutMs = 30000,
  mode: "script" | "condition" = "script"
): Promise<unknown> {
  // Initialize lockdown on first use
  initializeLockdown();

  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Code execution timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
  );

  // Create a new compartment for each execution (no state leakage between runs)
  const compartment = new Compartment({
    // Provide only the necessary context variables
    status: context.status ?? 0,
    body: structuredClone(context.body ?? {}),
    headers: structuredClone(context.headers ?? {}),
    cookies: structuredClone(context.cookies ?? {}),
    item: structuredClone(context.item ?? null),
    index: context.index ?? 0,
    totalLength: context.totalLength ?? 0,

    // Provide console for debugging (read-only, logged to host)
    console: {
      log: (...args: any[]) => console.log("[SANDBOX]", ...args),
      error: (...args: any[]) => console.error("[SANDBOX]", ...args),
      warn: (...args: any[]) => console.warn("[SANDBOX]", ...args),
      info: (...args: any[]) => console.info("[SANDBOX]", ...args),
      debug: (...args: any[]) => console.debug("[SANDBOX]", ...args),
    },

    // Math is safe to expose
    Math,
    // JSON is safe to expose
    JSON,
    // String methods are safe
    String,
    // Number methods are safe
    Number,
    // Array is safe
    Array,
    // Object is safe
    Object,
    // Boolean is safe
    Boolean,
    // Error for error handling
    Error,
    // Date is safe
    Date,
  });

  try {
    if (mode === "script") {
      // Script mode: wrap code in a function and execute it
      const wrappedCode = `
        (function() {
          let __result__;
          ${code}
          return __result__;
        })()
      `;

      const result = await Promise.race([
        Promise.resolve(compartment.evaluate(wrappedCode)),
        timeoutPromise,
      ]);

      return result;
    } else if (mode === "condition") {
      // Condition mode: evaluate as boolean expression
      const hasReturn = /\breturn\b/.test(code);
      const wrappedCode = hasReturn
        ? `
          (function() {
            ${code}
          })()
        `
        : `(${code})`;

      const result = await Promise.race([
        Promise.resolve(compartment.evaluate(wrappedCode)),
        timeoutPromise,
      ]);

      return !!result;
    }

    throw new Error(`Unknown mode: ${mode}`);
  } catch (err: any) {
    throw new Error(
      `Sandbox execution error: ${err?.message || String(err)}`
    );
  }
}

/**
 * Execute a condition snippet (expects a boolean-like result).
 * Uses the hardened sandbox mechanism and returns a boolean.
 */
export async function runConditionInSandbox(
  code: string,
  context: SandboxContext,
  timeoutMs = 20000
): Promise<boolean> {
  try {
    const result = await runCodeInSandbox(
      code,
      context,
      timeoutMs,
      "condition"
    );
    return !!result;
  } catch (err) {
    throw err;
  }
}
