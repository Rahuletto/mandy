import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { BiShow, BiHide } from "react-icons/bi";
import { TbAlertTriangle } from "react-icons/tb";
import { escapeHtml } from "../../utils/html";
import { HoverPopover } from "./HoverPopover";

interface EnvInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  availableVariables?: string[];
  type?: string;
  disabled?: boolean;
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
        return `<span title="Invalid variable" class="env-var env-invalid">${displayText}</span>`;
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
  disabled = false,
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
    if (disabled) return;
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
  }, [onChange, disabled]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain').replace(/\n/g, ' ');
    document.execCommand('insertText', false, text);
  }, [disabled]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      onKeyDown?.(e);
    }
  }, [onKeyDown, disabled]);

  const handleFocus = useCallback(() => {
    if (disabled) return;
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
  }, [value, disabled]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  return (
    <div className={`relative flex-1 flex items-center ${className} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}>
      <div
        ref={editorRef}
        contentEditable={!disabled}
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
        className={`flex-1 text-xs text-white/80 focus:outline-none whitespace-pre leading-normal relative z-10 ${disabled ? "pointer-events-none" : ""}`}
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
          disabled={disabled}
          className={`ml-2 p-0.5 text-white/30 transition-colors flex-shrink-0 z-20 ${disabled ? "" : "hover:text-white/60"}`}
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
  disabled?: boolean;
}

export function UrlInput({
  value,
  onChange,
  onCurlPaste,
  placeholder = "Enter a URL or paste the cURL",
  className = "",
  availableVariables = [],
  disabled = false,
}: UrlInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Warning triangle tooltip state
  const [showWarningTooltip, setShowWarningTooltip] = useState(false);
  const warningRef = useRef<HTMLDivElement>(null);
  const warningTimeoutRef = useRef<number | null>(null);

  // Invalid span popover state (for hovering on the red variable in URL)
  const [showInvalidPopover, setShowInvalidPopover] = useState(false);
  const invalidSpanRef = useRef<HTMLDivElement>(null);
  const invalidPopoverTimeoutRef = useRef<number | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });

  const handleWarningEnter = () => {
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    setShowWarningTooltip(true);
  };

  const handleWarningLeave = () => {
    warningTimeoutRef.current = window.setTimeout(() => {
      setShowWarningTooltip(false);
    }, 200);
  };

  const handleInvalidSpanEnter = (e: MouseEvent) => {
    if (invalidPopoverTimeoutRef.current) {
      clearTimeout(invalidPopoverTimeoutRef.current);
      invalidPopoverTimeoutRef.current = null;
    }
    const target = e.target as HTMLElement;
    const rect = target.getBoundingClientRect();
    setPopoverPosition({ top: rect.bottom + 8, left: rect.left });
    setShowInvalidPopover(true);
  };

  const handleInvalidSpanLeave = () => {
    invalidPopoverTimeoutRef.current = window.setTimeout(() => {
      setShowInvalidPopover(false);
    }, 200);
  };

  const handlePopoverEnter = () => {
    if (invalidPopoverTimeoutRef.current) {
      clearTimeout(invalidPopoverTimeoutRef.current);
      invalidPopoverTimeoutRef.current = null;
    }
  };

  const handlePopoverLeave = () => {
    invalidPopoverTimeoutRef.current = window.setTimeout(() => {
      setShowInvalidPopover(false);
    }, 200);
  };

  // Event delegation for .env-invalid spans
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('env-invalid')) {
        handleInvalidSpanEnter(e);
      }
    };

    const onMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('env-invalid')) {
        handleInvalidSpanLeave();
      }
    };

    editor.addEventListener('mouseover', onMouseOver);
    editor.addEventListener('mouseout', onMouseOut);

    return () => {
      editor.removeEventListener('mouseover', onMouseOver);
      editor.removeEventListener('mouseout', onMouseOut);
    };
  }, []);

  const hasInvalidVariables = useMemo(() => {
    if (!value) return false;
    const regex = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = regex.exec(value)) !== null) {
      const varName = match[1];
      const exists = availableVariables.length === 0 || availableVariables.includes(varName);
      if (!exists) return true;
    }
    return false;
  }, [value, availableVariables]);

  const invalidVariableNames = useMemo(() => {
    if (!value || availableVariables.length === 0) return [];
    const regex = /\{\{([^}]+)\}\}/g;
    const invalid: string[] = [];
    let match;
    while ((match = regex.exec(value)) !== null) {
      const varName = match[1];
      if (!availableVariables.includes(varName) && !invalid.includes(varName)) {
        invalid.push(varName);
      }
    }
    return invalid;
  }, [value, availableVariables]);

  const replaceVariable = useCallback((oldVar: string, newVar: string) => {
    const newValue = value.replace(new RegExp(`\\{\\{${oldVar}\\}\\}`, 'g'), `{{${newVar}}}`);
    onChange(newValue);
    setShowInvalidPopover(false);
  }, [value, onChange]);

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
    if (disabled) return;
    if (editorRef.current) {
      const text = editorRef.current.innerText || '';

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
  }, [onChange, onCurlPaste, disabled]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (disabled) {
      e.preventDefault();
      return;
    }

    const rawText = e.clipboardData.getData('text/plain');
    const trimmedText = rawText.trim();

    if (trimmedText.toLowerCase().startsWith('curl ')) {
      e.preventDefault();
      onCurlPaste?.(trimmedText);
      if (editorRef.current) {
        editorRef.current.blur();
      }
      return;
    }

    e.preventDefault();
    const singleLineText = rawText.replace(/\n/g, ' ').trim();

    if (editorRef.current) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        sel.deleteFromDocument();
      }
      document.execCommand('insertText', false, singleLineText);
    }
  }, [onCurlPaste, disabled]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  }, [disabled]);

  const handleFocus = useCallback(() => {
    if (disabled) return;
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
  }, [value, disabled]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  return (
    <div className={`relative flex-1 flex items-center ${className}`}>
      <div
        ref={editorRef}
        contentEditable={!disabled}
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
        className={`w-full px-3 py-2.5 text-sm text-white/90 focus:outline-none whitespace-pre relative z-10 ${disabled ? "pointer-events-none" : ""} ${hasInvalidVariables ? "pr-8" : ""}`}
        suppressContentEditableWarning
      />
      {!value && !isFocused && (
        <div className="absolute left-3 text-sm text-white/20 pointer-events-none select-none">
          {placeholder}
        </div>
      )}
      {hasInvalidVariables && (
        <>
          {/* Warning triangle with simple tooltip */}
          <div
            ref={warningRef}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 z-20 cursor-help"
            onMouseEnter={handleWarningEnter}
            onMouseLeave={handleWarningLeave}
          >
            <TbAlertTriangle size={16} />
          </div>
          <HoverPopover
            anchorRef={warningRef as React.RefObject<HTMLElement>}
            open={showWarningTooltip}
            onMouseEnter={handleWarningEnter}
            onMouseLeave={handleWarningLeave}
            className="!px-2 !py-1 text-xs bg-[#1e1e1e] !rounded-lg text-white"
          >
            Invalid environment variable found
          </HoverPopover>

          {/* Popover for hovering on invalid variable span in URL */}
          {showInvalidPopover && (
            <div
              ref={invalidSpanRef}
              className="fixed z-50 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl p-3 animate-blur-in min-w-[200px] max-w-[280px]"
              style={{ top: popoverPosition.top, left: popoverPosition.left }}
              onMouseEnter={handlePopoverEnter}
              onMouseLeave={handlePopoverLeave}
            >
              <div className="flex flex-col gap-2">
                <div className="text-red-400 font-medium text-[11px]">Invalid environment variable</div>
                <div className="flex flex-wrap gap-1">
                  {invalidVariableNames.map((varName) => (
                    <span key={varName} className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[11px] font-mono">
                      {`{{${varName}}}`}
                    </span>
                  ))}
                </div>

                {availableVariables.length > 0 && (
                  <>
                    <div className="border-t border-white/10 my-1" />
                    <div className="text-white/50 font-medium text-[11px]">Available variables</div>
                    <div className="flex flex-wrap gap-1">
                      {availableVariables.map((varName) => (
                        <button
                          key={varName}
                          type="button"
                          onClick={() => {
                            if (invalidVariableNames.length === 1) {
                              replaceVariable(invalidVariableNames[0], varName);
                            }
                          }}
                          className={`px-1.5 py-0.5 bg-accent/20 text-accent rounded text-[11px] font-mono transition-colors ${invalidVariableNames.length === 1 ? 'hover:bg-accent/30 cursor-pointer' : 'cursor-default'}`}
                          title={invalidVariableNames.length === 1 ? `Replace {{${invalidVariableNames[0]}}} with {{${varName}}}` : varName}
                        >
                          {`{{${varName}}}`}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
