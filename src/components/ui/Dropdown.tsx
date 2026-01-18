import { useEffect, useRef } from "react";
import { BsThreeDots } from "react-icons/bs";

export interface DropdownItem {
    label: string;
    onClick: () => void;
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
    className?: string;
    width?: string;
}

export function Dropdown({ items, onClose, className = "", width = "min-w-[160px]" }: DropdownProps) {
    const ref = useRef<HTMLDivElement>(null);

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
            className={`absolute z-50 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl py-2 ${width} ${className} animate-blur-in`}
        >
            {items.map((item, i) =>
                item.divider ? (
                    <div key={i} className="border-t border-white/10 my-1" />
                ) : item.header ? (
                    <div key={i} className="px-3 py-2 text-xs text-white/30 mt-2 first:mt-1">
                        {item.label}
                    </div>
                ) : (
                    <div
                        key={i}
                        className={`flex items-center group transition-colors ${item.active ? "bg-accent/5" : "hover:bg-white/5"
                            }`}
                    >
                        <button
                            onClick={() => {
                                item.onClick();
                                onClose();
                            }}
                            className={`flex-1 text-left px-4 py-2 text-xs flex items-center gap-2.5 ${item.danger
                                ? "text-red-400"
                                : item.active
                                    ? "text-accent font-semibold"
                                    : "text-white/80"
                                }`}
                        >
                            {item.icon && <span className="text-white/40">{item.icon}</span>}
                            <span className="truncate">{item.label}</span>
                        </button>
                        {item.rightAction && (
                            <div className="px-2">
                                {item.rightAction}
                            </div>
                        )}
                    </div>
                )
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
            className={`p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors ${className}`}
        >
            <BsThreeDots size={14} />
        </button>
    );
}
