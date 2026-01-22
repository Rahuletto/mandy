import { useState, useCallback, useRef, useEffect } from "react";
import type { Project, SortMode } from "../types/project";
import { FileTree } from "./FileTree";
import { ContextMenu, MenuItem, IconPicker, getIconComponent } from "./ui";
import { FaPlus } from "react-icons/fa6";

interface SidebarProps {
  activeProject: Project | null;
  selectedItemId: string | null;
  unsavedIds: Set<string>;
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
  width: number;
  onWidthChange: (width: number) => void;
  onProjectClick: () => void;
  onIconChange: (icon: string) => void;
  onIconColorChange?: (color: string) => void;
  onImportClick: () => void;
  showProjectOverview?: boolean;
  className?: string;
  loadingRequests?: Set<string>;
  completedRequests?: Set<string>;
}

export function Sidebar({
  activeProject,
  selectedItemId,
  unsavedIds,
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
  width,
  onWidthChange,
  onProjectClick,
  onIconChange,
  onIconColorChange,
  onImportClick,
  showProjectOverview = false,
  className = "",
  loadingRequests = new Set(),
  completedRequests = new Set(),
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isResizing, setIsResizing] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const iconButtonRef = useRef<HTMLButtonElement>(null);
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
        { label: "", onClick: () => {}, divider: true },
        {
          label: "New Folder",
          onClick: () => onAddFolder(activeProject.root.id),
        },
        {
          label: "Import Collection",
          onClick: onImportClick,
        },
      ]
    : [];

  return (
    <div
      ref={sidebarRef}
      className={`flex flex-col h-full bg-transparent select-none shrink-0 ${className}`}
      style={{ width }}
    >
      <div className="px-3 py-3 flex items-center gap-2 shrink-0">
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
          className="w-8 h-8 flex items-center justify-center rounded-full bg-accent text-[#fefefe] text-lg font-bold hover:bg-accent/90 transition-all disabled:opacity-30 cursor-pointer shrink-0"
        >
          <FaPlus size={16} />
        </button>
      </div>

      {activeProject ? (
        <>
          <div className="shrink-0">
            <div
              className={`flex items-center opacity-80 gap-2 px-3 py-2 transition-colors cursor-pointer ${
                showProjectOverview ? "bg-accent/10" : "hover:bg-white/5"
              }`}
              onClick={onProjectClick}
            >
              <button
                ref={iconButtonRef}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowIconPicker(true);
                }}
                className="w-5 h-5 flex items-center justify-center transition-colors cursor-pointer"
                style={{
                  color: showProjectOverview
                    ? "var(--accent)"
                    : activeProject.iconColor || "var(--accent)",
                }}
              >
                {(() => {
                  const IconComponent = getIconComponent(activeProject.icon);
                  return <IconComponent size={16} />;
                })()}
              </button>
              <span
                className={`flex-1 text-left text-xs truncate transition-colors ${
                  showProjectOverview
                    ? "text-accent font-medium"
                    : "text-white/70 hover:text-white"
                }`}
              >
                {activeProject.name}
              </span>
            </div>
          </div>
          <FileTree
            root={activeProject.root}
            selectedItemId={selectedItemId}
            onSelect={onSelect}
            onToggleFolder={onToggleFolder}
            onAddRequest={onAddRequest}
            onAddFolder={onAddFolder}
            onRename={onRename}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onSort={onSort}
            onMoveItem={onMoveItem}
            onCut={onCut}
            onCopy={onCopy}
            onPaste={onPaste}
            clipboard={clipboard}
            searchQuery={searchQuery}
            unsavedIds={unsavedIds}
            onImportClick={onImportClick}
            loadingRequests={loadingRequests}
            completedRequests={completedRequests}
          />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-white/30 text-xs p-4">
          No project selected
        </div>
      )}

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

      <IconPicker
        selectedIcon={activeProject?.icon}
        onSelect={onIconChange}
        selectedColor={activeProject?.iconColor}
        onSelectColor={onIconColorChange}
        isOpen={showIconPicker}
        onClose={() => setShowIconPicker(false)}
        anchorRef={iconButtonRef}
      />
    </div>
  );
}
