import { useEffect, useRef, useCallback, useState } from "react";
import { EditorView, lineNumbers, highlightActiveLine, keymap, drawSelection } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { html } from "@codemirror/lang-html";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from "@codemirror/language";
import { linter, lintGutter, lintKeymap } from "@codemirror/lint";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { matchstickExtension } from "./codemirrorTheme";
import { prettifyCode } from "../helpers/codeUtils";
import { BiCopy, BiCheck } from "react-icons/bi";

type Language = "json" | "xml" | "html" | "text";

interface CodeEditorProps {
    code: string;
    language: Language;
    onChange: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
}

const jsonLinter = linter(jsonParseLinter());

const languageExtensions = {
    json: () => [json(), jsonLinter],
    xml: () => [xml()],
    html: () => [html()],
    text: () => [],
};

export function CodeEditor({ code, language, onChange, readOnly = false }: CodeEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    const handlePrettify = useCallback(() => {
        if (!viewRef.current || readOnly) return;
        const currentCode = viewRef.current.state.doc.toString();
        const prettified = prettifyCode(currentCode, language);
        if (prettified !== currentCode) {
            onChangeRef.current(prettified);
        }
    }, [language, readOnly]);

    const handleCopy = useCallback(() => {
        const currentCode = viewRef.current?.state.doc.toString() || code;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(currentCode).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }).catch(() => fallbackCopy(currentCode));
        } else {
            fallbackCopy(currentCode);
        }
    }, [code]);

    const fallbackCopy = useCallback((text: string) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            console.error('Failed to copy');
        }
        document.body.removeChild(textarea);
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;

        const langExt = languageExtensions[language] || languageExtensions.text;

        const state = EditorState.create({
            doc: code,
            extensions: [
                lineNumbers(),
                highlightActiveLine(),
                drawSelection(),
                foldGutter(),
                langExt(),
                history(),
                bracketMatching(),
                closeBrackets(),
                indentOnInput(),
                autocompletion({
                    override: [],
                    defaultKeymap: true,
                }),
                lintGutter(),
                matchstickExtension,
                keymap.of([
                    ...defaultKeymap,
                    ...historyKeymap,
                    ...completionKeymap,
                    ...closeBracketsKeymap,
                    ...foldKeymap,
                    ...lintKeymap,
                    {
                        key: "Shift-Alt-f",
                        run: () => {
                            handlePrettify();
                            return true;
                        },
                    },
                ]),
                EditorView.editable.of(!readOnly),
                EditorView.contentAttributes.of({
                    "aria-readonly": readOnly ? "true" : "false"
                }),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && !readOnly) {
                        onChangeRef.current(update.state.doc.toString());
                    }
                }),
            ],
        });

        const view = new EditorView({
            state,
            parent: containerRef.current,
        });

        viewRef.current = view;

        return () => {
            view.destroy();
            viewRef.current = null;
        };
    }, [language, readOnly, handlePrettify]);

    useEffect(() => {
        if (viewRef.current) {
            const currentValue = viewRef.current.state.doc.toString();
            if (currentValue !== code) {
                viewRef.current.dispatch({
                    changes: { from: 0, to: currentValue.length, insert: code }
                });
            }
        }
    }, [code]);

    return (
        <div className="h-full w-full overflow-hidden relative group">
            <div ref={containerRef} className="h-full w-full" />
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                {!readOnly && language !== "text" && (
                    <button
                        type="button"
                        onClick={handlePrettify}
                        className="px-2 py-1 text-[10px] font-medium rounded bg-white/10 text-white/50 hover:bg-white/20 hover:text-white/80 transition-all"
                        title="Prettify (Shift+Alt+F)"
                    >
                        Prettify
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1.5 rounded bg-white/10 text-white/50 hover:bg-white/20 hover:text-white/80 transition-all"
                    title="Copy to clipboard"
                >
                    {copied ? <BiCheck size={14} className="text-green-400" /> : <BiCopy size={14} />}
                </button>
            </div>
        </div>
    );
}
