import { useState } from "react";
import type { ConnectionStatus } from "../../hooks/useWebSocket";
import type { WebSocketFile } from "../../types/project";
import {
	generateWsSnippet,
	WS_SNIPPET_LANGS,
	type WsSnippetLang,
} from "../../utils/wsSnippets";
import { OverviewLayout } from "./OverviewLayout";

interface WebSocketOverviewProps {
	ws: WebSocketFile;
	onUpdate: (updater: (ws: WebSocketFile) => WebSocketFile) => void;
	onConnect: () => void;
	status: ConnectionStatus;
	/** Another WebSocket file already holds the single active connection */
	blockedByOtherConnection?: boolean;
}

export const WebSocketOverview = ({
	ws,
	onUpdate,
	onConnect,
	status,
	blockedByOtherConnection = false,
}: WebSocketOverviewProps) => {
	const [snippetLang, setSnippetLang] = useState<WsSnippetLang>("JavaScript");
	const [showSnippetDropdown, setShowSnippetDropdown] = useState(false);

	const { code: snippetCode, language: snippetLanguage } = generateWsSnippet(
		ws.url,
		snippetLang,
	);

	const leftFooter = (
		<>
			{(ws.params || []).filter((p) => p.enabled && p.key).length > 0 && (
				<div className="mt-4">
					<h3 className="mb-2 font-semibold text-sm text-white/70">
						Query Parameters
					</h3>
					<div className="space-y-1">
						{(ws.params || [])
							.filter((p) => p.enabled && p.key)
							.map((p) => (
								<div
									key={p.id}
									className="border-white/5 border-b py-2 last:border-0"
								>
									<div className="flex items-center gap-3">
										<span className="font-medium font-mono text-white text-xs">
											{p.key}
										</span>
										<span className="font-mono text-[10px] text-emerald-400/60 lowercase">
											string
										</span>
									</div>
									{p.description && (
										<p className="mt-1 text-[11px] text-white/40">
											{p.description}
										</p>
									)}
								</div>
							))}
					</div>
				</div>
			)}

			{(ws.headerItems || []).filter((h) => h.enabled && h.key).length > 0 && (
				<div className="mt-4">
					<h3 className="mb-2 font-semibold text-sm text-white/70">Headers</h3>
					<div className="space-y-1">
						{(ws.headerItems || [])
							.filter((h) => h.enabled && h.key)
							.map((h) => (
								<div
									key={h.id}
									className="border-white/5 border-b py-2 last:border-0"
								>
									<div className="flex items-center gap-3">
										<span className="font-medium font-mono text-white text-xs">
											{h.key}
										</span>
									</div>
									{h.description && (
										<p className="mt-1 text-[11px] text-white/40">
											{h.description}
										</p>
									)}
								</div>
							))}
					</div>
				</div>
			)}
		</>
	);

	return (
		<OverviewLayout
			name={ws.name}
			description={ws.description || ""}
			onCommitName={(next) => onUpdate((prev) => ({ ...prev, name: next }))}
			onDescriptionChange={(desc) =>
				onUpdate((prev) => ({ ...prev, description: desc }))
			}
			leftFooter={leftFooter}
			panelBadge="WS"
			panelSubtitle={ws.url || "No URL set"}
			snippetDropdownLabel={snippetLang}
			snippetDropdownOpen={showSnippetDropdown}
			onSnippetDropdownOpenChange={setShowSnippetDropdown}
			snippetDropdownItems={WS_SNIPPET_LANGS.map((s) => ({
				label: s.label,
				onClick: () => {
					setSnippetLang(s.lang);
					setShowSnippetDropdown(false);
				},
			}))}
			snippetCode={snippetCode}
			snippetViewerLanguage={snippetLanguage}
			action={
				<button
					type="button"
					onClick={onConnect}
					disabled={
						!ws.url || status === "connected" || blockedByOtherConnection
					}
					title={
						!ws.url
							? "Enter a WebSocket URL to connect"
							: blockedByOtherConnection
								? "Only one WebSocket can be active at a time. Disconnect the other WebSocket first, then connect here."
								: status === "connected"
									? "Already connected"
									: undefined
					}
					className="absolute right-4 bottom-4 z-20 flex cursor-pointer items-center gap-2 rounded-full bg-accent px-4 py-1.5 font-semibold text-background text-sm transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Connect
				</button>
			}
		/>
	);
};
