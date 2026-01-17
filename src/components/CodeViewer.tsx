import { useEffect, useRef, useCallback, useState } from "react";
import { EditorView, lineNumbers, highlightActiveLine, drawSelection, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { html } from "@codemirror/lang-html";
import { defaultKeymap } from "@codemirror/commands";
import { foldGutter, foldKeymap } from "@codemirror/language";
import { matchstickExtension } from "./codemirrorTheme";
import { prettifyCode } from "../helpers/codeUtils";
import { BiCopy, BiCheck } from "react-icons/bi";

type Language = "json" | "xml" | "html" | "text";

interface CodeViewerProps {
  code: string;
  language: Language;
  prettify?: boolean;
}

const languageExtensions = {
  json: () => json(),
  xml: () => xml(),
  html: () => html(),
  text: () => [],
};

export function CodeViewer({ code, language, prettify = true }: CodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [copied, setCopied] = useState(false);

  const displayCode = prettify ? prettifyCode(code, language) : code;

  const handleCopy = useCallback(() => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(displayCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy());
    } else {
      fallbackCopy();
    }
  }, [displayCode]);

  const fallbackCopy = useCallback(() => {
    const textarea = document.createElement('textarea');
    textarea.value = displayCode;
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
  }, [displayCode]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const langExt = languageExtensions[language] || languageExtensions.text;

    const state = EditorState.create({
      doc: displayCode,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        foldGutter(),
        langExt(),
        EditorView.editable.of(false),
        EditorView.contentAttributes.of({
          "aria-readonly": "true",
        }),
        keymap.of([
          ...defaultKeymap,
          ...foldKeymap,
        ]),
        matchstickExtension,
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
  }, [displayCode, language]);

  return (
    <div className="h-full w-full overflow-hidden rounded relative group">
      <div ref={containerRef} className="h-full w-full" />
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-white/10 text-white/50 hover:bg-white/20 hover:text-white/80 transition-all opacity-0 group-hover:opacity-100 z-10"
        title="Copy to clipboard"
      >
        {copied ? <BiCheck size={16} className="text-green-400" /> : <BiCopy size={16} />}
      </button>
    </div>
  );
}
