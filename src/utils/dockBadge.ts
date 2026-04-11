import { commands } from "../bindings";

/** macOS Dock tile badge (count). Safe no-op in browser / non-macOS. */
export async function setDockBadgeCount(count: number): Promise<void> {
	try {
		const label = count > 0 ? String(Math.min(count, 99)) : null;
		const result = await commands.setDockBadge(label);
		if (result.status === "error") {
			console.warn("setDockBadge:", result.error);
		}
	} catch {
		/* Vite / non-Tauri */
	}
}
