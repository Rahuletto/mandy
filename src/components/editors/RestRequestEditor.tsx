import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { GiTeapot } from "react-icons/gi";
import type { ApiResponse, Methods, ResponseRenderer } from "../../bindings";
import {
	type AuthType,
	type BodyType,
	decodeBody,
	decodeBodyAsJson,
	parseCurlCommand,
	sendRequest,
} from "../../reqhelpers/rest";
import { useProjectStore } from "../../stores/projectStore";
import { useToastStore } from "../../stores/toastStore";
import type { Project, RequestFile } from "../../types/project";
import { formatBytes, getStatusColor, STATUS_TEXT } from "../../utils/format";
import { playSuccessChime } from "../../utils/sounds";
import { CodeViewer } from "../CodeMirror";
import { KeyValueTable } from "../KeyValueTable";
import { MethodSelector } from "../MethodSelector";
import { ProtocolToggle } from "../ProtocolToggle";
import { SizePopover } from "../popovers/SizePopover";
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

interface RestRequestEditorProps {
	activeRequest: RequestFile;
	activeProject: Project | null;
	loading: boolean;
	startLoading: (id: string) => void;
	stopLoading: (id: string) => void;
	onSendSuccess: (requestId: string) => void;
	onOpenProjectSettings: () => void;
}

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
	const [responseTab, setResponseTab] = useState<ResponseRenderer>("Raw");
	const [responseDetailTab, setResponseDetailTab] = useState<
		"headers" | "cookies"
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
	const timingRef = useRef<HTMLButtonElement>(null);
	const sizeRef = useRef<HTMLButtonElement>(null);
	const timingTimeoutRef = useRef<number | null>(null);
	const sizeTimeoutRef = useRef<number | null>(null);

	const [showInvalidVarDialog, setShowInvalidVarDialog] = useState(false);
	const [showCurlOverwriteDialog, setShowCurlOverwriteDialog] = useState(false);
	const [pendingCurlCommand, setPendingCurlCommand] = useState<string | null>(
		null,
	);

	const handleTimingEnter = () => {
		if (timingTimeoutRef.current) {
			clearTimeout(timingTimeoutRef.current);
			timingTimeoutRef.current = null;
		}
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
		setShowTimingPopover(false);
		setShowSizePopover(true);
	};

	const handleSizeLeave = () => {
		sizeTimeoutRef.current = window.setTimeout(() => {
			setShowSizePopover(false);
		}, 200);
	};

	const isItemEnabled = useCallback(
		(type: "param" | "header" | "cookie", key: string) => {
			return !disabledItems.has(`${activeRequest.id}:${type}:${key}`);
		},
		[activeRequest.id, disabledItems],
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

		if (activeRequest.request.cookies.length > 0) {
			const enabledCookies = activeRequest.request.cookies.filter((_, idx) =>
				isItemEnabled("cookie", `${idx}`),
			);
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
	}, [activeRequest, isItemEnabled]);

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
				preferred.find((r) =>
					activeRequest.response?.available_renderers.includes(r),
				) ||
				activeRequest.response.available_renderers[0] ||
				"Raw";
			setResponseTab(bestRenderer);
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

		return false;
	}, [activeRequest, getActiveEnvironmentVariables, isItemEnabled]);

	const performSend = useCallback(async () => {
		const requestId = activeRequest.id;
		startLoading(requestId);
		try {
			const resolvedUrl = resolveVariables(activeRequest.request.url);

			const resolvedHeaders: Record<string, string> = {};
			for (const [key, value] of Object.entries(
				activeRequest.request.headers,
			)) {
				if (isItemEnabled("header", key)) {
					resolvedHeaders[key] = resolveVariables(value || "");
				}
			}

			const resolvedCookies = activeRequest.request.cookies
				.filter((_, idx) => isItemEnabled("cookie", `${idx}`))
				.map((c) => ({ ...c }));

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

			const resolvedRequest = {
				...activeRequest.request,
				url: resolvedUrl,
				headers: resolvedHeaders,
				cookies: resolvedCookies,
				query_params: {},
				body: isGet ? "None" : activeRequest.request.body,
				auth: effectiveAuth,
				request_label: activeRequest.name,
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
				preferred.find((r) => resp.available_renderers.includes(r)) ||
				resp.available_renderers[0] ||
				"Raw";
			setResponseTab(bestRenderer);

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
				error: errorMessage,
			};
			setRequestResponse(requestId, errorResponse);
			setResponseTab("Raw");
		} finally {
			stopLoading(requestId);
		}
	}, [
		activeRequest,
		activeProject,
		activeTab,
		addToast,
		addToRecentRequests,
		isItemEnabled,
		onSendSuccess,
		resolveVariables,
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

		switch (responseTab) {
			case "Json": {
				const json = decodeBodyAsJson(response);
				const formatted = json ? JSON.stringify(json, null, 2) : body;
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
				return (
					<div className="h-full min-h-0 flex-1 overflow-auto">
						<pre
							className="whitespace-pre-wrap break-all p-4 font-mono text-sm text-white/80"
							style={{ fontFamily: "'IBM Plex Mono', monospace" }}
						>
							{body}
						</pre>
					</div>
				);
		}
	}

	function getRendererLabel(renderer: ResponseRenderer): string {
		switch (renderer) {
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
		<>
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
						onClick={handleSend}
						disabled={loading || !activeRequest.request.url}
						className={EDITOR_PRIMARY_BUTTON_CLASS}
					>
						{loading ? "Sending" : "Send"}
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
									title="Query Params"
									items={Object.entries(activeRequest.request.query_params).map(
										([key, value]) => ({
											id: key,
											key: key,
											value: value || "",
											description: "",
											enabled: isItemEnabled("param", key),
										}),
									)}
									onChange={(items) => {
										const newQueryParams: Record<string, string> = {};
										const newDisabledItems = new Set(disabledItems);
										const activeId = activeRequest.id;

										items.forEach((item) => {
											if (item.key.trim() || item.value.trim()) {
												newQueryParams[item.key] = item.value;
												const disabledKey = `${activeId}:param:${item.key}`;
												if (item.enabled) {
													newDisabledItems.delete(disabledKey);
												} else {
													newDisabledItems.add(disabledKey);
												}
											}
										});

										Object.keys(activeRequest.request.query_params).forEach(
											(oldKey) => {
												if (!newQueryParams[oldKey]) {
													newDisabledItems.delete(
														`${activeId}:param:${oldKey}`,
													);
												}
											},
										);

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
											const prefix = `${activeId}:param:`;
											const currentDisabledKeys = new Set(
												Array.from(newDisabledItems)
													.filter((k) => k.startsWith(prefix))
													.map((k) => k.slice(prefix.length)),
											);
											const queryString = buildQueryString(
												newQueryParams,
												currentDisabledKeys,
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
								<div className="flex items-center border-white/5 border-b bg-white/5 px-4 py-1.5">
									<span className="text-white/30 text-xs">Headers</span>
								</div>
								<KeyValueTable
									items={[
										...getComputedHeaders(),
										...Object.entries(activeRequest.request.headers).map(
											([key, value]) => ({
												id: key,
												key: key,
												value: value || "",
												description: "",
												enabled: isItemEnabled("header", key),
											}),
										),
									]}
									onChange={(items) => {
										const userItems = items.filter(
											(i) => !i.id.startsWith("computed:"),
										);
										const newHeaders: Record<string, string> = {};
										const newDisabledItems = new Set(disabledItems);
										const activeId = activeRequest.id;

										userItems.forEach((item) => {
											if (item.key.trim() || item.value.trim()) {
												newHeaders[item.key] = item.value;
												const disabledKey = `${activeId}:header:${item.key}`;
												if (item.enabled) {
													newDisabledItems.delete(disabledKey);
												} else {
													newDisabledItems.add(disabledKey);
												}
											}
										});

										Object.keys(activeRequest.request.headers).forEach(
											(oldKey) => {
												if (!newHeaders[oldKey]) {
													newDisabledItems.delete(
														`${activeId}:header:${oldKey}`,
													);
												}
											},
										);

										setDisabledItems(newDisabledItems);
										updateItem(activeId, "request", (r) => ({
											...r,
											request: { ...r.request, headers: newHeaders },
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
									title="Cookies"
									items={activeRequest.request.cookies.map((cookie, idx) => ({
										id: `${idx}`,
										key: cookie.name,
										value: cookie.value,
										description:
											`${cookie.domain || ""} ${cookie.path || ""}`.trim(),
										enabled: isItemEnabled("cookie", `${idx}`),
									}))}
									onChange={(items) => {
										const activeId = activeRequest.id;
										const newDisabledItems = new Set(disabledItems);

										const newCookies = items.map((i) => {
											const disabledKey = `${activeId}:cookie:${i.id}`;
											if (i.enabled) {
												newDisabledItems.delete(disabledKey);
											} else {
												newDisabledItems.add(disabledKey);
											}

											return {
												name: i.key,
												value: i.value,
												domain: null,
												path: null,
												expires: null,
												http_only: null,
												secure: null,
											};
										});

										activeRequest.request.cookies.forEach((_, idx) => {
											if (idx >= newCookies.length) {
												newDisabledItems.delete(`${activeId}:cookie:${idx}`);
											}
										});

										setDisabledItems(newDisabledItems);
										updateItem(activeId, "request", (r) => ({
											...r,
											request: { ...r.request, cookies: newCookies },
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
								<div className="flex gap-1">
									{(activeRequest.response?.available_renderers || ["Raw"]).map(
										(renderer) => (
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
										),
									)}
								</div>
							</div>

							<div
								className="overflow-auto"
								style={{ height: `${responseSplitY}%` }}
							>
								<div className="h-full">{renderResponseBody()}</div>
							</div>

							<div className="flex shrink-0 items-center justify-between border-white/10 border-y bg-inset pr-2">
								<div className="flex items-center gap-1">
									<div className="hidden">
										<span className="bg-[#22c55e]/20" />
										<span className="bg-[#eab308]/20" />
										<span className="bg-[#f97316]/20" />
										<span className="bg-[#ef4444]/20" />
									</div>
									<span
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
									</span>

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
		</>
	);
});
