import { describe, expect, it } from "vitest";
import type { Project } from "../types/project";
import {
	CURRENT_PROJECT_SCHEMA_VERSION,
	isLegacyProject,
	migratePersistedZustandState,
	projectNeedsMigration,
	ZUSTAND_PERSIST_VERSION,
} from "./index";

describe("migratePersistedZustandState", () => {
	it("collapses legacy active* id keys into activeItemId", () => {
		const migrated = migratePersistedZustandState(
			{
				activeRequestId: "req-1",
				activeWorkflowId: null,
				projects: [],
			},
			1,
		);
		expect(migrated.activeItemId).toBe("req-1");
		expect(migrated.activeRequestId).toBeUndefined();
		expect(migrated.activeWorkflowId).toBeUndefined();
	});

	it("keeps state unchanged at current zustand version", () => {
		const input = { activeItemId: "item-9", projects: [] };
		const migrated = migratePersistedZustandState(
			input,
			ZUSTAND_PERSIST_VERSION,
		);
		expect(migrated).toEqual(input);
	});
});

describe("project schema helpers", () => {
	const currentProject = {
		schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
	} as Project;

	const legacyProject = { schemaVersion: 0 } as Project;

	it("detects legacy projects", () => {
		expect(isLegacyProject(legacyProject)).toBe(true);
		expect(isLegacyProject(currentProject)).toBe(false);
	});

	it("flags migration when any project is legacy", () => {
		expect(projectNeedsMigration([currentProject, legacyProject])).toBe(true);
		expect(projectNeedsMigration([currentProject])).toBe(false);
	});
});
