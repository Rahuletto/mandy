import { useState, useEffect, useRef, memo } from "react";
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
import { FaFolder, FaFolderOpen, FaPlus } from "react-icons/fa6";
import { HiDownload } from "react-icons/hi";
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
  onImportClick: () => void;
  loadingRequests?: Set<string>;
  completedRequests?: Set<string>;
}

import {
  METHOD_COLORS,
  getShortMethod,
  getMethodColor,
} from "../utils/methodConstants";

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
  forceExpandAll: boolean = false,
): { item: TreeItem; depth: number; parentId: string }[] {
  const result: { item: TreeItem; depth: number; parentId: string }[] = [];
  for (const child of folder.children) {
    result.push({ item: child, depth, parentId: folder.id });
    if (child.type === "folder" && (forceExpandAll || child.expanded)) {
      result.push(...flattenTree(child, depth + 1, forceExpandAll));
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
  isNesting?: boolean;
  isInNestingFolder?: boolean;
  isCut?: boolean;
  itemRectsRef?: React.MutableRefObject<Map<string, DOMRect>>;
  isLoading?: boolean;
  isCompleted?: boolean;
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
  isNesting,
  isInNestingFolder,
  isCut,
  itemRectsRef,
  isLoading,
  isCompleted,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.id });
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!itemRef.current || !itemRectsRef) return;
    const rect = itemRef.current.getBoundingClientRect();
    itemRectsRef.current.set(item.id, rect);
    return () => {
      itemRectsRef.current.delete(item.id);
    };
  }, [item.id, itemRectsRef]);

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
      className={`group relative flex items-center gap-1 px-2 py-1.5 cursor-pointer text-xs select-none transition-all duration-500 ${
        isActive
          ? "bg-accent/20 text-accent font-medium"
          : "hover:bg-white/5 text-white/80"
      } ${isOver ? "bg-white/5" : ""} ${isNesting && isFolder ? "bg-accent/20 outline-1 outline-accent/50 rounded-b-none" : ""} ${isCompleted && !isActive ? "completed-flash" : ""}`}
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
      {isNesting && isFolder && (
        <div
          className="absolute left-0 top-0 bottom-0 bg-accent/20 pointer-events-none"
          style={{
            width: depth * 12 + 12,
            borderLeftWidth: 2,
            borderLeftColor: "var(--color-accent)",
          }}
        />
      )}
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
            color: getMethodColor((item as RequestFile).request.method),
          }}
        >
          {getShortMethod((item as RequestFile).request.method)}
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

      {isLoading && (
        <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin shrink-0" />
      )}
      {isUnsaved && !isLoading && (
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
      )}

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
  depth,
}: {
  item: TreeItem;
  depth: number;
}) {
  return (
    <div className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-xs bg-inset border-2 border-dashed rounded-lg border-accent/50 rounded shadow-2xl backdrop-blur-md opacity-90">
      <div className="absolute left-0 top-0 bottom-0 flex pointer-events-none">
        {Array.from({ length: depth }).map((_, i) => (
          <div
            key={i}
            className="w-[12px] border-r border-white/10 h-full"
            style={{ marginLeft: i === 0 ? 8 : 0 }}
          />
        ))}
      </div>
      <div style={{ width: depth * 12 }} className="shrink-0" />
      {item.type === "folder" ? (
        <>
          <FaFolder size={16} className="text-white/60 shrink-0" />
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
  onImportClick,
  loadingRequests = new Set(),
  completedRequests = new Set(),
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
  const [isNesting, setIsNesting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredFolderRef = useRef<string | null>(null);
  const [renderedCount, setRenderedCount] = useState(LAZY_BATCH_SIZE);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const flatItems = flattenTree(root, 0, !!searchQuery).filter(({ item }) =>
    matchesSearch(item, searchQuery),
  );
  const fullFlatItems = flattenTree(root, 0, true);
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
    const found = fullFlatItems.find(({ item }) => item.id === id);
    return found ? { item: found.item, depth: found.depth } : null;
  }

  function isInsideFolder(itemId: string, folderId: string): boolean {
    let current = fullFlatItems.find((f) => f.item.id === itemId);
    while (current && current.depth > 0) {
      const parent = fullFlatItems.find((f) => f.item.id === current?.parentId);
      if (parent?.item.id === folderId) return true;
      current = parent;
    }
    return false;
  }

  function handleDragStart(event: DragStartEvent) {
    haptic("generic");
    setActiveId(event.active.id as string);
  }

  const lastOverIdRef = useRef<string | null>(null);

  function clearHoverTimer() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    lastHoveredFolderRef.current = null;
  }

  function startHoverTimer(folderId: string) {
    clearHoverTimer();
    hoverTimerRef.current = setTimeout(() => {
      if (lastHoveredFolderRef.current === folderId) {
        const folder = findFolderById(root, folderId);
        if (folder && !folder.expanded) {
          onToggleFolder(folderId);
        }
        lastHoveredFolderRef.current = null;
      }
    }, 700);
    lastHoveredFolderRef.current = folderId;
  }

  function shouldNestInFolder(
    overId: string,
    activatorEvent: PointerEvent | undefined,
    activeData: { item: TreeItem; depth: number; parentId: string } | undefined,
    overData: { item: TreeItem; depth: number; parentId: string } | undefined,
  ): boolean {
    if (!overData || overData.item.type !== "folder") return false;
    if (!activatorEvent) return false;

    const rect = itemRectsRef.current.get(overId);
    if (!rect) return false;

    const pointerY = activatorEvent.clientY;
    const relativeY = pointerY - rect.top;
    const nestThreshold = rect.height * 0.35;

    if (relativeY < nestThreshold || relativeY > rect.height - nestThreshold) {
      return false;
    }

    if (!overData.item.expanded) return true;

    if (activeData && activeData.parentId === overData.item.id) {
      return false;
    }

    return true;
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id as string | undefined;
    if (!overId) {
      lastOverIdRef.current = null;
      setOverFolderId(null);
      setIsNesting(false);
      clearHoverTimer();
      return;
    }

    const overData = flatItems.find(({ item }) => item.id === overId);
    if (!overData) {
      lastOverIdRef.current = null;
      setOverFolderId(null);
      clearHoverTimer();
      return;
    }

    if (lastOverIdRef.current !== overId) {
      haptic("alignment");
      lastOverIdRef.current = overId;
    }

    const activeData = flatItems.find(
      ({ item }) => item.id === event.active.id,
    );

    const activatorEvent = event.activatorEvent as PointerEvent | undefined;
    const shouldNest = shouldNestInFolder(
      overId,
      activatorEvent,
      activeData,
      overData,
    );

    if (shouldNest) {
      if (
        activeData &&
        activeData.item.type === "folder" &&
        isInsideFolder(overId, activeData.item.id)
      ) {
        setOverFolderId(null);
        setIsNesting(false);
      } else {
        setOverFolderId(overId);
        setIsNesting(true);
        clearHoverTimer();
      }
    } else {
      setOverFolderId(null);
      setIsNesting(false);
      if (overData.item.type === "folder") {
        startHoverTimer(overId);
      } else {
        clearHoverTimer();
      }
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    haptic("alignment");
    const { active, over } = event;
    setActiveId(null);
    setOverFolderId(null);
    setIsNesting(false);
    clearHoverTimer();

    if (!over || active.id === over.id) return;

    const overId = over.id as string;
    const activeData = flatItems.find(({ item }) => item.id === active.id);
    const overData = flatItems.find(({ item }) => item.id === overId);

    if (!activeData || !overData) return;

    const activatorEvent = event.activatorEvent as PointerEvent | undefined;
    const shouldNest = shouldNestInFolder(
      overId,
      activatorEvent,
      activeData,
      overData,
    );

    if (shouldNest && overData.item.type === "folder") {
      if (
        activeData &&
        activeData.item.type === "folder" &&
        isInsideFolder(overId, activeData.item.id)
      ) {
        return;
      }
      onMoveItem(active.id as string, overData.item.id, 0);
      return;
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
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
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
              isOver={!isNesting && overFolderId === item.id}
              isNesting={isNesting && overFolderId === item.id}
              isCut={clipboard?.id === item.id && clipboard.type === "cut"}
              itemRectsRef={itemRectsRef}
              isLoading={loadingRequests.has(item.id)}
              isCompleted={completedRequests.has(item.id)}
            />
          ))}
        </SortableContext>
        <div className="px-3 py-2">
          <div className="flex gap-2 opacity-0 hover:opacity-100 transition-opacity duration-300">
            <button
              onClick={() => onAddRequest(root.id)}
              className="flex-1 px-3 py-2 text-xs font-medium text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <FaPlus size={10} />
              Create
            </button>
            <button
              onClick={onImportClick}
              className="flex-1 px-3 py-2 text-xs font-medium text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <HiDownload size={12} />
              Import
            </button>
          </div>
        </div>
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
