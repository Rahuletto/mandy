import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { TiPower } from "react-icons/ti";
import { teardownRealtimeForConnection } from "../realtime/globalRealtimeBridge";
import { RequestTypeIcon } from "../registry/requestTypeIcon";
import { cancelRestRequest } from "../reqhelpers/rest";
import type { Folder, RequestType } from "../types/project";
import { findTreeItemById } from "../utils/findTreeItem";
import { HoverPopover } from "./ui";

type ActivityRow =
  | {
      kind: "workflow";
      rowKey: string;
      navigateId: string | null;
      title: string;
      iconType: "workflow";
    }
  | { kind: "http"; id: string; title: string; iconType: RequestType };

interface HeaderActivityMenuProps {
  children: ReactNode;
  enabled: boolean;
  loadingIds: ReadonlySet<string>;
  projectRoot: Folder | null;
  isWorkflowRunning: boolean;
  workflowName: string | null;
  runningWorkflowId: string | null;
  onStopLoading: (id: string) => void;
  onForceKillWorkflow: () => void;
  onOpenActivityItem: (itemId: string) => void;
}

export function HeaderActivityMenu({
  children,
  enabled,
  loadingIds,
  projectRoot,
  isWorkflowRunning,
  workflowName,
  runningWorkflowId,
  onStopLoading,
  onForceKillWorkflow,
  onOpenActivityItem,
}: HeaderActivityMenuProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(true), 80);
  }, [clearTimer]);

  const scheduleClose = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(false), 450);
  }, [clearTimer]);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const rows: ActivityRow[] = [];
  if (isWorkflowRunning) {
    rows.push({
      kind: "workflow",
      rowKey: `wf-${runningWorkflowId ?? "running"}`,
      navigateId: runningWorkflowId,
      title: workflowName?.trim() ? workflowName : "Workflow",
      iconType: "workflow",
    });
  }
  for (const id of loadingIds) {
    const item = projectRoot ? findTreeItemById(projectRoot, id) : null;
    const title = item?.name ?? id;
    const iconType: RequestType =
      item && item.type !== "folder" ? item.type : "request";
    rows.push({ kind: "http", id, title, iconType });
  }

  const handleStop = async (row: ActivityRow) => {
    if (row.kind === "workflow") {
      onForceKillWorkflow();
      return;
    }
    try {
      await cancelRestRequest(row.id);
    } catch {
      /* still tear down transports */
    }
    await teardownRealtimeForConnection(row.id);
    onStopLoading(row.id);
  };

  if (!enabled) {
    return <div className="no-drag relative inline-flex">{children}</div>;
  }

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover popover anchor */}
      <div
        ref={anchorRef}
        className="no-drag relative inline-flex flex-col gap-2 items-center"
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        {children}
        <HoverPopover
          anchorRef={anchorRef}
          open={open}
          onClose={() => setOpen(false)}
          onMouseEnter={clearTimer}
          onMouseLeave={scheduleClose}
          position="bottom"
          className="no-drag z-[200] min-w-62.5 !p-2 max-w-[min(360px,calc(100vw-24px))]"
        >
          <div className="max-h-56 flex-col flex gap-1 overflow-auto">
            {rows.map((row) => (
              <div
                key={row.kind === "workflow" ? row.rowKey : `http-${row.id}`}
                className="flex items-center gap-2.5 px-1.5"
              >
                <span className="shrink-0 text-white/55">
                  <RequestTypeIcon type={row.iconType} size={16} />
                </span>
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer truncate text-left text-xs text-white/90 hover:text-white"
                  onClick={() => {
                    const id =
                      row.kind === "workflow" ? row.navigateId : row.id;
                    if (id) onOpenActivityItem(id);
                  }}
                  disabled={row.kind === "workflow" && !row.navigateId}
                >
                  {row.title}
                </button>
                <button
                  type="button"
                  onClick={() => void handleStop(row)}
                  className="shrink-0 cursor-pointer rounded-full p-1.5 text-white/40 transition-colors hover:bg-red/15 hover:text-red"
                  title="Stop / disconnect"
                  aria-label={`Stop ${row.title}`}
                >
                  <TiPower size={16} />
                </button>
              </div>
            ))}
          </div>
        </HoverPopover>
      </div>
    </>
  );
}
