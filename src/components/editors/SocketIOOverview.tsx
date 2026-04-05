import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { autoSizeTextarea } from "../../utils";
import type { SocketIOFile } from "../../types/project";
import { CodeViewer } from "../CodeMirror";
import { Dropdown } from "../ui";
import {
  generateSocketIoSnippet,
  SOCKETIO_SNIPPET_LANGS,
  type SocketIOSnippetLang,
} from "../../utils/realtimeSnippets";

interface SocketIOOverviewProps {
  sio: SocketIOFile;
  status: "connected" | "connecting" | "disconnected";
  onUpdate: (updater: (sio: SocketIOFile) => SocketIOFile) => void;
  onConnect: () => void;
}

export const SocketIOOverview = ({
  sio,
  status,
  onUpdate,
  onConnect,
}: SocketIOOverviewProps) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState(sio.name);
  const [description, setDescription] = useState(sio.description || "");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [snippetLang, setSnippetLang] = useState<SocketIOSnippetLang>("JavaScript");
  const [showSnippetDropdown, setShowSnippetDropdown] = useState(false);

  useEffect(() => {
    setName(sio.name);
    setDescription(sio.description || "");
  }, [sio]);

  useLayoutEffect(() => {
    autoSizeTextarea(descriptionRef.current);
  }, [description]);

  const { code: snippetCode, language: snippetLanguage } = generateSocketIoSnippet(
    sio,
    snippetLang,
  );

  const enabledHeaders = (sio.headerItems || []).filter((h) => h.enabled && h.key);

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
                onBlur={() => {
                  setIsEditingName(false);
                  const next = name.trim();
                  if (next && next !== sio.name) {
                    onUpdate((prev) => ({ ...prev, name: next }));
                  } else {
                    setName(sio.name);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            ) : (
              <h1
                className="text-2xl font-bold text-white mb-2 cursor-text hover:text-white/90"
                onClick={() => setIsEditingName(true)}
              >
                {sio.name}
              </h1>
            )}

            <textarea
              ref={descriptionRef}
              className="w-full bg-transparent border-none outline-none text-sm text-white/60 resize-none overflow-hidden min-h-6 mb-3 placeholder:text-white/20"
              placeholder="Add a description..."
              value={description}
              onChange={(e) => {
                const next = e.target.value;
                setDescription(next);
                onUpdate((prev) => ({ ...prev, description: next }));
              }}
            />

            <section className="flex flex-col gap-8">
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-white/70 mb-2">
                  Connection
                </h3>
                <div className="space-y-1">
                  <div className="py-2 border-b border-white/5">
                    <span className="text-xs text-white/40">URL</span>
                    <p className="text-xs font-mono text-white/80 mt-1 break-all">
                      {sio.url || "Not set"}
                    </p>
                  </div>
                  <div className="py-2 border-b border-white/5">
                    <span className="text-xs text-white/40">Namespace</span>
                    <input
                      type="text"
                      value={sio.namespace || "/"}
                      onChange={(e) => {
                        const next = e.target.value;
                        onUpdate((prev) => ({ ...prev, namespace: next || "/" }));
                      }}
                      className="w-full mt-1 bg-inputbox rounded px-2 py-1.5 text-xs font-mono text-white outline-none placeholder:text-white/20"
                      placeholder="/"
                      disabled={status !== "disconnected"}
                    />
                  </div>
                </div>
              </div>

              {enabledHeaders.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-white/70 mb-2">
                    Headers
                  </h3>
                  <div className="space-y-1">
                    {enabledHeaders.map((h) => (
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
                <span className="inline-flex items-center text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#25C2A0]/20 text-[#25C2A0]">
                  SIO
                </span>
                <span className="text-xs text-white/40 truncate max-w-[220px]">
                  {sio.url || "No URL set"}
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
                    items={SOCKETIO_SNIPPET_LANGS.map((snippet) => ({
                      label: snippet.label,
                      onClick: () => {
                        setSnippetLang(snippet.lang);
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
                disabled={!sio.url || status !== "disconnected"}
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
