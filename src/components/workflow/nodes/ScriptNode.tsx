import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { VscCode, VscCheck, VscClose, VscLoading } from "react-icons/vsc";
import type { ScriptNodeData } from "../../../types/workflow";

export const ScriptNode = memo(function ScriptNode({ data }: NodeProps) {
  const { label = "Script", status = "idle" } = data as ScriptNodeData;

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
      className={`px-3 py-2 rounded-lg border-2 transition-colors backdrop-blur-md ${getBorderColor()} ${getBgColor()}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-white/40 !border-none"
      />
      <div className="flex items-center gap-2">
        <VscCode className="text-purple-400 shrink-0" size={12} />
        <span className="text-sm text-white/80 truncate max-w-20">{label}</span>
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
        className="!w-2 !h-2 !bg-white/40 !border-none"
      />
    </div>
  );
});
