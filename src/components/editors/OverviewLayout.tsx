import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { autoSizeTextarea } from "../../utils";
import { CodeViewer } from "../CodeMirror";
import type { Language } from "../CodeMirror/languageExtensions";
import { Dropdown, type MenuItem } from "../ui";

export interface OverviewLayoutProps {
  /** Short label in the snippet panel header (e.g. WS, MQTT). */
  panelBadge: string;
  panelBadgeClassName?: string;
  /** Secondary line in the panel header (e.g. URL). */
  panelSubtitle: string;
  snippetDropdownLabel: string;
  snippetDropdownOpen: boolean;
  onSnippetDropdownOpenChange: (open: boolean) => void;
  snippetDropdownItems: MenuItem[];
  /** When set, replaces the CodeViewer (e.g. GraphQL query + variables layout). */
  snippetPanelBody?: ReactNode;
  snippetCode?: string;
  snippetViewerLanguage?: Language;
  /** Primary action (e.g. Connect) — rendered bottom-right on the snippet panel. */
  action: ReactNode;
  /** Optional content under the title/description on the left (params, tables, etc.). */
  leftFooter?: ReactNode;
  name: string;
  description: string;
  onCommitName: (name: string) => void;
  onDescriptionChange: (description: string) => void;
}

/**
 * Shared overview chrome: editable title, auto-growing description, optional left body,
 * sticky snippet panel with language dropdown and primary action.
 */
export const OverviewLayout = ({
  panelBadge,
  panelBadgeClassName = "bg-emerald-500/20 text-emerald-400",
  panelSubtitle,
  snippetDropdownLabel,
  snippetDropdownOpen,
  onSnippetDropdownOpenChange,
  snippetDropdownItems,
  snippetPanelBody,
  snippetCode,
  snippetViewerLanguage,
  action,
  leftFooter,
  name,
  description,
  onCommitName,
  onDescriptionChange,
}: OverviewLayoutProps) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNameDraft(name);
  }, [name]);

  useLayoutEffect(() => {
    autoSizeTextarea(descriptionRef.current);
  }, []);

  const handleNameBlur = () => {
    setIsEditingName(false);
    const next = nameDraft.trim();
    if (next && next !== name) {
      onCommitName(next);
    } else {
      setNameDraft(name);
    }
  };

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="relative mx-auto flex min-h-full max-w-[1600px] gap-8 pr-4 pl-8">
        <div className="w-[40%] flex-1 py-12">
          <div className="max-w-3xl">
            {isEditingName ? (
              <input
                className="mb-2 w-full border-none bg-transparent font-bold text-2xl text-white outline-none"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
              />
            ) : (
              <h1
                className="mb-2 cursor-text font-bold text-2xl text-white hover:text-white/90"
                onClick={() => setIsEditingName(true)}
              >
                {name}
              </h1>
            )}

            <textarea
              ref={descriptionRef}
              className="mb-3 min-h-6 w-full resize-none overflow-hidden border-none bg-transparent text-sm text-white/60 outline-none placeholder:text-white/20"
              placeholder="Add a description..."
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
            />

            {leftFooter ? (
              <section className="flex flex-col gap-8">{leftFooter}</section>
            ) : null}

            <div className="h-24" />
          </div>
        </div>

        <div className="sticky top-0 h-[80vh] w-[60%] shrink-0 self-start py-4">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/5 bg-background">
            <div className="flex shrink-0 items-center justify-between border-white/5 border-b bg-white/5 px-4 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 font-bold font-mono text-[10px] ${panelBadgeClassName}`}
                >
                  {panelBadge}
                </span>
                <span className="max-w-[150px] truncate text-white/40 text-xs">
                  {panelSubtitle}
                </span>
              </div>

              {snippetDropdownItems.length > 0 ? (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onSnippetDropdownOpenChange(!snippetDropdownOpen)
                    }
                    className="flex items-center gap-1 text-[11px] text-white/60 hover:text-white"
                  >
                    {snippetDropdownLabel}
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {snippetDropdownOpen && (
                    <Dropdown
                      className="top-full right-0 mt-1"
                      onClose={() => onSnippetDropdownOpenChange(false)}
                      items={snippetDropdownItems}
                    />
                  )}
                </div>
              ) : snippetDropdownLabel ? (
                <span className="shrink-0 text-[11px] text-white/30">
                  {snippetDropdownLabel}
                </span>
              ) : null}
            </div>

            <div className="relative min-h-0 flex-1 text-[11px]">
              <div className="absolute inset-0 overflow-auto">
                {snippetPanelBody ?? (
                  <CodeViewer
                    code={snippetCode ?? ""}
                    language={snippetViewerLanguage ?? "text"}
                  />
                )}
              </div>
              {action}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
