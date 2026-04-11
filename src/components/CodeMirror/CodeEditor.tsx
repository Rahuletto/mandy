import {
	autocompletion,
	type Completion,
	type CompletionContext,
	closeBrackets,
	closeBracketsKeymap,
	completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
	bracketMatching,
	foldKeymap,
	indentOnInput,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { Compartment, EditorState } from "@codemirror/state";
import {
	drawSelection,
	EditorView,
	highlightActiveLine,
	keymap,
	lineNumbers,
} from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";
import { BiCheck, BiCopy } from "react-icons/bi";
import { copyToClipboard } from "../../utils/clipboard";
import { prettifyCode } from "../../utils/codeUtils";
import { subscribeToThemeChanges } from "../../utils/themeColors";
import { type Language, languageExtensions } from "./languageExtensions";
import { getMandyExtension } from "./theme";

export interface CompletionItem {
	label: string;
	type?: string;
	detail?: string;
}

interface CodeEditorProps {
	code: string;
	language: Language;
	onChange: (value: string) => void;
	placeholder?: string;
	readOnly?: boolean;
	completions?: CompletionItem[];
	/** Suggested object keys (e.g. from prior MQTT traffic) — completes after `"` in JSON */
	jsonKeyCompletions?: string[];
}

export function CodeEditor({
	code,
	language,
	onChange,
	readOnly = false,
	completions = [],
	jsonKeyCompletions = [],
}: CodeEditorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	/** Initial doc when creating the view; avoids stale `code` without listing it in the init effect deps. */
	const latestCodeForInitRef = useRef(code);
	latestCodeForInitRef.current = code;
	const onChangeRef = useRef(onChange);
	const completionsRef = useRef(completions);
	const jsonKeyCompletionsRef = useRef(jsonKeyCompletions);
	const [copied, setCopied] = useState(false);
	const [activeExtensions, setActiveExtensions] = useState<Extension[]>([]);
	const [_themeKey, setThemeKey] = useState(0);
	const themeCompartment = useRef(new Compartment()).current;

	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	useEffect(() => {
		completionsRef.current = completions;
	}, [completions]);

	useEffect(() => {
		jsonKeyCompletionsRef.current = jsonKeyCompletions;
	}, [jsonKeyCompletions]);

	useEffect(() => {
		const unsubscribe = subscribeToThemeChanges(() => {
			setThemeKey((k) => k + 1);
		});
		return unsubscribe;
	}, []);

	useEffect(() => {
		let mounted = true;
		const loadLang = async () => {
			const getExts = languageExtensions[language] || languageExtensions.text;
			const exts = await getExts();
			if (mounted) {
				setActiveExtensions(exts);
			}
		};
		loadLang();
		return () => {
			mounted = false;
		};
	}, [language]);

	const handlePrettify = useCallback(() => {
		if (!viewRef.current || readOnly) return;
		const currentCode = viewRef.current.state.doc.toString();
		const prettified = prettifyCode(currentCode, language);
		if (prettified !== currentCode) {
			onChangeRef.current(prettified);
		}
	}, [language, readOnly]);

	const handleCopy = useCallback(async () => {
		const currentCode = viewRef.current?.state.doc.toString() || code;
		const success = await copyToClipboard(currentCode);
		if (success) {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	}, [code]);

	useEffect(() => {
		if (!containerRef.current) return;

		const workflowCompletions = (context: CompletionContext) => {
			const word = context.matchBefore(/\{\{[\w.]*$/);
			if (!word || completionsRef.current.length === 0) return null;

			const options: Completion[] = completionsRef.current.map((c) => ({
				label: c.label,
				type: c.type || "variable",
				detail: c.detail,
				apply: c.label,
			}));

			return {
				from: word.from,
				options,
				validFor: /^\{\{[\w.]*$/,
			};
		};

		const jsonKeyCompletionsSource = (context: CompletionContext) => {
			if (language !== "json") return null;
			const keys = jsonKeyCompletionsRef.current;
			if (keys.length === 0) return null;
			const word = context.matchBefore(/"[\w]*$/);
			if (!word) return null;
			const typed = word.text.slice(1);
			const filtered = keys.filter((k) => typed === "" || k.startsWith(typed));
			if (filtered.length === 0) return null;
			return {
				from: word.from + 1,
				options: filtered.map(
					(k): Completion => ({
						label: k,
						type: "property",
						apply: k,
					}),
				),
			};
		};

		// Capture doc before destroy — and never depend on `code` here: it changes every
		// keystroke and would recreate the whole editor (focus loss, cursor to start).
		const previousDoc =
			viewRef.current?.state.doc.toString() ?? latestCodeForInitRef.current;

		if (viewRef.current) {
			viewRef.current.destroy();
		}

		const state = EditorState.create({
			doc: previousDoc,
			extensions: [
				lineNumbers(),
				highlightActiveLine(),
				drawSelection(),
				...activeExtensions,
				history(),
				bracketMatching(),
				closeBrackets(),
				indentOnInput(),
				autocompletion({
					override: [workflowCompletions, jsonKeyCompletionsSource],
					defaultKeymap: true,
					icons: false,
				}),
				EditorView.theme({
					".cm-tooltip.cm-tooltip-autocomplete": {
						backgroundColor: "var(--color-card, #1a1a1a)",
						border: "1px solid rgba(255, 255, 255, 0.1)",
						borderRadius: "8px",
						boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
						padding: "4px",
					},
					".cm-tooltip-autocomplete ul": {
						fontFamily: "ui-monospace, monospace",
						fontSize: "12px",
					},
					".cm-tooltip-autocomplete ul li": {
						padding: "4px 8px",
						borderRadius: "4px",
					},
					".cm-tooltip-autocomplete ul li[aria-selected]": {
						backgroundColor: "var(--color-accent, #ff6b35)",
						color: "var(--color-background, #0a0a0a)",
					},
					".cm-completionLabel": {
						color: "rgba(255, 255, 255, 0.9)",
					},
					".cm-completionDetail": {
						color: "rgba(255, 255, 255, 0.4)",
						marginLeft: "8px",
						fontSize: "10px",
					},
				}),
				themeCompartment.of(getMandyExtension()),
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
					"aria-readonly": readOnly ? "true" : "false",
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
	}, [language, readOnly, handlePrettify, activeExtensions, themeCompartment]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: _themeKey triggers theme reconfiguration on global theme change
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: themeCompartment.reconfigure(getMandyExtension()),
		});
	}, [themeCompartment, _themeKey]);

	useEffect(() => {
		if (viewRef.current) {
			const currentValue = viewRef.current.state.doc.toString();
			if (currentValue !== code) {
				viewRef.current.dispatch({
					changes: { from: 0, to: currentValue.length, insert: code },
				});
			}
		}
	}, [code]);

	return (
		<div className="group relative h-full w-full overflow-hidden">
			<div ref={containerRef} className="h-full w-full" />
			<div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-all group-hover:opacity-100">
				{!readOnly && language !== "text" && (
					<button
						type="button"
						onClick={handlePrettify}
						className="rounded bg-white/10 px-2 py-1 font-medium text-[10px] text-white/50 transition-all hover:bg-white/20 hover:text-white/80"
						title="Prettify (Shift+Alt+F)"
					>
						Prettify
					</button>
				)}
				<button
					type="button"
					onClick={handleCopy}
					className="rounded bg-white/10 p-1.5 text-white/50 transition-all hover:bg-white/20 hover:text-white/80"
					title="Copy to clipboard"
				>
					{copied ? (
						<BiCheck size={14} className="text-green" />
					) : (
						<BiCopy size={14} />
					)}
				</button>
			</div>
		</div>
	);
}
