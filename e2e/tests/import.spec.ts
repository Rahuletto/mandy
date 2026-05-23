import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { sidebar } from "../helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const postmanFixture = path.join(__dirname, "../fixtures/minimal-postman.json");

test.describe("Project import", () => {
	test("imports a Postman collection when creating a project", async ({
		page,
	}) => {
		await page.goto("/");
		await page.evaluate(() => localStorage.clear());
		await page.reload();

		await page.getByTestId("project-selector").click();
		await page.getByTestId("create-project-menu").click();
		await page.getByTestId("new-project-source-postman").click();

		await page.locator('input[type="file"]').setInputFiles(postmanFixture);
		await expect(page.getByText("File Selected")).toBeVisible();
		await page.getByTestId("new-project-submit").click();

		await expect(page.getByTestId("new-project-modal")).toBeHidden();
		await expect(sidebar(page)).toBeVisible();
		await expect(sidebar(page)).toContainText("E2E Collection");
		await expect(sidebar(page).getByText("Get Users")).toBeVisible({
			timeout: 10_000,
		});
	});
});
