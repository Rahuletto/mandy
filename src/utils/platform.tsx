import { ReactNode } from "react";
import { BsCommand } from "react-icons/bs";
import { MdKeyboardControlKey } from "react-icons/md";

export const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

export function getModifierKey(): string {
    return isMac ? "Cmd" : "Ctrl";
}

export function getModifierIcon(): ReactNode {
    return isMac ? <BsCommand /> : <MdKeyboardControlKey />; // Using standard icons
}

export const SHORTCUTS = {
    SAVE: { label: "Save", mac: "Cmd+S", win: "Ctrl+S" },
    NewRequest: { label: "New Request", mac: "Cmd+N", win: "Ctrl+N" },
    RUN: { label: "Run Request", mac: "Cmd+Return", win: "Ctrl+Enter" },
    DELETE: { label: "Delete", mac: "Cmd+Delete", win: "Delete" },
    RENAME: { label: "Rename", mac: "Return", win: "F2" }, // F2 is standard on Windows, Return on Mac
    CUT: { label: "Cut", mac: "Cmd+X", win: "Ctrl+X" },
    COPY: { label: "Copy", mac: "Cmd+C", win: "Ctrl+C" },
    PASTE: { label: "Paste", mac: "Cmd+V", win: "Ctrl+V" },
    DUPLICATE: { label: "Duplicate", mac: "Cmd+D", win: "Ctrl+D" },
};

export function getShortcutDisplay(key: keyof typeof SHORTCUTS): ReactNode {
    return <div className="flex items-center gap-0.5 text-[10px] opacity-50 font-mono">
        {isMac ? (
            <>
                {SHORTCUTS[key].mac.split('+').map((part, i) => {
                    if (part === "Cmd") return <BsCommand key={i} />;
                    return <span key={i}>{part}</span>;
                })}
            </>
        ) : (
            <span>{SHORTCUTS[key].win}</span>
        )}
    </div>;
}

export function getSimpleShortcut(action: "Cut" | "Copy" | "Paste" | "Delete" | "Duplicate"): ReactNode {
    const map = {
        Cut: SHORTCUTS.CUT,
        Copy: SHORTCUTS.COPY,
        Paste: SHORTCUTS.PASTE,
        Delete: SHORTCUTS.DELETE,
        Duplicate: SHORTCUTS.DUPLICATE
    };
    const sc = map[action];
    if (!sc) return null;

    return getShortcutDisplay(action.toUpperCase() as any);
}
