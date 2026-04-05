import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaFolder, FaPlus } from "react-icons/fa6";
import { creatableItemTypes, RequestTypeIcon } from "../registry";
import type {
	Project,
	RequestType,
	SortMode,
	TreeItem,
} from "../types/project";
import { FileTree } from "./FileTree";
import { ContextMenu, getIconComponent, IconPicker, type MenuItem } from "./ui";

interface SidebarProps {
	activeProject: Project | null;
	selectedItemId: string | null;
	onSelect: (id: string, type: TreeItem["type"]) => void;
	onToggleFolder: (id: string) => void;
	onAddItem: (type: RequestType, folderId: string) => void;
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
	loadingItems?: Set<string>;
	completedItems?: Set<string>;
	legacyProjectSchema?: boolean;
}

export function Sidebar({
	activeProject,
	selectedItemId,
	onSelect,
	onToggleFolder,
	onAddItem,
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
	loadingItems = new Set(),
	completedItems = new Set(),
	legacyProjectSchema = false,
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

	const addMenuItems: MenuItem[] = useMemo(() => {
		if (!activeProject) return [];
		const rootId = activeProject.root.id;
		const fromRegistry: MenuItem[] = creatableItemTypes.map((cfg) => ({
			label: cfg.label,
			icon: (
				<RequestTypeIcon type={cfg.type} size={14} className="opacity-100" />
			),
			onClick: () => onAddItem(cfg.type, rootId),
		}));
		return [
			...fromRegistry,
			{ label: "", onClick: () => {}, divider: true },
			{
				label: "New Workflow",
				icon: (
					<RequestTypeIcon type="workflow" size={14} className="opacity-100" />
				),
				onClick: () => onAddItem("workflow", rootId),
			},
			{
				label: "New Folder",
				icon: <FaFolder size={12} />,
				onClick: () => onAddFolder(rootId),
			},
			{ label: "", onClick: () => {}, divider: true },
			{
				label: "Import Collection",
				onClick: onImportClick,
			},
		];
	}, [activeProject, onAddItem, onAddFolder, onImportClick]);

	return (
		<div
			ref={sidebarRef}
			className={`flex h-full shrink-0 select-none flex-col bg-transparent ${className}`}
			style={{ width }}
		>
			<div className="flex shrink-0 items-center gap-2 px-3 py-3">
				<div className="flex-1">
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Search"
						className="w-full rounded-full bg-text/10 px-4 py-2 text-sm text-white/80 transition-colors placeholder:text-white/20 focus:border-white/10 focus:outline-none"
					/>
				</div>
				<button
					ref={addButtonRef}
					onClick={handleAddClick}
					disabled={!activeProject}
					type="button"
					className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent font-bold text-[#fefefe] text-lg transition-all hover:bg-accent/90 disabled:opacity-30"
				>
					<FaPlus size={16} />
				</button>
			</div>

			{activeProject ? (
				<>
					<div className="shrink-0">
						<div
							className={`flex cursor-pointer items-center gap-2 px-3 py-2 opacity-80 transition-colors ${
								showProjectOverview ? "bg-accent/10" : "hover:bg-white/5"
							}`}
							onClick={onProjectClick}
						>
							<button
								type="button"
								ref={iconButtonRef}
								onClick={(e) => {
									e.stopPropagation();
									setShowIconPicker(true);
								}}
								className="flex h-5 w-5 cursor-pointer items-center justify-center transition-colors"
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
								className={`flex-1 truncate text-left text-xs transition-colors ${
									showProjectOverview
										? "font-medium text-accent"
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
						onAddItem={onAddItem}
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
						onImportClick={onImportClick}
						loadingItems={loadingItems}
						completedItems={completedItems}
						showLegacySchemaIndicator={legacyProjectSchema}
					/>
				</>
			) : (
				<div className="flex flex-1 items-center justify-center p-4 text-white/30 text-xs">
					No project selected
				</div>
			)}

			<div
				className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize transition-colors hover:bg-accent/50"
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
