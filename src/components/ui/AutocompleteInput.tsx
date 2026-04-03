import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type CSSProperties,
  type ReactNode,
} from "react";

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  emptyText?: string;
  maxSuggestions?: number;
  renderSuggestion?: (suggestion: string, active: boolean) => ReactNode;
  getSuggestionStyle?: (suggestion: string) => CSSProperties | undefined;
}

export function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className = "",
  inputClassName = "",
  emptyText = "No matches",
  maxSuggestions = 8,
  renderSuggestion,
  getSuggestionStyle,
}: AutocompleteInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const filteredSuggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    const normalized = query
      ? suggestions.filter((item) => item.toLowerCase().includes(query))
      : suggestions;
    return normalized.slice(0, maxSuggestions);
  }, [maxSuggestions, suggestions, value]);

  const commitSelection = useCallback(
    (nextValue: string) => {
      onChange(nextValue);
      setOpen(false);
      setActiveIndex(-1);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(nextValue.length, nextValue.length);
      });
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!open) {
        if (event.key === "ArrowDown" && filteredSuggestions.length > 0) {
          event.preventDefault();
          setOpen(true);
          setActiveIndex(0);
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) =>
          filteredSuggestions.length === 0
            ? -1
            : Math.min(prev + 1, filteredSuggestions.length - 1),
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.key === "Enter") {
        if (activeIndex >= 0 && filteredSuggestions[activeIndex]) {
          event.preventDefault();
          commitSelection(filteredSuggestions[activeIndex]);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    },
    [activeIndex, commitSelection, filteredSuggestions, open],
  );

  useEffect(() => {
    setActiveIndex((prev) => {
      if (!open || filteredSuggestions.length === 0) return -1;
      return Math.min(prev, filteredSuggestions.length - 1);
    });
  }, [filteredSuggestions, open]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`block min-w-0 appearance-none border-0 bg-transparent ${inputClassName}`}
        autoComplete="off"
      />
      {open && filteredSuggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-white/10 bg-card shadow-2xl shadow-black/40">
          <div className="max-h-56 overflow-auto py-1">
            {filteredSuggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  commitSelection(suggestion);
                }}
                className={`flex w-full items-center px-3 py-2 text-left text-xs transition-colors ${
                  index === activeIndex
                    ? "bg-accent/10 text-accent"
                    : "text-white/75 hover:bg-white/5 hover:text-white"
                }`}
              >
                {renderSuggestion ? (
                  renderSuggestion(suggestion, index === activeIndex)
                ) : (
                  <span
                    className="truncate font-mono"
                    style={getSuggestionStyle?.(suggestion)}
                  >
                    {suggestion}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
