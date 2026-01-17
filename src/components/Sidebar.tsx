import { useState, useCallback, useRef, useEffect } from "react";
import type { Project, SortMode } from "../types/project";
import { FileTree } from "./FileTree";
import { ContextMenu, MenuItem } from "./ui";
import { FaPlus } from "react-icons/fa6";

interface SidebarProps {
  activeProject: Project | null;
  activeRequestId: string | null;
  unsavedIds: Set<string>;
  onSelectRequest: (id: string) => void;
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
  width: number;
  onWidthChange: (width: number) => void;
}

export function Sidebar({
  activeProject,
  activeRequestId,
  unsavedIds,
  onSelectRequest,
  onToggleFolder,
  onAddRequest,
  onAddFolder,
  onRename,
  onDelete,
  onDuplicate,
  onSort,
  onMoveItem,
  width,
  onWidthChange,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isResizing, setIsResizing] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(200, Math.min(400, e.clientX));
      onWidthChange(newWidth);
    },
    [isResizing, onWidthChange],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  function handleAddClick() {
    if (addButtonRef.current && activeProject) {
      const rect = addButtonRef.current.getBoundingClientRect();
      setShowAddMenu({ x: rect.left, y: rect.bottom + 4 });
    }
  }

  const addMenuItems: MenuItem[] = activeProject
    ? [
      {
        label: "New Request",
        onClick: () => onAddRequest(activeProject.root.id),
      },
      {
        label: "New Folder",
        onClick: () => onAddFolder(activeProject.root.id),
      },
    ]
    : [];

  return (
    <div
      ref={sidebarRef}
      className="relative flex flex-col bg-transparent select-none shrink-0"
      style={{ width }}
    >
      <div className="px-3 py-3 flex items-center gap-2">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="w-full bg-text/10 rounded-full px-4 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/10 transition-colors"
          />
        </div>
        <button
          ref={addButtonRef}
          onClick={handleAddClick}
          disabled={!activeProject}
          type="button"
          className="w-8 h-8 flex items-center justify-center rounded-full bg-accent text-text text-lg font-bold shadow-lg hover:bg-accent/90 transition-all disabled:opacity-30 disabled:grayscale shrink-0"
        >
          <FaPlus size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {activeProject ? (
          <FileTree
            root={activeProject.root}
            activeRequestId={activeRequestId}
            onSelectRequest={onSelectRequest}
            onToggleFolder={onToggleFolder}
            onAddRequest={onAddRequest}
            onAddFolder={onAddFolder}
            onRename={onRename}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onSort={onSort}
            onMoveItem={onMoveItem}
            searchQuery={searchQuery}
            unsavedIds={unsavedIds}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-white/30 text-xs p-4">
            No project selected
          </div>
        )}
      </div>

      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 transition-colors"
        onMouseDown={handleMouseDown}
      />

      {showAddMenu && (
        <ContextMenu
          x={showAddMenu.x}
          y={showAddMenu.y}
          items={addMenuItems}
          onClose={() => setShowAddMenu(null)}
        />
      )}
    </div>
  );
}
