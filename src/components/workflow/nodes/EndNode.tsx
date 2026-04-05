import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { BsStopFill } from "react-icons/bs";
import { handleClass } from "./shared";

export const EndNode = memo(function EndNode(_props: NodeProps) {
	return (
		<div
			className={`px-4 pl-3 py-2 rounded-full flex items-center gap-1.5 transition-colors bg-green`}
		>
			<BsStopFill size={16} className={"text-background"} />
			<span className="text-xs text-background font-semibold">End</span>
			<Handle type="target" position={Position.Left} className={handleClass} />
		</div>
	);
});
