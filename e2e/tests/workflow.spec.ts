import { expect, test } from "@playwright/test";
import { addItemFromSidebar, createBlankProject, sidebar } from "../helpers";

test.describe("Workflow", () => {
	test.beforeEach(async ({ page }) => {
		await createBlankProject(page, "Workflow E2E");
	});

	test("creates a workflow from the sidebar menu", async ({ page }) => {
		await addItemFromSidebar(page, "New Workflow");
		await expect(page.getByTestId("workflow-editor")).toBeVisible();
		await expect(sidebar(page).getByText("New Workflow")).toBeVisible();
	});
});
