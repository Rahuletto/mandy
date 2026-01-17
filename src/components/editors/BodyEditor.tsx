import { useState, useMemo } from "react";
import type { BodyType, MultipartField } from "../../bindings";
import { CodeEditor } from "../CodeMirror/CodeEditor";
import { KeyValueTable } from "../KeyValueTable";
import { Dropdown } from "../ui/Dropdown";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { BiFile, BiX, BiChevronDown } from "react-icons/bi";

interface BodyEditorProps {
    body: BodyType;
    onChange: (body: BodyType) => void;
    availableVariables?: string[];
}

type BodyTab = "none" | "json" | "text" | "xml" | "form-data" | "urlencoded" | "binary";

const TAB_MIME_MAP: Record<BodyTab, string> = {
    none: "None",
    json: "application/json",
    text: "text/plain",
    xml: "application/xml",
    "form-data": "multipart/form-data",
    urlencoded: "application/x-www-form-urlencoded",
    binary: "application/octet-stream"
};

export function BodyEditor({ body, onChange, availableVariables = [] }: BodyEditorProps) {
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
                onChange({ Raw: { content: getRawContent(), content_type: "application/json" } });
                break;
            case "text":
                onChange({ Raw: { content: getRawContent(), content_type: "text/plain" } });
                break;
            case "xml":
                onChange({ Raw: { content: getRawContent(), content_type: "application/xml" } });
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
                        filename: selected.split("/").pop() || "file"
                    }
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
        { label: "None", active: activeTab === "none", onClick: () => handleTabChange("none") },
        { label: "Text", header: true, onClick: () => { } },
        { label: TAB_MIME_MAP.json, active: activeTab === "json", onClick: () => handleTabChange("json") },
        { label: TAB_MIME_MAP.xml, active: activeTab === "xml", onClick: () => handleTabChange("xml") },
        { label: TAB_MIME_MAP.text, active: activeTab === "text", onClick: () => handleTabChange("text") },
        { label: "Structured", header: true, onClick: () => { } },
        { label: TAB_MIME_MAP.urlencoded, active: activeTab === "urlencoded", onClick: () => handleTabChange("urlencoded") },
        { label: TAB_MIME_MAP["form-data"], active: activeTab === "form-data", onClick: () => handleTabChange("form-data") },
        { label: "Binary", header: true, onClick: () => { } },
        { label: TAB_MIME_MAP.binary, active: activeTab === "binary", onClick: () => handleTabChange("binary") },
    ];

    return (
        <div className="flex flex-col h-full overflow-hidden">

            <div className="flex items-center gap-4 px-4 py-3 border-b border-white/5 shrink-0">
                <div className="text-xs text-white/30 ">
                    Content Type
                </div>
                <div className="relative">
                    <button
                        onClick={() => setShowSelector(!showSelector)}
                        className="flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 hover:bg-accent/15 transition-colors text-xs font-medium text-white/80"
                    >
                        <span className="text-accent">
                            {TAB_MIME_MAP[activeTab]}
                        </span>
                        <BiChevronDown className={`text-white/20 transition-transform ${showSelector ? "rotate-180" : ""}`} />
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
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white/10 mb-4">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9l-7-7z" />
                                <path d="M13 2v7h7" />
                            </svg>
                        </div>
                        <div className="text-sm font-medium text-white/60 mb-1">This request does not have a body</div>
                        <div className="text-xs text-white/30 max-w-[240px]">Select a content type above if you want to send data with your request.</div>
                    </div>
                )}

                {(activeTab === "json" || activeTab === "text" || activeTab === "xml") && (
                    <div className="h-full">
                        <CodeEditor
                            code={getRawContent()}
                            language={activeTab === "json" ? "json" : activeTab === "xml" ? "xml" : "text"}
                            onChange={updateRawContent}
                        />
                    </div>
                )}

                {activeTab === "urlencoded" && (
                    <div className="p-2">
                        <KeyValueTable
                            items={Object.entries((body !== "None" && "FormUrlEncoded" in body ? body.FormUrlEncoded.fields : {})).map(([k, v]) => ({
                                id: k,
                                key: k,
                                value: v || "",
                                description: "",
                                enabled: true
                            }))}
                            onChange={(items) => {
                                const fields: Record<string, string> = {};
                                items.forEach(i => {
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
                            items={(body !== "None" && "Multipart" in body ? body.Multipart.fields : []).map((f, i) => ({
                                id: `${i}`,
                                key: f.name,
                                value: "Text" in f.value ? f.value.Text : (f.value.File.filename || "file"),
                                description: "File" in f.value ? "File" : "Text",
                                enabled: true
                            }))}
                            onChange={(items) => {
                                const fields: MultipartField[] = items.map(i => {
                                    return {
                                        name: i.key,
                                        value: { Text: i.value }
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
                    <div className="h-full flex flex-col items-center justify-center p-8">
                        {body !== "None" && "Binary" in body && body.Binary.filename ? (
                            <div className="flex flex-col items-center gap-4 bg-inset border border-white/10 p-8 rounded-2xl shadow-2xl max-w-sm w-full">
                                <div className="w-16 h-16 bg-accent/20 rounded-2xl flex items-center justify-center text-accent shadow-inner">
                                    <BiFile size={32} />
                                </div>
                                <div className="text-center">
                                    <div className="text-sm font-semibold text-white truncate max-w-[200px]">
                                        {body.Binary.filename}
                                    </div>
                                    <div className="text-[10px] text-white/40 mt-1 font-mono uppercase tracking-wider">
                                        {(body.Binary.data.length / 1024).toFixed(2)} KB
                                    </div>
                                </div>
                                <div className="flex gap-2 w-full mt-4">
                                    <button
                                        onClick={handleFileSelect}
                                        className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-white/80 transition-all border border-white/5 active:scale-95"
                                    >
                                        Change File
                                    </button>
                                    <button
                                        onClick={clearFile}
                                        className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-xs font-semibold transition-all border border-red-500/10 flex items-center gap-1 active:scale-95"
                                    >
                                        <BiX size={16} /> Remove
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-5">
                                <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center text-white/10 border border-white/5 shadow-inner">
                                    <BiFile size={40} />
                                </div>
                                <div className="text-center">
                                    <div className="text-base font-semibold text-white/80">Binary Data</div>
                                    <div className="text-xs text-white/40 mt-1.5 max-w-[200px]">Select a file to send as the raw request body</div>
                                </div>
                                <button
                                    onClick={handleFileSelect}
                                    className="mt-3 px-8 py-2.5 bg-accent hover:bg-accent/90 text-background rounded-full text-xs font-bold transition-all shadow-lg shadow-accent/20 active:scale-95 uppercase tracking-wide"
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
