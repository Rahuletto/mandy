type TSContext = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  item?: unknown;
  index?: number;
  totalLength?: number;
};

let sucraseTransform: ((code: string, opts?: any) => { code: string }) | null =
  null;
let loading: Promise<void> | null = null;

async function ensureSucrase() {
  if (sucraseTransform) return sucraseTransform;
  if (!loading) {
    loading = (async () => {
      const mod = await import("https://esm.sh/sucrase");
      sucraseTransform = (mod &&
        (mod.transform || (mod.default && mod.default.transform))) as any;
      if (!sucraseTransform)
        throw new Error("Failed to load Sucrase transform");
    })();
  }
  await loading;
  return sucraseTransform!;
}

try {
  // Minimize worker capabilities (basic sandbox restrictions)
  (globalThis as any).fetch = undefined;
  (globalThis as any).XMLHttpRequest = undefined;
  (globalThis as any).WebSocket = undefined;
  (globalThis as any).Worker = undefined;
} catch (e) {
  // ignore if environment forbids override
}

self.addEventListener("message", async (ev: MessageEvent) => {
  const msg = ev.data;
  if (!msg || typeof msg !== "object") return;

  try {
    if (msg.type === "init") {
      await ensureSucrase();
      self.postMessage({ type: "inited" });
      return;
    }

    if (msg.type === "run") {
      const id = msg.id;
      const mode: "script" | "condition" =
        msg.mode === "condition" ? "condition" : "script";
      const code: string = msg.code || "";
      const context: TSContext = msg.context || {};

      const transform = await ensureSucrase();

      const transpiled = transform(code, { transforms: ["typescript"] }).code;

      if (mode === "script") {
        const wrapped = `
function __run_script__() {
${transpiled}
}
__result__ = __run_script__();
`;
        try {
          // Include totalLength in callable args so scripts can optionally access it
          const fn = new Function(
            "status",
            "body",
            "headers",
            "cookies",
            "item",
            "index",
            "totalLength",
            wrapped + "\n return __result__;",
          );
          const result = fn(
            context.status ?? 0,
            structuredClone(context.body ?? {}),
            structuredClone(context.headers ?? {}),
            structuredClone(context.cookies ?? {}),
            structuredClone(context.item ?? null),
            context.index ?? 0,
            context.totalLength ?? 0,
          );
          self.postMessage({ type: "result", id, ok: true, result });
        } catch (err: any) {
          self.postMessage({
            type: "result",
            id,
            ok: false,
            error: err?.message || String(err),
          });
        }
        return;
      }

      if (mode === "condition") {
        // If the user's code doesn't include an explicit `return`, assume it's a
        // simple expression and auto-wrap it so common cases like `{{status}} == 200`
        // or `{{body}}.forEach(...)` work without requiring `return`.
        const hasReturn = /\breturn\b/.test(transpiled);
        const wrapped = hasReturn
          ? `
function __run_condition__() {
${transpiled}
}
__result__ = Boolean(__run_condition__());
`
          : `
function __run_condition__() {
  return (${transpiled});
}
__result__ = Boolean(__run_condition__());
`;
        try {
          // Include totalLength as an available parameter for condition checks as well.
          const fn = new Function(
            "status",
            "body",
            "headers",
            "cookies",
            "item",
            "index",
            "totalLength",
            wrapped + "\n return __result__;",
          );
          const result = fn(
            context.status ?? 0,
            structuredClone(context.body ?? {}),
            structuredClone(context.headers ?? {}),
            structuredClone(context.cookies ?? {}),
            structuredClone(context.item ?? null),
            context.index ?? 0,
            context.totalLength ?? 0,
          );
          self.postMessage({ type: "result", id, ok: true, result: !!result });
        } catch (err: any) {
          self.postMessage({
            type: "result",
            id,
            ok: false,
            error: err?.message || String(err),
          });
        }
        return;
      }
    }
  } catch (err: any) {
    const id = (ev.data && ev.data.id) || null;
    self.postMessage({
      type: "result",
      id,
      ok: false,
      error: err?.message || String(err),
    });
  }
});
