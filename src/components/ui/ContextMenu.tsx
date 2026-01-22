import { useEffect, useRef, useState, useLayoutEffect } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
  shortcut?: React.ReactNode;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const padding = 12;
    let newLeft = x;
    let newTop = y;

    if (x + rect.width > window.innerWidth - padding) {
      newLeft = window.innerWidth - rect.width - padding;
    }

    if (y + rect.height > window.innerHeight - padding) {
      newTop = window.innerHeight - rect.height - padding;
    }

    setPos({
      left: Math.max(padding, newLeft),
      top: Math.max(padding, newTop),
    });
  }, [x, y]);

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
      className="fixed z-[9999] bg-card border border-border rounded-lg shadow-2xl py-1 min-w-[160px] max-h-[calc(100vh-24px)] overflow-auto shadow-black/50 animate-blur-in"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="border-t border-white/10 my-1" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between gap-4 ${
              item.disabled
                ? "opacity-50 cursor-not-allowed text-white/50"
                : item.danger
                  ? "text-red-400 hover:bg-red-500/10"
                  : "text-white/80 hover:bg-white/10"
            }`}
          >
            <span>{item.label}</span>
            {item.shortcut && <span>{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}
