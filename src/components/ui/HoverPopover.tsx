import { type ReactNode, useEffect, useRef, useState } from "react";

interface HoverPopoverProps {
	children: ReactNode;
	anchorRef: React.RefObject<HTMLElement | null>;
	open?: boolean;
	onClose?: () => void;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
	className?: string;
	position?: "top" | "bottom";
}

export function HoverPopover({
	children,
	anchorRef,
	open = true,
	onClose,
	onMouseEnter,
	onMouseLeave,
	className = "",
	position = "top",
}: HoverPopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);
	const [coords, setCoords] = useState({ top: 0, left: 0 });
	const [isClosing, setIsClosing] = useState(false);
	const [render, setRender] = useState(open);

	useEffect(() => {
		if (open) {
			setRender(true);
			setIsClosing(false);
		} else {
			setIsClosing(true);
			const timer = setTimeout(() => setRender(false), 500);
			return () => clearTimeout(timer);
		}
	}, [open]);

	useEffect(() => {
		const updatePosition = () => {
			if (anchorRef.current && popoverRef.current) {
				const anchorRect = anchorRef.current.getBoundingClientRect();
				const popoverRect = popoverRef.current.getBoundingClientRect();

				let top: number;
				let left =
					anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2;

				if (position === "top") {
					top = anchorRect.top - popoverRect.height - 8;
				} else {
					top = anchorRect.bottom + 8;
				}

				if (left < 8) left = 8;
				if (left + popoverRect.width > window.innerWidth - 8) {
					left = window.innerWidth - popoverRect.width - 8;
				}

				if (position === "top" && top < 8) {
					top = anchorRect.bottom + 8;
				} else if (
					position === "bottom" &&
					top + popoverRect.height > window.innerHeight - 8
				) {
					top = anchorRect.top - popoverRect.height - 8;
				}

				setCoords({ top, left });
			}
		};

		if (render) {
			updatePosition();
			const t1 = window.setTimeout(updatePosition, 0);
			const t2 = window.setTimeout(updatePosition, 32);
			window.addEventListener("resize", updatePosition);
			window.addEventListener("scroll", updatePosition, true);
			return () => {
				clearTimeout(t1);
				clearTimeout(t2);
				window.removeEventListener("resize", updatePosition);
				window.removeEventListener("scroll", updatePosition, true);
			};
		}
		return () => {};
	}, [anchorRef, position, render]);

	useEffect(() => {
		if (!onClose || isClosing || !render) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (
				popoverRef.current &&
				!popoverRef.current.contains(e.target as Node)
			) {
				if (onClose) onClose();
			}
		};

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (onClose) onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [onClose, isClosing, render]);

	if (!render) return null;

	return (
		<div
			ref={popoverRef}
			className={`${className} fixed z-50 rounded-xl border border-border bg-card p-3 shadow-2xl ${isClosing ? "animate-blur-out" : "animate-blur-in"}`}
			style={{ top: coords.top, left: coords.left }}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			{children}
		</div>
	);
}
