import { type ReactNode, useRef, useState } from "react";
import { HoverPopover } from "./HoverPopover";

interface TooltipProps {
	content: ReactNode;
	children: ReactNode;
	position?: "top" | "bottom";
	className?: string;
	wrapperClassName?: string;
}

export function Tooltip({
	content,
	children,
	position = "top",
	className = "",
	wrapperClassName = "inline-flex",
}: TooltipProps) {
	const [open, setOpen] = useState(false);
	const anchorRef = useRef<HTMLDivElement>(null);

	if (!content) return <>{children}</>;

	return (
		<div
			ref={anchorRef}
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={() => setOpen(false)}
			className={wrapperClassName}
		>
			{children}
			<HoverPopover
				anchorRef={anchorRef as React.RefObject<HTMLElement>}
				open={open}
				onMouseEnter={() => setOpen(true)}
				onMouseLeave={() => setOpen(false)}
				position={position}
				className={`!px-2.5 !py-1.5 !rounded-lg max-w-[min(18rem,calc(100vw-1rem))] text-left text-xs leading-snug text-white bg-card whitespace-normal ${className}`}
			>
				{content}
			</HoverPopover>
		</div>
	);
}
