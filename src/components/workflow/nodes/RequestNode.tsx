import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { VscCheck, VscClose, VscLoading } from "react-icons/vsc";
import { getMethodColor, getShortMethod } from "../../../utils/methodConstants";
import type { RequestNodeData } from "../../../types/workflow";
import { getNodeStyles, handleClass } from "./shared";

export const RequestNode = memo(function RequestNode({ data }: NodeProps) {
  const { method = "GET", requestName, label, status = "idle" } = data as RequestNodeData;
  const name = requestName ?? label ?? "Request";

  return (
    <div className={`min-w-[160px] px-3 py-2 rounded-lg border-2 transition-colors backdrop-blur-md ${getNodeStyles(status)}`}>
      <Handle type="target" position={Position.Left} className={handleClass} />
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
          style={{ color: getMethodColor(method), backgroundColor: `${getMethodColor(method)}20` }}
        >
          {getShortMethod(method)}
        </span>
        <span className="text-sm text-white/80 truncate max-w-[120px]">{name}</span>
        {status === "running" && <VscLoading className="text-accent animate-spin ml-auto" size={14} />}
        {status === "completed" && <VscCheck className="text-green ml-auto" size={14} />}
        {status === "error" && <VscClose className="text-red ml-auto" size={14} />}
      </div>
      <Handle type="source" position={Position.Right} className={handleClass} />
    </div>
  );
});
