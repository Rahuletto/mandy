import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BsThreeDots } from "react-icons/bs";

export interface DropdownItem {
	label: string;
	onClick?: () => void;
	onContextMenu?: (event: React.MouseEvent) => void;
	icon?: React.ReactNode;
	danger?: boolean;
	divider?: boolean;
	active?: boolean;
	header?: boolean;
}

/** Cap list height; outer shell also respects viewport via min(). */
const DROPDOWN_MAX_HEIGHT = "min(20rem, calc(100vh - 24px))";

interface DropdownProps {
	items: DropdownItem[];
	onClose: () => void;
	className?: string; // Kept for backward compatibility but using fixed positioning
	width?: string;
	maxHeight?: string;
	/** Anchor horizontal edge to the trigger; use `end` for triggers on the right. */
	align?: "start" | "end";
	searchValue?: string;
	onSearchValueChange?: (value: string) => void;
	searchPlaceholder?: string;
	emptyMessage?: string;
}

export function Dropdown({
	items,
	onClose,
	width = "min-w-[160px]",
	maxHeight = DROPDOWN_MAX_HEIGHT,
	align = "start",
	searchValue,
	onSearchValueChange,
	searchPlaceholder = "Search...",
	emptyMessage = "No matches",
}: DropdownProps) {
	const hasSearch =
		typeof searchValue === "string" && onSearchValueChange !== undefined;
	const listMaxHeight = hasSearch
		? "min(17rem, calc(100vh - 72px))"
		: maxHeight;
	const ref = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const [isVisible, setIsVisible] = useState(false);
	const [pos, setPos] = useState({ left: -9999, top: -9999 });

	useEffect(() => {
		if (hasSearch) {
			searchInputRef.current?.focus();
		}
	}, [hasSearch]);

	useLayoutEffect(() => {
		if (!ref.current) return;

		const parent = ref.current.parentElement;
		if (!parent) return;

		const parentRect = parent.getBoundingClientRect();
		const rect = ref.current.getBoundingClientRect();
		const padding = 12;

		let newLeft =
			align === "end" ? parentRect.right - rect.width : parentRect.left;
		let newTop = parentRect.bottom + 4;

		if (newLeft + rect.width > window.innerWidth - padding) {
			newLeft = window.innerWidth - rect.width - padding;
		}
		if (newLeft < padding) {
			newLeft = padding;
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
	}, [align, items.length, hasSearch]);

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
			className={`fixed z-[9999] flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/50 ${width} ${isVisible ? "animate-blur-in" : "opacity-0"}`}
			style={{ left: pos.left, top: pos.top }}
		>
			{hasSearch ? (
				<div
					className="flex shrink-0 items-center gap-2 border-white/10 border-b px-3 py-2"
					onMouseDown={(event) => event.stopPropagation()}
				>
					<svg
						className="size-3.5 shrink-0 text-white/35"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden
					>
						<circle cx="11" cy="11" r="7" />
						<path d="m20 20-3.5-3.5" />
					</svg>
					<input
						ref={searchInputRef}
						type="search"
						value={searchValue}
						onChange={(event) => onSearchValueChange(event.target.value)}
						placeholder={searchPlaceholder}
						aria-label={searchPlaceholder}
						className="min-w-0 flex-1 border-none bg-transparent text-xs text-white outline-none placeholder:text-white/30"
					/>
				</div>
			) : null}
			<div
				className="overflow-y-auto overscroll-contain py-2"
				style={{ maxHeight: listMaxHeight }}
			>
				{items.length === 0 ? (
					<p className="px-3 py-2 text-white/35 text-xs">{emptyMessage}</p>
				) : null}
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
						<button
							key={i}
							type="button"
							onClick={() => {
								item.onClick?.();
								onClose();
							}}
							onContextMenu={(event) => item.onContextMenu?.(event)}
							className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs transition-colors ${
								item.danger
									? "text-red hover:bg-white/5"
									: item.active
										? "bg-accent/5 font-semibold text-accent"
										: "text-white/80 hover:bg-white/5"
							}`}
						>
							{item.icon && (
								<span className="text-white/40">{item.icon}</span>
							)}
							<span className="truncate">{item.label}</span>
						</button>
					),
				)}
			</div>
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
