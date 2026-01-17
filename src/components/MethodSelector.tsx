import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Methods } from "../bindings";

const METHOD_COLORS: Record<string, string> = {
  GET: "#22c55e",
  POST: "#f97316",
  PUT: "#3b82f6",
  PATCH: "#a855f7",
  DELETE: "#ef4444",
  HEAD: "#6b7280",
  OPTIONS: "#06b6d4",
};

const METHODS: Methods[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

interface MethodSelectorProps {
  value: Methods;
  onChange: (method: Methods) => void;
}

export function MethodSelector({ value, onChange }: MethodSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2.5 text-sm font-bold w-[80px] font-mono focus:outline-none flex items-center gap-1 no-drag"
        style={{ color: METHOD_COLORS[value] }}
      >
        {value}
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed bg-inset flex flex-col w-[100px] border border-white/10 rounded-lg shadow-xl py-1 z-[9999]"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          {METHODS.map((method) => (
            <button
              type="button"
              key={method}
              onClick={() => {
                onChange(method);
                setIsOpen(false);
              }}
              className={` text-left px-3 py-1.5 text-xs font-bold font-mono transition-colors hover:bg-white/10 no-drag ${method === value ? "bg-white/5" : ""
                }`}
              style={{ color: METHOD_COLORS[method] }}
            >
              {method}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

export { METHOD_COLORS };

