import { useState } from "react";
import type { SocketIOFile } from "../../types/project";
import {
	generateSocketIoSnippet,
	SOCKETIO_SNIPPET_LANGS,
	type SocketIOSnippetLang,
} from "../../utils/realtimeSnippets";
import { OverviewLayout } from "./OverviewLayout";

interface SocketIOOverviewProps {
	sio: SocketIOFile;
	status: "connected" | "connecting" | "disconnected";
	onUpdate: (updater: (sio: SocketIOFile) => SocketIOFile) => void;
	onConnect: () => void;
}

export const SocketIOOverview = ({
	sio,
	status,
	onUpdate,
	onConnect,
}: SocketIOOverviewProps) => {
	const [snippetLang, setSnippetLang] =
		useState<SocketIOSnippetLang>("JavaScript");
	const [showSnippetDropdown, setShowSnippetDropdown] = useState(false);

	const { code: snippetCode, language: snippetLanguage } =
		generateSocketIoSnippet(sio, snippetLang);

	const enabledHeaders = (sio.headerItems || []).filter(
		(h) => h.enabled && h.key,
	);

	const leftFooter = (
		<>
			<div className="mt-4">
				<h3 className="mb-2 font-semibold text-sm text-white/70">Connection</h3>
				<div className="space-y-1">
					<div className="border-white/5 border-b py-2">
						<span className="text-white/40 text-xs">URL</span>
						<p className="mt-1 break-all font-mono text-white/80 text-xs">
							{sio.url || "Not set"}
						</p>
					</div>
					<div className="border-white/5 border-b py-2">
						<span className="text-white/40 text-xs">Namespace</span>
						<input
							type="text"
							value={sio.namespace || "/"}
							onChange={(e) => {
								const next = e.target.value;
								onUpdate((prev) => ({ ...prev, namespace: next || "/" }));
							}}
							className="mt-1 w-full rounded bg-inputbox px-2 py-1.5 font-mono text-white text-xs outline-none placeholder:text-white/20"
							placeholder="/"
							disabled={status !== "disconnected"}
						/>
					</div>
				</div>
			</div>

			{enabledHeaders.length > 0 && (
				<div className="mt-4">
					<h3 className="mb-2 font-semibold text-sm text-white/70">Headers</h3>
					<div className="space-y-1">
						{enabledHeaders.map((h) => (
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
			name={sio.name}
			description={sio.description || ""}
			onCommitName={(next) => onUpdate((prev) => ({ ...prev, name: next }))}
			onDescriptionChange={(desc) =>
				onUpdate((prev) => ({ ...prev, description: desc }))
			}
			leftFooter={leftFooter}
			panelBadge="SIO"
			panelBadgeClassName="bg-[#25C2A0]/20 text-[#25C2A0]"
			panelSubtitle={sio.url || "No URL set"}
			snippetDropdownLabel={snippetLang}
			snippetDropdownOpen={showSnippetDropdown}
			onSnippetDropdownOpenChange={setShowSnippetDropdown}
			snippetDropdownItems={SOCKETIO_SNIPPET_LANGS.map((snippet) => ({
				label: snippet.label,
				onClick: () => {
					setSnippetLang(snippet.lang);
					setShowSnippetDropdown(false);
				},
			}))}
			snippetCode={snippetCode}
			snippetViewerLanguage={snippetLanguage}
			action={
				<button
					type="button"
					onClick={onConnect}
					disabled={!sio.url || status !== "disconnected"}
					className="absolute right-4 bottom-4 z-20 flex cursor-pointer items-center gap-2 rounded-full bg-accent px-4 py-1.5 font-semibold text-background text-sm transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Connect
				</button>
			}
		/>
	);
};
