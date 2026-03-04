import { useState, useRef, useEffect, memo, useCallback } from "react";
import { VscChevronRight, VscChevronDown } from "react-icons/vsc";
import { FaFolder, FaFolderOpen } from "react-icons/fa6";
import type { Folder, RequestFile, TreeItem } from "../../types/project";
import { getShortMethod, getMethodColor } from "../../utils/methodConstants";

interface RequestPopoverProps {
  root: Folder;
  position: { x: number; y: number };
  onClose: () => void;
  onAddRequest?: (requestId: string, requestName: string, method: string) => void;
}

function flattenForRequests(folder: Folder, depth: number, expanded: Set<string>): { item: TreeItem; depth: number }[] {
  const result: { item: TreeItem; depth: number }[] = [];
  for (const child of folder.children) {
    if (child.type === "workflow") continue;
    result.push({ item: child, depth });
    if (child.type === "folder" && expanded.has(child.id)) {
      result.push(...flattenForRequests(child, depth + 1, expanded));
    }
  }
  return result;
}

function countRequests(folder: Folder): number {
  return folder.children.reduce((count, child) => {
    if (child.type === "request") return count + 1;
    if (child.type === "folder") return count + countRequests(child);
    return count;
  }, 0);
}

const RequestItem = memo(function RequestItem({ item, depth, onClick }: { item: RequestFile; depth: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs hover:bg-white/10 rounded transition-colors text-left"
      style={{ paddingLeft: depth * 16 + 12 }}
    >
      <span className="font-mono text-[10px] font-bold shrink-0 w-8 text-right" style={{ color: getMethodColor(item.request.method) }}>
        {getShortMethod(item.request.method)}
      </span>
      <span className="truncate text-white/80">{item.name}</span>
    </button>
  );
});

const FolderItem = memo(function FolderItem({ item, depth, isExpanded, onToggle }: { item: Folder; depth: number; isExpanded: boolean; onToggle: () => void }) {
  const count = countRequests(item);
  if (count === 0) return null;

  return (
    <button
      type="button"
      className="w-full flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-xs hover:bg-white/10 rounded transition-colors text-left"
      style={{ paddingLeft: depth * 16 + 12 }}
      onClick={onToggle}
    >
      <span className="text-white/40">{isExpanded ? <VscChevronDown size={12} /> : <VscChevronRight size={12} />}</span>
      <span className="text-white/50">{isExpanded ? <FaFolderOpen size={12} /> : <FaFolder size={12} />}</span>
      <span className="truncate text-white/60">{item.name}</span>
      <span className="text-white/30 text-[10px] ml-auto">{count}</span>
    </button>
  );
});

export function RequestPopover({ root, position, onClose, onAddRequest }: RequestPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root.id]));

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleBlur = () => {
      setTimeout(() => {
        if (!ref.current?.contains(document.activeElement)) onClose();
      }, 100);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("blur", handleBlur);
    };
  }, [onClose]);

  const toggle = useCallback((id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  }), []);

  const items = flattenForRequests(root, 0, expanded);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: position.x,
        bottom: window.innerHeight - position.y + 8,
        maxHeight: 300,
        zIndex: 1000,
      }}
      className="w-64 bg-card border border-white/10 rounded-lg overflow-hidden"
    >
      <div className="overflow-y-auto max-h-[260px] py-1">
        {items.length === 0 ? (
          <div className="px-3 py-4 text-xs text-white/30 text-center">No requests found</div>
        ) : (
          items.map(({ item, depth }) =>
            item.type === "folder" ? (
              <FolderItem key={item.id} item={item} depth={depth} isExpanded={expanded.has(item.id)} onToggle={() => toggle(item.id)} />
            ) : item.type === "request" ? (
              <RequestItem
                key={item.id}
                item={item}
                depth={depth}
                onClick={() => {
                  onAddRequest?.(item.id, item.name, item.request.method);
                  onClose();
                }}
              />
            ) : null
          )
        )}
      </div>
    </div>
  );
}
