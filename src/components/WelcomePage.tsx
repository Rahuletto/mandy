import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BiFile } from "react-icons/bi";
import { FaFolder } from "react-icons/fa6";
import { TbChevronDown, TbPlus } from "react-icons/tb";
import { allItemTypes, creatableItemTypes, RequestTypeIcon } from "../registry";
import type { RequestType } from "../types/project";
import { getMethodColor, getShortMethod } from "../utils/methodConstants";
import { Logo } from "./ui";

interface WelcomePageProps {
	onNewItem: (type: RequestType) => void;
	onNewFolder: () => void;
	onImportClick: () => void;
	recentRequests: Array<{
		requestId: string;
		method: string;
		name: string;
	}>;
	onSelectRecent: (id: string) => void;
	projects: Array<{ id: string; name: string }>;
	activeProjectId: string | null;
	onSelectProject: (id: string) => void;
	onNewProject: () => void;
}

function RecentTypeIcon({ method }: { method: string }) {
	const m = method.toUpperCase();
	const entry = allItemTypes.find(
		(c) =>
			c.matchRecentsByShortLabel !== false && c.shortLabel.toUpperCase() === m,
	);
	if (entry) {
		return <RequestTypeIcon type={entry.type} className="shrink-0" />;
	}
	return (
		<span
			className="shrink-0 text-right font-bold font-mono text-[11px]"
			style={{ color: getMethodColor(method) }}
		>
			{getShortMethod(method)}
		</span>
	);
}

