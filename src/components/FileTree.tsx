import { useState, useEffect, useRef, useMemo, memo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { VscChevronRight, VscChevronDown, VscAdd } from "react-icons/vsc";
import { FaFolder, FaFolderOpen } from "react-icons/fa6";
import type { Folder, RequestFile, TreeItem, SortMode } from "../types/project";
import { ContextMenu, MenuItem } from "./ui";
import { getSimpleShortcut, getShortcutDisplay } from "../utils/platform";
import { haptic } from "../utils/haptics";

interface FileTreeProps {
  root: Folder;
  selectedItemId: string | null;
  onSelect: (id: string, isFolder: boolean) => void;
  onToggleFolder: (id: string) => void;
  onAddRequest: (folderId: string) => void;
  onAddFolder: (folderId: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onSort: (folderId: string, mode: SortMode) => void;
  onMoveItem: (
    itemId: string,
    targetFolderId: string,
    targetIndex: number,
  ) => void;
  onCut: (id: string) => void;
  onCopy: (id: string) => void;
  onPaste: (parentId: string) => void;
  clipboard: { id: string; type: "cut" | "copy" } | null;
  searchQuery: string;
  unsavedIds: Set<string>;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "#22c55e",
  POST: "#eab308",
  PUT: "#3b82f6",
  PATCH: "#a855f7",
  DELETE: "#ef4444",
  HEAD: "#6b7280",
  OPTIONS: "#06b6d4",
};

const LAZY_BATCH_SIZE = 100;

function matchesSearch(item: TreeItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (item.name.toLowerCase().includes(q)) return true;
  if (item.type === "folder") {
    return item.children.some((c) => matchesSearch(c, q));
  }
  return false;
}

function flattenTree(
  folder: Folder,
  depth: number = 0,
): { item: TreeItem; depth: number; parentId: string }[] {
  const result: { item: TreeItem; depth: number; parentId: string }[] = [];
  for (const child of folder.children) {
    result.push({ item: child, depth, parentId: folder.id });
    if (child.type === "folder" && child.expanded) {
      result.push(...flattenTree(child, depth + 1));
    }
  }
  return result;
}

interface SortableItemProps {
  item: TreeItem;
  depth: number;
  isActive: boolean;
  isUnsaved: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onContextMenu: (e: React.MouseEvent, filterAddOnly?: boolean) => void;
  isRenaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  isDragging?: boolean;
  isOver?: boolean;
  isCut?: boolean;
}

function SortableItem({
  item,
  depth,
  isActive,
  isUnsaved,
  onSelect,
  onToggle,
  onContextMenu,
  isRenaming,
  renameValue,
  setRenameValue,
  onRenameSubmit,
  onRenameCancel,
  isDragging,
  isOver,
  isCut,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : isCut ? 0.5 : 1,
  };

  const isFolder = item.type === "folder";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative flex items-center gap-1 px-2 py-1.5 cursor-pointer text-xs select-none transition-colors ${
        isActive
          ? "bg-accent/20 text-accent font-medium"
          : "hover:bg-white/5 text-white/80"
      } ${isOver && isFolder ? "bg-accent/10 outline-1 outline-accent/30" : ""}`}
      onClick={() => {
        if (item.type === "folder") {
          onSelect();
          onToggle();
        } else {
          onSelect();
        }
      }}
      onContextMenu={onContextMenu}
    >
      <div className="absolute left-0 top-0 bottom-0 flex pointer-events-none">
        {Array.from({ length: depth }).map((_, i) => (
          <div
            key={i}
            className="w-[12px] border-r border-white/5 h-full"
            style={{ marginLeft: i === 0 ? 8 : 0 }}
          />
        ))}
      </div>

      <div style={{ width: depth * 12 }} className="shrink-0" />

      {item.type === "folder" ? (
        <div className="flex items-center gap-1.5 shrink-0 mr-1">
          <span className="text-white/40">
            {item.expanded ? (
              <VscChevronDown size={14} />
            ) : (
              <VscChevronRight size={14} />
            )}
          </span>
          <span className="text-white/60">
            {item.expanded ? (
              <FaFolderOpen size={16} />
            ) : (
              <FaFolder size={16} />
            )}
          </span>
        </div>
      ) : (
        <span
          className="font-mono text-[11px] font-bold shrink-0 mr-2 w-10 text-right"
          style={{
            color:
              METHOD_COLORS[(item as RequestFile).request.method] || "#888",
          }}
        >
          {(item as RequestFile).request.method}
        </span>
      )}

      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={onRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameSubmit();
            if (e.key === "Escape") onRenameCancel();
          }}
          className="flex-1 bg-inset border border-white/20 rounded px-1 py-0.5 text-xs"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="truncate flex-1">{item.name}</span>
      )}

      {isUnsaved && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}

      <div className="flex items-center opacity-0 group-hover:opacity-100 gap-1 transition-opacity">
        {isFolder && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(e, true);
            }}
            className="hover:bg-white/10 rounded p-1 text-white/50"
            title="Add..."
          >
            <VscAdd size={10} />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(e);
          }}
          className="hover:bg-white/10 rounded p-0.5 px-1 text-white/50"
        >
          ⋯
        </button>
      </div>
    </div>
  );
}

const DragOverlayItem = memo(function DragOverlayItem({
  item,
}: {
  item: TreeItem;
  depth: number;
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 text-xs bg-inset border border-accent/50 rounded shadow-2xl backdrop-blur-md opacity-90">
      {item.type === "folder" ? (
        <>
          <FaFolder size={16} className="text-white/60" />
          <span className="truncate text-white/90 font-medium">
            {item.name}
          </span>
        </>
      ) : (
        <>
          <span
            className="font-mono text-[10px] font-bold shrink-0 mr-1"
            style={{
              color:
                METHOD_COLORS[(item as RequestFile).request.method] || "#888",
            }}
          >
            {(item as RequestFile).request.method}
          </span>
          <span className="truncate text-white/90">{item.name}</span>
        </>
      )}
    </div>
  );
});

export function FileTree({
  root,
  selectedItemId,
  onSelect,
  onToggleFolder,
  onAddRequest,
  onAddFolder,
  onRename,
  onDelete,
  onDuplicate,
  onSort,
  onMoveItem,
  onCut,
  onCopy,
  onPaste,
  clipboard,
  searchQuery,
  unsavedIds,
}: FileTreeProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: TreeItem;
    filterAddOnly?: boolean;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overFolderId, setOverFolderId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderedCount, setRenderedCount] = useState(LAZY_BATCH_SIZE);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const flatItems = flattenTree(root).filter(({ item }) =>
    matchesSearch(item, searchQuery),
  );
  const itemIds = flatItems.map(({ item }) => item.id);
  const visibleItems = flatItems.slice(0, renderedCount);
  const hasMore = renderedCount < flatItems.length;

  useEffect(() => {
    setRenderedCount(LAZY_BATCH_SIZE);
  }, [root.id, searchQuery]);

  useEffect(() => {
    if (!containerRef.current) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current!;
      if (scrollHeight - scrollTop - clientHeight < 200 && hasMore) {
        setRenderedCount((prev) =>
          Math.min(prev + LAZY_BATCH_SIZE, flatItems.length),
        );
      }
    };

    const el = containerRef.current;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [hasMore, flatItems.length]);

  useEffect(() => {
    const handleTriggerRename = (e: Event) => {
      const customEvent = e as CustomEvent;
      const itemId = customEvent.detail?.itemId;
      if (itemId) {
        const item = flatItems.find((f) => f.item.id === itemId)?.item;
        if (item) startRename(item);
      }
    };
    window.addEventListener("trigger-rename", handleTriggerRename);
    return () =>
      window.removeEventListener("trigger-rename", handleTriggerRename);
  }, [flatItems]);

  function findItemInTree(
    id: string,
  ): { item: TreeItem; depth: number } | null {
    const found = flatItems.find(({ item }) => item.id === id);
    return found ? { item: found.item, depth: found.depth } : null;
  }

  function handleDragStart(event: DragStartEvent) {
    haptic("generic");
    setActiveId(event.active.id as string);
  }

  const lastOverIdRef = useRef<string | null>(null);

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id as string | undefined;
    if (!overId) {
      lastOverIdRef.current = null;
      setOverFolderId(null);
      return;
    }

    const overData = flatItems.find(({ item }) => item.id === overId);
    if (!overData) {
      lastOverIdRef.current = null;
      setOverFolderId(null);
      return;
    }

    if (lastOverIdRef.current !== overId) {
      haptic("alignment");
      lastOverIdRef.current = overId;
    }

    const activeData = flatItems.find(
      ({ item }) => item.id === event.active.id,
    );

    if (overData.item.type === "folder") {
      if (
        !overData.item.expanded ||
        (activeData && activeData.parentId !== overData.item.id)
      ) {
        setOverFolderId(overId);
        return;
      }
    }

    setOverFolderId(overData.parentId || null);
  }

  function handleDragEnd(event: DragEndEvent) {
    haptic("alignment");
    const { active, over } = event;
    setActiveId(null);
    setOverFolderId(null);

    if (!over || active.id === over.id) return;

    const overId = over.id as string;
    const activeData = flatItems.find(({ item }) => item.id === active.id);
    const overData = flatItems.find(({ item }) => item.id === overId);

    if (!activeData || !overData) return;

    if (overData.item.type === "folder") {
      if (!overData.item.expanded || activeData.parentId !== overData.item.id) {
        onMoveItem(active.id as string, overData.item.id, 0);
        return;
      }
    }

    const activeFlatIdx = flatItems.findIndex((f) => f.item.id === active.id);
    const overFlatIdx = flatItems.findIndex((f) => f.item.id === overId);

    if (activeFlatIdx > overFlatIdx) {
      onMoveItem(
        active.id as string,
        overData.parentId,
        findItemIndexInParent(overId, overData.parentId),
      );
    } else {
      onMoveItem(
        active.id as string,
        overData.parentId,
        findItemIndexInParent(overId, overData.parentId) + 1,
      );
    }
  }

  function findItemIndexInParent(itemId: string, parentId: string): number {
    const parent = findFolderById(root, parentId);
    if (!parent) return 0;
    return parent.children.findIndex((c) => c.id === itemId);
  }

  function findFolderById(folder: Folder, id: string): Folder | null {
    if (folder.id === id) return folder;
    for (const child of folder.children) {
      if (child.type === "folder") {
        const found = findFolderById(child, id);
        if (found) return found;
      }
    }
    return null;
  }

  function handleContextMenu(
    e: React.MouseEvent,
    item: TreeItem,
    filterAddOnly?: boolean,
  ) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item, filterAddOnly });
  }

  function startRename(item: TreeItem) {
    setRenamingId(item.id);
    setRenameValue(item.name);
  }

  function handleRenameSubmit() {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  }

  function handleRenameCancel() {
    setRenamingId(null);
    setRenameValue("");
  }

  function getContextMenuItems(item: TreeItem): MenuItem[] {
    const commonActions: MenuItem[] = [
      {
        label: "Cut",
        onClick: () => onCut(item.id),
      },
      {
        label: "Copy",
        onClick: () => onCopy(item.id),
      },
      {
        label: "Paste",
        disabled: !clipboard || item.type !== "folder",
        onClick: () => item.type === "folder" && onPaste(item.id),
      },
      { label: "", onClick: () => {}, divider: true },
      {
        label: "Rename",
        onClick: () => startRename(item),
        shortcut: getShortcutDisplay("RENAME"),
      },
      {
        label: "Duplicate",
        onClick: () => onDuplicate(item.id),
        shortcut: getSimpleShortcut("Duplicate"),
      },
      { label: "", onClick: () => {}, divider: true },
    ];

    if (item.type === "folder") {
      return [
        { label: "New Request", onClick: () => onAddRequest(item.id) },
        { label: "", onClick: () => {}, divider: true },
        { label: "New Folder", onClick: () => onAddFolder(item.id) },
        { label: "", onClick: () => {}, divider: true },
        ...commonActions,
        { label: "Sort by Method", onClick: () => onSort(item.id, "method") },
        { label: "Sort A-Z", onClick: () => onSort(item.id, "alphabetical") },
        { label: "", onClick: () => {}, divider: true },
        { label: "Delete", onClick: () => onDelete(item.id), danger: true },
      ];
    }
    return [
      ...commonActions,
      {
        label: "Delete",
        onClick: () => onDelete(item.id),
        danger: true,
        shortcut: getSimpleShortcut("Delete"),
      },
    ];
  }

  const activeItem = activeId ? findItemInTree(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto">
        {flatItems.length === 0 ? (
          <div className="p-4 text-center text-white/30 text-xs">
            No requests yet.
            <br />
            Click + to add one.
          </div>
        ) : (
          <SortableContext
            items={itemIds}
            strategy={verticalListSortingStrategy}
          >
            {visibleItems.map(({ item, depth }) => (
              <SortableItem
                key={item.id}
                item={item}
                depth={depth}
                isActive={item.id === selectedItemId}
                isUnsaved={unsavedIds.has(item.id)}
                onSelect={() => onSelect(item.id, item.type === "folder")}
                onToggle={() => onToggleFolder(item.id)}
                onContextMenu={(e, filterAddOnly) =>
                  handleContextMenu(e, item, filterAddOnly)
                }
                isRenaming={renamingId === item.id}
                renameValue={renameValue}
                setRenameValue={setRenameValue}
                onRenameSubmit={handleRenameSubmit}
                onRenameCancel={handleRenameCancel}
                isDragging={activeId === item.id}
                isOver={overFolderId === item.id}
                isCut={clipboard?.id === item.id && clipboard.type === "cut"}
              />
            ))}
          </SortableContext>
        )}
      </div>

      <DragOverlay>
        {activeItem && (
          <DragOverlayItem item={activeItem.item} depth={activeItem.depth} />
        )}
      </DragOverlay>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={
            contextMenu.filterAddOnly
              ? getContextMenuItems(contextMenu.item).slice(0, 3)
              : getContextMenuItems(contextMenu.item)
          }
          onClose={() => setContextMenu(null)}
        />
      )}
    </DndContext>
  );
}
