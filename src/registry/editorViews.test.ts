import { describe, expect, it, vi } from "vitest";
import type { Project } from "../types/project";
import { isProtocolRequestItem, renderProtocolEditor } from "./editorViews";
import { getItemConfig } from "./index";

function minimalCtx() {
	return {
		activeProject: null as Project | null,
		getEnvKeys: () => [] as string[],
		resolveVariables: (t: string) => t,
		updateItem: vi.fn(),
		startLoading: vi.fn(),
		stopLoading: vi.fn(),
		onOpenProjectSettings: vi.fn(),
		onSendGraphQL: vi.fn(),
		loadingItems: new Set<string>(),
	};
}

const PROTOCOL_TYPES = [
	"websocket",
	"graphql",
	"socketio",
	"mqtt",
	"grpc",
	"sse",
] as const;

describe("renderProtocolEditor", () => {
	for (const type of PROTOCOL_TYPES) {
		it(`renders ${type} editor shell with test id`, () => {
			const item = getItemConfig(type).createDefault({ id: `${type}-1` });
			if (!isProtocolRequestItem(item)) {
				throw new Error(`expected protocol item for ${type}`);
			}
			const node = renderProtocolEditor(item, minimalCtx());
			expect(node).toBeTruthy();
		});
	}
});
