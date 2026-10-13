import { emit } from "@tauri-apps/api/event";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RestStreamEvent } from "../../bindings";
import { getItemConfig } from "../../registry";
import { createMockApiResponse } from "../../test/mocks/tauriHandlers";
import { RestRequestEditor } from "./RestRequestEditor";

describe("REST response view", () => {
	it.each([
		["application/json", '{"ok":true}', false],
		["text/plain", "ordinary response", false],
		["text/event-stream", "data: hello\n\n", true],
		["application/x-ndjson", '{"first":1}\n{"second":2}\n', true],
		["application/ndjson", '{"first":1}\n{"second":2}\n', true],
	] as const)(
		"renders a completed chunked %s response in its appropriate view",
		async (contentType, body, streaming) => {
			const request = getItemConfig("request").createDefault({ id: "rest-1" });
			request.response = createMockApiResponse({
				body_base64: btoa(body),
				headers: {
					"content-type": contentType,
					"transfer-encoding": "chunked",
				},
				detected_content_type: contentType,
				transfer_encoding: "chunked",
				available_renderers:
					contentType === "application/json" ? ["Raw", "Json"] : ["Raw"],
			});
			render(
				<RestRequestEditor
					activeRequest={request}
					activeProject={null}
					loading={false}
					startLoading={vi.fn()}
					stopLoading={vi.fn()}
					onSendSuccess={vi.fn()}
					onOpenProjectSettings={vi.fn()}
				/>,
			);
			fireEvent.click(screen.getByRole("button", { name: "Headers" }));
			await act(async () => {
				// Subscription is installed through a dynamic import on mount.
				await new Promise((resolve) => setTimeout(resolve, 0));
			});

			await act(async () => {
				await emit<RestStreamEvent>("rest://stream", {
					request_key: "rest-1:123",
					kind: "Chunk",
					chunk_base64: btoa(body),
					chunk_text_preview: body,
					timestamp_ms: 123,
					error: null,
				});
				await emit<RestStreamEvent>("rest://stream", {
					request_key: "rest-1:123",
					kind: "Completed",
					chunk_base64: null,
					chunk_text_preview: null,
					timestamp_ms: 124,
					error: null,
				});
				// Let the editor's batched event updates reach the rendered view.
				await new Promise((resolve) => setTimeout(resolve, 100));
			});

			const streamTab = screen.queryByRole("button", {
				name: "Stream",
			});
			if (streaming) {
				expect(streamTab).toBeVisible();
				expect(screen.getByText("Stream completed")).toBeVisible();
			} else {
				expect(streamTab).not.toBeInTheDocument();
				if (contentType === "application/json") {
					expect(screen.getByRole("button", { name: "JSON" })).toBeVisible();
				}
				fireEvent.click(screen.getByRole("button", { name: "Raw" }));
				expect(screen.getByText(body, { exact: true })).toBeVisible();
			}
		},
	);
});
