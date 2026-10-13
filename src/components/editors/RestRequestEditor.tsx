import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { GiTeapot } from "react-icons/gi";
import { TbArrowDown, TbCircleX, TbInfoCircle } from "react-icons/tb";
import type {
	ApiResponse,
	Cookie,
	Methods,
	ResponseRenderer,
} from "../../bindings";
import {
	type AuthType,
	type BodyType,
	type RestStreamEvent,
	cancelRestRequest,
	decodeBody,
	decodeBodyAsJson,
	getOAuth2TokenCached,
	parseCurlCommand,
	sendRequest,
} from "../../reqhelpers/rest";
import { useProjectStore } from "../../stores/projectStore";
import { useToastStore } from "../../stores/toastStore";
import type { KeyValueItem, Project, RequestFile } from "../../types/project";
import { formatBytes, getStatusColor, STATUS_TEXT } from "../../utils/format";
import { playSuccessChime } from "../../utils/sounds";
import { CodeViewer } from "../CodeMirror";
import { KeyValueTable } from "../KeyValueTable";
import { MethodSelector } from "../MethodSelector";
import { ProtocolToggle } from "../ProtocolToggle";
import { SizePopover } from "../popovers/SizePopover";
import { StatusPopover } from "../popovers/StatusPopover";
import { TimingPopover } from "../popovers/TimingPopover";
import { RequestOverview } from "../RequestOverview";
import { Dialog, UrlInput } from "../ui";
import { AuthEditor } from "./AuthEditor";
import { BodyEditor } from "./BodyEditor";
import { EditorRequestBar } from "./EditorRequestBar";
import {
	EDITOR_PRIMARY_BUTTON_CLASS,
	editorTabButtonClass,
} from "./editorRequestBarStyles";
export interface RestRequestEditorHandle {
	send: () => void;
}

type ExtendedResponseRenderer = ResponseRenderer | "Decompressed";

interface RestRequestEditorProps {
	activeRequest: RequestFile;
	activeProject: Project | null;
	loading: boolean;
	startLoading: (id: string) => void;
	stopLoading: (id: string) => void;
	onSendSuccess: (requestId: string) => void;
	onOpenProjectSettings: () => void;
}

const STREAM_MAX_EVENTS = 2000;
const STREAM_FLUSH_MS = 50;
const STREAM_LINE_HEIGHT = 18;
const STREAM_TOOLING_ENABLED = true;

function buildQueryString(
	params: Record<string, string | undefined>,
	disabledKeys: Set<string> = new Set(),
): string {
	const enabledParams = Object.entries(params).filter(
		([key, value]) => !disabledKeys.has(key) && value !== undefined,
	) as [string, string][];

	if (enabledParams.length === 0) return "";

	const queryParts = enabledParams
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => {
			const encodedKey = encodeURIComponent(key);
			const rawValue = value || "";

			if (rawValue.includes("{{")) {
				let result = "";
				let lastIndex = 0;
				const regex = /\{\{[^}]+\}\}/g;
				let match: RegExpExecArray | null = regex.exec(rawValue);
				while (match !== null) {
					result += encodeURIComponent(rawValue.slice(lastIndex, match.index));
					result += match[0];
					lastIndex = regex.lastIndex;
					match = regex.exec(rawValue);
				}
				result += encodeURIComponent(rawValue.slice(lastIndex));
				return `${encodedKey}=${result}`;
			}
			return `${encodedKey}=${encodeURIComponent(rawValue)}`;
		});

	return queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
}

