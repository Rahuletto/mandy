import { useEffect, useRef, useState } from "react";
import { HiX } from "react-icons/hi";
import { SiInsomnia, SiPostman } from "react-icons/si";
import { TbArrowLeft, TbChevronRight, TbPlus, TbUpload } from "react-icons/tb";

type NewProjectSource = "blank" | "postman" | "insomnia";

interface NewProjectModalProps {
	isOpen: boolean;
	onClose: () => void;
	onCreateBlank: (name: string) => void;
	onCreateFromPostman: (collection: object) => void;
	onCreateFromInsomnia: (data: object) => void;
}

export function NewProjectModal({
	isOpen,
	onClose,
	onCreateBlank,
	onCreateFromPostman,
	onCreateFromInsomnia,
}: NewProjectModalProps) {
	const modalRef = useRef<HTMLDivElement>(null);
	const [selectedSource, setSelectedSource] = useState<NewProjectSource | null>(
		null,
	);
	const [projectName, setProjectName] = useState("");
	const [fileContent, setFileContent] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!isOpen) return;

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (selectedSource) {
					setSelectedSource(null);
					setError("");
				} else {
					onClose();
				}
			}
		};

		document.addEventListener("keydown", handleEscape);
		document.body.style.overflow = "hidden";

		return () => {
			document.removeEventListener("keydown", handleEscape);
			document.body.style.overflow = "";
		};
	}, [isOpen, onClose, selectedSource]);

	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		try {
			const text = await file.text();
			setFileContent(text);
			setError("");
		} catch (_err) {
			setError("Failed to read file");
		}
	};

	const handleCreate = async () => {
		setError("");
		setLoading(true);

		try {
			if (selectedSource === "blank") {
				if (!projectName.trim()) {
					setError("Project name is required");
					return;
				}
				onCreateBlank(projectName.trim());
				handleClose();
			} else if (selectedSource === "postman") {
				const collection = JSON.parse(fileContent);
				onCreateFromPostman(collection);
				handleClose();
			} else if (selectedSource === "insomnia") {
				const data = JSON.parse(fileContent);
				onCreateFromInsomnia(data);
				handleClose();
			}
		} catch (err: any) {
			setError(err.message || "Failed to create project");
		} finally {
			setLoading(false);
		}
	};

	const handleClose = () => {
		setSelectedSource(null);
		setProjectName("");
		setFileContent("");
		setError("");
		onClose();
	};

	if (!isOpen) return null;

	const sources = [
		{
			id: "blank" as NewProjectSource,
			label: "Blank Project",
			icon: TbPlus,
			color: "text-accent",
		},
		{
			id: "postman" as NewProjectSource,
			label: "Import from Postman",
			icon: SiPostman,
			color: "text-orange-400",
		},
		{
			id: "insomnia" as NewProjectSource,
			label: "Import from Insomnia",
			icon: SiInsomnia,
			color: "text-purple-400",
		},
	];

	return (
		<div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
			<div
				className="fade-in absolute inset-0 animate-in bg-black/60 duration-300"
				onClick={handleClose}
			/>

			<div
				ref={modalRef}
				className="zoom-in-95 fade-in relative w-full max-w-[320px] animate-in rounded-xl border border-border bg-card shadow-2xl duration-300"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between border-white/5 border-b px-4 py-3">
					{selectedSource && (
						<button
							type="button"
							onClick={() => {
								setSelectedSource(null);
								setFileContent("");
								setProjectName("");
								setError("");
							}}
							className="absolute top-3 left-3 cursor-pointer text-white/30 transition-colors hover:text-white"
						>
							<TbArrowLeft size={16} />
						</button>
					)}
					<div className="flex-1 text-center">
						<h2 className="font-semibold text-sm text-white">
							{selectedSource === "blank"
								? "New Project"
								: selectedSource
									? "Import Project"
									: "New Project"}
						</h2>
					</div>
					<button
						type="button"
						onClick={handleClose}
						className="absolute top-3 right-3 cursor-pointer text-white/30 transition-colors hover:text-white"
					>
						<HiX size={16} />
					</button>
				</div>

				{!selectedSource ? (
					<div className="space-y-1 p-2">
						{sources.map((source) => {
							const Icon = source.icon;
							return (
								<button
									type="button"
									key={source.id}
									onClick={() => setSelectedSource(source.id)}
									className="group flex w-full cursor-pointer items-center gap-3 rounded-lg p-2.5 px-3 text-left transition-colors hover:bg-white/5"
								>
									<Icon
										size={16}
										className="text-white/40 transition-colors group-hover:text-white/80"
									/>
									<span className="flex-1 text-sm text-white/70 transition-colors group-hover:text-white">
										{source.label}
									</span>
									<TbChevronRight
										size={14}
										className="text-white/20 group-hover:text-white/50"
									/>
								</button>
							);
						})}
					</div>
				) : (
					<div className="space-y-4 p-4">
						{selectedSource === "blank" ? (
							<div>
								<label className="mb-2 block pl-1 font-medium text-[11px] text-white/40">
									Project Name
								</label>
								<input
									type="text"
									value={projectName}
									onChange={(e) => setProjectName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && projectName.trim()) handleCreate();
									}}
									placeholder="My awesome project"
									className="w-full rounded-lg border border-border bg-inset px-3 py-2 text-sm text-white transition-all placeholder:text-white/20 focus:border-white/20 focus:outline-none"
								/>
							</div>
						) : (
							<div>
								<input
									ref={fileInputRef}
									type="file"
									accept=".json"
									onChange={handleFileSelect}
									className="hidden"
								/>
								<button
									type="button"
									onClick={() => fileInputRef.current?.click()}
									className={`group flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-6 transition-all ${
										fileContent
											? "border-accent/40 bg-accent/5"
											: "border-white/10 bg-white/2 hover:border-white/20 hover:bg-white/4"
									}`}
								>
									<div
										className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
											fileContent
												? "bg-accent/20"
												: "bg-white/5 group-hover:bg-white/10"
										}`}
									>
										<TbUpload
											size={16}
											className={fileContent ? "text-accent" : "text-white/40"}
										/>
									</div>
									<div className="text-center">
										<div className="font-medium text-sm text-white/70">
											{fileContent ? "File Selected" : "Select File"}
										</div>
										<div className="text-[10px] text-white/30">
											{fileContent ? "Ready to import" : "JSON files only"}
										</div>
									</div>
								</button>
							</div>
						)}

						{error && (
							<div className="rounded-lg border border-red/10 bg-red/10 p-3">
								<p className="flex items-center gap-2 text-red text-xs">
									<span className="h-1 w-1 rounded-full bg-red" />
									{error}
								</p>
							</div>
						)}

						<button
							type="button"
							onClick={handleCreate}
							disabled={
								loading ||
								(selectedSource === "blank"
									? !projectName.trim()
									: !fileContent)
							}
							className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-black text-sm transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{loading ? (
								<div className="h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black" />
							) : (
								<span>
									{selectedSource === "blank"
										? "Create Project"
										: "Import Project"}
								</span>
							)}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
