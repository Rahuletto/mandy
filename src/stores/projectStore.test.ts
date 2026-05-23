import { describe, expect, it } from "vitest";
import { useProjectStore } from "./projectStore";

describe("useProjectStore", () => {
	it("creates projects and REST requests", () => {
		const projectId = useProjectStore.getState().createProject("Store Test");
		const requestId = useProjectStore
			.getState()
			.addItem("request", useProjectStore.getState().getActiveProject()!.root.id, "Ping");

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
		const project = useProjectStore.getState().getActiveProject()!;
		const envId = project.environments[0]!.id;
		useProjectStore.getState().setActiveEnvironment(project.id, envId);
		useProjectStore
			.getState()
			.updateEnvironmentVariable(
				envId,
				project.environments[0]!.variables[0]!.id,
				"HOST",
				"api.example.com",
				true,
			);

		const resolved = useProjectStore
			.getState()
			.resolveVariables("https://{{HOST}}/v1");
		expect(resolved).toBe("https://api.example.com/v1");
	});
});
