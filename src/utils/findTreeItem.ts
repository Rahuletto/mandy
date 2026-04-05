import type { Folder, TreeItem } from "../types/project";

export function findTreeItemById(
	root: Folder,
	targetId: string,
): TreeItem | null {
	if (root.id === targetId) return root;
	for (const child of root.children) {
		if (child.id === targetId) return child;
		if (child.type === "folder") {
			const found = findTreeItemById(child, targetId);
			if (found) return found;
		}
	}
	return null;
}
