import { getGrpcStatusMeta } from "../../constants/grpcStatusMeta";
import { getHttpStatusMeta } from "../../constants/httpStatusMeta";
import { getGrpcStatusColor, getStatusColor } from "../../utils/format";
import { openUrl } from "@tauri-apps/plugin-opener";
import { HoverPopover } from "../ui";

interface StatusPopoverProps {
	statusCode: number;
	statusText?: string;
	protocol?: "http" | "grpc";
	anchorRef: React.RefObject<HTMLElement | null>;
	open?: boolean;
	onClose: () => void;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
}

export function StatusPopover({
	statusCode,
	statusText,
	protocol = "http",
	anchorRef,
	open,
	onClose,
	onMouseEnter,
	onMouseLeave,
}: StatusPopoverProps) {
	const httpMeta =
		protocol === "http" ? getHttpStatusMeta(statusCode) : undefined;
	const grpcMeta =
		protocol === "grpc" ? getGrpcStatusMeta(statusCode) : undefined;
	const title = httpMeta?.title || grpcMeta?.title || statusText || "Status";
	const description =
		httpMeta?.description ||
		grpcMeta?.description ||
		"The server returned this status code for the request.";
	const docsUrl = httpMeta?.mdnUrl || grpcMeta?.docsUrl;
	const docsLabel = httpMeta ? "MDN docs" : grpcMeta ? "gRPC docs" : null;
	const color =
		protocol === "grpc"
			? getGrpcStatusColor(statusCode)
			: getStatusColor(statusCode);

	return (
		<HoverPopover
			anchorRef={anchorRef}
			open={open}
			onClose={onClose}
			className="min-w-[210px] max-w-[240px]"
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<div className="mb-3 flex items-center gap-2 border-white/10 border-b pb-2">
				<span
					className="rounded px-1.5 py-0.5 font-bold text-[11px]"
					style={{ color, backgroundColor: `${color}20` }}
				>
					{statusCode}
				</span>
				<span className="font-medium text-[11px]" style={{ color }}>
					{title}
				</span>
			</div>

			<div className="text-[11px] text-white/70 leading-relaxed">
				{description}
			</div>

			{docsUrl && docsLabel ? (
				<div className="mt-3">
					<button
						type="button"
						onClick={() => {
							void openUrl(docsUrl).catch(() => {
								window.open(docsUrl, "_blank", "noopener,noreferrer");
							});
						}}
						className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-1 font-medium text-[10px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
					>
						{docsLabel}
						<span aria-hidden>↗</span>
					</button>
				</div>
			) : null}
		</HoverPopover>
	);
}
