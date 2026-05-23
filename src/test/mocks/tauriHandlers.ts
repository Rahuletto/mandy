import type { InvokeArgs } from "@tauri-apps/api/core";
import type { ApiResponse } from "../../bindings";

const zeroTiming = {
	total_ms: 42,
	dns_lookup_ms: 1,
	tcp_handshake_ms: 2,
	tls_handshake_ms: 3,
	transfer_start_ms: 4,
	ttfb_ms: 10,
	content_download_ms: 22,
};

const zeroSize = { headers_bytes: 0, body_bytes: 0, total_bytes: 0 };

export function createMockApiResponse(
	overrides?: Partial<ApiResponse>,
): ApiResponse {
	const body = JSON.stringify({ ok: true, test: true });
	const bodyBytes = new TextEncoder().encode(body);
	let body_base64 = "";
	if (typeof Buffer !== "undefined") {
		body_base64 = Buffer.from(bodyBytes).toString("base64");
	} else {
		let binary = "";
		for (const byte of bodyBytes) {
			binary += String.fromCharCode(byte);
		}
		body_base64 = btoa(binary);
	}

	return {
		status: 200,
		status_text: "OK",
		headers: { "content-type": "application/json" },
		cookies: [],
		body_base64,
		timing: zeroTiming,
		request_size: { headers_bytes: 120, body_bytes: 0, total_bytes: 120 },
		response_size: {
			headers_bytes: 48,
			body_bytes: bodyBytes.length,
			total_bytes: 48 + bodyBytes.length,
		},
		redirects: [],
		remote_addr: "127.0.0.1:443",
		http_version: "HTTP/2",
		available_renderers: ["Raw", "Json"],
		detected_content_type: "application/json",
		protocol_used: "HTTP/2",
		error: null,
		...overrides,
	};
}

/** Shared IPC mock for Vitest and Playwright (E2E) runs. */
export function createTauriMockHandler(): (
	cmd: string,
	payload?: InvokeArgs,
) => unknown {
	return (cmd, payload) => {
		switch (cmd) {
			case "rest_request":
				return createMockApiResponse();
			case "rest_cancel_request":
			case "set_dock_badge":
			case "ws_disconnect":
			case "mqtt_disconnect":
			case "sse_disconnect":
			case "sio_disconnect":
				return null;
			case "fetch_url":
				return {
					status: 200,
					body: "{}",
					headers: { "content-type": "application/json" },
				};
			case "ws_connect":
				return {
					connection_id: "test-ws-connection",
					protocol: null,
				};
			default:
				if (cmd.startsWith("plugin:")) {
					return null;
				}
				console.warn(
					`[test mock] unhandled IPC command: ${cmd}`,
					payload ?? {},
				);
				return null;
		}
	};
}

export { zeroSize, zeroTiming };
