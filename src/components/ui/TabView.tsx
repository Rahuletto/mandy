interface Tab {
	id: string;
	label: string;
	badge?: number | string;
	/** Native tooltip on hover */
	title?: string;
}

interface TabViewProps {
	tabs: Tab[];
	activeTab: string;
	onTabChange: (tabId: string) => void;
	variant?: "pill" | "underline";
	size?: "sm" | "md";
	className?: string;
}

export function TabView({
	tabs,
	activeTab,
	onTabChange,
	variant = "pill",
	size = "sm",
	className = "",
}: TabViewProps) {
	if (variant === "underline") {
		return (
			<div className={`flex gap-1 border-white/10 border-b ${className}`}>
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						title={tab.title}
						onClick={() => onTabChange(tab.id)}
						className={`relative cursor-pointer px-4 py-2 font-medium text-sm transition-colors ${
							activeTab === tab.id
								? "text-accent"
								: "text-white/50 hover:text-white/80"
						}`}
					>
						<span className="flex items-center gap-2">
							{tab.label}
							{tab.badge !== undefined && (
								<span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
									{tab.badge}
								</span>
							)}
						</span>
						{activeTab === tab.id && (
							<div className="absolute right-0 bottom-0 left-0 h-0.5 bg-accent" />
						)}
					</button>
				))}
			</div>
		);
	}

	// Pill variant (default)
	const sizeClasses =
		size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

	return (
		<div className={`flex gap-1 ${className}`}>
			{tabs.map((tab) => (
				<button
					key={tab.id}
					type="button"
					title={tab.title}
					onClick={() => onTabChange(tab.id)}
					className={`${sizeClasses} cursor-pointer rounded-md font-medium transition-colors ${
						activeTab === tab.id
							? "bg-accent/10 text-accent"
							: "text-white/80 hover:text-white/60"
					}`}
				>
					<span className="flex items-center gap-1.5">
						{tab.label}
						{tab.badge !== undefined && (
							<span className="rounded bg-white/20 px-1 py-0.5 text-[10px]">
								{tab.badge}
							</span>
						)}
					</span>
				</button>
			))}
		</div>
	);
}
