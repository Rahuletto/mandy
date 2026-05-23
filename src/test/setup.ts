import "@testing-library/jest-dom/vitest";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, vi } from "vitest";
import { createTauriMockHandler } from "./mocks/tauriHandlers";

/** Node 22+ can expose a broken `localStorage`; Tauri mocks may replace it too. */
export function installLocalStorageMock(): void {
	const data = new Map<string, string>();
	const mock = {
		get length() {
			return data.size;
		},
		clear() {
			data.clear();
		},
		getItem(key: string) {
			return data.get(key) ?? null;
		},
		setItem(key: string, value: string) {
			data.set(key, value);
		},
		removeItem(key: string) {
			data.delete(key);
		},
		key(index: number) {
			return [...data.keys()][index] ?? null;
		},
	};
	Object.defineProperty(globalThis, "localStorage", {
		value: mock,
		configurable: true,
		writable: true,
	});
}

installLocalStorageMock();

beforeEach(() => {
	mockWindows("main");
	mockIPC(createTauriMockHandler(), { shouldMockEvents: true });
	installLocalStorageMock();
});

afterEach(() => {
	clearMocks();
	vi.restoreAllMocks();
	installLocalStorageMock();
});
