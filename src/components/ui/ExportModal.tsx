import { useEffect, useRef } from "react";
import { HiX } from "react-icons/hi";
import { SiInsomnia, SiPostman, SiSwagger } from "react-icons/si";
import { Logo } from "./Logo";

interface ExportModalProps {
	isOpen: boolean;
	onClose: () => void;
	onExportOpenAPI: () => void;
	onExportMandy: () => void;
	onExportPostman: () => void;
	onExportInsomnia: () => void;
}

export function ExportModal({
	isOpen,
	onClose,
	onExportOpenAPI,
	onExportMandy,
	onExportPostman,
	onExportInsomnia,
}: ExportModalProps) {
	const modalRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!isOpen) return;

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};

		document.addEventListener("keydown", handleEscape);
		document.body.style.overflow = "hidden";

		return () => {
			document.removeEventListener("keydown", handleEscape);
			document.body.style.overflow = "";
		};
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	const exportOptions = [
		{
			id: "mandy",
			label: "Mandy Project",
			isLogo: true,
			onClick: onExportMandy,
		},
		{
			id: "openapi",
			label: "OpenAPI Spec",
			icon: SiSwagger,
			onClick: onExportOpenAPI,
		},
		{
			id: "postman",
			label: "Postman Collection",
			icon: SiPostman,
			onClick: onExportPostman,
		},
		{
			id: "insomnia",
			label: "Insomnia Export",
			icon: SiInsomnia,
			onClick: onExportInsomnia,
		},
	];

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
			<div
				className="fade-in absolute inset-0 animate-in bg-black/60 duration-300"
				onClick={onClose}
			/>

			<div
				ref={modalRef}
				className="zoom-in-95 fade-in relative w-full max-w-[320px] animate-in overflow-hidden rounded-xl border border-border bg-card shadow-2xl duration-300"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between border-border/50 border-b px-4 py-3">
					<div className="flex-1 text-center">
						<h2 className="font-semibold text-sm text-white">Export</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="absolute top-3 right-3 cursor-pointer text-white/30 transition-colors hover:text-white"
					>
						<HiX size={16} />
					</button>
				</div>

				<div className="space-y-1 p-2">
					{exportOptions.map((option) => {
						return (
							<button
								type="button"
								key={option.id}
								onClick={() => {
									option.onClick();
									onClose();
								}}
								className="group flex w-full cursor-pointer items-center gap-3 rounded-lg p-2.5 px-3 text-left transition-colors hover:bg-white/5"
							>
								{option.isLogo ? (
									<Logo
										width={16}
										height={16}
										className="text-white/40 transition-colors group-hover:text-white/80"
									/>
								) : (
									<>
										{option.id === "openapi" && (
											<SiSwagger
												size={16}
												className="text-white/40 transition-colors group-hover:text-white/80"
											/>
										)}
										{option.id === "postman" && (
											<SiPostman
												size={16}
												className="text-white/40 transition-colors group-hover:text-white/80"
											/>
										)}
										{option.id === "insomnia" && (
											<SiInsomnia
												size={16}
												className="text-white/40 transition-colors group-hover:text-white/80"
											/>
										)}
									</>
								)}
								<span className="flex-1 text-sm text-white/70 transition-colors group-hover:text-white">
									{option.label}
								</span>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
