import { useEffect, useRef } from "react";
import { VscGitMerge, VscRefresh } from "react-icons/vsc";

interface NodeTypePopoverProps {
	position: { x: number; y: number };
	onClose: () => void;
	onAddCondition: () => void;
	onAddLoop: () => void;
}

export function NodeTypePopover({
	position,
	onClose,
	onAddCondition,
	onAddLoop,
}: NodeTypePopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				popoverRef.current &&
				!popoverRef.current.contains(e.target as Node)
			) {
				onClose();
			}
		};

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};

		const handleBlur = () => {
			setTimeout(() => {
				if (!popoverRef.current?.contains(document.activeElement)) onClose();
			}, 100);
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);
		window.addEventListener("blur", handleBlur);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
			window.removeEventListener("blur", handleBlur);
		};
	}, [onClose]);

	const style: React.CSSProperties = {
		position: "fixed",
		left: position.x,
		bottom: window.innerHeight - position.y + 8,
		zIndex: 1000,
	};

	const items = [
		{
			icon: VscGitMerge,
			label: "Condition",
			color: "text-yellow",
			onClick: () => {
				onAddCondition();
				onClose();
			},
		},
		{
			icon: VscRefresh,
			label: "Loop",
			color: "text-cyan-400",
			onClick: () => {
				onAddLoop();
				onClose();
			},
		},
	];

	return (
		<div
			ref={popoverRef}
			style={style}
			className="w-52 overflow-hidden rounded-lg border border-white/10 bg-card"
		>
			<div className="py-1">
				{items.map((item) => (
					<button
						key={item.label}
						type="button"
						onClick={item.onClick}
						className="flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-white/10"
					>
						<item.icon size={14} className={`${item.color} shrink-0`} />
						<div className="font-medium text-white/90 text-xs">
							{item.label}
						</div>
					</button>
				))}
			</div>
		</div>
	);
}
