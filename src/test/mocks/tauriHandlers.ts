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

const MINIMAL_GRAPHQL_INTROSPECTION = {
	data: {
		__schema: {
			queryType: { name: "Query" },
			mutationType: null,
			subscriptionType: null,
			types: [],
		},
	},
};

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
		decoded_body_base64: null,
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
		content_encoding: null,
		transfer_encoding: null,
		decoded_by_curl: true,
		raw_body_available: false,
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
			case "rest_oauth2_token":
			case "set_dock_badge":
			case "ws_disconnect":
			case "ws_send":
			case "mqtt_disconnect":
			case "mqtt_publish":
			case "mqtt_subscribe":
			case "mqtt_unsubscribe":
			case "sse_disconnect":
			case "sio_disconnect":
			case "sio_emit":
				return null;
			case "sio_emit_with_ack":
				return { event: "test", data: "{}", timed_out: false };
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
			case "graphql_introspect":
				return {
					schema_json: JSON.stringify(MINIMAL_GRAPHQL_INTROSPECTION),
					error: null,
				};
			case "sio_connect":
				return {
					connection_id: "test-sio-connection",
					url: "http://localhost",
					namespace: "/",
					error: null,
				};
			case "mqtt_connect":
				return {
					connection_id: "test-mqtt-connection",
				};
			case "sse_connect":
				return {
					connection_id: "test-sse-connection",
				};
			case "grpc_call":
				return {
					status_code: 0,
					status_message: "OK",
					headers: { "content-type": "application/json" },
					body: "{}",
					trailers: {},
					timing_ms: 12,
					timing: zeroTiming,
					request_size: zeroSize,
					response_size: { headers_bytes: 0, body_bytes: 2, total_bytes: 2 },
					error: null,
				};
			default:
				if (cmd.startsWith("plugin:")) {
					return null;
				}
				if (process.env.VITE_E2E === "1" || process.env.VITEST) {
					console.warn(
						`[test mock] unhandled IPC command: ${cmd}`,
						payload ?? {},
					);
				}
				return null;
		}
	};
}

export { zeroSize, zeroTiming };
