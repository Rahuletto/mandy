import type { Page } from "@playwright/test";

export function sidebar(page: Page) {
	return page.getByTestId("sidebar");
}
