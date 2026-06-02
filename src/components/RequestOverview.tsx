import type React from "react";
import { useMemo, useState } from "react";
import { decodeBody } from "../reqhelpers/rest";
import { useProjectStore } from "../stores/projectStore";
import type { ObjectDefinition } from "../types/overview";
import type { RequestFile } from "../types/project";
import {
	generateRestSnippet,
	getDefaultRestSnippetId,
	getLegacyLanguageSnippetId,
	listRestSnippetProfiles,
} from "../utils/restSnippets";
import {
	extractDefinitions,
	getTypeColor,
	scrollToId,
} from "../utils/overviewUtils";
import { OverviewLayout } from "./editors/OverviewLayout";
import type { DropdownItem } from "./ui";

interface RequestOverviewProps {
	activeRequest: RequestFile;
	onRun: () => void;
	onUpdateName: (name: string) => void;
	onUpdateDescription: (description: string) => void;
	onUpdatePropertyDescription: (key: string, description: string) => void;
	onSwitchToBody: () => void;
}

export const RequestOverview: React.FC<RequestOverviewProps> = ({
	activeRequest,
	onRun,
	onUpdateName,
	onUpdateDescription,
	onUpdatePropertyDescription,
	onSwitchToBody,
}) => {
	const [showSnippetDropdown, setShowSnippetDropdown] = useState(false);
	const [snippetSearch, setSnippetSearch] = useState("");
	const [editingProperty, setEditingProperty] = useState<string | null>(null);
	const [propDescValue, setPropDescValue] = useState("");
	const selectedLanguage = useProjectStore((state) => state.selectedLanguage);
	const selectedRestSnippetId = useProjectStore(
		(state) => state.selectedRestSnippetId,
	);
	const setSelectedRestSnippetId = useProjectStore(
		(state) => state.setSelectedRestSnippetId,
	);

	const snippetProfiles = useMemo(() => listRestSnippetProfiles(), []);
	const activeSnippetId =
		selectedRestSnippetId ||
		getLegacyLanguageSnippetId(selectedLanguage) ||
		getDefaultRestSnippetId();
	const { code: snippetCode, language: currentLang } = generateRestSnippet(
		activeSnippetId,
		activeRequest.request,
	);

	const definitions = useMemo(() => {
		let allDefs: ObjectDefinition[] = [];
		const seen = new Set<string>();

		const reqBody = activeRequest.request.body;
		if (
			reqBody !== "None" &&
			"Raw" in reqBody &&
			reqBody.Raw.content_type?.includes("json")
		) {
			try {
				const data = JSON.parse(reqBody.Raw.content);
				allDefs = [
					...allDefs,
					...extractDefinitions(data, "RequestBody", seen),
				];
			} catch (_e) {}
		}

		if (activeRequest.response) {
			const bodyText = decodeBody(activeRequest.response);
			if (bodyText) {
				try {
					const data = JSON.parse(bodyText);
					allDefs = [
						...allDefs,
						...extractDefinitions(data, "ResponseBody", seen),
					];
				} catch (_e) {}
			}
		}

		return allDefs;
	}, [activeRequest]);

	const handlePropDescBlur = (key: string) => {
		onUpdatePropertyDescription(key, propDescValue);
		setEditingProperty(null);
	};

	const renderProperty = (
		key: string,
		value: unknown,
		context?: string,
		allowDescription?: boolean,
		showTypes: boolean = true,
	) => {
		const type = Array.isArray(value) ? "array" : typeof value;
		const isObject = type === "object" && value !== null;
		const isObjectArray =
			type === "array" &&
			Array.isArray(value) &&
			value.length > 0 &&
			typeof value[0] === "object";

		const fullKey = context ? `${context}.${key}` : key;
		const savedDesc = activeRequest.propertyDescriptions?.[fullKey] || "";

		let targetId = "";
		if (isObject)
			targetId = `def-${key.charAt(0).toUpperCase() + key.slice(1)}`;
		if (isObjectArray)
			targetId = `def-${key.charAt(0).toUpperCase() + key.slice(1)}Item`;

		return (
			<div
				key={key}
				className="group border-white/5 border-b py-2 last:border-0"
			>
				<div className="flex items-center gap-3">
					<span className="font-medium font-mono text-white text-xs">
						{key}
					</span>
					{showTypes &&
						(targetId ? (
							<button
								type="button"
								onClick={() => scrollToId(targetId)}
								className={`cursor-pointer font-mono text-[10px] lowercase hover:underline ${getTypeColor(type)}`}
							>
								{type}
							</button>
						) : (
							<span
								className={`font-mono text-[10px] lowercase ${getTypeColor(type)}`}
							>
								{type}
							</span>
						))}
					{key === "id" && (
						<span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400 leading-none">
							read-only
						</span>
					)}
				</div>

				{allowDescription && (
					<div className="mt-1 flex min-h-[18px] items-center">
						{editingProperty === fullKey ? (
							<input
								className="m-0 w-full border-none bg-transparent p-0 text-[11px] text-white/80 leading-none outline-none"
								value={propDescValue}
								onChange={(e) => setPropDescValue(e.target.value)}
								onBlur={() => handlePropDescBlur(fullKey)}
								onKeyDown={(e) =>
									e.key === "Enter" && handlePropDescBlur(fullKey)
								}
								placeholder="Enter description..."
							/>
						) : (
							<button
								type="button"
								className="w-full cursor-text text-left text-[11px] text-white/40 leading-none transition-colors hover:text-white/60"
								onClick={() => {
									setEditingProperty(fullKey);
									setPropDescValue(savedDesc);
								}}
							>
								{savedDesc || "No description"}
							</button>
						)}
					</div>
				)}
			</div>
		);
	};

	const renderStructure = (
		title: string,
		data: Record<string, unknown>,
		showSwitch?: boolean,
		context?: string,
		allowDescription?: boolean,
	) => {
		if (!data) return null;
		return (
			<div className="mt-4">
				<div className="mb-6 flex items-center justify-start gap-5">
					<h3 className="font-semibold text-sm text-white/70">{title}</h3>
					{showSwitch && (
						<button
							type="button"
							onClick={onSwitchToBody}
							className="cursor-pointer rounded-full bg-white/5 px-3 py-1 font-medium text-[10px] text-white/80 transition-colors hover:bg-white/2 hover:text-white/50"
						>
							Show Body
						</button>
					)}
				</div>
				<div className="space-y-1">
					{Object.entries(data).map(([key, value]) =>
						renderProperty(
							key,
							value,
							context,
							allowDescription,
							showSwitch || context === "response" || context === "request",
						),
					)}
				</div>
			</div>
		);
	};

	const method = activeRequest.request.method;
	const methodBadgeClassName =
		method === "GET"
			? "bg-green/20 text-green"
			: method === "POST"
				? "bg-blue-500/20 text-blue-400"
				: method === "PUT"
					? "bg-yellow/20 text-yellow"
					: method === "DELETE"
						? "bg-red/20 text-red"
						: "bg-gray-500/20 text-gray-400";

	const filteredSnippetProfiles = useMemo(() => {
		const query = snippetSearch.trim().toLowerCase();
		if (!query) return snippetProfiles;
		return snippetProfiles.filter((profile) =>
			`${profile.languageGroup} ${profile.clientLabel} ${profile.label}`
				.toLowerCase()
				.includes(query),
		);
	}, [snippetProfiles, snippetSearch]);

	const snippetDropdownItems: DropdownItem[] = useMemo(() => {
		const items: DropdownItem[] = [];
		let previousGroup = "";
		for (const profile of filteredSnippetProfiles) {
			if (previousGroup !== profile.languageGroup) {
				previousGroup = profile.languageGroup;
				items.push({ label: previousGroup, header: true });
			}
			items.push({
				label: profile.clientLabel,
				active: profile.id === activeSnippetId,
				onClick: () => {
					setSelectedRestSnippetId(profile.id);
					setShowSnippetDropdown(false);
				},
			});
		}
		return items;
	}, [activeSnippetId, filteredSnippetProfiles, setSelectedRestSnippetId]);

	const leftFooter = (
		<>
			{Object.keys(activeRequest.request.query_params).length > 0 && (
				<div className="mt-4">
					<h3 className="mb-2 font-semibold text-sm text-white/70">
						Query Parameters
					</h3>
					<div className="space-y-1">
						{Object.entries(activeRequest.request.query_params).map(
							([key, value]) =>
								renderProperty(key, value, "params", true, false),
						)}
					</div>
				</div>
			)}

			{(() => {
				const body = activeRequest.request.body;
				if (
					body !== "None" &&
					"Raw" in body &&
					body.Raw.content_type?.includes("json")
				) {
					try {
						return renderStructure(
							"Request Body",
							JSON.parse(body.Raw.content) as Record<string, unknown>,
							true,
							"request",
							true,
						);
					} catch (_e) {}
				}
				return null;
			})()}

			{(() => {
				if (!activeRequest.response) return null;
				const bodyText = decodeBody(activeRequest.response);
				if (!bodyText) return null;
				try {
					return renderStructure(
						"Response Body",
						JSON.parse(bodyText) as Record<string, unknown>,
						false,
						"response",
						false,
					);
				} catch (_e) {}
				return null;
			})()}

			{definitions.length > 0 && (
				<div className="mt-8">
					<h3 className="mb-4 font-semibold text-sm text-white/70">
						Object Definitions
					</h3>
					<div className="space-y-4">
						{definitions.map((def) => (
							<div
								key={def.name}
								id={`def-${def.name}`}
								className="scroll-mt-12 rounded-lg transition-colors duration-500"
							>
								<div className="mb-3 flex items-center gap-2">
									<span className="font-mono text-lg text-white/20">#</span>
									<h4 className="font-mono font-semibold text-accent/70 text-sm">
										{def.name}
									</h4>
								</div>
								<div className="ml-2 space-y-1 border-white/5 border-l pl-8">
									{Object.entries(def.properties).map(([key, value]) =>
										renderProperty(key, value, def.name, false, true),
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</>
	);

	return (
		<OverviewLayout
			name={activeRequest.name}
			description={activeRequest.description || ""}
			onCommitName={onUpdateName}
			onDescriptionChange={onUpdateDescription}
			leftFooter={leftFooter}
			panelBadge={activeRequest.request.method}
			panelBadgeClassName={methodBadgeClassName}
			panelSubtitle={activeRequest.name || "/"}
			snippetDropdownLabel={
				snippetProfiles.find((profile) => profile.id === activeSnippetId)
					?.label ?? "Snippet"
			}
			snippetDropdownOpen={showSnippetDropdown}
			onSnippetDropdownOpenChange={setShowSnippetDropdown}
			snippetDropdownItems={snippetDropdownItems}
			snippetDropdownSearchValue={snippetSearch}
			onSnippetDropdownSearchChange={setSnippetSearch}
			snippetDropdownSearchPlaceholder="Filter…"
			snippetCode={snippetCode}
			snippetViewerLanguage={currentLang}
			action={
				<button
					type="button"
					onClick={onRun}
					className="absolute right-4 bottom-4 z-20 flex cursor-pointer items-center gap-2 rounded-full bg-accent px-4 py-1.5 font-semibold text-background text-sm transition-colors hover:bg-accent/90"
				>
					Run
				</button>
			}
		/>
	);
};
