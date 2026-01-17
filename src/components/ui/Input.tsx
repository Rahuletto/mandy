import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { BiShow, BiHide } from "react-icons/bi";
import { escapeHtml } from "../../utils/html";

interface EnvInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  availableVariables?: string[];
  type?: string;
}

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
      const text = editorRef.current.innerText || '';
      if (text.includes('\n')) {
        const cleaned = text.replace(/\n/g, '');
        editorRef.current.innerText = cleaned;
        onChange(cleaned);
        return;
      }
      onChange(text);
    }
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain').replace(/\n/g, ' ');
    document.execCommand('insertText', false, text);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onKeyDown?.(e);
    }
  }, [onKeyDown]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);

    if (editorRef.current) {
      const currentText = value;
      editorRef.current.innerText = currentText;

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
    <div className={`relative flex-1 flex items-center ${className}`}>
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
        onKeyDown={handleKeyDown}
        className="flex-1 text-xs text-white/80 focus:outline-none whitespace-pre leading-normal relative z-10"
        suppressContentEditableWarning
      />
      {!value && !isFocused && (
        <div className="absolute left-0 text-xs text-white/20 pointer-events-none select-none">
          {placeholder}
        </div>
      )}

      {isPassword && value && (
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="ml-2 p-0.5 text-white/30 hover:text-white/60 transition-colors flex-shrink-0 z-20"
        >
          {showPassword ? <BiHide size={14} /> : <BiShow size={14} />}
        </button>
      )}
    </div>
  );
}

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onCurlPaste?: (command: string) => void;
  onInvalidInput?: (message: string) => void;
  placeholder?: string;
  className?: string;
  availableVariables?: string[];
}

export function UrlInput({
  value,
  onChange,
  onCurlPaste,
  onInvalidInput,
  placeholder = "Enter a URL or paste the cURL",
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
    if (editorRef.current) {
      const currentText = editorRef.current.innerText || "";
      if (!isFocused) {
        editorRef.current.innerHTML = value ? highlightedHtml : "";
      } else if (value !== currentText && value.startsWith('http')) {
        editorRef.current.innerText = value;
      }
    }
  }, [highlightedHtml, isFocused, value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const text = editorRef.current.innerText || '';

      // Prevent multi-line in URL input
      if (text.includes('\n') && !text.trim().toLowerCase().startsWith('curl ')) {
        const cleaned = text.replace(/\n/g, '').trim();
        editorRef.current.innerText = cleaned;
        onChange(cleaned);
        return;
      }

      if (text.trim().toLowerCase().startsWith('curl ')) {
        const command = text.trim();
        onCurlPaste?.(command);
        return;
      }
      onChange(text);
    }
  }, [onChange, onCurlPaste]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const rawText = e.clipboardData.getData('text/plain');
    const trimmedText = rawText.trim();

    if (trimmedText.toLowerCase().startsWith('curl ')) {
      onCurlPaste?.(trimmedText);
      return;
    }

    // If it's not a cURL command, it must be a single line
    const singleLineText = rawText.replace(/\n/g, ' ').trim();

    // Basic validation for URL-like strings
    const isPotentiallyUrl = singleLineText.startsWith('http') ||
      singleLineText.includes('.') ||
      singleLineText.startsWith('/') ||
      singleLineText.includes(':');

    if (!isPotentiallyUrl && singleLineText.length > 0) {
      onInvalidInput?.("Input must be a valid URL or a cURL command");
      return;
    }

    document.execCommand('insertText', false, singleLineText);
  }, [onCurlPaste, onInvalidInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  }, []);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (editorRef.current) {
      editorRef.current.innerText = value || "";
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
    <div className={`relative flex-1 flex items-center ${className}`}>
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
        onKeyDown={handleKeyDown}
        className="w-full px-3 py-2.5 text-sm text-white/90 focus:outline-none whitespace-pre relative z-10"
        suppressContentEditableWarning
      />
      {!value && !isFocused && (
        <div className="absolute left-3 text-sm text-white/20 pointer-events-none select-none">
          {placeholder}
        </div>
      )}
    </div>
  );
}
