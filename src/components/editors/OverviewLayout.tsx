import {
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { autoSizeTextarea } from "../../utils";
import { CodeViewer } from "../CodeMirror";
import type { Language } from "../CodeMirror/languageExtensions";
import { Dropdown, type MenuItem } from "../ui";

export interface OverviewLayoutProps {
	/** Short label in the snippet panel header (e.g. WS, MQTT). */
	panelBadge: string;
	panelBadgeClassName?: string;
	/** Secondary line in the panel header (e.g. URL). */
	panelSubtitle: string;
	snippetDropdownLabel: string;
	snippetDropdownOpen: boolean;
	onSnippetDropdownOpenChange: (open: boolean) => void;
	snippetDropdownItems: MenuItem[];
	/** When set, replaces the CodeViewer (e.g. GraphQL query + variables layout). */
	snippetPanelBody?: ReactNode;
	snippetCode?: string;
	snippetViewerLanguage?: Language;
	/** Primary action (e.g. Connect) — rendered bottom-right on the snippet panel. */
	action: ReactNode;
	/** Optional content under the title/description on the left (params, tables, etc.). */
	leftFooter?: ReactNode;
	name: string;
	description: string;
	onCommitName: (name: string) => void;
	onDescriptionChange: (description: string) => void;
}

/**
 * Shared overview chrome: editable title, auto-growing description, optional left body,
 * sticky snippet panel with language dropdown and primary action.
 */
export const OverviewLayout = ({
	panelBadge,
	panelBadgeClassName = "bg-emerald-500/20 text-emerald-400",
	panelSubtitle,
	snippetDropdownLabel,
	snippetDropdownOpen,
	onSnippetDropdownOpenChange,
	snippetDropdownItems,
	snippetPanelBody,
	snippetCode,
	snippetViewerLanguage,
	action,
	leftFooter,
	name,
	description,
	onCommitName,
	onDescriptionChange,
}: OverviewLayoutProps) => {
	const [isEditingName, setIsEditingName] = useState(false);
	const [nameDraft, setNameDraft] = useState(name);
	const descriptionRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		setNameDraft(name);
	}, [name]);

	useLayoutEffect(() => {
		autoSizeTextarea(descriptionRef.current);
	}, []);

	const handleNameBlur = () => {
		setIsEditingName(false);
		const next = nameDraft.trim();
		if (next && next !== name) {
			onCommitName(next);
		} else {
			setNameDraft(name);
		}
	};

	return (
		<div className="h-full overflow-y-auto overflow-x-hidden">
			<div className="flex min-h-full max-w-[1600px] mx-auto relative pl-8 pr-4 gap-8">
				<div className="flex-1 py-12 w-[40%]">
					<div className="max-w-3xl">
						{isEditingName ? (
							<input
								className="text-2xl font-bold bg-transparent border-none outline-none text-white w-full mb-2"
								value={nameDraft}
								onChange={(e) => setNameDraft(e.target.value)}
								onBlur={handleNameBlur}
								onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
							/>
						) : (
							<h1
								className="text-2xl font-bold text-white mb-2 cursor-text hover:text-white/90"
								onClick={() => setIsEditingName(true)}
							>
								{name}
							</h1>
						)}

						<textarea
							ref={descriptionRef}
							className="w-full bg-transparent border-none outline-none text-sm text-white/60 resize-none overflow-hidden min-h-6 mb-3 placeholder:text-white/20"
							placeholder="Add a description..."
							value={description}
							onChange={(e) => onDescriptionChange(e.target.value)}
						/>

						{leftFooter ? (
							<section className="flex flex-col gap-8">{leftFooter}</section>
						) : null}

						<div className="h-24" />
					</div>
				</div>

				<div className="w-[60%] shrink-0 py-4 self-start sticky top-0 h-[80vh]">
					<div className="h-full rounded-xl bg-background border border-white/5 overflow-hidden flex flex-col">
						<div className="flex shrink-0 items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
							<div className="flex items-center gap-2 min-w-0">
								<span
									className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${panelBadgeClassName}`}
								>
									{panelBadge}
								</span>
								<span className="text-xs text-white/40 truncate max-w-[150px]">
									{panelSubtitle}
								</span>
							</div>

							{snippetDropdownItems.length > 0 ? (
								<div className="relative shrink-0">
									<button
										type="button"
										onClick={() =>
											onSnippetDropdownOpenChange(!snippetDropdownOpen)
										}
										className="text-[11px] text-white/60 hover:text-white flex items-center gap-1"
									>
										{snippetDropdownLabel}
										<svg
											width="10"
											height="10"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
										>
											<path d="m6 9 6 6 6-6" />
										</svg>
									</button>
									{snippetDropdownOpen && (
										<Dropdown
											className="top-full right-0 mt-1"
											onClose={() => onSnippetDropdownOpenChange(false)}
											items={snippetDropdownItems}
										/>
									)}
								</div>
							) : snippetDropdownLabel ? (
								<span className="text-[11px] text-white/30 shrink-0">
									{snippetDropdownLabel}
								</span>
							) : null}
						</div>

						<div className="flex-1 min-h-0 text-[11px] relative">
							<div className="absolute inset-0 overflow-auto">
								{snippetPanelBody ?? (
									<CodeViewer
										code={snippetCode ?? ""}
										language={snippetViewerLanguage ?? "text"}
									/>
								)}
							</div>
							{action}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
