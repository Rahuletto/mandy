import { expect, test } from "@playwright/test";
import {
	createBlankProject,
	createRequestFromWelcome,
	sidebar,
} from "../helpers";

test.describe("Project tree", () => {
	test.beforeEach(async ({ page }) => {
		await createBlankProject(page, "Tree E2E");
	});

	test("creates a folder from welcome", async ({ page }) => {
		await page.getByRole("button", { name: "New Folder" }).click();
		await expect(sidebar(page).getByText("New Folder")).toBeVisible();
	});

	test("opens project overview settings", async ({ page }) => {
		await sidebar(page).getByTestId("sidebar-project-settings").click();
		await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Config" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Variables" })).toBeVisible();
	});

	test("returns to welcome via homepage control", async ({ page }) => {
		await createRequestFromWelcome(page, "request");
		await expect(page.getByTestId("rest-editor")).toBeVisible();
		await page.getByTestId("homepage-button").click();
		await expect(page.getByTestId("welcome-page")).toBeVisible();
	});
});
