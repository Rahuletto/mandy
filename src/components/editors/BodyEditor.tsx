import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useMemo, useState } from "react";
import { BiChevronDown, BiX } from "react-icons/bi";
import type { BodyType, MultipartField } from "../../bindings";
import { CodeEditor } from "../CodeMirror/CodeEditor";
import { KeyValueTable } from "../KeyValueTable";
import { Dropdown } from "../ui/Dropdown";

interface BodyEditorProps {
	body: BodyType;
	onChange: (body: BodyType) => void;
	availableVariables?: string[];
}

type BodyTab =
	| "none"
	| "json"
	| "text"
	| "xml"
	| "form-data"
	| "urlencoded"
	| "binary";

const TAB_MIME_MAP: Record<BodyTab, string> = {
	none: "None",
	json: "application/json",
	text: "text/plain",
	xml: "application/xml",
	"form-data": "multipart/form-data",
	urlencoded: "application/x-www-form-urlencoded",
	binary: "application/octet-stream",
};

export function BodyEditor({
	body,
	onChange,
	availableVariables = [],
}: BodyEditorProps) {
	const [showSelector, setShowSelector] = useState(false);

	const activeTab = useMemo<BodyTab>(() => {
		if (body === "None") return "none";
		if ("Raw" in body) {
			const ct = body.Raw.content_type?.toLowerCase() || "";
			if (ct.includes("json")) return "json";
			if (ct.includes("xml")) return "xml";
			return "text";
		}
		if ("FormUrlEncoded" in body) return "urlencoded";
		if ("Multipart" in body) return "form-data";
		if ("Binary" in body) return "binary";
		return "none";
	}, [body]);

	const handleTabChange = (tab: BodyTab) => {
		switch (tab) {
			case "none":
				onChange("None");
				break;
			case "json":
				onChange({
					Raw: { content: getRawContent(), content_type: "application/json" },
				});
				break;
			case "text":
				onChange({
					Raw: { content: getRawContent(), content_type: "text/plain" },
				});
				break;
			case "xml":
				onChange({
					Raw: { content: getRawContent(), content_type: "application/xml" },
				});
				break;
			case "urlencoded":
				onChange({ FormUrlEncoded: { fields: {} } });
				break;
			case "form-data":
				onChange({ Multipart: { fields: [] } });
				break;
			case "binary":
				onChange({ Binary: { data: [], filename: null } });
				break;
		}
	};

	const getRawContent = () => {
		if (body !== "None" && "Raw" in body) {
			return body.Raw.content;
		}
		return "";
	};

	const updateRawContent = (content: string) => {
		if (body !== "None" && "Raw" in body) {
			onChange({ Raw: { ...body.Raw, content } });
		}
	};

	const handleFileSelect = async () => {
		try {
			const selected = await open({
				multiple: false,
				directory: false,
			});
			if (selected && typeof selected === "string") {
				const data = await readFile(selected);
				onChange({
					Binary: {
						data: Array.from(data),
						filename: selected.split("/").pop() || "file",
					},
				});
			}
		} catch (err) {
			console.error("Failed to read file", err);
		}
	};

	const clearFile = () => {
		onChange({ Binary: { data: [], filename: null } });
	};

	const dropdownItems = [
		{
			label: "None",
			active: activeTab === "none",
			onClick: () => handleTabChange("none"),
		},
		{ label: "Text", header: true, onClick: () => {} },
		{
			label: TAB_MIME_MAP.json,
			active: activeTab === "json",
			onClick: () => handleTabChange("json"),
		},
		{
			label: TAB_MIME_MAP.xml,
			active: activeTab === "xml",
			onClick: () => handleTabChange("xml"),
		},
		{
			label: TAB_MIME_MAP.text,
			active: activeTab === "text",
			onClick: () => handleTabChange("text"),
		},
		{ label: "Structured", header: true, onClick: () => {} },
		{
			label: TAB_MIME_MAP.urlencoded,
			active: activeTab === "urlencoded",
			onClick: () => handleTabChange("urlencoded"),
		},
		{
			label: TAB_MIME_MAP["form-data"],
			active: activeTab === "form-data",
			onClick: () => handleTabChange("form-data"),
		},
		{ label: "Binary", header: true, onClick: () => {} },
		{
			label: TAB_MIME_MAP.binary,
			active: activeTab === "binary",
			onClick: () => handleTabChange("binary"),
		},
	];

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-4 border-white/5 border-b px-4 py-3">
				<div className="text-white/30 text-xs">Content Type</div>
				<div className="relative">
					<button
						type="button"
						onClick={() => setShowSelector(!showSelector)}
						className="flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 font-medium text-white/80 text-xs transition-colors hover:bg-accent/15"
					>
						<span className="text-accent">{TAB_MIME_MAP[activeTab]}</span>
						<BiChevronDown
							className={`text-white/20 transition-transform ${showSelector ? "rotate-180" : ""}`}
						/>
					</button>

					{showSelector && (
						<Dropdown
							items={dropdownItems}
							onClose={() => setShowSelector(false)}
							className="top-full left-0 mt-1"
							width="w-64"
						/>
					)}
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				{activeTab === "none" && (
					<div className="flex h-full flex-col items-center justify-center p-8 text-center">
						<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-white/10">
							<svg
								width="32"
								height="32"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
							>
								<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9l-7-7z" />
								<path d="M13 2v7h7" />
							</svg>
						</div>
						<div className="mb-1 font-medium text-sm text-white/60">
							This request does not have a body
						</div>
						<div className="max-w-[240px] text-white/30 text-xs">
							Select a content type above if you want to send data with your
							request.
						</div>
					</div>
				)}

				{(activeTab === "json" ||
					activeTab === "text" ||
					activeTab === "xml") && (
					<div className="h-full">
						<CodeEditor
							code={getRawContent()}
							language={
								activeTab === "json"
									? "json"
									: activeTab === "xml"
										? "xml"
										: "text"
							}
							onChange={updateRawContent}
						/>
					</div>
				)}

				{activeTab === "urlencoded" && (
					<div className="p-2">
						<KeyValueTable
							items={Object.entries(
								body !== "None" && "FormUrlEncoded" in body
									? body.FormUrlEncoded.fields
									: {},
							).map(([k, v]) => ({
								id: k,
								key: k,
								value: v || "",
								description: "",
								enabled: true,
							}))}
							onChange={(items) => {
								const fields: Record<string, string> = {};
								items.forEach((i) => {
									if (i.key.trim()) fields[i.key] = i.value;
								});
								onChange({ FormUrlEncoded: { fields } });
							}}
							availableVariables={availableVariables}
							placeholder={{ key: "key", value: "value" }}
						/>
					</div>
				)}

				{activeTab === "form-data" && (
					<div className="p-2">
						<KeyValueTable
							items={(body !== "None" && "Multipart" in body
								? body.Multipart.fields
								: []
							).map((f, i) => ({
								id: `${i}`,
								key: f.name,
								value:
									"Text" in f.value
										? f.value.Text
										: f.value.File.filename || "file",
								description: "File" in f.value ? "File" : "Text",
								enabled: true,
							}))}
							onChange={(items) => {
								const fields: MultipartField[] = items.map((i) => {
									return {
										name: i.key,
										value: { Text: i.value },
									};
								});
								onChange({ Multipart: { fields } });
							}}
							availableVariables={availableVariables}
							placeholder={{ key: "key", value: "value" }}
						/>
					</div>
				)}

				{activeTab === "binary" && (
					<div className="flex h-full flex-col items-center justify-center p-8">
						{body !== "None" && "Binary" in body && body.Binary.filename ? (
							<div className="flex w-full max-w-sm flex-col items-start rounded-xl bg-inset p-2">
								<div className="p-4 pb-2 text-left">
									<div className="truncate font-semibold text-sm text-white">
										{body.Binary.filename}
									</div>
									<div className="mt-1 font-mono text-[12px] text-accent">
										{(body.Binary.data.length / 1024).toFixed(2)} KB
									</div>
								</div>
								<div className="mt-4 flex w-full gap-2">
									<button
										type="button"
										onClick={handleFileSelect}
										className="flex-1 cursor-pointer rounded-lg border border-white/5 bg-white/5 px-4 py-2 font-semibold text-white/80 text-xs transition-all hover:bg-white/10 active:scale-95"
									>
										Change File
									</button>
									<button
										type="button"
										onClick={clearFile}
										className="flex cursor-pointer items-center gap-1 rounded-full border border-red/10 bg-red px-4 py-2 font-semibold text-background text-xs transition-all hover:bg-red/90 active:scale-95"
									>
										<BiX size={16} /> Remove
									</button>
								</div>
							</div>
						) : (
							<div className="flex flex-col items-center gap-5">
								<div className="text-center">
									<div className="font-semibold text-base text-white/80">
										Binary Data
									</div>
									<div className="mt-1.5 max-w-[200px] text-white/40 text-xs">
										Select a file to send as the raw request body
									</div>
								</div>
								<button
									type="button"
									onClick={handleFileSelect}
									className="mt-3 cursor-pointer rounded-full bg-accent px-6 py-2 font-semibold text-background text-sm transition-all hover:bg-accent/90 active:scale-95"
								>
									Select File
								</button>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
