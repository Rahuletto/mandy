import { useEffect, useRef, useCallback, useState } from "react";
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  keymap,
  drawSelection,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  indentOnInput,

  foldKeymap,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { getMandyExtension } from "./theme";
import { languageExtensions, type Language } from "./languageExtensions";
import { prettifyCode } from "../../utils/codeUtils";
import { copyToClipboard } from "../../utils/clipboard";
import { BiCopy, BiCheck } from "react-icons/bi";
import { subscribeToThemeChanges } from "../../utils/themeColors";
import type { Extension } from "@codemirror/state";

interface CodeEditorProps {
  code: string;
  language: Language;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export function CodeEditor({
  code,
  language,
  onChange,
  readOnly = false,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const [copied, setCopied] = useState(false);
  const [activeExtensions, setActiveExtensions] = useState<Extension[]>([]);
  const [themeKey, setThemeKey] = useState(0);

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

    const state = EditorState.create({
      doc: code,
      extensions: [
        highlightActiveLine(),
        drawSelection(),
        ...activeExtensions,
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        autocompletion({
          override: [],
          defaultKeymap: true,
        }),

        ...getMandyExtension(),
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
  }, [language, readOnly, handlePrettify, activeExtensions, themeKey]);

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
          {copied ? (
            <BiCheck size={14} className="text-green-400" />
          ) : (
            <BiCopy size={14} />
          )}
        </button>
      </div>
    </div>
  );
}
