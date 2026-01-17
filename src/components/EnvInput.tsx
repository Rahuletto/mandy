import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { BiShow, BiHide } from "react-icons/bi";

interface EnvInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  availableVariables?: string[];
  type?: string;
}

// Build highlighted HTML from value
function buildHighlightedHtml(value: string, availableVariables: string[], masked: boolean): string {
  if (!value) return '';

  const regex = /(\{\{[^}]+\}\})/g;
  const parts = value.split(regex);

  return parts.map(part => {
    if (part.match(/^\{\{[^}]+\}\}$/)) {
      const varName = part.slice(2, -2);
      const exists = availableVariables.length === 0 || availableVariables.includes(varName);
      const displayText = masked ? '•'.repeat(part.length) : escapeHtml(part);

      if (exists) {
        return `<span class="env-var env-valid">${displayText}</span>`;
      } else {
        return `<span class="env-var env-invalid">${displayText}</span>`;
      }
    }
    const displayText = masked ? '•'.repeat(part.length) : escapeHtml(part);
    return displayText;
  }).join('');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function EnvInput({
  value,
  onChange,
  placeholder,
  className = "",
  onKeyDown,
  availableVariables = [],
  type = "text",
}: EnvInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isPassword = type === "password";
  const shouldMask = isPassword && !showPassword;

  const highlightedHtml = useMemo(() =>
    buildHighlightedHtml(value, availableVariables, shouldMask),
    [value, availableVariables, shouldMask]
  );

  // Update display when not focused
  useEffect(() => {
    if (editorRef.current && !isFocused) {
      if (value) {
        editorRef.current.innerHTML = highlightedHtml;
      } else {
        editorRef.current.innerHTML = '';
      }
    }
  }, [highlightedHtml, isFocused, value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerText || '');
    }
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    // Show plain text while editing
    if (editorRef.current) {
      const currentText = value;
      editorRef.current.innerText = currentText;
      // Move cursor to end
      requestAnimationFrame(() => {
        if (editorRef.current) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      });
    }
  }, [value]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  return (
    <div className={`flex items-center ${className}`}>
      <div
        ref={editorRef}
        contentEditable
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={onKeyDown as any}
        data-placeholder={placeholder}
        className="flex-1 text-xs text-white/80 focus:outline-none whitespace-pre leading-normal empty:before:content-[attr(data-placeholder)] empty:before:text-white/30"
        suppressContentEditableWarning
      />

      {isPassword && value && (
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="ml-2 p-0.5 text-white/30 hover:text-white/60 transition-colors flex-shrink-0"
        >
          {showPassword ? <BiHide size={14} /> : <BiShow size={14} />}
        </button>
      )}
    </div>
  );
}

// URL Input
interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  availableVariables?: string[];
}

export function UrlInput({
  value,
  onChange,
  placeholder,
  className = "",
  availableVariables = [],
}: UrlInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const highlightedHtml = useMemo(() =>
    buildHighlightedHtml(value, availableVariables, false),
    [value, availableVariables]
  );

  useEffect(() => {
    if (editorRef.current && !isFocused) {
      if (value) {
        editorRef.current.innerHTML = highlightedHtml;
      } else {
        editorRef.current.innerHTML = '';
      }
    }
  }, [highlightedHtml, isFocused, value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerText || '');
    }
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (editorRef.current) {
      editorRef.current.innerText = value;
      requestAnimationFrame(() => {
        if (editorRef.current) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      });
    }
  }, [value]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  return (
    <div className={`relative flex-1 ${className}`}>
      <div
        ref={editorRef}
        contentEditable
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={handleFocus}
        onBlur={handleBlur}
        data-placeholder={placeholder}
        className="w-full px-3 py-2.5 text-sm text-white/90 focus:outline-none whitespace-pre empty:before:content-[attr(data-placeholder)] empty:before:text-white/30"
        suppressContentEditableWarning
      />
    </div>
  );
}
