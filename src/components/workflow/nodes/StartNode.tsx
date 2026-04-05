import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { BsFillPlayFill } from "react-icons/bs";
import { handleClass } from "./shared";

export const StartNode = memo(function StartNode(_props: NodeProps) {
	return (
		<div
			className={`flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 transition-colors`}
		>
			<BsFillPlayFill size={16} className={"text-background"} />
			<span className="font-semibold text-background text-xs">Start</span>
			<Handle type="source" position={Position.Right} className={handleClass} />
		</div>
	);
});
