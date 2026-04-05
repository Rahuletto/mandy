import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
  shortcut?: React.ReactNode;
  icon?: React.ReactNode;
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

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] max-h-[calc(100vh-24px)] min-w-[160px] animate-blur-in overflow-auto rounded-lg border border-border bg-card py-1 shadow-2xl shadow-black/50"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="my-1 border-white/10 border-t" />
        ) : (
          <button
            type="button"
            key={i}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
            className={`flex w-full items-center justify-start gap-4 py-1.5 pr-2 pl-3 text-left text-xs transition-colors ${
              item.disabled
                ? "cursor-not-allowed text-white opacity-50"
                : item.danger
                  ? "text-red hover:bg-red/10"
                  : "text-white opacity-80 hover:bg-white/10"
            }`}
          >
            {item.icon && (
              <span className="text-white opacity-60">{item.icon}</span>
            )}
            <span>{item.label}</span>
            {item.shortcut && <span>{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
