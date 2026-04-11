import type { TimingInfo } from "../../bindings";
import { HoverPopover } from "../ui";

interface TimingPopoverProps {
	timing: TimingInfo;
	anchorRef: React.RefObject<HTMLElement | null>;
	open?: boolean;
	onClose: () => void;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
}

const TIMING_COLORS = {
	dns: "#f59e0b",
	tcp: "#8b5cf6",
	tls: "#3b82f6",
	ttfb: "#ff6141",
	download: "#22c55e",
};

function formatTime(ms: number): string {
	if (ms < 0.01) {
		return `${(ms * 1000).toFixed(0)} µs`;
	}
	if (ms < 1) {
		return `${(ms * 1000).toFixed(2)} µs`;
	}
	if (ms < 1000) {
		return `${ms.toFixed(2)} ms`;
	}
	return `${(ms / 1000).toFixed(2)} s`;
}

function formatTotalTime(ms: number): string {
	if (ms < 1000) {
		return `${ms.toFixed(2)} ms`;
	}
	return `${(ms / 1000).toFixed(2)} s`;
}

export function TimingPopover({
	timing,
	anchorRef,
	open,
	onClose,
	onMouseEnter,
	onMouseLeave,
}: TimingPopoverProps) {
	const total = timing.total_ms || 1;

	const phases = [
		{
			key: "dns",
			label: "DNS Lookup",
			ms: timing.dns_lookup_ms,
			color: TIMING_COLORS.dns,
		},
		{
			key: "tcp",
			label: "TCP Handshake",
			ms: timing.tcp_handshake_ms,
			color: TIMING_COLORS.tcp,
		},
		{
			key: "tls",
			label: "SSL Handshake",
			ms: timing.tls_handshake_ms,
			color: TIMING_COLORS.tls,
		},
		{
			key: "ttfb",
			label: "Waiting (TTFB)",
			ms: timing.ttfb_ms,
			color: TIMING_COLORS.ttfb,
		},
		{
			key: "download",
			label: "Download",
			ms: timing.content_download_ms,
			color: TIMING_COLORS.download,
		},
	];

	let cumulative = 0;
	const waterfallData = phases.map((phase) => {
		const start = cumulative;
		cumulative += phase.ms;
		return {
			...phase,
			startPercent: (start / total) * 100,
			widthPercent: Math.max((phase.ms / total) * 100, 0.5),
		};
	});

	return (
		<HoverPopover
			anchorRef={anchorRef}
			open={open}
			onClose={onClose}
			className="min-w-[300px]"
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<div className="mb-3 flex items-center gap-2 border-white/10 border-b pb-2">
				<svg
					className="h-4 w-4 text-white/60"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<circle cx="12" cy="12" r="10" />
					<polyline points="12,6 12,12 16,14" />
				</svg>
				<span className="font-medium text-[11px] text-white">
					Response Time
				</span>
				<span className="ml-auto font-bold text-[11px] text-white">
					{formatTotalTime(timing.total_ms)}
				</span>
			</div>

			<div>
				{waterfallData.map((row) => (
					<div key={row.key} className="flex items-center gap-2">
						<span className="w-20 shrink-0 text-[10px] text-white/50">
							{row.label}
						</span>
						<div
							className="relative h-[22px] flex-1 overflow-hidden border-white/20 border-x"
							style={{ width: 140 }}
						>
							<div
								className="absolute h-full"
								style={{
									left: `${row.startPercent}%`,
									width: `${row.widthPercent}%`,
									backgroundColor: row.color,
									...(row.key === "ttfb" && {
										background: `repeating-linear-gradient(90deg, ${row.color} 0px, ${row.color} 3px, transparent 3px, transparent 6px)`,
									}),
								}}
							/>
						</div>
						<span className="w-14 shrink-0 text-right font-mono text-[10px] text-white/70">
							{formatTime(row.ms)}
						</span>
					</div>
				))}
			</div>
		</HoverPopover>
	);
}
