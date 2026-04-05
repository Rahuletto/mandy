import type { SizeInfo } from "../../bindings";
import { formatBytes } from "../../utils/format";
import { HoverPopover } from "../ui";

interface SizePopoverProps {
  requestSize: SizeInfo;
  responseSize: SizeInfo;
  anchorRef: React.RefObject<HTMLElement | null>;
  open?: boolean;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
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
        <div className="mb-2 flex items-center gap-2">
          <svg
            className="h-4 w-4 text-blue-400"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 4l-8 8h6v8h4v-8h6z" transform="rotate(180 12 12)" />
          </svg>
          <span className="font-medium text-[11px] text-white">Response</span>
          <span className="ml-auto font-bold text-[11px] text-white">
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

      <div className="my-2 h-px bg-white/10" />

      <div>
        <div className="mb-2 flex items-center gap-2">
          <svg
            className="h-4 w-4 text-amber-400"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 4l-8 8h6v8h4v-8h6z" />
          </svg>
          <span className="font-medium text-[11px] text-white">Request</span>
          <span className="ml-auto font-bold text-[11px] text-white">
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