function normalizeResolvedUrl(url: string): string {
	try {
		const parsed = new URL(url);
		// Keep protocol separator (`://`) intact and normalize only pathname slashes.
		parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
		return parsed.toString();
	} catch {
		return url;
	}
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function toHexPreview(bytes: Uint8Array, maxBytes = 512): string {
	const chunk = bytes.slice(0, maxBytes);
	const hex = Array.from(chunk)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join(" ");
	return hex;
}

export const RestRequestEditor = forwardRef<
	RestRequestEditorHandle,
	RestRequestEditorProps
>(function RestRequestEditor(
	{
		activeRequest,
		activeProject,
		loading,
		startLoading,
		stopLoading,
		onSendSuccess,
		onOpenProjectSettings,
	},
	ref,
) {
	const updateItem = useProjectStore((s) => s.updateItem);
	const renameItem = useProjectStore((s) => s.renameItem);
	const setRequestResponse = useProjectStore((s) => s.setRequestResponse);
	const addToRecentRequests = useProjectStore((s) => s.addToRecentRequests);
	const resolveVariables = useProjectStore((s) => s.resolveVariables);
	const getActiveEnvironmentVariables = useProjectStore(
		(s) => s.getActiveEnvironmentVariables,
	);
	const { addToast } = useToastStore();

	const [activeTab, setActiveTab] = useState<
		"overview" | "params" | "authorization" | "body" | "headers" | "cookies"
	>("overview");
	const [responseTab, setResponseTab] =
		useState<ExtendedResponseRenderer>("Raw");
	const [responseDetailTab, setResponseDetailTab] = useState<
		"headers" | "cookies" | "redirects"
	>("headers");
	const [curlInput, setCurlInput] = useState("");
	const [showCurlImport, setShowCurlImport] = useState(false);
	const [mainSplitX, setMainSplitX] = useState(50);
	const [responseSplitY, setResponseSplitY] = useState(60);
	const [isResizingMain, setIsResizingMain] = useState(false);
	const [isResizingResponse, setIsResizingResponse] = useState(false);
	const mainPanelRef = useRef<HTMLDivElement>(null);
	const responsePanelRef = useRef<HTMLDivElement>(null);

	const [disabledItems, setDisabledItems] = useState<Set<string>>(new Set());

	const [showTimingPopover, setShowTimingPopover] = useState(false);
	const [showSizePopover, setShowSizePopover] = useState(false);
	const [showStatusPopover, setShowStatusPopover] = useState(false);
	const [activeRedirectStatusIndex, setActiveRedirectStatusIndex] = useState<
		number | null
	>(null);
	const statusRef = useRef<HTMLButtonElement>(null);
	const redirectStatusRefs = useRef<Record<number, HTMLButtonElement | null>>(
		{},
	);
	const timingRef = useRef<HTMLButtonElement>(null);
	const sizeRef = useRef<HTMLButtonElement>(null);

	// Helper functions to convert between header formats
	const headersToKeyValueItems = useCallback((): KeyValueItem[] => {
		const items: KeyValueItem[] = [];
		const existingItems = activeRequest.headerItems || [];

		// Create a map of existing items by key for quick lookup
		const existingMap = new Map<string, KeyValueItem>();
		for (const item of existingItems) {
			existingMap.set(item.key, item);
		}

		// Convert headers to KeyValueItems, preserving enabled state from existing items
		for (const [key, value] of Object.entries(activeRequest.request.headers)) {
			const existing = existingMap.get(key);
			items.push({
				id: existing?.id || crypto.randomUUID(),
				key,
				value: value || "",
				description: existing?.description || "",
				enabled: existing?.enabled ?? true,
			});
		}

		return items;
	}, [activeRequest.request.headers, activeRequest.headerItems]);

	const cookiesToKeyValueItems = useCallback((): KeyValueItem[] => {
		const items: KeyValueItem[] = [];
		const existingItems = activeRequest.cookieItems || [];

		// Create a map of existing items by cookie name for quick lookup
		const existingMap = new Map<string, KeyValueItem>();
		for (const item of existingItems) {
			existingMap.set(item.key, item);
		}

		// Convert cookies to KeyValueItems, preserving enabled state from existing items
		for (let i = 0; i < activeRequest.request.cookies.length; i++) {
			const cookie = activeRequest.request.cookies[i];
			const existing = existingMap.get(cookie.name);
			items.push({
				id: existing?.id || crypto.randomUUID(),
				key: cookie.name,
				value: cookie.value,
				description: `${cookie.domain || ""} ${cookie.path || ""}`.trim(),
				enabled: existing?.enabled ?? true,
			});
		}

		return items;
	}, [activeRequest.request.cookies, activeRequest.cookieItems]);

	const keyValueItemsToHeaders = useCallback(
		(items: KeyValueItem[]): Record<string, string> => {
			const headers: Record<string, string> = {};
			for (const item of items) {
				if (item.key.trim()) {
					headers[item.key] = item.value;
				}
			}
			return headers;
		},
		[],
	);

	const keyValueItemsToCookies = useCallback(
		(items: KeyValueItem[]): Cookie[] => {
			const cookies: Cookie[] = [];
			for (const item of items) {
				if (item.key.trim()) {
					cookies.push({
						name: item.key,
						value: item.value,
						domain: null,
						path: null,
						expires: null,
						http_only: null,
						secure: null,
					});
				}
			}
			return cookies;
		},
		[],
	);
	const timingTimeoutRef = useRef<number | null>(null);
	const sizeTimeoutRef = useRef<number | null>(null);
	const statusTimeoutRef = useRef<number | null>(null);
	const redirectStatusTimeoutRef = useRef<number | null>(null);

	const [showInvalidVarDialog, setShowInvalidVarDialog] = useState(false);
	const [showCurlOverwriteDialog, setShowCurlOverwriteDialog] = useState(false);
	const [pendingCurlCommand, setPendingCurlCommand] = useState<string | null>(
		null,
	);
	const [isSendHovered, setIsSendHovered] = useState(false);
	const [streamEvents, setStreamEvents] = useState<RestStreamEvent[]>([]);
	const streamAutoScroll = true;
	const streamPaused = false;
	const [streamPanelTab, setStreamPanelTab] = useState<"timeline" | "raw">(
		"timeline",
	);
	const [virtualStart, setVirtualStart] = useState(0);
	const activeCancelKeyRef = useRef<string | null>(null);
	const streamBodyRef = useRef<HTMLDivElement>(null);
	const streamPausedBufferRef = useRef<RestStreamEvent[]>([]);
	const streamBatchQueueRef = useRef<RestStreamEvent[]>([]);
	const streamFlushTimerRef = useRef<number | null>(null);
	const streamArchiveRef = useRef<string[]>([]);

	useEffect(() => {
		// If redirects disappear after a new request, fall back to headers tab.
		if (
			responseDetailTab === "redirects" &&
			(activeRequest.response?.redirects?.length ?? 0) === 0
		) {
			setResponseDetailTab("headers");
		}
	}, [activeRequest.response?.redirects, responseDetailTab]);

	useEffect(() => {
		if (!STREAM_TOOLING_ENABLED) return;
		let active = true;
		let unlisten: null | (() => void) = null;
		const flushQueue = () => {
			streamFlushTimerRef.current = null;
			const batch = streamBatchQueueRef.current;
			if (batch.length === 0) return;
			streamBatchQueueRef.current = [];
			setStreamEvents((prev) => {
				const droppedCount = Math.max(
					prev.length + batch.length - STREAM_MAX_EVENTS,
					0,
				);
				if (droppedCount > 0) {
					const dropped = prev.slice(0, droppedCount);
					const archived = dropped
						.filter((ev) => ev.kind === "Chunk")
						.map((ev) => ev.chunk_text_preview ?? "")
						.filter(Boolean);
					if (archived.length > 0) {
						streamArchiveRef.current.push(...archived);
					}
				}
				const next = [...prev, ...batch].slice(-STREAM_MAX_EVENTS);
				return next;
			});
		};
		void import("@tauri-apps/api/event").then(async ({ listen }) => {
			unlisten = await listen<RestStreamEvent>("rest://stream", (event) => {
				if (!active) return;
				const payload = event.payload;
				const keyPrefix = `${activeRequest.id}:`;
				if (!payload.request_key.startsWith(keyPrefix)) return;
				if (streamPaused) {
					streamPausedBufferRef.current.push(payload);
					return;
				}
				streamBatchQueueRef.current.push(payload);
				if (streamFlushTimerRef.current == null) {
					streamFlushTimerRef.current = window.setTimeout(
						flushQueue,
						STREAM_FLUSH_MS,
					);
				}
			});
		});
		return () => {
			active = false;
			if (streamFlushTimerRef.current != null) {
				clearTimeout(streamFlushTimerRef.current);
				streamFlushTimerRef.current = null;
			}
			if (unlisten) unlisten();
		};
	}, [activeRequest.id, streamPaused]);

	useEffect(() => {
		if (!STREAM_TOOLING_ENABLED) return;
		if (!streamAutoScroll) return;
		const el = streamBodyRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [streamEvents, streamAutoScroll]);

	useEffect(() => {
		if (!STREAM_TOOLING_ENABLED) return;
		if (streamPaused) return;
		if (streamPausedBufferRef.current.length === 0) return;
		setStreamEvents((prev) => [...prev, ...streamPausedBufferRef.current]);
		streamPausedBufferRef.current = [];
	}, [streamPaused]);

	const rawStreamLines = useMemo(
		() =>
			streamEvents
				.filter((ev) => ev.kind === "Chunk")
				.map(
					(ev) => ev.chunk_text_preview ?? `[base64] ${ev.chunk_base64 ?? ""}`,
				),
		[streamEvents],
	);
	const visibleRawStreamLines = useMemo(() => {
		const viewportRows = 200;
		return rawStreamLines.slice(virtualStart, virtualStart + viewportRows);
	}, [rawStreamLines, virtualStart]);
	const streamTimelineRows = useMemo(() => {
		return streamEvents.map((event) => {
			const isChunk = event.kind === "Chunk";
			const text = isChunk
				? (event.chunk_text_preview ?? "").trim() || "(empty chunk)"
				: event.kind === "Error"
					? event.error || "Stream error"
					: event.kind === "Completed"
						? "Stream completed"
						: event.kind === "Cancelled"
							? "Stream cancelled"
							: "Stream started";
			return {
				id: `${event.kind}-${event.timestamp_ms}-${event.chunk_base64?.slice(0, 8) ?? ""}`,
				kind: event.kind,
				text,
				time: new Date(event.timestamp_ms).toLocaleTimeString(),
				rowClass:
					event.kind === "Chunk"
						? "bg-green/10"
						: event.kind === "Error"
							? "bg-red/10"
							: event.kind === "Completed"
								? "bg-white/3"
								: "",
				iconClass:
					event.kind === "Chunk"
						? "text-green"
						: event.kind === "Error"
							? "text-red"
							: "text-white/45",
			};
		});
	}, [streamEvents]);
	const shouldShowStreamPanel = useMemo(() => {
		if (!STREAM_TOOLING_ENABLED) return false;
		if (streamEvents.length === 0) return false;
		if (loading) return true;
		const contentType =
			activeRequest.response?.detected_content_type?.toLowerCase() ?? "";
		// Chunked transport also carries ordinary bodies; only stream formats
		// should keep the timeline after the response has completed.
		return (
			contentType.includes("text/event-stream") ||
			contentType.includes("application/x-ndjson") ||
			contentType.includes("application/ndjson")
		);
	}, [activeRequest.response, loading, streamEvents.length]);

	const handleTimingEnter = () => {
		if (timingTimeoutRef.current) {
			clearTimeout(timingTimeoutRef.current);
			timingTimeoutRef.current = null;
		}
		if (statusTimeoutRef.current) {
			clearTimeout(statusTimeoutRef.current);
			statusTimeoutRef.current = null;
		}
		setShowStatusPopover(false);
		setShowSizePopover(false);
		setShowTimingPopover(true);
	};

	const handleTimingLeave = () => {
		timingTimeoutRef.current = window.setTimeout(() => {
			setShowTimingPopover(false);
		}, 200);
	};

	const handleSizeEnter = () => {
		if (sizeTimeoutRef.current) {
			clearTimeout(sizeTimeoutRef.current);
			sizeTimeoutRef.current = null;
		}
		if (statusTimeoutRef.current) {
			clearTimeout(statusTimeoutRef.current);
			statusTimeoutRef.current = null;
		}
		setShowStatusPopover(false);
		setShowTimingPopover(false);
		setShowSizePopover(true);
	};

	const handleSizeLeave = () => {
		sizeTimeoutRef.current = window.setTimeout(() => {
			setShowSizePopover(false);
		}, 200);
	};

	const handleStatusEnter = () => {
		if (statusTimeoutRef.current) {
			clearTimeout(statusTimeoutRef.current);
			statusTimeoutRef.current = null;
		}
		if (redirectStatusTimeoutRef.current) {
			clearTimeout(redirectStatusTimeoutRef.current);
			redirectStatusTimeoutRef.current = null;
		}
		setActiveRedirectStatusIndex(null);
		setShowTimingPopover(false);
		setShowSizePopover(false);
		setShowStatusPopover(true);
	};

	const handleStatusLeave = () => {
		statusTimeoutRef.current = window.setTimeout(() => {
			setShowStatusPopover(false);
		}, 200);
	};

	const handleRedirectStatusEnter = (index: number) => {
		if (redirectStatusTimeoutRef.current) {
			clearTimeout(redirectStatusTimeoutRef.current);
			redirectStatusTimeoutRef.current = null;
		}
		setShowStatusPopover(false);
		setShowTimingPopover(false);
		setShowSizePopover(false);
		setActiveRedirectStatusIndex(index);
	};

	const handleRedirectStatusLeave = () => {
		redirectStatusTimeoutRef.current = window.setTimeout(() => {
			setActiveRedirectStatusIndex(null);
		}, 200);
	};

	const isItemEnabled = useCallback(
		(type: "param" | "header" | "cookie", key: string) => {
			if (type === "header") {
				const headerItems =
					activeRequest.headerItems || headersToKeyValueItems();
				const item = headerItems.find((item) => item.key === key);
				return item?.enabled ?? true;
			} else if (type === "cookie") {
				const cookieItems =
					activeRequest.cookieItems || cookiesToKeyValueItems();
				const item = cookieItems.find((item) => item.key === key);
				return item?.enabled ?? true;
			}
			// For params, still use disabledItems for now
			return !disabledItems.has(`${activeRequest.id}:${type}:${key}`);
		},
		[
			activeRequest.id,
			activeRequest.headerItems,
			activeRequest.cookieItems,
			headersToKeyValueItems,
			cookiesToKeyValueItems,
			disabledItems,
		],
	);

	const getComputedHeaders = useCallback(() => {
		const computed: Array<{
			id: string;
			key: string;
			value: string;
			description: string;
			enabled: boolean;
			locked?: boolean;
			onValueClick?: () => void;
		}> = [];

		const body = activeRequest.request.body;
		let contentType: string | null = null;
		if (body !== "None") {
			if ("Raw" in body) contentType = body.Raw.content_type;
			else if ("FormUrlEncoded" in body)
				contentType = "application/x-www-form-urlencoded";
			else if ("Multipart" in body) contentType = "multipart/form-data";
			else if ("Binary" in body) contentType = "application/octet-stream";
		}

		if (contentType) {
			computed.push({
				id: "computed:content-type",
				key: "Content-Type",
				value: contentType,
				description: "Generated from body",
				enabled: true,
				locked: true,
				onValueClick: () => setActiveTab("body"),
			});
		}

		// Check cookies from cookieItems for enabled state
		const cookieItems = activeRequest.cookieItems || cookiesToKeyValueItems();
		const enabledCookies = cookieItems.filter((item) => item.enabled);
		if (enabledCookies.length > 0) {
			computed.push({
				id: "computed:cookie",
				key: "Cookie",
				value: `${enabledCookies.length} cookie${enabledCookies.length > 1 ? "s" : ""}`,
				description: "Generated from cookies",
				enabled: true,
				locked: true,
				onValueClick: () => setActiveTab("cookies"),
			});
		}

		const auth = activeRequest.request.auth;
		if (auth !== "None") {
			let authValue = "";
			let authTypeLabel = "";
			if ("Basic" in auth) {
				authValue = `Basic user:pass`;
				authTypeLabel = "Basic Auth";
			} else if ("Bearer" in auth) {
				authValue = `Bearer ${auth.Bearer.token ? `${auth.Bearer.token.substring(0, 10)}...` : ""}`;
				authTypeLabel = "Bearer Token";
			} else if ("ApiKey" in auth && auth.ApiKey.add_to === "Header") {
				computed.push({
					id: "computed:auth",
					key: auth.ApiKey.key || "API-Key",
					value: auth.ApiKey.value || "",
					description: "Generated from Auth",
					enabled: true,
					locked: true,
					onValueClick: () => setActiveTab("authorization"),
				});
			} else if ("Digest" in auth) {
				authValue = "Digest <challenge-response>";
				authTypeLabel = "Digest Auth";
			} else if ("Ntlm" in auth) {
				authValue = "NTLM <challenge-response>";
				authTypeLabel = "NTLM Auth";
			} else if ("OAuth2" in auth) {
				authValue = `Bearer ${auth.OAuth2.token ? `${auth.OAuth2.token.substring(0, 10)}...` : ""}`;
				authTypeLabel = "OAuth 2.0";
			}

			if (authValue) {
				computed.push({
					id: "computed:auth",
					key: "Authorization",
					value: authValue,
					description: `Generated from ${authTypeLabel}`,
					enabled: true,
					locked: true,
					onValueClick: () => setActiveTab("authorization"),
				});
			}
		}

		return computed;
	}, [activeRequest, cookiesToKeyValueItems]);

	useEffect(() => {
		if (activeRequest && activeTab === "body") {
			const method = activeRequest.request.method;
			if (method === "GET" || method === "HEAD") {
				setActiveTab("params");
			}
		}
	}, [activeRequest.id, activeTab, activeRequest]);

	useEffect(() => {
		if (activeRequest.response) {
			const preferred: ResponseRenderer[] = [
				"Json",
				"Xml",
				"Html",
				"HtmlPreview",
				"Image",
				"Audio",
				"Video",
				"Pdf",
			];
			const bestRenderer =
				(activeRequest.response.content_encoding &&
				!activeRequest.response.decoded_by_curl
					? "Decompressed"
					: null) ||
				preferred.find((r) =>
					activeRequest.response?.available_renderers.includes(r),
				) ||
				activeRequest.response.available_renderers[0] ||
				"Raw";
			setResponseTab(bestRenderer as ExtendedResponseRenderer);
		}
	}, [activeRequest.response]);

	const handleMainMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizingMain(true);
	}, []);

	const handleResponseMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizingResponse(true);
	}, []);

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (isResizingMain && mainPanelRef.current) {
				const rect = mainPanelRef.current.getBoundingClientRect();
				const newPercent = ((e.clientX - rect.left) / rect.width) * 100;
				setMainSplitX(Math.max(30, Math.min(70, newPercent)));
			}
			if (isResizingResponse && responsePanelRef.current) {
				const rect = responsePanelRef.current.getBoundingClientRect();
				const newPercent = ((e.clientY - rect.top) / rect.height) * 100;
				setResponseSplitY(Math.max(20, Math.min(80, newPercent)));
			}
		};

		const handleMouseUp = () => {
			setIsResizingMain(false);
			setIsResizingResponse(false);
		};

		if (isResizingMain || isResizingResponse) {
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = isResizingMain ? "col-resize" : "row-resize";
			document.body.style.userSelect = "none";
		}

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
	}, [isResizingMain, isResizingResponse]);

	const checkForInvalidVars = useCallback(() => {
		const available = getActiveEnvironmentVariables().map((v) => v.key);

		const hasInvalid = (text: string) => {
			if (!text) return false;
			const regex = /\{\{([^}]+)\}\}/g;
			let match: RegExpExecArray | null = regex.exec(text);
			while (match !== null) {
				const varName = match[1];
				if (!available.includes(varName)) return true;
				match = regex.exec(text);
			}
			return false;
		};

		if (hasInvalid(activeRequest.request.url)) return true;

		for (const [key, value] of Object.entries(activeRequest.request.headers)) {
			if (isItemEnabled("header", key)) {
				if (hasInvalid(value || "")) return true;
			}
		}

		const auth = activeRequest.request.auth;
		if (auth !== "None") {
			if ("Basic" in auth) {
				if (
					hasInvalid(auth.Basic.username) ||
					hasInvalid(auth.Basic.password)
				) {
					return true;
				}
			} else if ("Bearer" in auth) {
				if (hasInvalid(auth.Bearer.token)) return true;
			} else if ("ApiKey" in auth) {
				if (hasInvalid(auth.ApiKey.key) || hasInvalid(auth.ApiKey.value)) {
					return true;
				}
			} else if ("Digest" in auth) {
				if (
					hasInvalid(auth.Digest.username) ||
					hasInvalid(auth.Digest.password)
				) {
					return true;
				}
			} else if ("Ntlm" in auth) {
				if (
					hasInvalid(auth.Ntlm.username) ||
					hasInvalid(auth.Ntlm.password) ||
					hasInvalid(auth.Ntlm.domain || "")
				) {
					return true;
				}
			} else if ("MutualTls" in auth) {
				if (
					hasInvalid(auth.MutualTls.cert_pem) ||
					hasInvalid(auth.MutualTls.key_pem) ||
					hasInvalid(auth.MutualTls.key_passphrase || "") ||
					hasInvalid(auth.MutualTls.ca_pem || "")
				) {
					return true;
				}
			} else if ("OAuth2" in auth) {
				if (
					hasInvalid(auth.OAuth2.token || "") ||
					hasInvalid(auth.OAuth2.client_id || "") ||
					hasInvalid(auth.OAuth2.client_secret || "") ||
					hasInvalid(auth.OAuth2.token_url || "") ||
					hasInvalid(auth.OAuth2.auth_url || "") ||
					hasInvalid(auth.OAuth2.redirect_uri || "") ||
					hasInvalid(auth.OAuth2.refresh_token || "") ||
					(auth.OAuth2.scopes?.some((scope) => hasInvalid(scope)) ?? false)
				) {
					return true;
				}
			}
		}

		return false;
	}, [activeRequest, getActiveEnvironmentVariables, isItemEnabled]);

	const resolveAuthVariables = useCallback(
		(auth: AuthType): AuthType => {
			if (auth === "None") return "None";
			if ("Basic" in auth) {
				return {
					Basic: {
						username: resolveVariables(auth.Basic.username),
						password: resolveVariables(auth.Basic.password),
					},
				};
			}
			if ("Bearer" in auth) {
				return { Bearer: { token: resolveVariables(auth.Bearer.token) } };
			}
			if ("ApiKey" in auth) {
				return {
					ApiKey: {
						key: resolveVariables(auth.ApiKey.key),
						value: resolveVariables(auth.ApiKey.value),
						add_to: auth.ApiKey.add_to,
					},
				};
			}
			if ("Digest" in auth) {
				return {
					Digest: {
						username: resolveVariables(auth.Digest.username),
						password: resolveVariables(auth.Digest.password),
					},
				};
			}
			if ("Ntlm" in auth) {
				return {
					Ntlm: {
						username: resolveVariables(auth.Ntlm.username),
						password: resolveVariables(auth.Ntlm.password),
						domain: auth.Ntlm.domain
							? resolveVariables(auth.Ntlm.domain)
							: null,
					},
				};
			}
			if ("MutualTls" in auth) {
				return {
					MutualTls: {
						cert_pem: resolveVariables(auth.MutualTls.cert_pem),
						key_pem: resolveVariables(auth.MutualTls.key_pem),
						key_passphrase: auth.MutualTls.key_passphrase
							? resolveVariables(auth.MutualTls.key_passphrase)
							: null,
						ca_pem: auth.MutualTls.ca_pem
							? resolveVariables(auth.MutualTls.ca_pem)
							: null,
						insecure_skip_verify: auth.MutualTls.insecure_skip_verify ?? null,
					},
				};
			}
			if ("OAuth2" in auth) {
				return {
					OAuth2: {
						...auth.OAuth2,
						token: auth.OAuth2.token
							? resolveVariables(auth.OAuth2.token)
							: null,
						client_id: auth.OAuth2.client_id
							? resolveVariables(auth.OAuth2.client_id)
							: null,
						client_secret: auth.OAuth2.client_secret
							? resolveVariables(auth.OAuth2.client_secret)
							: null,
						token_url: auth.OAuth2.token_url
							? resolveVariables(auth.OAuth2.token_url)
							: null,
						auth_url: auth.OAuth2.auth_url
							? resolveVariables(auth.OAuth2.auth_url)
							: null,
						redirect_uri: auth.OAuth2.redirect_uri
							? resolveVariables(auth.OAuth2.redirect_uri)
							: null,
						scopes:
							auth.OAuth2.scopes?.map((scope) => resolveVariables(scope)) ??
							null,
						refresh_token: auth.OAuth2.refresh_token
							? resolveVariables(auth.OAuth2.refresh_token)
							: null,
					},
				};
			}
			return auth;
		},
		[resolveVariables],
	);

	const performSend = useCallback(async () => {
		const requestId = activeRequest.id;
		const cancelKey = `${requestId}:${Date.now()}`;
		if (STREAM_TOOLING_ENABLED) {
			setStreamEvents([]);
			streamPausedBufferRef.current = [];
			streamBatchQueueRef.current = [];
			streamArchiveRef.current = [];
			setVirtualStart(0);
			setStreamPanelTab("timeline");
		}
		activeCancelKeyRef.current = cancelKey;
		startLoading(requestId);
		try {
			const resolvedUrl = normalizeResolvedUrl(
				resolveVariables(activeRequest.request.url),
			);

			// Filter headers based on enabled state in headerItems
			const resolvedHeaders: Record<string, string> = {};
			const headerItems = activeRequest.headerItems || headersToKeyValueItems();
			for (const item of headerItems) {
				if (item.enabled && item.key.trim()) {
					resolvedHeaders[item.key] = resolveVariables(item.value);
				}
			}

			// Filter cookies based on enabled state in cookieItems
			const cookieItems = activeRequest.cookieItems || cookiesToKeyValueItems();
			const resolvedCookies = cookieItems
				.filter((item) => item.enabled && item.key.trim())
				.map((item) => ({
					name: item.key,
					value: resolveVariables(item.value),
					domain: null,
					path: null,
					expires: null,
					http_only: null,
					secure: null,
				}));

			const isGet = activeRequest.request.method === "GET";

			const hasProjectAuth =
				activeProject?.authorization && activeProject.authorization !== "None";
			let effectiveAuth: AuthType = activeRequest.request.auth ?? "None";
			if (
				activeRequest.useInheritedAuth &&
				hasProjectAuth &&
				activeProject != null
			) {
				effectiveAuth = activeProject.authorization!;
			}
			effectiveAuth = resolveAuthVariables(effectiveAuth);
			if (
				effectiveAuth !== "None" &&
				typeof effectiveAuth === "object" &&
				"OAuth2" in effectiveAuth
			) {
				const oauth = effectiveAuth.OAuth2;
				if (
					oauth.mode === "ClientCredentials" &&
					oauth.token_url &&
					oauth.client_id
				) {
					const tokenResponse = await getOAuth2TokenCached({
						token_url: resolveVariables(oauth.token_url),
						client_id: resolveVariables(oauth.client_id),
						client_secret: oauth.client_secret
							? resolveVariables(oauth.client_secret)
							: null,
						scopes: oauth.scopes?.map((s) => resolveVariables(s)) ?? null,
						grant_type: "client_credentials",
						refresh_token: oauth.refresh_token ?? null,
					});
					effectiveAuth = {
						OAuth2: {
							...oauth,
							token: tokenResponse.access_token,
							refresh_token: tokenResponse.refresh_token,
						},
					};
				}
			}

			const resolvedRequest = {
				...activeRequest.request,
				url: resolvedUrl,
				headers: resolvedHeaders,
				cookies: resolvedCookies,
				query_params: {},
				body: isGet ? "None" : activeRequest.request.body,
				auth: effectiveAuth,
				request_label: activeRequest.name,
				cancel_key: cancelKey,
			};
			const resp = await sendRequest(resolvedRequest);
			setRequestResponse(activeRequest.id, resp);
			addToRecentRequests(activeRequest.id);

			if (resp.status < 200 || resp.status >= 300) {
				addToast(
					`Request failed: ${resp.status} ${STATUS_TEXT[resp.status] || resp.status_text}`,
					"error",
				);
			}

			const preferred: ResponseRenderer[] = [
				"Json",
				"Xml",
				"Html",
				"HtmlPreview",
				"Image",
				"Audio",
				"Video",
				"Pdf",
			];
			const bestRenderer =
				(resp.content_encoding && !resp.decoded_by_curl
					? "Decompressed"
					: null) ||
				preferred.find((r) => resp.available_renderers.includes(r)) ||
				resp.available_renderers[0] ||
				"Raw";
			setResponseTab(bestRenderer as ExtendedResponseRenderer);

			if (activeTab === "overview") {
				setActiveTab("body");
			}

			onSendSuccess(requestId);
			playSuccessChime();
		} catch (err: unknown) {
			console.error(err);
			const errorMessage =
				err instanceof Error
					? err.message
					: err != null
						? String(err)
						: "Unknown error";
			const errorResponse: ApiResponse = {
				status: 0,
				status_text: "Error",
				headers: {},
				cookies: [],
				body_base64: btoa(errorMessage),
				decoded_body_base64: null,
				timing: {
					total_ms: 0,
					dns_lookup_ms: 0,
					tcp_handshake_ms: 0,
					tls_handshake_ms: 0,
					transfer_start_ms: 0,
					ttfb_ms: 0,
					content_download_ms: 0,
				},
				request_size: { headers_bytes: 0, body_bytes: 0, total_bytes: 0 },
				response_size: { headers_bytes: 0, body_bytes: 0, total_bytes: 0 },
				redirects: [],
				remote_addr: null,
				http_version: "",
				available_renderers: ["Raw"],
				detected_content_type: "text/plain",
				protocol_used: "",
				content_encoding: null,
				transfer_encoding: null,
				decoded_by_curl: true,
				raw_body_available: false,
				error: errorMessage,
			};
			setRequestResponse(requestId, errorResponse);
			setResponseTab("Raw");
		} finally {
			activeCancelKeyRef.current = null;
			setIsSendHovered(false);
			stopLoading(requestId);
		}
	}, [
		activeRequest,
		activeProject,
		activeTab,
		addToast,
		addToRecentRequests,
		cookiesToKeyValueItems,
		headersToKeyValueItems,
		onSendSuccess,
		resolveVariables,
		resolveAuthVariables,
		setRequestResponse,
		startLoading,
		stopLoading,
	]);

	const handleSend = useCallback(() => {
		if (checkForInvalidVars()) {
			setShowInvalidVarDialog(true);
		} else {
			void performSend();
		}
	}, [checkForInvalidVars, performSend]);

	const handleStop = useCallback(async () => {
		const cancelKey = activeCancelKeyRef.current;
		if (!cancelKey) return;
		try {
			await cancelRestRequest(cancelKey);
		} catch (err) {
			console.error(err);
			addToast("Failed to stop request", "error");
		}
	}, [addToast]);

	useImperativeHandle(ref, () => ({ send: handleSend }), [handleSend]);

	function processCurlImport(command: string) {
		try {
			const parsed = parseCurlCommand(command);
			updateItem(activeRequest.id, "request", (r) => ({
				...r,
				request: {
					...r.request,
					...parsed,
					headers: { ...r.request.headers, ...parsed.headers },
				},
			}));
			addToast("Imported from cURL", "success");
		} catch {
			addToast("Failed to parse cURL command", "error");
		}
	}

	function handleImportCurl() {
		const parsed = parseCurlCommand(curlInput);
		updateItem(activeRequest.id, "request", (r) => ({
			...r,
			request: {
				...r.request,
				...parsed,
				headers: { ...r.request.headers, ...parsed.headers },
			},
		}));
		setShowCurlImport(false);
		setCurlInput("");
	}

	function handleAutoImportCurl(command: string) {
		const isEmpty =
			!activeRequest.request.url &&
			activeRequest.request.method === "GET" &&
			Object.keys(activeRequest.request.headers).length === 0 &&
			Object.keys(activeRequest.request.query_params || {}).length === 0 &&
			activeRequest.request.body === "None" &&
			activeRequest.request.auth === "None";

		if (!isEmpty) {
			setPendingCurlCommand(command);
			setShowCurlOverwriteDialog(true);
			return;
		}

		processCurlImport(command);
	}

	function updateUrl(url: string) {
		const params: Record<string, string> = {};
		const hashIndex = url.indexOf("#");
		const urlWithoutHash = hashIndex !== -1 ? url.slice(0, hashIndex) : url;
		const fragment = hashIndex !== -1 ? url.slice(hashIndex) : "";
		const queryIndex = urlWithoutHash.indexOf("?");
		if (queryIndex !== -1) {
			const queryString = urlWithoutHash.slice(queryIndex + 1);
			queryString.split("&").forEach((part) => {
				if (!part) return;
				const eqIndex = part.indexOf("=");
				if (eqIndex === -1) {
					params[decodeURIComponent(part)] = "";
				} else {
					const key = decodeURIComponent(part.slice(0, eqIndex));
					const rawValue = part.slice(eqIndex + 1);
					if (rawValue.includes("{{")) {
						params[key] = rawValue;
					} else {
						try {
							params[key] = decodeURIComponent(rawValue);
						} catch {
							params[key] = rawValue;
						}
					}
				}
			});
		}

		updateItem(activeRequest.id, "request", (r) => ({
			...r,
			request: {
				...r.request,
				url: url + fragment,
				query_params: params,
			},
		}));
	}

	function updateMethod(method: Methods) {
		updateItem(activeRequest.id, "request", (r) => ({
			...r,
			request: { ...r.request, method },
		}));

		if ((method === "GET" || method === "HEAD") && activeTab === "body") {
			setActiveTab("params");
		}
	}

	function updateBody(body: BodyType) {
		updateItem(activeRequest.id, "request", (r) => ({
			...r,
			request: { ...r.request, body },
		}));
	}

	function updateAuth(auth: AuthType) {
		updateItem(activeRequest.id, "request", (r) => ({
			...r,
			request: { ...r.request, auth },
		}));
	}

	function updateAuthInheritance(inherit: boolean) {
		updateItem(activeRequest.id, "request", (r) => ({
			...r,
			useInheritedAuth: inherit,
		}));
	}

	function renderResponseBody() {
		if (!activeRequest.response) return null;

		const body = decodeBody(activeRequest.response);
		const response = activeRequest.response;
		const requestId = activeRequest.id;
		const detectedContentType = (
			response.detected_content_type || ""
		).toLowerCase();
		const isBinaryContent =
			detectedContentType.includes("application/octet-stream") ||
			detectedContentType.includes("application/x-binary");
		const hasEncodedPayload = Boolean(response.content_encoding);
		const decodedBody =
			response.decoded_body_base64 != null
				? new TextDecoder().decode(base64ToBytes(response.decoded_body_base64))
				: null;
		const effectiveDecodedBody =
			response.decoded_by_curl || !hasEncodedPayload ? body : decodedBody;

		switch (responseTab) {
			case "Decompressed":
				return hasEncodedPayload ? (
					<div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
						<div className="border-white/10 border-b bg-white/2 px-3 py-2 text-[11px] text-white/60">
							Decompressed from `Content-Encoding:{" "}
							{response.content_encoding || "unknown"}`{" "}
							{response.decoded_by_curl
								? "(decoded by transport)"
								: "(decoded in renderer)"}
						</div>
						<div className="h-full min-h-0 flex-1 overflow-auto">
							{effectiveDecodedBody != null ? (
								<pre
									className="select-text whitespace-pre-wrap break-all p-4 font-mono text-sm text-white/80"
									style={{ fontFamily: "'IBM Plex Mono', monospace" }}
								>
									{effectiveDecodedBody}
								</pre>
							) : (
								<div className="p-3 text-white/40 text-xs">
									Could not decompress this content encoding in transport.
								</div>
							)}
						</div>
					</div>
				) : (
					<div className="p-3 text-white/40 text-xs">
						No encoded payload available for decompression preview.
					</div>
				);
			case "Json": {
				const source = effectiveDecodedBody ?? body;
				let formatted = source;
				try {
					const parsed = JSON.parse(source);
					formatted = JSON.stringify(parsed, null, 2);
				} catch {
					const fallback = decodeBodyAsJson(response);
					if (fallback) {
						formatted = JSON.stringify(fallback, null, 2);
					}
				}
				return (
					<div className="h-full min-h-0 flex-1">
						<CodeViewer
							key={`${requestId}-json`}
							code={formatted}
							language="json"
						/>
					</div>
				);
			}
			case "Xml":
				return (
					<div className="h-full min-h-0 flex-1">
						<CodeViewer key={`${requestId}-xml`} code={body} language="xml" />
					</div>
				);
			case "Html":
				return (
					<div className="h-full min-h-0 flex-1">
						<CodeViewer key={`${requestId}-html`} code={body} language="html" />
					</div>
				);
			case "HtmlPreview": {
				const requestUrl = activeRequest.request.url;
				let baseUrl = "";
				try {
					const url = new URL(
						requestUrl.startsWith("http")
							? requestUrl
							: `https://${requestUrl}`,
					);
					baseUrl = `${url.protocol}//${url.host}`;
				} catch {
					/* ignore */
				}

				let previewHtml = body;
				if (baseUrl && !body.includes("<base")) {
					if (body.includes("<head>")) {
						previewHtml = body.replace(
							"<head>",
							`<head><base href="${baseUrl}/">`,
						);
					} else if (body.includes("<head ")) {
						previewHtml = body.replace(
							/<head\s[^>]*>/,
							`$&<base href="${baseUrl}/">`,
						);
					} else if (
						body.includes("<!DOCTYPE") ||
						body.includes("<!doctype") ||
						body.includes("<html")
					) {
						previewHtml = body.replace(
							/(<html[^>]*>)/i,
							`$1<head><base href="${baseUrl}/"></head>`,
						);
					} else {
						previewHtml = `<base href="${baseUrl}/">${body}`;
					}
				}

				return (
					<div className="h-full min-h-0 flex-1 overflow-hidden rounded bg-white">
						<iframe
							key={`${requestId}-preview`}
							srcDoc={previewHtml}
							className="h-full w-full border-0"
							sandbox="allow-same-origin allow-scripts"
							title="HTML Preview"
						/>
					</div>
				);
			}
			case "Image": {
				const base64 = response.body_base64;
				const contentType = response.detected_content_type || "image/png";
				return (
					<div className="flex h-full min-h-0 flex-1 items-center justify-center p-4">
						<img
							src={`data:${contentType};base64,${base64}`}
							alt="Response"
							className="max-h-full max-w-full object-contain"
						/>
					</div>
				);
			}
			case "Audio": {
				const base64 = response.body_base64;
				const contentType = response.detected_content_type || "audio/mpeg";
				return (
					<div className="flex h-full min-h-0 flex-1 items-center justify-center p-4">
						<audio controls className="w-full max-w-md">
							<source
								src={`data:${contentType};base64,${base64}`}
								type={contentType}
							/>
							Your browser does not support audio playback.
						</audio>
					</div>
				);
			}
			case "Video": {
				const base64 = response.body_base64;
				const contentType = response.detected_content_type || "video/mp4";
				return (
					<div className="flex h-full min-h-0 flex-1 items-center justify-center p-4">
						<video controls className="max-h-full max-w-full">
							<source
								src={`data:${contentType};base64,${base64}`}
								type={contentType}
							/>
							Your browser does not support video playback.
						</video>
					</div>
				);
			}
			case "Pdf": {
				const base64 = response.body_base64;
				return (
					<div className="h-full min-h-0 flex-1">
						<iframe
							src={`data:application/pdf;base64,${base64}`}
							className="h-full w-full border-0"
							title="PDF Preview"
						/>
					</div>
				);
			}
			default:
				if (isBinaryContent) {
					const rawBytes = base64ToBytes(response.body_base64);
					const hexPreview = toHexPreview(rawBytes);
					const totalBytes = rawBytes.byteLength;
					const shownBytes = Math.min(totalBytes, 512);
					return (
						<div className="h-full min-h-0 flex-1 overflow-auto p-4">
							<div className="mb-3 rounded-md border border-white/10 bg-white/3 px-3 py-2 text-white/70 text-xs">
								Binary response ({formatBytes(totalBytes)}). Showing first{" "}
								{shownBytes} byte
								{shownBytes === 1 ? "" : "s"} as hex.
							</div>
							<pre
								className="select-text whitespace-pre-wrap break-all font-mono text-sm text-white/80"
								style={{ fontFamily: "'IBM Plex Mono', monospace" }}
							>
								{hexPreview}
							</pre>
						</div>
					);
				}
				return (
					<div className="h-full min-h-0 flex-1 overflow-auto">
						<pre
							className="select-text whitespace-pre-wrap break-all p-4 font-mono text-sm text-white/80"
							style={{ fontFamily: "'IBM Plex Mono', monospace" }}
						>
							{body}
						</pre>
					</div>
				);
		}
	}

	function getRendererLabel(renderer: ExtendedResponseRenderer): string {
		switch (renderer) {
			case "Decompressed":
				return "Decoded";
			case "Raw":
				return "Raw";
			case "Json":
				return "JSON";
			case "Xml":
				return "XML";
			case "Html":
				return "HTML";
			case "HtmlPreview":
				return "Preview";
			case "Image":
				return "Image";
			case "Audio":
				return "Audio";
			case "Video":
				return "Video";
			case "Pdf":
				return "PDF";
			default:
				return renderer;
		}
	}

	const envKeys = getActiveEnvironmentVariables().map((v) => v.key);

	return (
		<div
			data-testid="rest-editor"
			className="flex min-h-0 flex-1 flex-col overflow-hidden"
		>
			<EditorRequestBar
				loading={loading}
				leading={
					<MethodSelector
						value={activeRequest.request.method}
						onChange={updateMethod}
					/>
				}
				urlField={
					<UrlInput
						data-testid="rest-url-input"
						value={activeRequest.request.url}
						onChange={(v) => updateUrl(v)}
						onCurlPaste={handleAutoImportCurl}
						onInvalidInput={(msg) => addToast(msg, "info")}
						placeholder="Enter URL or paste cURL"
						availableVariables={envKeys}
						disabled={loading}
					/>
				}
				action={
					<button
						type="button"
						data-testid="rest-send-button"
						onClick={() => {
							if (loading) {
								void handleStop();
								return;
							}
							handleSend();
						}}
						onMouseEnter={() => setIsSendHovered(true)}
						onMouseLeave={() => setIsSendHovered(false)}
						disabled={!activeRequest.request.url}
						className={`${EDITOR_PRIMARY_BUTTON_CLASS} ${
							loading && !isSendHovered
								? "opacity-50"
								: loading && isSendHovered
									? "bg-red hover:bg-red/90"
									: ""
						}`}
					>
						{loading ? (isSendHovered ? "Stop" : "Sending") : "Send"}
					</button>
				}
			/>

			<div ref={mainPanelRef} className="flex flex-1 overflow-hidden">
				<div
					className="flex flex-col overflow-hidden p-2 pl-4"
					style={{
						width:
							activeRequest.response && activeTab !== "overview"
								? `${mainSplitX}%`
								: "100%",
					}}
				>
					<div className="flex shrink-0 items-center gap-1 py-2">
						{(
							[
								"overview",
								"params",
								"authorization",
								"body",
								"headers",
								"cookies",
							] as const
						)
							.filter(
								(tab) =>
									tab !== "body" || activeRequest.request.method !== "GET",
							)
							.map((tab) => (
								<button
									key={tab}
									type="button"
									onClick={() => setActiveTab(tab)}
									className={editorTabButtonClass(activeTab === tab)}
								>
									{tab === "overview"
										? "Overview"
										: tab.charAt(0).toUpperCase() + tab.slice(1)}
								</button>
							))}
					</div>

					<div className="relative flex-1 overflow-auto">
						{loading && (
							<div className="absolute inset-0 z-10 cursor-not-allowed bg-background/30" />
						)}
						{activeTab === "authorization" && (
							<AuthEditor
								auth={activeRequest.request.auth}
								onChange={updateAuth}
								availableVariables={envKeys}
								projectAuth={activeProject?.authorization}
								isInherited={activeRequest.useInheritedAuth ?? true}
								onInheritChange={updateAuthInheritance}
								onOpenProjectSettings={onOpenProjectSettings}
							/>
						)}
						{activeTab === "params" && (
							<div className="flex min-h-0 flex-1 flex-col">
								<KeyValueTable
									items={Object.entries(activeRequest.request.query_params).map(
										([key, value]) => ({
											id: key,
											key: key,
											value: value || "",
											description: "",
											enabled: !disabledItems.has(
												`${activeRequest.id}:param:${key}`,
											),
										}),
									)}
									onChange={(items) => {
										const newQueryParams: Record<string, string> = {};
										const newDisabledItems = new Set<string>();
										const activeId = activeRequest.id;

										items.forEach((item) => {
											if (item.key.trim() || item.value.trim()) {
												newQueryParams[item.key] = item.value;
												if (!item.enabled) {
													newDisabledItems.add(`${activeId}:param:${item.key}`);
												}
											}
										});

										setDisabledItems(newDisabledItems);
										updateItem(activeId, "request", (r) => {
											const urlWithoutQuery = r.request.url.split("?")[0];
											const fullHashIndex = urlWithoutQuery.indexOf("#");
											const baseUrl =
												fullHashIndex !== -1
													? urlWithoutQuery.slice(0, fullHashIndex)
													: urlWithoutQuery;
											const urlFragment = r.request.url.includes("#")
												? r.request.url.slice(r.request.url.indexOf("#"))
												: "";
											const queryString = buildQueryString(
												newQueryParams,
												newDisabledItems,
											);
											return {
												...r,
												request: {
													...r.request,
													query_params: newQueryParams,
													url: baseUrl + queryString + urlFragment,
												},
											};
										});
									}}
									availableVariables={envKeys}
									placeholder={{
										key: "Param",
										value: "Value",
									}}
								/>
							</div>
						)}
						{activeTab === "headers" && (
							<div className="flex min-h-0 flex-1 flex-col">
								<KeyValueTable
									items={[
										...getComputedHeaders(),
										...(activeRequest.headerItems || headersToKeyValueItems()),
									]}
									onChange={(items) => {
										const userItems = items.filter(
											(i) => !i.id.startsWith("computed:"),
										);
										const newHeaders = keyValueItemsToHeaders(userItems);

										updateItem(activeRequest.id, "request", (r) => ({
											...r,
											request: { ...r.request, headers: newHeaders },
											headerItems: userItems,
										}));
									}}
									availableVariables={envKeys}
									placeholder={{
										key: "Header",
										value: "Value",
									}}
								/>
							</div>
						)}
						{activeTab === "cookies" && (
							<div className="flex min-h-0 flex-1 flex-col">
								<KeyValueTable
									items={activeRequest.cookieItems || cookiesToKeyValueItems()}
									onChange={(items) => {
										const newCookies = keyValueItemsToCookies(items);

										updateItem(activeRequest.id, "request", (r) => ({
											...r,
											request: { ...r.request, cookies: newCookies },
											cookieItems: items,
										}));
									}}
									showDescription={false}
									placeholder={{
										key: "Cookie",
										value: "value",
									}}
								/>
							</div>
						)}
						{activeTab === "body" && (
							<BodyEditor
								body={activeRequest.request.body}
								onChange={updateBody}
								availableVariables={envKeys}
							/>
						)}
						{activeTab === "overview" && (
							<RequestOverview
								activeRequest={activeRequest}
								onRun={() => {
									handleSend();
									setActiveTab("body");
								}}
								onUpdateName={(name) => renameItem(activeRequest.id, name)}
								onUpdateDescription={(description) => {
									updateItem(activeRequest.id, "request", (r) => ({
										...r,
										description,
									}));
								}}
								onUpdatePropertyDescription={(key, description) => {
									updateItem(activeRequest.id, "request", (r) => ({
										...r,
										propertyDescriptions: {
											...(r.propertyDescriptions || {}),
											[key]: description,
										},
									}));
								}}
								onSwitchToBody={() => setActiveTab("body")}
							/>
						)}
					</div>
				</div>

				{activeRequest.response && activeTab !== "overview" && (
					<>
						<div
							className="group flex w-2 shrink-0 cursor-col-resize items-center justify-center"
							onMouseDown={handleMainMouseDown}
						>
							<div className="h-full w-px transition-colors group-hover:bg-accent/50" />
						</div>

						<div
							ref={responsePanelRef}
							className="flex flex-1 flex-col overflow-hidden border-white/10 border-l bg-inset"
						>
							<div className="flex shrink-0 items-center justify-between p-2 px-4">
								<span className="font-medium text-white text-xs">Response</span>
								{STREAM_TOOLING_ENABLED && shouldShowStreamPanel ? (
									<div className="flex items-center gap-1">
										<button
											type="button"
											onClick={() => setStreamPanelTab("timeline")}
											className={`rounded-md px-2 py-1 font-medium text-xs transition-colors ${
												streamPanelTab === "timeline"
													? "bg-accent/10 text-accent"
													: "text-white/60 hover:bg-white/5 hover:text-white/80"
											}`}
										>
											Stream
										</button>
										<button
											type="button"
											onClick={() => setStreamPanelTab("raw")}
											className={`rounded-md px-2 py-1 font-medium text-xs transition-colors ${
												streamPanelTab === "raw"
													? "bg-accent/10 text-accent"
													: "text-white/60 hover:bg-white/5 hover:text-white/80"
											}`}
										>
											Raw
										</button>
									</div>
								) : (
									<div className="flex gap-1">
										{[
											...new Set<ExtendedResponseRenderer>([
												...((activeRequest.response?.available_renderers || [
													"Raw",
												]) as ExtendedResponseRenderer[]),
												...(activeRequest.response?.content_encoding &&
												!activeRequest.response?.decoded_by_curl
													? (["Decompressed"] as ExtendedResponseRenderer[])
													: []),
												...(activeRequest.response?.content_encoding &&
												!activeRequest.response?.decoded_by_curl &&
												(activeRequest.response?.detected_content_type
													?.toLowerCase()
													.includes("json") ??
													false)
													? (["Json"] as ExtendedResponseRenderer[])
													: []),
											]),
										].map((renderer) => (
											<button
												key={renderer}
												type="button"
												onClick={() => setResponseTab(renderer)}
												className={`rounded-md px-2 py-0.5 font-medium text-xs transition-colors ${
													responseTab === renderer
														? "bg-accent/10 text-accent"
														: "text-white/60 hover:text-white/50"
												}`}
											>
												{getRendererLabel(renderer)}
											</button>
										))}
									</div>
								)}
							</div>

							<div
								className="overflow-auto"
								style={{ height: `${responseSplitY}%` }}
							>
								<div className="h-full">
									{STREAM_TOOLING_ENABLED && shouldShowStreamPanel ? (
										<div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
											<div
												ref={streamBodyRef}
												className="flex-1 overflow-auto"
												onScroll={(e) => {
													const top = e.currentTarget.scrollTop;
													setVirtualStart(
														Math.max(
															Math.floor(top / STREAM_LINE_HEIGHT) - 20,
															0,
														),
													);
												}}
											>
												{streamPanelTab === "timeline" ? (
													<div className="flex min-h-full flex-col justify-end border-white/5 border-b">
														{streamTimelineRows.map((row) => (
															<div
																key={row.id}
																className={`flex items-start gap-2 border-white/5 border-b px-3 py-2 text-xs last:border-b-0 ${row.rowClass}`}
															>
																<div
																	className={`mt-0.5 shrink-0 ${row.iconClass}`}
																>
																	{row.kind === "Chunk" ? (
																		<TbArrowDown size={13} />
																	) : row.kind === "Error" ? (
																		<TbCircleX size={13} />
																	) : (
																		<TbInfoCircle size={13} />
																	)}
																</div>
																<div className="min-w-0 flex-1">
																	<div className="mb-0.5 flex items-center gap-2 text-[10px] text-white/40">
																		<span className="font-semibold text-white/55">
																			{row.kind}
																		</span>
																		<span>{row.time}</span>
																	</div>
																	<pre className="whitespace-pre-wrap break-all font-mono text-white/70 text-xs">
																		{row.text}
																	</pre>
																</div>
															</div>
														))}
													</div>
												) : (
													<div
														className="px-3 py-2 font-mono text-xs text-white/50"
														style={{
															height: `${rawStreamLines.length * STREAM_LINE_HEIGHT}px`,
															position: "relative",
														}}
													>
														<div
															style={{
																position: "absolute",
																top: `${virtualStart * STREAM_LINE_HEIGHT}px`,
																left: 0,
																right: 0,
															}}
														>
															{visibleRawStreamLines.map((line, idx) => (
																<div
																	key={`${virtualStart + idx}-${line.slice(0, 20)}`}
																	className="whitespace-pre-wrap break-all"
																>
																	{line}
																</div>
															))}
														</div>
													</div>
												)}
											</div>
										</div>
									) : (
										renderResponseBody()
									)}
								</div>
							</div>

							<div className="flex shrink-0 items-center justify-between border-white/10 border-y bg-inset pr-2">
								<div className="flex items-center gap-1">
									<div className="hidden">
										<span className="bg-[#22c55e]/20" />
										<span className="bg-[#eab308]/20" />
										<span className="bg-[#f97316]/20" />
										<span className="bg-[#ef4444]/20" />
									</div>
									<button
										ref={statusRef}
										type="button"
										data-testid="rest-response-status"
										onMouseEnter={handleStatusEnter}
										onMouseLeave={handleStatusLeave}
										className={`flex items-center gap-1.5 px-3 py-2 font-bold text-xs ${activeRequest.response?.status === 418 ? "rainbow-bg rainbow-text" : ""}`}
										style={
											activeRequest.response?.status !== 418
												? {
														color: getStatusColor(
															activeRequest.response?.status || 0,
														),
														backgroundColor: `${getStatusColor(activeRequest.response?.status || 0)}20`,
													}
												: undefined
										}
									>
										{activeRequest.response?.status === 418 && (
											<GiTeapot size={14} />
										)}
										{activeRequest.response?.status}{" "}
										{STATUS_TEXT[activeRequest.response?.status || 0] ||
											activeRequest.response?.status_text}
									</button>

									<button
										ref={timingRef}
										type="button"
										onMouseEnter={handleTimingEnter}
										onMouseLeave={handleTimingLeave}
										className="cursor-default rounded px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
									>
										{(() => {
											const ms = activeRequest.response?.timing?.total_ms ?? 0;
											return ms >= 1000
												? `${(ms / 1000).toFixed(2)} s`
												: `${ms.toFixed(2)} ms`;
										})()}
									</button>
									<span className="text-white/20">•</span>

									<button
										ref={sizeRef}
										type="button"
										onMouseEnter={handleSizeEnter}
										onMouseLeave={handleSizeLeave}
										className="cursor-default rounded px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
									>
										{formatBytes(
											activeRequest.response?.response_size?.total_bytes || 0,
										)}
									</button>
								</div>

								<ProtocolToggle />

								{timingRef.current && activeRequest.response?.timing && (
									<TimingPopover
										timing={activeRequest.response.timing}
										anchorRef={timingRef as React.RefObject<HTMLElement>}
										open={showTimingPopover}
										onClose={() => setShowTimingPopover(false)}
										onMouseEnter={handleTimingEnter}
										onMouseLeave={handleTimingLeave}
									/>
								)}

								{sizeRef.current && activeRequest.response?.response_size && (
									<SizePopover
										requestSize={activeRequest.response.request_size}
										responseSize={activeRequest.response.response_size}
										anchorRef={sizeRef as React.RefObject<HTMLElement>}
										open={showSizePopover}
										onClose={() => setShowSizePopover(false)}
										onMouseEnter={handleSizeEnter}
										onMouseLeave={handleSizeLeave}
									/>
								)}
								{statusRef.current &&
									activeRequest.response?.status != null && (
										<StatusPopover
											statusCode={activeRequest.response.status}
											statusText={activeRequest.response.status_text}
											anchorRef={statusRef as React.RefObject<HTMLElement>}
											open={showStatusPopover}
											onClose={() => setShowStatusPopover(false)}
											onMouseEnter={handleStatusEnter}
											onMouseLeave={handleStatusLeave}
										/>
									)}
							</div>

							<div
								className="h-[1px] shrink-0 cursor-row-resize bg-white/10 transition-colors"
								onMouseDown={handleResponseMouseDown}
							/>

							<div
								className="flex flex-col overflow-hidden bg-card"
								style={{ height: `${100 - responseSplitY}%` }}
							>
								<div className="flex shrink-0 items-center gap-1 p-2">
									<button
										type="button"
										onClick={() => setResponseDetailTab("headers")}
										className={`rounded-md px-2 py-0.5 font-medium text-xs transition-colors ${
											responseDetailTab === "headers"
												? "bg-accent/10 text-accent"
												: "text-white/60 hover:text-white/50"
										}`}
									>
										Headers
									</button>
									<button
										type="button"
										onClick={() => setResponseDetailTab("cookies")}
										className={`rounded-md px-2 py-0.5 font-medium text-xs transition-colors ${
											responseDetailTab === "cookies"
												? "bg-accent/10 text-accent"
												: "text-white/60 hover:text-white/50"
										}`}
									>
										Cookies
									</button>
									{(activeRequest.response?.redirects?.length ?? 0) > 0 && (
										<button
											type="button"
											onClick={() => setResponseDetailTab("redirects")}
											className={`rounded-md px-2 py-0.5 font-medium text-xs transition-colors ${
												responseDetailTab === "redirects"
													? "bg-accent/10 text-accent"
													: "text-white/60 hover:text-white/50"
											}`}
										>
											Redirects
										</button>
									)}
								</div>

								<div className="flex-1 overflow-auto">
									{responseDetailTab === "headers" && (
										<div className="min-h-0 flex-1">
											<table className="w-full border-collapse font-mono text-xs">
												<tbody>
													{Object.entries(
														activeRequest.response?.headers || {},
													).map(([k, v]) => (
														<tr
															key={k}
															className="border-white/5 border-b transition-colors hover:bg-white/2"
														>
															<td className="w-1/3 min-w-[120px] border-white/5 border-r px-3 py-2 align-top text-white/40">
																{k}
															</td>
															<td className="whitespace-pre-wrap break-all px-3 py-2 align-top text-white/60">
																{v}
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									)}
									{responseDetailTab === "cookies" && (
										<div className="min-h-0 flex-1">
											{activeRequest.response?.cookies &&
											activeRequest.response.cookies.length > 0 ? (
												<KeyValueTable
													items={activeRequest.response.cookies.map((c, i) => ({
														id: `${i}`,
														key: c.name,
														value: c.value,
														description:
															`${c.domain || ""} ${c.path || ""}`.trim(),
														enabled: true,
													}))}
													onChange={() => {}}
													readOnly={true}
													showDescription={false}
												/>
											) : (
												<div className="p-3 text-white/30 text-xs">
													No cookies
												</div>
											)}
										</div>
									)}
									{responseDetailTab === "redirects" && (
										<div className="min-h-0 flex-1">
											<div className="relative p-2">
												{(activeRequest.response?.redirects?.length ?? 0) >
													0 && (
													<div className="pointer-events-none absolute top-6 right-0 bottom-6 left-[26px] w-px bg-white/15" />
												)}
												<div className="relative flex gap-3 px-2 py-2 transition-colors hover:bg-white/2">
													<div className="relative flex w-5 shrink-0 justify-center">
														<div className="z-10 mt-1 h-2.5 w-2.5 rounded-full border border-yellow-400 bg-yellow-400" />
													</div>
													<div className="min-w-0 flex-1">
														<div className="flex items-center gap-2">
															<div className="select-text break-all font-mono text-[11px] text-white/60">
																{resolveVariables(activeRequest.request.url)}
															</div>
														</div>
													</div>
												</div>
												{(activeRequest.response?.redirects || []).map(
													(redirect, index, arr) => {
														const isLast = index === arr.length - 1;
														return (
															<div
																key={`${redirect.status}-${redirect.url}-${index}`}
																className="relative flex gap-3 px-2 py-2 transition-colors hover:bg-white/2"
															>
																<div className="relative flex w-5 shrink-0 justify-center">
																	<div
																		className={`z-10 mt-1 h-2.5 w-2.5 rounded-full border ${
																			isLast
																				? "border-accent bg-accent"
																				: "border-accent/40 bg-card"
																		}`}
																	/>
																</div>
																<div className="min-w-0 flex-1">
																	<div className="flex items-center gap-2">
																		<button
																			ref={(el) => {
																				redirectStatusRefs.current[index] = el;
																			}}
																			type="button"
																			onMouseEnter={() =>
																				handleRedirectStatusEnter(index)
																			}
																			onMouseLeave={handleRedirectStatusLeave}
																			className="rounded px-1.5 py-0.5 font-medium text-[11px]"
																			style={{
																				color: getStatusColor(redirect.status),
																				backgroundColor: `${getStatusColor(redirect.status)}20`,
																			}}
																		>
																			{redirect.status}
																		</button>
																		<div className="select-text break-all font-mono text-[11px] text-white/60">
																			{redirect.url}
																		</div>
																	</div>
																</div>
															</div>
														);
													},
												)}
												{activeRedirectStatusIndex != null &&
													redirectStatusRefs.current[
														activeRedirectStatusIndex
													] &&
													activeRequest.response?.redirects?.[
														activeRedirectStatusIndex
													] && (
														<StatusPopover
															statusCode={
																activeRequest.response.redirects[
																	activeRedirectStatusIndex
																].status
															}
															anchorRef={{
																current:
																	redirectStatusRefs.current[
																		activeRedirectStatusIndex
																	],
															}}
															open={true}
															onClose={() => setActiveRedirectStatusIndex(null)}
															onMouseEnter={() =>
																handleRedirectStatusEnter(
																	activeRedirectStatusIndex,
																)
															}
															onMouseLeave={handleRedirectStatusLeave}
														/>
													)}
											</div>
										</div>
									)}
								</div>
							</div>
						</div>
					</>
				)}
			</div>

			{showCurlImport && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
					<div className="w-full max-w-xl rounded-xl border border-border bg-card p-5">
						<div className="mb-4 font-medium text-sm">Import cURL Command</div>
						<textarea
							value={curlInput}
							onChange={(e) => setCurlInput(e.target.value)}
							placeholder="curl https://api.example.com -H 'Content-Type: application/json'"
							className="h-40 w-full resize-none rounded-lg border border-border bg-inset p-3 font-mono text-sm focus:border-accent/50 focus:outline-none"
						/>
						<div className="mt-4 flex justify-end gap-3">
							<button
								type="button"
								onClick={() => setShowCurlImport(false)}
								className="rounded-lg bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/15"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleImportCurl}
								className="rounded-lg bg-accent px-4 py-2 text-sm transition-colors hover:bg-accent/90"
							>
								Import
							</button>
						</div>
					</div>
				</div>
			)}

			<Dialog
				isOpen={showInvalidVarDialog}
				title="Invalid Environment Variables"
				description="Some environment variables in your request could not be resolved. Do you want to send the request anyway?"
				confirmLabel="Send Anyway"
				onConfirm={() => {
					setShowInvalidVarDialog(false);
					void performSend();
				}}
				onCancel={() => setShowInvalidVarDialog(false)}
				isDestructive={false}
			/>
			<Dialog
				isOpen={showCurlOverwriteDialog}
				title="Overwrite Request?"
				description="This request already contains data. importing a cURL command will overwrite existing values. Do you want to continue?"
				confirmLabel="Overwrite"
				onConfirm={() => {
					if (pendingCurlCommand) {
						processCurlImport(pendingCurlCommand);
					}
					setShowCurlOverwriteDialog(false);
					setPendingCurlCommand(null);
				}}
				onCancel={() => {
					setShowCurlOverwriteDialog(false);
					setPendingCurlCommand(null);
				}}
				isDestructive={true}
			/>
		</div>
	);
});
