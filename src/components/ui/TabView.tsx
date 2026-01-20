interface Tab {
  id: string;
  label: string;
  badge?: number | string;
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
      <div className={`flex gap-1 border-b border-white/10 ${className}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer relative ${
              activeTab === tab.id
                ? "text-accent"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            <span className="flex items-center gap-2">
              {tab.label}
              {tab.badge !== undefined && (
                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">
                  {tab.badge}
                </span>
              )}
            </span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
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
          onClick={() => onTabChange(tab.id)}
          className={`${sizeClasses} cursor-pointer font-medium rounded-md transition-colors ${
            activeTab === tab.id
              ? "text-accent bg-accent/10"
              : "text-white/80 hover:text-white/60"
          }`}
        >
          <span className="flex items-center gap-1.5">
            {tab.label}
            {tab.badge !== undefined && (
              <span className="text-[10px] bg-white/20 px-1 py-0.5 rounded">
                {tab.badge}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
