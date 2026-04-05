import {
	autocompletion,
	closeBrackets,
	closeBracketsKeymap,
	completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
	bracketMatching,
	foldGutter,
	foldKeymap,
	indentOnInput,
} from "@codemirror/language";
import { lintGutter, lintKeymap } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import {
	drawSelection,
	EditorView,
	highlightActiveLine,
	keymap,
	lineNumbers,
} from "@codemirror/view";
import { graphql, updateSchema } from "cm6-graphql";
import type { GraphQLSchema } from "graphql";
import { useCallback, useEffect, useRef, useState } from "react";
import { BiCheck, BiCopy } from "react-icons/bi";
import { copyToClipboard } from "../../utils/clipboard";
import { subscribeToThemeChanges } from "../../utils/themeColors";
import { getMandyExtension } from "./theme";

interface GraphQLCodeEditorProps {
	code: string;
	onChange: (value: string) => void;
	schema?: GraphQLSchema | null;
	readOnly?: boolean;
}

export function GraphQLCodeEditor({
	code,
	onChange,
	schema,
	readOnly = false,
}: GraphQLCodeEditorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const onChangeRef = useRef(onChange);
	const [copied, setCopied] = useState(false);
	const [_themeKey, setThemeKey] = useState(0);
	const themeCompartment = useRef(new Compartment()).current;

	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	useEffect(() => {
		const unsubscribe = subscribeToThemeChanges(() => {
			setThemeKey((k) => k + 1);
		});
		return unsubscribe;
	}, []);

	useEffect(() => {
		if (viewRef.current && schema) {
			updateSchema(viewRef.current, schema);
		}
	}, [schema]);

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

		const gqlExtensions = graphql(schema || undefined);

		const extensions = [
			lineNumbers(),
			highlightActiveLine(),
			drawSelection(),
			...gqlExtensions,
			autocompletion({
				defaultKeymap: true,
				icons: false,
				activateOnTyping: true,
			}),
			history(),
			bracketMatching(),
			closeBrackets(),
			indentOnInput(),
			foldGutter(),
			...(!readOnly ? [lintGutter()] : []),
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
				".cm-diagnostic": {
					borderRadius: "4px",
					padding: "4px 8px",
				},
				".cm-diagnostic-error": {
					borderLeft: "3px solid #ef4444",
				},
				".cm-diagnostic-warning": {
					borderLeft: "3px solid #eab308",
				},
				".cm-lint-marker": {
					width: "6px",
					height: "6px",
				},
				".cm-tooltip": {
					backgroundColor: "var(--color-card, #1a1a1a)",
					border: "1px solid rgba(255, 255, 255, 0.1)",
					borderRadius: "6px",
					boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
					color: "rgba(255, 255, 255, 0.8)",
					fontSize: "12px",
					padding: "4px 8px",
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
		];

		const state = EditorState.create({ doc: code, extensions });

		if (viewRef.current) {
			viewRef.current.destroy();
		}

		const view = new EditorView({
			state,
			parent: containerRef.current,
		});

		viewRef.current = view;

		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, [readOnly, schema, code, themeCompartment]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: themeCompartment.reconfigure(getMandyExtension()),
		});
	}, [themeCompartment]);

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
