import type { Project, Folder } from "../../../types/project";
import { generateId } from "../shared";

export function exportToMatchstickJSON(project: Project): string {
    return JSON.stringify(project, null, 2);
}

export function parseMatchstickJSON(json: string): Project | null {
    try {
        const parsed = JSON.parse(json);
        if (parsed.root && parsed.name) {
            const regenerateIds = (folder: Folder): Folder => {
                return {
                    ...folder,
                    id: generateId(),
                    children: folder.children.map((child) =>
                        child.type === "folder"
                            ? regenerateIds(child)
                            : { ...child, id: generateId() }
                    ),
                };
            };

            return {
                ...parsed,
                id: generateId(),
                root: regenerateIds(parsed.root),
            };
        }
        return null;
    } catch {
        return null;
    }
}
