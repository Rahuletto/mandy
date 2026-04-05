import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BsThreeDots } from "react-icons/bs";

export interface DropdownItem {
	label: string;
	onClick?: () => void;
	icon?: React.ReactNode;
	rightAction?: React.ReactNode;
	danger?: boolean;
	divider?: boolean;
	active?: boolean;
	header?: boolean;
}

interface DropdownProps {
	items: DropdownItem[];
	onClose: () => void;
	className?: string; // Kept for backward compatibility but using fixed positioning
	width?: string;
}

export function Dropdown({
	items,
	onClose,
	width = "min-w-[160px]",
}: DropdownProps) {
	const ref = useRef<HTMLDivElement>(null);
	const [isVisible, setIsVisible] = useState(false);
	const [pos, setPos] = useState({ left: -9999, top: -9999 });

	useLayoutEffect(() => {
		if (!ref.current) return;

		const parent = ref.current.parentElement;
		if (!parent) return;

		const parentRect = parent.getBoundingClientRect();
		const rect = ref.current.getBoundingClientRect();
		const padding = 12;

		let newLeft = parentRect.left;
		let newTop = parentRect.bottom + 4;

		if (newLeft + rect.width > window.innerWidth - padding) {
			newLeft = window.innerWidth - rect.width - padding;
		}

		if (newTop + rect.height > window.innerHeight - padding) {
			newTop = parentRect.top - rect.height - 4;

			if (newTop < padding) {
				newTop = window.innerHeight - rect.height - padding;
			}
		}

		setPos({
			left: Math.max(padding, newLeft),
			top: Math.max(padding, newTop),
		});
		setIsVisible(true);
	}, []);

	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				onClose();
			}
		}
		function handleEscape(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("mousedown", handleClick);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("mousedown", handleClick);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [onClose]);

	return (
		<div
			ref={ref}
			className={`fixed z-[9999] rounded-xl border border-border bg-card py-2 shadow-2xl ${width} ${isVisible ? "animate-blur-in" : "opacity-0"} max-h-[calc(100vh-24px)] overflow-auto shadow-black/50`}
			style={{ left: pos.left, top: pos.top }}
		>
			{items.map((item, i) =>
				item.divider ? (
					<div key={i} className="my-1 border-border border-t" />
				) : item.header ? (
					<div
						key={i}
						className="mt-2 px-3 py-2 text-white/30 text-xs first:mt-1"
					>
						{item.label}
					</div>
				) : (
					<div
						key={i}
						className={`group flex items-center transition-colors ${
							item.active ? "bg-accent/5" : "hover:bg-white/5"
						}`}
					>
						<button
							type="button"
							onClick={() => {
								item.onClick?.();
								onClose();
							}}
							disabled={item.header}
							className={`flex flex-1 items-center gap-2.5 px-4 py-2 text-left text-xs ${
								item.danger
									? "text-red"
									: item.active
										? "font-semibold text-accent"
										: "text-white/80"
							} ${item.header ? "cursor-default" : "cursor-pointer"}`}
						>
							{item.icon && <span className="text-white/40">{item.icon}</span>}
							<span className="truncate">{item.label}</span>
						</button>
						{item.rightAction && <div className="px-2">{item.rightAction}</div>}
					</div>
				),
			)}
		</div>
	);
}

interface MoreButtonProps {
	onClick: (e: React.MouseEvent) => void;
	className?: string;
}

export function MoreButton({ onClick, className = "" }: MoreButtonProps) {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onClick(e);
			}}
			className={`rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/70 ${className}`}
		>
			<BsThreeDots size={14} />
		</button>
	);
}
