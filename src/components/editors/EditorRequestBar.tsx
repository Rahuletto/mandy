import type { ReactNode } from "react";
import { getItemConfig, RequestTypeIcon } from "../../registry";

const URL_BAR_CLASS =
	"relative flex flex-1 items-center overflow-hidden rounded-lg bg-inputbox transition-opacity";

const PROTOCOL_BAR_TYPES = [
	"websocket",
	"graphql",
	"socketio",
	"mqtt",
] as const;
export type ProtocolRequestBarType = (typeof PROTOCOL_BAR_TYPES)[number];

/**
 * Icon-only leading segment — compact width; REST keeps a wider column for method labels.
 */
export function ProtocolEditorLeading({
	type,
}: {
	type: ProtocolRequestBarType;
}) {
	const label = getItemConfig(type).label;
	return (
		<div
			className="flex w-11 shrink-0 items-center justify-center py-2.5"
			title={label}
		>
			<RequestTypeIcon type={type} size={18} />
		</div>
	);
}

interface EditorRequestBarProps {
	/** Left segment: {@link MethodSelector} or {@link ProtocolEditorLeading}. */
	leading: ReactNode;
	/** URL field — typically {@link UrlInput} or a plain input styled the same. */
	urlField: ReactNode;
	/** Optional right end inside the bar (e.g. schema spinner). */
	barEnd?: ReactNode;
	loading?: boolean;
	/** Accent divider between leading and URL (e.g. WebSocket / Socket.IO / MQTT when connected). */
	accentDivider?: boolean;
	/** Send / Run / Connect / Disconnect (wrap with Tooltip if needed). */
	action: ReactNode;
}

/**
 * Shared top bar for REST and protocol editors: env + URL row + primary action.
 */
export function EditorRequestBar({
	leading,
	urlField,
	barEnd,
	loading = false,
	accentDivider = false,
	action,
}: EditorRequestBarProps) {
	return (
		<div className="flex gap-4 border-text/15 border-b p-4">
			<div
				className={`${URL_BAR_CLASS} ${loading ? "shimmer-loading opacity-80" : ""}`}
			>
				{loading ? (
					<div className="pointer-events-none absolute inset-0 z-10 bg-background/30" />
				) : null}
				{leading}
				<div
					className={`h-5 w-px shrink-0 transition-colors ${accentDivider ? "bg-accent/70" : "bg-white/10"}`}
				/>
				<div className="flex min-h-0 min-w-0 flex-1 items-stretch">
					{urlField}
				</div>
				{barEnd ? (
					<div className="flex shrink-0 items-center">{barEnd}</div>
				) : null}
			</div>
			<div className="flex shrink-0 items-center">{action}</div>
		</div>
	);
}
