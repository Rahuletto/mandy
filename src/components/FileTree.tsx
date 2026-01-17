import { useState } from "react";
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
import type { Folder, RequestFile, TreeItem, SortMode } from "../types/project";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface FileTreeProps {
  root: Folder;
  activeRequestId: string | null;
  onSelectRequest: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onAddRequest: (folderId: string) => void;
  onAddFolder: (folderId: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onSort: (folderId: string, mode: SortMode) => void;
  onMoveItem: (itemId: string, targetFolderId: string, targetIndex: number) => void;
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

function matchesSearch(item: TreeItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (item.name.toLowerCase().includes(q)) return true;
  if (item.type === "folder") {
    return item.children.some((c) => matchesSearch(c, query));
  }
  return false;
}

function flattenTree(folder: Folder, depth: number = 0): { item: TreeItem; depth: number; parentId: string }[] {
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
  onContextMenu: (e: React.MouseEvent) => void;
  isRenaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  isDragging?: boolean;
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
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group flex items-center gap-1 px-2 py-1.5 cursor-pointer text-xs select-none transition-colors ${isActive ? "bg-accent/20 text-accent" : "hover:bg-white/5 text-white/80"
        }`}
      onClick={() => {
        if (item.type === "folder") onToggle();
        else onSelect();
      }}
      onContextMenu={onContextMenu}
    >
      <div style={{ width: depth * 12 }} />

      {item.type === "folder" ? (
        <span className="text-white/40 w-4 text-[10px]">{item.expanded ? "▼" : "▶"}</span>
      ) : (
        <span
          className="font-mono text-[11px] font-bold shrink-0 mr-2"
          style={{ color: METHOD_COLORS[(item as RequestFile).request.method] || "#888" }}
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

      <button
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(e);
        }}
        className="opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded p-0.5 px-1 text-white/50"
      >
        ⋯
      </button>
    </div>
  );
}

function DragOverlayItem({ item, depth }: { item: TreeItem; depth: number }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 text-xs bg-inset border border-accent/50 rounded shadow-lg"
      style={{ paddingLeft: depth * 12 + 8 }}
    >
      {item.type === "folder" ? (
        <span className="text-white/40 w-4 text-[10px]">▶</span>
      ) : (
        <span
          className="font-mono text-[11px] font-bold shrink-0 mr-2"
          style={{ color: METHOD_COLORS[(item as RequestFile).request.method] || "#888" }}
        >
          {(item as RequestFile).request.method}
        </span>
      )}
      <span className="truncate text-white/80">{item.name}</span>
    </div>
  );
}

export function FileTree({
  root,
  activeRequestId,
  onSelectRequest,
  onToggleFolder,
  onAddRequest,
  onAddFolder,
  onRename,
  onDelete,
  onDuplicate,
  onSort,
  onMoveItem,
  searchQuery,
  unsavedIds,
}: FileTreeProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: TreeItem } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [_overFolderId, setOverFolderId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const flatItems = flattenTree(root).filter(({ item }) => matchesSearch(item, searchQuery));
  const itemIds = flatItems.map(({ item }) => item.id);

  function findItemInTree(id: string): { item: TreeItem; depth: number } | null {
    const found = flatItems.find(({ item }) => item.id === id);
    return found ? { item: found.item, depth: found.depth } : null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id as string | undefined;
    if (!overId) {
      setOverFolderId(null);
      return;
    }

    const overData = flatItems.find(({ item }) => item.id === overId);
    if (overData?.item.type === "folder") {
      setOverFolderId(overId);
    } else {
      setOverFolderId(overData?.parentId || null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverFolderId(null);

    if (!over || active.id === over.id) return;

    const activeData = flatItems.find(({ item }) => item.id === active.id);
    const overData = flatItems.find(({ item }) => item.id === over.id);

    if (!activeData || !overData) return;

    let targetFolderId: string;
    let targetIndex: number;

    if (overData.item.type === "folder") {
      targetFolderId = overData.item.id;
      targetIndex = 0;
    } else {
      targetFolderId = overData.parentId;
      const folder = findFolderById(root, targetFolderId);
      if (folder) {
        const idx = folder.children.findIndex((c) => c.id === over.id);
        targetIndex = idx + 1;
      } else {
        targetIndex = 0;
      }
    }

    onMoveItem(active.id as string, targetFolderId, targetIndex);
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

  function handleContextMenu(e: React.MouseEvent, item: TreeItem) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
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
    if (item.type === "folder") {
      return [
        { label: "Add Request", onClick: () => onAddRequest(item.id) },
        { label: "Add Folder", onClick: () => onAddFolder(item.id) },
        { label: "", onClick: () => { }, divider: true },
        { label: "Rename", onClick: () => startRename(item) },
        { label: "Duplicate", onClick: () => onDuplicate(item.id) },
        { label: "", onClick: () => { }, divider: true },
        { label: "Sort by Method", onClick: () => onSort(item.id, "method") },
        { label: "Sort A-Z", onClick: () => onSort(item.id, "alphabetical") },
        { label: "", onClick: () => { }, divider: true },
        { label: "Delete", onClick: () => onDelete(item.id), danger: true },
      ];
    }
    return [
      { label: "Rename", onClick: () => startRename(item) },
      { label: "Duplicate", onClick: () => onDuplicate(item.id) },
      { label: "", onClick: () => { }, divider: true },
      { label: "Delete", onClick: () => onDelete(item.id), danger: true },
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
      <div className="flex-1 overflow-auto">
        {flatItems.length === 0 ? (
          <div className="p-4 text-center text-white/30 text-xs">
            No requests yet.
            <br />
            Click + to add one.
          </div>
        ) : (
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {flatItems.map(({ item, depth }) => (
              <SortableItem
                key={item.id}
                item={item}
                depth={depth}
                isActive={item.type === "request" && item.id === activeRequestId}
                isUnsaved={unsavedIds.has(item.id)}
                onSelect={() => onSelectRequest(item.id)}
                onToggle={() => onToggleFolder(item.id)}
                onContextMenu={(e) => handleContextMenu(e, item)}
                isRenaming={renamingId === item.id}
                renameValue={renameValue}
                setRenameValue={setRenameValue}
                onRenameSubmit={handleRenameSubmit}
                onRenameCancel={handleRenameCancel}
                isDragging={activeId === item.id}
              />
            ))}
          </SortableContext>
        )}
      </div>

      <DragOverlay>
        {activeItem && <DragOverlayItem item={activeItem.item} depth={activeItem.depth} />}
      </DragOverlay>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.item)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </DndContext>
  );
}
