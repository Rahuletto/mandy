import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Methods } from "../bindings";
import { getMethodColor, METHOD_COLORS } from "../utils/methodConstants";

const METHODS: Methods[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

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
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
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
        className="no-drag flex w-[80px] items-center gap-1 px-4 py-2.5 font-bold font-mono text-sm focus:outline-none"
        style={{ color: METHOD_COLORS[value] }}
      >
        {value}
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] flex w-[100px] flex-col rounded-lg border border-white/10 bg-inset py-1 shadow-xl"
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
                className={`no-drag px-3 py-1.5 text-left font-bold font-mono text-xs transition-colors hover:bg-white/10 ${
                  method === value ? "bg-white/5" : ""
                }`}
                style={{ color: getMethodColor(method) }}
              >
                {method}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
