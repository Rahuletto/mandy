import type { NodeOutput } from "../types/workflow";

/** UTF-8 byte length of a string (for payload size display). */
export function utf8ByteLength(text: string): number {
	return new TextEncoder().encode(text).length;
}

/** Resolved duration in ms from a workflow node output (REST / GraphQL-style). */
export function getNodeOutputDurationMs(output?: NodeOutput): number {
	const direct = output?.duration;
	if (typeof direct === "number" && Number.isFinite(direct)) return direct;
	const timed = output?.timing?.total_ms;
	if (typeof timed === "number" && Number.isFinite(timed)) return timed;
	return 0;
}
