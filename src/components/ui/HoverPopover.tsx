import { useState, useRef, useEffect, type ReactNode } from "react";

interface HoverPopoverProps {
  children: ReactNode;
  anchorRef: React.RefObject<HTMLElement>;
  open?: boolean;
  onClose?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  className?: string;
  position?: "top" | "bottom";
}

export function HoverPopover({
  children,
  anchorRef,
  open = true,
  onClose,
  onMouseEnter,
  onMouseLeave,
  className = "",
  position = "top",
}: HoverPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [isClosing, setIsClosing] = useState(false);
  const [render, setRender] = useState(open);

  useEffect(() => {
    if (open) {
      setRender(true);
      setIsClosing(false);
    } else {
      setIsClosing(true);
      const timer = setTimeout(() => setRender(false), 500);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    const updatePosition = () => {
      if (anchorRef.current && popoverRef.current) {
        const anchorRect = anchorRef.current.getBoundingClientRect();
        const popoverRect = popoverRef.current.getBoundingClientRect();

        let top: number;
        let left =
          anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2;

        if (position === "top") {
          top = anchorRect.top - popoverRect.height - 8;
        } else {
          top = anchorRect.bottom + 8;
        }

        if (left < 8) left = 8;
        if (left + popoverRect.width > window.innerWidth - 8) {
          left = window.innerWidth - popoverRect.width - 8;
        }

        if (position === "top" && top < 8) {
          top = anchorRect.bottom + 8;
        } else if (
          position === "bottom" &&
          top + popoverRect.height > window.innerHeight - 8
        ) {
          top = anchorRect.top - popoverRect.height - 8;
        }

        setCoords({ top, left });
      }
    };

    if (render) {
      updatePosition();
      window.addEventListener("resize", updatePosition);
      window.addEventListener("scroll", updatePosition, true);
    }
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, position, render]);

  useEffect(() => {
    if (!onClose || isClosing || !render) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        if (onClose) onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (onClose) onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, isClosing, render]);

  if (!render) return null;

  return (
    <div
      ref={popoverRef}
      className={`${className} fixed z-50 bg-card border border-border rounded-xl shadow-2xl p-3 ${isClosing ? "animate-blur-out" : "animate-blur-in"}`}
      style={{ top: coords.top, left: coords.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}
