import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo, useEffect, useState } from "react";
import { VscCheck, VscClose, VscLoading, VscRefresh } from "react-icons/vsc";

export const LoopNode = memo(function LoopNode({ data }: NodeProps) {
	const {
		label = "Loop",
		iterations = 1,
		currentIteration,
		status = "idle",
	} = data as any;

	const [style, setStyle] = useState("bg-card border-white/20");

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

	useEffect(() => {
		if (currentIteration !== undefined) {
			setStyle("bg-yellow/10 border-yellow");
			setTimeout(() => {
				setStyle(`${getBorderColor()} ${getBgColor()}`);
			}, 500);
		} else {
			setStyle(`${getBorderColor()} ${getBgColor()}`);
		}
	}, [currentIteration, getBorderColor, getBgColor]);

	return (
		<div
			className={`px-3 py-2 rounded-lg border-2 transition-colors backdrop-blur-md ${style}`}
		>
			<Handle
				type="target"
				position={Position.Left}
				className="!w-2 !h-2 !bg-white/40 !border-none"
			/>
			<div className="flex items-center gap-2">
				<VscRefresh className="text-cyan-400 shrink-0" size={12} />
				<span className="text-sm text-white/80 truncate w-30">{label}</span>
				<span className="text-[9px] text-white/40 shrink-0">
					{currentIteration !== undefined ? `${currentIteration}/` : ""}
					{iterations}x
				</span>
				{status === "running" && (
					<VscLoading className="text-accent animate-spin shrink-0" size={10} />
				)}
				{status === "completed" && (
					<VscCheck className="text-green shrink-0" size={10} />
				)}
				{status === "error" && (
					<VscClose className="text-red shrink-0" size={10} />
				)}
			</div>
			<Handle
				type="source"
				position={Position.Right}
				id="exit"
				className="!w-2 !h-2 !bg-white/40 !border-none"
			/>
			<Handle
				type="source"
				position={Position.Bottom}
				id="loop"
				className="!w-2 !h-2 !bg-cyan-400 !border-none"
				title="loop back"
			/>
		</div>
	);
});
