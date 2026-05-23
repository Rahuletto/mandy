import { expect, type Page } from "@playwright/test";

export function sidebar(page: Page) {
	return page.getByTestId("sidebar");
}

export async function resetApp(page: Page) {
	await page.goto("/");
	await page.evaluate(() => localStorage.clear());
	await page.reload();
}

export async function createBlankProject(page: Page, name: string) {
	await resetApp(page);
	await page.getByTestId("project-selector").click();
	await page.getByTestId("create-project-menu").click();
	await page.getByTestId("new-project-source-blank").click();
	await page.getByTestId("new-project-name").fill(name);
	await page.getByTestId("new-project-submit").click();
	await expect(page.getByTestId("new-project-modal")).toBeHidden();
	await expect(sidebar(page)).toBeVisible();
}

export async function createRequestFromWelcome(page: Page, type: string) {
	await page.getByTestId("new-request-button").click();
	await page.getByTestId(`request-type-${type}`).click();
}

export async function addItemFromSidebar(page: Page, menuLabel: string) {
	await sidebar(page).getByTestId("sidebar-add-button").click();
	await page.getByRole("button", { name: menuLabel }).click();
}

export const CREATABLE_REQUEST_TYPES = [
	"request",
	"websocket",
	"graphql",
	"socketio",
	"mqtt",
	"grpc",
	"sse",
] as const;

export type CreatableRequestType = (typeof CREATABLE_REQUEST_TYPES)[number];

export const DEFAULT_ITEM_NAMES: Record<CreatableRequestType, string> = {
	request: "New Request",
	websocket: "New WebSocket",
	graphql: "New GraphQL",
	socketio: "New Socket.IO",
	mqtt: "New MQTT",
	grpc: "New gRPC",
	sse: "New SSE",
};
