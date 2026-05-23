import { expect, test } from "@playwright/test";
import {
	addItemFromSidebar,
	CREATABLE_REQUEST_TYPES,
	createBlankProject,
	createRequestFromWelcome,
	DEFAULT_ITEM_NAMES,
	sidebar,
} from "../helpers";

for (const type of CREATABLE_REQUEST_TYPES) {
	test.describe(`${type} editor`, () => {
		test.beforeEach(async ({ page }) => {
			await createBlankProject(page, `${type} E2E`);
		});

		test(`opens ${type} editor from welcome`, async ({ page }) => {
			await createRequestFromWelcome(page, type);
			const editorTestId =
				type === "request" ? "rest-editor" : `${type}-editor`;
			await expect(page.getByTestId(editorTestId)).toBeVisible();
			await expect(
				sidebar(page).getByText(DEFAULT_ITEM_NAMES[type], { exact: true }),
			).toBeVisible();
		});
	});
}

test.describe("sidebar add menu", () => {
	test.beforeEach(async ({ page }) => {
		await createBlankProject(page, "Sidebar Menu");
	});

	test("creates REST via sidebar + menu", async ({ page }) => {
		await addItemFromSidebar(page, "REST Request");
		await expect(page.getByTestId("rest-editor")).toBeVisible();
	});

	test("creates MQTT via sidebar + menu", async ({ page }) => {
		await addItemFromSidebar(page, "MQTT");
		await expect(page.getByTestId("mqtt-editor")).toBeVisible();
	});
});
