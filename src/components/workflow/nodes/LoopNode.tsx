import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo, useEffect, useMemo, useState } from "react";
import { VscCheck, VscClose, VscLoading, VscRefresh } from "react-icons/vsc";

export const LoopNode = memo(function LoopNode({ data }: NodeProps) {
	const {
		label = "Loop",
		iterations = 1,
		currentIteration,
		status = "idle",
	} = data as any;

	const [style, setStyle] = useState("bg-card border-white/20");

	const borderAndBg = useMemo(() => {
		const border =
			status === "running"
				? "border-accent"
				: status === "completed"
					? "border-green"
					: status === "error"
						? "border-red"
						: "border-white/20";
		const bg =
			status === "running"
				? "bg-accent/10"
				: status === "completed"
					? "bg-green/10"
					: status === "error"
						? "bg-red/10"
						: "bg-card";
		return `${border} ${bg}`;
	}, [status]);

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		if (currentIteration !== undefined) {
			setStyle("bg-yellow/10 border-yellow");
			timer = setTimeout(() => {
				setStyle(borderAndBg);
			}, 500);
		} else {
			setStyle(borderAndBg);
		}
		return () => {
			if (timer !== undefined) clearTimeout(timer);
		};
	}, [currentIteration, borderAndBg]);

	return (
		<div
			className={`rounded-lg border-2 px-3 py-2 backdrop-blur-md transition-colors ${style}`}
		>
			<Handle
				type="target"
				position={Position.Left}
				className="!w-2 !h-2 !bg-white/40 !border-none"
			/>
			<div className="flex items-center gap-2">
				<VscRefresh className="shrink-0 text-cyan-400" size={12} />
				<span className="w-30 truncate text-sm text-white/80">{label}</span>
				<span className="shrink-0 text-[9px] text-white/40">
					{currentIteration !== undefined ? `${currentIteration}/` : ""}
					{iterations}x
				</span>
				{status === "running" && (
					<VscLoading className="shrink-0 animate-spin text-accent" size={10} />
				)}
				{status === "completed" && (
					<VscCheck className="shrink-0 text-green" size={10} />
				)}
				{status === "error" && (
					<VscClose className="shrink-0 text-red" size={10} />
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
