import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { createTauriMockHandler } from "../test/mocks/tauriHandlers";

/** Install Tauri IPC/window mocks before the React tree mounts (Playwright / E2E builds). */
export function setupE2EMocks(): void {
	clearMocks();
	mockWindows("main");
	mockIPC(createTauriMockHandler(), { shouldMockEvents: true });
}
