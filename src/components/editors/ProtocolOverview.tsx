import { type ReactNode, useState } from "react";
import type { Language } from "../CodeMirror";
import type { DropdownItem } from "../ui";
import { OverviewLayout } from "./OverviewLayout";

export interface ProtocolOverviewProps {
	name: string;
	description: string;
	onCommitName: (name: string) => void;
	onDescriptionChange: (description: string) => void;
	panelBadge: string;
	panelBadgeClassName?: string;
	panelSubtitle: string;
	snippetLangs: { label: string; lang: string }[];
	generateSnippet: (lang: string) => { code: string; language: Language };
	action: ReactNode;
	leftFooter?: ReactNode;
}

export function ProtocolOverview({
	name,
	description,
	onCommitName,
	onDescriptionChange,
	panelBadge,
	panelBadgeClassName,
	panelSubtitle,
	snippetLangs,
	generateSnippet,
	action,
	leftFooter,
}: ProtocolOverviewProps) {
	const [snippetLang, setSnippetLang] = useState(snippetLangs[0]?.lang ?? "");
	const [showSnippetDropdown, setShowSnippetDropdown] = useState(false);

	const { code: snippetCode, language: snippetLanguage } = generateSnippet(
		snippetLang || snippetLangs[0]?.lang || "",
	);

	const snippetDropdownItems: DropdownItem[] = snippetLangs.map((item) => ({
		label: item.label,
		onClick: () => {
			setSnippetLang(item.lang);
			setShowSnippetDropdown(false);
		},
	}));

	const activeLabel =
		snippetLangs.find((s) => s.lang === snippetLang)?.label ??
		snippetLangs[0]?.label ??
		"Snippet";

	return (
		<OverviewLayout
			name={name}
			description={description}
			onCommitName={onCommitName}
			onDescriptionChange={onDescriptionChange}
			leftFooter={leftFooter}
			panelBadge={panelBadge}
			panelBadgeClassName={panelBadgeClassName}
			panelSubtitle={panelSubtitle}
			snippetDropdownLabel={activeLabel}
			snippetDropdownOpen={showSnippetDropdown}
			onSnippetDropdownOpenChange={setShowSnippetDropdown}
			snippetDropdownItems={snippetDropdownItems}
			snippetCode={snippetCode}
			snippetViewerLanguage={snippetLanguage}
			action={action}
		/>
	);
}
