import { expect, test } from "@playwright/test";
import { sidebar } from "../helpers";

test.describe("App shell", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => localStorage.clear());
		await page.reload();
	});

	test("shows welcome screen with no project selected", async ({ page }) => {
		await expect(page.getByTestId("welcome-page")).toBeVisible();
		await expect(page.getByTestId("new-request-button")).toBeVisible();
	});

	test("creates a blank project from the welcome flow", async ({ page }) => {
		await page.getByTestId("project-selector").click();
		await page.getByTestId("create-project-menu").click();
		await expect(page.getByTestId("new-project-modal")).toBeVisible();

		await page.getByTestId("new-project-source-blank").click();
		await page.getByTestId("new-project-name").fill("E2E Project");
		await page.getByTestId("new-project-submit").click();

		await expect(page.getByTestId("new-project-modal")).toBeHidden();
		await expect(sidebar(page)).toBeVisible();
		await expect(page.getByTestId("project-selector")).toContainText(
			"E2E Project",
		);
	});
});
