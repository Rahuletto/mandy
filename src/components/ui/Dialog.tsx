import { useEffect, useRef } from "react";

interface DialogProps {
    isOpen: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function Dialog({
    isOpen,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    isDestructive = false,
    onConfirm,
    onCancel,
}: DialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (e.key === "Escape") {
                onCancel();
            }
            if (e.key === "Enter") {
            }
        };

        if (isOpen) {
            document.addEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "hidden";
        }

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "";
        };
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
            <div
                ref={dialogRef}
                className="w-full max-w-sm bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl scale-100 animate-in zoom-in-95 duration-200 p-6 flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col gap-2">
                    <h3 className="text-lg font-semibold text-white leading-none tracking-tight">
                        {title}
                    </h3>
                    {description && (
                        <p className="text-sm text-white/60">
                            {description}
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 mt-2">
                    <button
                        onClick={onCancel}
                        className="px-3 py-2 text-xs cursor-pointer font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 cursor-pointer text-xs font-semibold rounded-full transition-colors shadow-sm ${isDestructive
                            ? "bg-red-500 hover:bg-red-600 text-white"
                            : "bg-accent hover:bg-accent/90 text-background"
                            }`}
                        autoFocus
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
            <div className="absolute inset-0 -z-10" onClick={onCancel} />
        </div>
    );
}
