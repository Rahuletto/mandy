import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { autoSizeTextarea } from "../../utils";
import { generateWsSnippet, WS_SNIPPET_LANGS, type WsSnippetLang } from "../../utils/wsSnippets";
import type { WebSocketFile } from "../../types/project";
import { CodeViewer } from "../CodeMirror";
import { Dropdown } from "../ui";
import type { ConnectionStatus } from "../../hooks/useWebSocket";

interface WebSocketOverviewProps {
  ws: WebSocketFile;
  onUpdate: (updater: (ws: WebSocketFile) => WebSocketFile) => void;
  onConnect: () => void;
  status: ConnectionStatus;
  /** Another WebSocket file already holds the single active connection */
  blockedByOtherConnection?: boolean;
}

export const WebSocketOverview = ({
  ws,
  onUpdate,
  onConnect,
  status,
  blockedByOtherConnection = false,
}: WebSocketOverviewProps) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState(ws.name);
  const [description, setDescription] = useState(ws.description || "");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [snippetLang, setSnippetLang] = useState<WsSnippetLang>("JavaScript");
  const [showSnippetDropdown, setShowSnippetDropdown] = useState(false);

  useEffect(() => {
    setName(ws.name);
    setDescription(ws.description || "");
  }, [ws]);

  useLayoutEffect(() => {
    autoSizeTextarea(descriptionRef.current);
  }, [description]);

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (name.trim() && name !== ws.name) {
      onUpdate((prev) => ({ ...prev, name: name.trim() }));
    } else {
      setName(ws.name);
    }
  };

  const { code: snippetCode, language: snippetLanguage } = generateWsSnippet(
    ws.url,
    snippetLang,
  );

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="flex min-h-full max-w-[1600px] mx-auto relative pl-8 pr-4 gap-8">
        <div className="flex-1 py-12 w-[40%]">
          <div className="max-w-3xl">
            {isEditingName ? (
              <input
                autoFocus
                className="text-2xl font-bold bg-transparent border-none outline-none text-white w-full mb-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
              />
            ) : (
              <h1
                className="text-2xl font-bold text-white mb-2 cursor-text hover:text-white/90"
                onClick={() => setIsEditingName(true)}
              >
                {ws.name}
              </h1>
            )}

            <textarea
              ref={descriptionRef}
              className="w-full bg-transparent border-none outline-none text-sm text-white/60 resize-none overflow-hidden min-h-6 mb-3 placeholder:text-white/20"
              placeholder="Add a description..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                onUpdate((prev) => ({
                  ...prev,
                  description: e.target.value,
                }));
              }}
            />

            <section className="flex flex-col gap-8">
              {(ws.params || []).filter((p) => p.enabled && p.key).length >
                0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-white/70 mb-2">
                    Query Parameters
                  </h3>
                  <div className="space-y-1">
                    {(ws.params || [])
                      .filter((p) => p.enabled && p.key)
                      .map((p) => (
                        <div
                          key={p.id}
                          className="py-2 border-b border-white/5 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-white font-medium">
                              {p.key}
                            </span>
                            <span className="text-[10px] lowercase font-mono text-emerald-400/60">
                              string
                            </span>
                          </div>
                          {p.description && (
                            <p className="mt-1 text-[11px] text-white/40">
                              {p.description}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {(ws.headerItems || []).filter((h) => h.enabled && h.key)
                .length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-white/70 mb-2">
                    Headers
                  </h3>
                  <div className="space-y-1">
                    {(ws.headerItems || [])
                      .filter((h) => h.enabled && h.key)
                      .map((h) => (
                        <div
                          key={h.id}
                          className="py-2 border-b border-white/5 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-white font-medium">
                              {h.key}
                            </span>
                          </div>
                          {h.description && (
                            <p className="mt-1 text-[11px] text-white/40">
                              {h.description}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </section>

            <div className="h-24" />
          </div>
        </div>

        <div className="w-[60%] shrink-0 py-4 self-start sticky top-0 h-[80vh]">
          <div className="h-full rounded-xl bg-background border border-white/5 overflow-hidden flex flex-col">
            <div className="flex shrink-0 items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                  WS
                </span>
                <span className="text-xs text-white/40 truncate max-w-[150px] ">
                  {ws.url || "No URL set"}
                </span>
              </div>

              <div className="relative">
                <button
                  onClick={() => setShowSnippetDropdown(!showSnippetDropdown)}
                  className="text-[11px] text-white/60 hover:text-white flex items-center gap-1"
                >
                  {snippetLang}
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
                {showSnippetDropdown && (
                  <Dropdown
                    className="top-full right-0 mt-1"
                    onClose={() => setShowSnippetDropdown(false)}
                    items={WS_SNIPPET_LANGS.map((s) => ({
                      label: s.label,
                      onClick: () => {
                        setSnippetLang(s.lang);
                        setShowSnippetDropdown(false);
                      },
                    }))}
                  />
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 text-[11px] relative">
              <div className="absolute inset-0 overflow-auto">
                <CodeViewer code={snippetCode} language={snippetLanguage} />
              </div>
              <button
                type="button"
                onClick={onConnect}
                disabled={
                  !ws.url ||
                  status === "connected" ||
                  blockedByOtherConnection
                }
                title={
                  !ws.url
                    ? "Enter a WebSocket URL to connect"
                    : blockedByOtherConnection
                      ? "Only one WebSocket can be active at a time. Disconnect the other WebSocket first, then connect here."
                      : status === "connected"
                        ? "Already connected"
                        : undefined
                }
                className="flex absolute right-4 bottom-4 cursor-pointer items-center gap-2 px-4 py-1.5 bg-accent text-background rounded-full text-sm font-semibold hover:bg-accent/90 transition-colors z-20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
