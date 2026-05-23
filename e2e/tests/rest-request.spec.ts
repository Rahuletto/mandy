import { expect, test } from "@playwright/test";
import { sidebar } from "../helpers";

async function createProject(
	page: import("@playwright/test").Page,
	name: string,
) {
	await page.goto("/");
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await page.getByTestId("project-selector").click();
	await page.getByTestId("create-project-menu").click();
	await page.getByTestId("new-project-source-blank").click();
	await page.getByTestId("new-project-name").fill(name);
	await page.getByTestId("new-project-submit").click();
	await expect(sidebar(page)).toBeVisible();
}

async function fillRestUrl(page: import("@playwright/test").Page, url: string) {
	const input = page.getByTestId("rest-url-input");
	await input.click();
	await input.fill(url);
}

test.describe("REST request flow", () => {
	test("creates a REST request and receives a mocked response", async ({
		page,
	}) => {
		await createProject(page, "REST E2E");

		await page.getByTestId("new-request-button").click();
		await page.getByTestId("request-type-request").click();

		await expect(page.getByTestId("rest-editor")).toBeVisible();
		await fillRestUrl(page, "https://httpbin.org/get");
		await page.getByTestId("rest-send-button").click();

		await expect(page.getByTestId("rest-response-status")).toContainText(
			"200",
			{ timeout: 15_000 },
		);
	});
});
