import { describe, expect, it } from "vitest";
import type { Project } from "../types/project";
import { useProjectStore } from "./projectStore";

function activeProject(): Project {
	const project = useProjectStore.getState().getActiveProject();
	expect(project).toBeDefined();
	if (!project) {
		throw new Error("expected active project");
	}
	return project;
}

describe("useProjectStore", () => {
	it("creates projects and REST requests", () => {
		const projectId = useProjectStore.getState().createProject("Store Test");
		const requestId = useProjectStore
			.getState()
			.addItem("request", activeProject().root.id, "Ping");

		const project = useProjectStore.getState().getActiveProject();
		expect(project?.name).toBe("Store Test");
		expect(useProjectStore.getState().activeItemId).toBe(requestId);
		expect(project?.recentRequests.some((r) => r.requestId === requestId)).toBe(
			true,
		);

		useProjectStore.getState().selectProject(projectId);
		expect(useProjectStore.getState().activeProjectId).toBe(projectId);
	});

	it("resolves environment variables in text", () => {
		useProjectStore.getState().createProject("Env Test");
		const project = activeProject();
		const env = project.environments[0];
		expect(env).toBeDefined();
		if (!env) return;

		useProjectStore.getState().setActiveEnvironment(project.id, env.id);
		const variable = env.variables[0];
		expect(variable).toBeDefined();
		if (!variable) return;

		useProjectStore
			.getState()
			.updateEnvironmentVariable(
				env.id,
				variable.id,
				"HOST",
				"api.example.com",
				true,
			);

		const resolved = useProjectStore
			.getState()
			.resolveVariables("https://{{HOST}}/v1");
		expect(resolved).toBe("https://api.example.com/v1");
	});

	it("creates and duplicates each creatable protocol type", () => {
		useProjectStore.getState().createProject("All Types");
		const rootId = activeProject().root.id;
		const types = [
			"request",
			"websocket",
			"graphql",
			"socketio",
			"mqtt",
			"grpc",
			"sse",
		] as const;

		for (const type of types) {
			const id = useProjectStore
				.getState()
				.addItem(type, rootId, `Test ${type}`);
			const before = activeProject().root.children.length;
			useProjectStore.getState().duplicateItem(id);
			const after = activeProject().root.children;
			expect(after.length).toBe(before + 1);
			const dup = after.find((c) => c.id !== id && c.type === type);
			expect(dup?.type).toBe(type);
			expect(dup?.name).toContain("(copy)");
		}
	});
});
