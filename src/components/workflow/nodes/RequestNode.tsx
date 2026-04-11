import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo, useContext, useMemo } from "react";
import { VscCheck, VscClose, VscLoading } from "react-icons/vsc";
import type { RequestNodeData } from "../../../types/workflow";
import { formatBytes, formatDuration } from "../../../utils/format";
import { getMethodColor, getShortMethod } from "../../../utils/methodConstants";
import { getNodeOutputDurationMs } from "../../../utils/workflowMetrics";
import { WorkflowNodeOutputsContext } from "../WorkflowNodeOutputsContext";
import { getNodeStyles, handleClass } from "./shared";

export const RequestNode = memo(function RequestNode({ id, data }: NodeProps) {
	const nodeOutputs = useContext(WorkflowNodeOutputsContext);
	const output = nodeOutputs[id];
	const {
		method = "GET",
		requestName,
		label,
		status = "idle",
	} = data as RequestNodeData;
	const name = requestName ?? label ?? "Request";

	const metricsLine = useMemo(() => {
		if (!output) return null;
		const ms = getNodeOutputDurationMs(output);
		const totalBytes = output.responseSize?.total_bytes;
		const hasDuration = ms > 0;
		const hasSize =
			typeof totalBytes === "number" &&
			Number.isFinite(totalBytes) &&
			totalBytes >= 0;
		if (!hasDuration && !hasSize) return null;
		if (status !== "completed" && status !== "error") return null;

		const parts: string[] = [];
		if (hasDuration) parts.push(formatDuration(Math.round(ms)));
		if (hasSize) parts.push(formatBytes(totalBytes!));
		return parts.join(" · ");
	}, [output, status]);

	return (
		<div
			className={`min-w-[160px] rounded-lg border-2 px-3 py-2 backdrop-blur-md transition-colors ${getNodeStyles(status)}`}
		>
			<Handle type="target" position={Position.Left} className={handleClass} />
			<div className="flex items-center gap-2">
				<span
					className="rounded px-1.5 py-0.5 font-bold font-mono text-[10px]"
					style={{
						color: getMethodColor(method),
						backgroundColor: `${getMethodColor(method)}20`,
					}}
				>
					{getShortMethod(method)}
				</span>
				<span className="max-w-[120px] truncate text-sm text-white/80">
					{name}
				</span>
				{status === "running" && (
					<VscLoading className="ml-auto animate-spin text-accent" size={14} />
				)}
				{status === "completed" && (
					<VscCheck className="ml-auto shrink-0 text-green" size={14} />
				)}
				{status === "error" && (
					<VscClose className="ml-auto shrink-0 text-red" size={14} />
				)}
			</div>
			{metricsLine ? (
				<div
					className="mt-1 max-w-[200px] truncate font-mono text-[10px] text-white/45 tabular-nums"
					title={metricsLine}
				>
					{metricsLine}
				</div>
			) : null}
			<Handle type="source" position={Position.Right} className={handleClass} />
		</div>
	);
});
