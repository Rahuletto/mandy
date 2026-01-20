import { useState, useCallback, useRef, useEffect } from "react";
import type { Project, SortMode } from "../types/project";
import { FileTree } from "./FileTree";
import { ContextMenu, MenuItem, IconPicker, getIconComponent } from "./ui";
import { FaPlus } from "react-icons/fa6";
import { HiDownload } from "react-icons/hi";

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
      { label: "", onClick: () => { }, divider: true },
      {
        label: "New Folder",
        onClick: () => onAddFolder(activeProject.root.id),
      },
    ]
    : [];

  return (
    <div
      ref={sidebarRef}
      className={`flex flex-col bg-transparent select-none shrink-0 ${className}`}
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
          <>
            <div>
              <div className={`flex items-center opacity-80 gap-2 px-3 py-2 transition-colors cursor-pointer ${showProjectOverview
                ? "bg-accent/10"
                : "hover:bg-white/5"
                }`} onClick={onProjectClick}>
                <button
                  ref={iconButtonRef}
                  onClick={(e) => { e.stopPropagation(); setShowIconPicker(true); }}
                  className="w-5 h-5 flex items-center justify-center transition-colors cursor-pointer"
                  style={{ color: showProjectOverview ? "var(--color-accent)" : (activeProject.iconColor || "rgba(255, 255, 255, 0.6)") }}
                >
                  {(() => {
                    const IconComponent = getIconComponent(activeProject.icon);
                    return <IconComponent size={16} />;
                  })()}
                </button>
                <span
                  className={`flex-1 text-left text-xs truncate transition-colors ${showProjectOverview ? "text-accent font-medium" : "text-white/70 hover:text-white"
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
            />
            <div className="px-3 pt-2 opacity-0 hover:opacity-100 transition-opacity duration-300">
              <div className="flex gap-2">
                <button
                  onClick={() => onAddRequest(activeProject.root.id)}
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
          </>
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