export const WelcomePage: React.FC<WelcomePageProps> = ({
	onNewItem,
	onNewFolder,
	onImportClick,
	recentRequests,
	onSelectRecent,
	projects,
	activeProjectId,
	onSelectProject,
	onNewProject,
}) => {
	const [showProjectSelector, setShowProjectSelector] = useState(false);
	const [showRequestTypes, setShowRequestTypes] = useState(false);
	const activeProject = projects.find((p) => p.id === activeProjectId);
	const requestDropdownRef = useRef<HTMLDivElement>(null);
	const projectSelectorRef = useRef<HTMLDivElement>(null);

	const requestTypeEntries = useMemo(
		() =>
			creatableItemTypes.map((cfg) => ({
				type: cfg.type,
				label: cfg.label,
				icon: <RequestTypeIcon type={cfg.type} size={16} />,
			})),
		[],
	);

	useEffect(() => {
		if (!showRequestTypes) return;
		const handleClick = (e: MouseEvent) => {
			if (
				requestDropdownRef.current &&
				!requestDropdownRef.current.contains(e.target as Node)
			) {
				setShowRequestTypes(false);
			}
		};
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === "Escape") setShowRequestTypes(false);
		};
		document.addEventListener("mousedown", handleClick);
		document.addEventListener("keydown", handleEsc);
		return () => {
			document.removeEventListener("mousedown", handleClick);
			document.removeEventListener("keydown", handleEsc);
		};
	}, [showRequestTypes]);

	useEffect(() => {
		if (!showProjectSelector) return;
		const handleClick = (e: MouseEvent) => {
			if (
				projectSelectorRef.current &&
				!projectSelectorRef.current.contains(e.target as Node)
			) {
				setShowProjectSelector(false);
			}
		};
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === "Escape") setShowProjectSelector(false);
		};
		document.addEventListener("mousedown", handleClick);
		document.addEventListener("keydown", handleEsc);
		return () => {
			document.removeEventListener("mousedown", handleClick);
			document.removeEventListener("keydown", handleEsc);
		};
	}, [showProjectSelector]);

	return (
		<div className="flex h-full flex-1 select-none flex-col items-center justify-center overflow-auto py-20 font-sans text-white/30">
			<div className="fade-in slide-in-from-bottom-4 mb-10 flex animate-in flex-col items-center duration-1000">
				<div className="relative mb-2">
					<Logo className="h-16 w-16 opacity-[0.3]" />
				</div>

				<div className="relative mt-4">
					{showProjectSelector && (
						<div
							className="fixed inset-0 z-40"
							aria-hidden
							onClick={() => setShowProjectSelector(false)}
						/>
					)}
					<div ref={projectSelectorRef} className="relative z-50">
						<button
							type="button"
							onClick={() => setShowProjectSelector(!showProjectSelector)}
							className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/2 px-3 py-1.5 text-[13px] text-white/30 outline-none transition-all hover:bg-white/5 hover:text-white/40"
						>
							<span className="font-medium">
								{activeProject?.name || "Select Project"}
							</span>
							<TbChevronDown
								size={12}
								className={`opacity-30 transition-transform ${showProjectSelector ? "rotate-180" : ""}`}
							/>
						</button>

						{showProjectSelector && (
							<div className="fade-in zoom-in-95 absolute top-full left-1/2 z-50 mt-2 w-48 -translate-x-1/2 animate-in rounded-xl border border-border bg-card py-1.5 shadow-2xl duration-200">
								{projects.map((p) => (
									<button
										type="button"
										key={p.id}
										onClick={() => {
											onSelectProject(p.id);
											setShowProjectSelector(false);
										}}
										className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors ${
											p.id === activeProjectId
												? "bg-accent/10 text-accent"
												: "text-white/60 hover:bg-white/5 hover:text-white"
										}`}
									>
										<span className="truncate">{p.name}</span>
									</button>
								))}
								<div className="mx-2 my-1 h-px bg-white/5" />
								<button
									type="button"
									onClick={() => {
										onNewProject();
										setShowProjectSelector(false);
									}}
									className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-white/40 transition-colors hover:bg-white/5 hover:text-white"
								>
									<TbPlus size={14} className="opacity-50" />
									<span>Create Project</span>
								</button>
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="fade-in slide-in-from-bottom-8 w-full max-w-[320px] animate-in space-y-8 delay-200 duration-700">
				<div className="space-y-3">
					<h2 className="text-white/40 text-xs">New</h2>
					<div className="space-y-3.5">
						<div className="relative" ref={requestDropdownRef}>
							<button
								type="button"
								onClick={() => setShowRequestTypes(!showRequestTypes)}
								className={`group flex w-full cursor-pointer items-center gap-3 text-left text-white transition-all duration-200 ${
									showRequestTypes
										? "opacity-90"
										: "opacity-50 hover:opacity-80"
								}`}
							>
								<div className="flex h-4 w-4 items-center justify-center">
									<TbPlus size={18} />
								</div>
								<span className="font-medium text-[14px]">New Request</span>
								<TbChevronDown
									size={12}
									className={`ml-auto opacity-30 transition-transform duration-200 ${showRequestTypes ? "rotate-180" : ""}`}
								/>
							</button>

							{showRequestTypes && (
								<div className="fade-in slide-in-from-top-2 zoom-in-95 absolute z-50 mt-2 ml-7 min-w-[200px] origin-top animate-in rounded-xl border border-border bg-card py-1.5 shadow-2xl duration-200">
									{requestTypeEntries.map((rt) => (
										<button
											type="button"
											key={rt.type}
											onClick={() => {
												onNewItem(rt.type);
												setShowRequestTypes(false);
											}}
											className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-white/60 transition-colors hover:bg-white/5 hover:text-white"
										>
											<span className="shrink-0">{rt.icon}</span>
											<span className="font-medium text-[13px]">
												{rt.label}
											</span>
										</button>
									))}
								</div>
							)}
						</div>

						<button
							type="button"
							onClick={onNewFolder}
							className={`group flex w-full cursor-pointer items-center gap-3 text-left text-white transition-all duration-200 ${
								showRequestTypes
									? "pointer-events-none opacity-20"
									: "opacity-50 hover:opacity-80"
							}`}
						>
							<div className="flex h-4 w-4 items-center justify-center">
								<FaFolder size={14} />
							</div>
							<span className="font-medium text-[14px]">New Folder</span>
						</button>
						<button
							type="button"
							onClick={onImportClick}
							className={`group flex w-full cursor-pointer items-center gap-3 text-left text-white transition-all duration-200 ${
								showRequestTypes
									? "pointer-events-none opacity-20"
									: "opacity-50 hover:opacity-80"
							}`}
						>
							<div className="flex h-4 w-4 items-center justify-center">
								<BiFile size={16} />
							</div>
							<span className="font-medium text-[14px]">Import from file</span>
						</button>
					</div>
				</div>

				<div
					className={`space-y-5 transition-opacity duration-200 ${
						showRequestTypes ? "pointer-events-none opacity-20" : ""
					}`}
				>
					<h2 className="text-white/40 text-xs">Recents</h2>
					<div className="space-y-3.5">
						{recentRequests.length > 0 ? (
							recentRequests.slice(0, 5).map((req) => (
								<button
									type="button"
									key={req.requestId}
									onClick={() => onSelectRecent(req.requestId)}
									className="group flex w-full items-center gap-3 text-left text-white/40 transition-all duration-200 hover:text-white/80"
								>
									<div className="flex w-10 shrink-0 items-center justify-end opacity-80 transition-opacity group-hover:opacity-100 [&_svg]:max-h-[14px] [&_svg]:max-w-[14px]">
										<RecentTypeIcon method={req.method} />
									</div>
									<span className="truncate font-medium text-[14px]">
										{req.name}
									</span>
								</button>
							))
						) : (
							<div className="pl-10 text-[13px] text-white/5 italic">
								No recent requests
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
