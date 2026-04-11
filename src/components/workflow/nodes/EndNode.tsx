import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { BsStopFill } from "react-icons/bs";
import { handleClass } from "./shared";

export const EndNode = memo(function EndNode(_props: NodeProps) {
	return (
		<div
			className={`flex items-center gap-1.5 rounded-full bg-green px-4 py-2 pl-3 transition-colors`}
		>
			<BsStopFill size={16} className={"text-background"} />
			<span className="font-semibold text-background text-xs">End</span>
			<Handle type="target" position={Position.Left} className={handleClass} />
		</div>
	);
});
