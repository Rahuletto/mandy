import { useEffect, useRef, useCallback, useState } from "react";
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
  keymap,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap } from "@codemirror/commands";
import { foldGutter, foldKeymap } from "@codemirror/language";
import { matchstickExtension } from "./theme";
import { languageExtensions, type Language } from "./languageExtensions";
import type { Extension } from "@codemirror/state";
import { prettifyCode } from "../../utils/codeUtils";
import { copyToClipboard } from "../../utils/clipboard";
import { BiCopy, BiCheck } from "react-icons/bi";
import { curlHighlighter } from "./curlHighlighter";

interface CodeViewerProps {
  code: string;
  language: Language;
  prettify?: boolean;
  transparentGutter?: boolean;
}

export function CodeViewer({
  code,
  language,
  prettify = true,
  transparentGutter = false,
}: CodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeExtensions, setActiveExtensions] = useState<Extension[]>([]);

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

  const displayCode = prettify ? prettifyCode(code, language) : code;

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(displayCode);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [displayCode]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const state = EditorState.create({
      doc: displayCode,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        foldGutter(),
        ...activeExtensions,
        EditorView.editable.of(false),
        EditorView.contentAttributes.of({
          "aria-readonly": "true",
        }),
        keymap.of([...defaultKeymap, ...foldKeymap]),
        matchstickExtension,
        language === "shell" || language === "bash" ? curlHighlighter : [],
        transparentGutter
          ? EditorView.theme({
              ".cm-gutters": {
                backgroundColor: "transparent !important",
                border: "none !important",
              },
              ".cm-activeLineGutter": {
                backgroundColor: "transparent !important",
              },
            })
          : [],
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [displayCode, language, activeExtensions, transparentGutter]);

  return (
    <div className="h-full w-full overflow-hidden rounded relative group">
      <div ref={containerRef} className="h-full w-full" />
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-white/10 text-white/50 hover:bg-white/20 hover:text-white/80 transition-all opacity-0 group-hover:opacity-100 z-10"
        title="Copy to clipboard"
      >
        {copied ? (
          <BiCheck size={16} className="text-green-400" />
        ) : (
          <BiCopy size={16} />
        )}
      </button>
    </div>
  );
}
