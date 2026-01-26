import { useRef, useEffect } from "react";
import { VscCode, VscGitMerge, VscRefresh } from "react-icons/vsc";

interface NodeTypePopoverProps {
  position: { x: number; y: number };
  onClose: () => void;
  onAddScript: () => void;
  onAddCondition: () => void;
  onAddLoop: () => void;
}

export function NodeTypePopover({
  position,
  onClose,
  onAddScript,
  onAddCondition,
  onAddLoop
}: NodeTypePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
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
      icon: VscCode,
      label: "Custom Script",
      color: "text-purple-400",
      onClick: () => { onAddScript(); onClose(); },
    },
    {
      icon: VscGitMerge,
      label: "Condition",
      color: "text-yellow",
      onClick: () => { onAddCondition(); onClose(); },
    },
    {
      icon: VscRefresh,
      label: "Loop",
      color: "text-cyan-400",
      onClick: () => { onAddLoop(); onClose(); },
    },
  ];

  return (
    <div
      ref={popoverRef}
      style={style}
      className="w-52 bg-card border border-white/10 rounded-lg overflow-hidden"
    >
      <div className="py-1">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className="w-full flex items-start gap-3 px-3 py-2 hover:bg-white/10 transition-colors text-left"
          >
            <item.icon size={14} className={`${item.color} shrink-0`} />
              <div className="text-xs text-white/90 font-medium">{item.label}</div>

          </button>
        ))}
      </div>
    </div>
  );
}
