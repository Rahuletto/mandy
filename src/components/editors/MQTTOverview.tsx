import { useState } from "react";
import type { MQTTFile } from "../../types/project";
import {
	generateMqttSnippet,
	MQTT_SNIPPET_LANGS,
	type MqttSnippetLang,
} from "../../utils/realtimeSnippets";
import { OverviewLayout } from "./OverviewLayout";

interface MQTTOverviewProps {
	mqtt: MQTTFile;
	status: "connected" | "connecting" | "disconnected";
	onUpdate: (updater: (mqtt: MQTTFile) => MQTTFile) => void;
	onConnect: () => void;
}

export function MQTTOverview({
	mqtt,
	status,
	onUpdate,
	onConnect,
}: MQTTOverviewProps) {
	const [snippetLang, setSnippetLang] = useState<MqttSnippetLang>("JavaScript");
	const [showSnippetDropdown, setShowSnippetDropdown] = useState(false);

	const { code: snippetCode, language: snippetLanguage } = generateMqttSnippet(
		mqtt,
		snippetLang,
	);

	const leftFooter = (
		<div className="mt-4">
			<h3 className="mb-2 font-semibold text-sm text-white/70">Connection</h3>
			<div className="space-y-1">
				<div className="border-white/5 border-b py-2">
					<span className="text-white/40 text-xs">Broker URL</span>
					<p className="mt-1 break-all font-mono text-white/80 text-xs">
						{mqtt.url || "Not set"}
					</p>
				</div>
				<div className="border-white/5 border-b py-2">
					<span className="text-white/40 text-xs">Client ID</span>
					<p className="mt-1 break-all font-mono text-white/80 text-xs">
						{mqtt.clientId || "Auto-generated"}
					</p>
				</div>
				<div className="border-white/5 border-b py-2">
					<span className="text-white/40 text-xs">Subscriptions</span>
					<p className="mt-1 break-all font-mono text-white/80 text-xs">
						{mqtt.subscriptions.length > 0
							? mqtt.subscriptions
									.map((sub) => `${sub.topic} (QoS ${sub.qos})`)
									.join(", ")
							: "None"}
					</p>
				</div>
			</div>
		</div>
	);

	return (
		<OverviewLayout
			name={mqtt.name}
			description={mqtt.description || ""}
			onCommitName={(next) => onUpdate((prev) => ({ ...prev, name: next }))}
			onDescriptionChange={(desc) =>
				onUpdate((prev) => ({ ...prev, description: desc }))
			}
			leftFooter={leftFooter}
			panelBadge="MQTT"
			panelBadgeClassName="bg-orange-400/20 text-orange-300"
			panelSubtitle={mqtt.url || "No broker URL set"}
			snippetDropdownLabel={snippetLang}
			snippetDropdownOpen={showSnippetDropdown}
			onSnippetDropdownOpenChange={setShowSnippetDropdown}
			snippetDropdownItems={MQTT_SNIPPET_LANGS.map((snippet) => ({
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
					disabled={!mqtt.url || status !== "disconnected"}
					className="absolute right-4 bottom-4 z-20 flex cursor-pointer items-center gap-2 rounded-full bg-accent px-4 py-1.5 font-semibold text-background text-sm transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Connect
				</button>
			}
		/>
	);
}
