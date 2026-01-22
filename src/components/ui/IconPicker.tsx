import { useState, useRef, useEffect } from "react";
import { hexToRgba } from "../../utils/format";
import {
  HiFolder,
  HiLightningBolt,
  HiCube,
  HiGlobe,
  HiServer,
  HiDatabase,
  HiCloud,
  HiCode,
  HiCog,
  HiBeaker,
  HiChip,
  HiCollection,
  HiColorSwatch,
  HiDocumentText,
  HiFire,
  HiHeart,
  HiKey,
  HiLockClosed,
  HiPuzzle,
  HiShieldCheck,
  HiSparkles,
  HiStar,
  HiTag,
  HiTerminal,
  HiTruck,
  HiCubeTransparent,
  HiFingerPrint,
  HiAcademicCap,
  HiBriefcase,
} from "react-icons/hi";
import type { IconType } from "react-icons";

const ICON_OPTIONS: { icon: IconType; name: string }[] = [
  { icon: HiFolder, name: "folder" },
  { icon: HiLightningBolt, name: "lightning" },
  { icon: HiCube, name: "cube" },
  { icon: HiGlobe, name: "globe" },
  { icon: HiServer, name: "server" },
  { icon: HiDatabase, name: "database" },
  { icon: HiCloud, name: "cloud" },
  { icon: HiCode, name: "code" },
  { icon: HiCog, name: "cog" },
  { icon: HiBeaker, name: "beaker" },
  { icon: HiChip, name: "chip" },
  { icon: HiCollection, name: "collection" },
  { icon: HiColorSwatch, name: "swatch" },
  { icon: HiDocumentText, name: "document" },
  { icon: HiFire, name: "fire" },
  { icon: HiHeart, name: "heart" },
  { icon: HiKey, name: "key" },
  { icon: HiLockClosed, name: "lock" },
  { icon: HiPuzzle, name: "puzzle" },
  { icon: HiShieldCheck, name: "shield" },
  { icon: HiSparkles, name: "sparkles" },
  { icon: HiStar, name: "star" },
  { icon: HiTag, name: "tag" },
  { icon: HiTerminal, name: "terminal" },
  { icon: HiTruck, name: "truck" },

  { icon: HiCubeTransparent, name: "cubetransparent" },
  { icon: HiFingerPrint, name: "fingerprint" },
  { icon: HiAcademicCap, name: "academic" },
  { icon: HiBriefcase, name: "briefcase" },
];

const COLOR_OPTIONS = [
  { name: "Gray", value: "#94a3b8" },
  { name: "Red", value: "#f87171" },
  { name: "Orange", value: "#fb923c" },
  { name: "Amber", value: "#fbbf24" },
  { name: "Green", value: "#4ade80" },
  { name: "Emerald", value: "#34d399" },
  { name: "Blue", value: "#60a5fa" },
  { name: "Indigo", value: "#818cf8" },
  { name: "Violet", value: "#a78bfa" },
  { name: "Pink", value: "#f472b6" },
  { name: "Rose", value: "#fb7185" },
  { name: "Accent", value: "#ff502b" },
];

interface IconPickerProps {
  selectedIcon?: string;
  onSelect: (icon: string) => void;
  selectedColor?: string;
  onSelectColor?: (color: string) => void;
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function getIconComponent(iconName?: string): IconType {
  if (!iconName) return HiFolder;
  const found = ICON_OPTIONS.find((opt) => opt.name === iconName);
  return found?.icon || HiFolder;
}

export function IconPicker({
  selectedIcon,
  onSelect,
  selectedColor,
  onSelectColor,
  isOpen,
  onClose,
  anchorRef,
}: IconPickerProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  useEffect(() => {
    if (isOpen && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPosition({
        x: rect.left,
        y: rect.bottom + 8,
      });
      setIsAnimatingOut(false);
    }
  }, [isOpen, anchorRef]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, anchorRef]);

  const handleClose = () => {
    setIsAnimatingOut(true);
    setTimeout(onClose, 200);
  };

  const handleSelect = (iconName: string) => {
    onSelect(iconName);
  };

  const handleSelectColor = (color: string) => {
    if (onSelectColor) {
      onSelectColor(color);
    }
  };

  if (!isOpen && !isAnimatingOut) return null;

  return (
    <div
      ref={popoverRef}
      className={`fixed z-50 bg-card border border-border rounded-xl shadow-2xl p-3 w-[216px] ${
        isAnimatingOut ? "animate-blur-out" : "animate-blur-in"
      }`}
      style={{
        left: position.x,
        top: position.y,
      }}
      onAnimationEnd={() => {
        if (isAnimatingOut) {
          setIsAnimatingOut(false);
        }
      }}
    >
      <div className="grid grid-cols-6 gap-1">
        {ICON_OPTIONS.map(({ icon: Icon, name }) => (
          <button
            key={name}
            onClick={() => handleSelect(name)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors cursor-pointer group ${
              selectedIcon === name ? "ring-1 ring-white/20" : ""
            }`}
            style={{
              backgroundColor:
                selectedIcon === name
                  ? selectedColor
                    ? hexToRgba(selectedColor, 0.15)
                    : "rgba(255, 255, 255, 0.1)"
                  : undefined,
            }}
          >
            <Icon
              size={16}
              style={{ color: selectedColor || "#fff" }}
              className={`transition-colors ${selectedIcon === name ? "opacity-100" : "opacity-60 group-hover:opacity-100"}`}
            />
          </button>
        ))}
      </div>

      <div className="h-px bg-white/5 my-3" />

      <div className="grid grid-cols-7 gap-1.5 px-0.5">
        {COLOR_OPTIONS.map(({ name, value }) => (
          <button
            key={name}
            onClick={() => handleSelectColor(value)}
            className={`w-5 h-5 rounded-full transition-transform hover:scale-110 cursor-pointer relative flex items-center justify-center ${
              selectedColor === value
                ? "ring-2 ring-white/40 ring-offset-2 ring-offset-[#1e1e1e]"
                : ""
            }`}
            style={{ backgroundColor: value }}
            title={name}
          >
            {selectedColor === value && (
              <div className="w-1 h-1 rounded-full bg-white shadow-sm" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
