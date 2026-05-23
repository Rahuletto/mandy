import { render, screen } from "@testing-library/react";
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

describe("isProtocolRequestItem", () => {
	it("includes protocol editors only", () => {
		for (const type of PROTOCOL_TYPES) {
			const item = getItemConfig(type).createDefault({ id: "p" });
			expect(isProtocolRequestItem(item)).toBe(true);
		}
		const rest = getItemConfig("request").createDefault({ id: "r" });
		expect(isProtocolRequestItem(rest)).toBe(false);
	});
});

describe("renderProtocolEditor", () => {
	for (const type of PROTOCOL_TYPES) {
		it(`renders ${type} editor with data-testid`, () => {
			const item = getItemConfig(type).createDefault({ id: `${type}-1` });
			if (!isProtocolRequestItem(item)) {
				throw new Error(`expected protocol item for ${type}`);
			}
			render(renderProtocolEditor(item, minimalCtx()));
			expect(screen.getByTestId(`${type}-editor`)).toBeInTheDocument();
		});
	}
});
