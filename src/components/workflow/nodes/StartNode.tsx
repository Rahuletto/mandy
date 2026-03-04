import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BsFillPlayFill } from "react-icons/bs";
import { handleClass } from "./shared";

export const StartNode = memo(function StartNode({ data }: NodeProps) {

  return (
    <div className={`px-4 py-2 rounded-full flex items-center gap-1.5 transition-colors bg-accent`}>
      <BsFillPlayFill size={16} className={"text-background"} />
      <span className="text-xs font-semibold text-background">Start</span>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </div>
  );
});
