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
	/** When false: no Cancel, backdrop does not close, Escape does nothing. */
	dismissible?: boolean;
	confirmDisabled?: boolean;
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
	dismissible = true,
	confirmDisabled = false,
}: DialogProps) {
	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isOpen) return;
			if (e.key === "Escape" && dismissible) {
				onCancel();
			}
			if (e.key === "Enter") {
				e.preventDefault();
				onConfirm();
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
	}, [isOpen, onCancel, onConfirm, dismissible]);

	if (!isOpen) return null;

	return (
		<div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/50 p-4 duration-200">
			<div
				ref={dialogRef}
				className="flex w-full max-w-sm animate-blur-in flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex flex-col gap-2">
					<h3 className="font-semibold text-lg text-white leading-none tracking-tight">
						{title}
					</h3>
					{description && (
						<p className="text-sm text-white/60">{description}</p>
					)}
				</div>

				<div className="mt-2 flex items-center justify-end gap-3">
					{dismissible && (
						<button
							type="button"
							onClick={onCancel}
							className="cursor-pointer rounded-md bg-white/5 px-3 py-2 font-medium text-white/70 text-xs transition-colors hover:bg-white/10 hover:text-white"
						>
							{cancelLabel}
						</button>
					)}
					<button
						type="button"
						disabled={confirmDisabled}
						onClick={onConfirm}
						className={`rounded-full px-4 py-2 font-semibold text-xs shadow-sm transition-colors ${
							confirmDisabled
								? "cursor-not-allowed opacity-50"
								: "cursor-pointer"
						} ${
							isDestructive
								? "bg-red text-white hover:bg-red"
								: "bg-accent text-background hover:bg-accent/90"
						}`}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
			<div
				className="absolute inset-0 -z-10"
				onClick={dismissible ? onCancel : undefined}
				aria-hidden
			/>
		</div>
	);
}
