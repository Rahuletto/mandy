import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { VscCheck, VscClose, VscLoading } from "react-icons/vsc";
import type { ConditionNodeData } from "../../../types/workflow";

export const ConditionNode = memo(function ConditionNode({ data }: NodeProps) {
	const { label = "Condition", status = "idle" } = data as ConditionNodeData;

	const getBorderColor = () => {
		if (status === "running") return "border-accent";
		if (status === "completed") return "border-green";
		if (status === "error") return "border-red";
		return "border-white/20";
	};

	const getBgColor = () => {
		if (status === "running") return "bg-accent/10";
		if (status === "completed") return "bg-green/10";
		if (status === "error") return "bg-red/10";
		return "bg-card";
	};

	return (
		<div
			className={`w-16 h-16 rounded-full backdrop-blur-md border-2 flex flex-col items-center justify-center transition-colors ${getBorderColor()} ${getBgColor()}`}
		>
			<Handle
				type="target"
				position={Position.Left}
				className="!w-2 !h-2 !bg-white/40 !border-none"
			/>
			<div className="flex items-center gap-1">
				{status === "running" && (
					<VscLoading className="text-accent animate-spin" size={10} />
				)}
				{status === "completed" && (
					<VscCheck className="text-green" size={10} />
				)}
				{status === "error" && <VscClose className="text-red" size={10} />}
			</div>
			<span className="text-sm text-white/80 max-w-16 truncate text-center leading-tight px-1">
				{label}
			</span>
			<Handle
				type="source"
				position={Position.Right}
				id="true"
				className="!w-2 !h-2 !bg-green !border-none !top-[30%]"
				title="true"
			/>
			<Handle
				type="source"
				position={Position.Right}
				id="false"
				className="!w-2 !h-2 !bg-red !border-none !top-[70%]"
				title="false"
			/>
		</div>
	);
});
