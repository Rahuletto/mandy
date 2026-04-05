import type { Folder, RequestFile } from "../types/project";

/** Depth-first search for a REST request file by id. */
export function findRequestFileById(
	folder: Folder,
	requestId: string,
): RequestFile | null {
	for (const item of folder.children) {
		if (item.type === "request" && item.id === requestId) {
			return item;
		}
		if (item.type === "folder") {
			const found = findRequestFileById(item, requestId);
			if (found) return found;
		}
	}
	return null;
}
