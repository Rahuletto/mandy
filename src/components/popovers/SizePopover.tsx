import type { SizeInfo } from "../../bindings";
import { HoverPopover } from "../ui";

interface SizePopoverProps {
  requestSize: SizeInfo;
  responseSize: SizeInfo;
  anchorRef: React.RefObject<HTMLElement>;
  open?: boolean;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function SizePopover({
  requestSize,
  responseSize,
  anchorRef,
  open,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: SizePopoverProps) {
  return (
    <HoverPopover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      className="min-w-[240px]"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <svg
            className="w-4 h-4 text-blue-400"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 4l-8 8h6v8h4v-8h6z" transform="rotate(180 12 12)" />
          </svg>
          <span className="text-[11px] font-medium text-white">Response</span>
          <span className="ml-auto text-[11px] font-bold text-white">
            {formatBytes(responseSize.total_bytes)}
          </span>
        </div>
        <div className="space-y-1 pl-6">
          <div className="flex justify-between text-[10px]">
            <span className="text-white/40">Headers</span>
            <span className="font-mono text-white/60">
              {formatBytes(responseSize.headers_bytes)}
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-white/40">Body</span>
            <span className="font-mono text-white/60">
              {formatBytes(responseSize.body_bytes)}
            </span>
          </div>
        </div>
      </div>

      <div className="h-px bg-white/10 my-2" />

      <div>
        <div className="flex items-center gap-2 mb-2">
          <svg
            className="w-4 h-4 text-amber-400"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 4l-8 8h6v8h4v-8h6z" />
          </svg>
          <span className="text-[11px] font-medium text-white">Request</span>
          <span className="ml-auto text-[11px] font-bold text-white">
            {formatBytes(requestSize.total_bytes)}
          </span>
        </div>
        <div className="space-y-1 pl-6">
          <div className="flex justify-between text-[10px]">
            <span className="text-white/40">Headers</span>
            <span className="font-mono text-white/60">
              {formatBytes(requestSize.headers_bytes)}
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-white/40">Body</span>
            <span className="font-mono text-white/60">
              {formatBytes(requestSize.body_bytes)}
            </span>
          </div>
        </div>
      </div>
    </HoverPopover>
  );
}
