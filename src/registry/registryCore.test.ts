import { describe, expect, it } from "vitest";
import type { RequestType } from "../types/project";
import { allItemTypes, creatableItemTypes, getItemConfig } from "./index";

const ALL_TYPES: RequestType[] = [
	"request",
	"websocket",
	"graphql",
	"socketio",
	"mqtt",
	"workflow",
	"grpc",
	"sse",
];

describe("itemTypeRegistry", () => {
	it("registers every request type", () => {
		for (const type of ALL_TYPES) {
			expect(getItemConfig(type).type).toBe(type);
		}
	});

	it("creatable types exclude workflow", () => {
		const creatable = new Set(creatableItemTypes.map((c) => c.type));
		expect(creatable.has("workflow")).toBe(false);
		expect(creatable.size).toBeGreaterThanOrEqual(6);
	});
});

describe.each(
	allItemTypes.map((c) => [c.type, c] as const),
)("item type %s", (_label, cfg) => {
	it("createDefault + clone", () => {
		const item = cfg.createDefault({ id: "src-id", name: `Test ${cfg.type}` });
		expect(item.id).toBe("src-id");
		expect(item.type).toBe(cfg.type);

		const cloned = cfg.clone(item as never, { id: "clone-id" });
		expect(cloned.id).toBe("clone-id");
		expect(cloned.type).toBe(cfg.type);
	});

	it("getRecentMeta", () => {
		const item = cfg.createDefault({ id: "x" });
		const meta = cfg.getRecentMeta(item as never);
		expect(meta).toHaveProperty("methodLabel");
		expect(meta).toHaveProperty("url");
	});
});
