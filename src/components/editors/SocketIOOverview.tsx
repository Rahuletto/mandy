import { useState } from "react";
import type { SocketIOFile } from "../../types/project";
import {
  generateSocketIoSnippet,
  SOCKETIO_SNIPPET_LANGS,
  type SocketIOSnippetLang,
} from "../../utils/realtimeSnippets";
import { OverviewLayout } from "./OverviewLayout";

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
  const [snippetLang, setSnippetLang] =
    useState<SocketIOSnippetLang>("JavaScript");
  const [showSnippetDropdown, setShowSnippetDropdown] = useState(false);

  const { code: snippetCode, language: snippetLanguage } =
    generateSocketIoSnippet(sio, snippetLang);

  const enabledHeaders = (sio.headerItems || []).filter(
    (h) => h.enabled && h.key,
  );

  const leftFooter = (
    <>
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-white/70 mb-2">Connection</h3>
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
          <h3 className="text-sm font-semibold text-white/70 mb-2">Headers</h3>
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
    </>
  );

  return (
    <OverviewLayout
      name={sio.name}
      description={sio.description || ""}
      onCommitName={(next) => onUpdate((prev) => ({ ...prev, name: next }))}
      onDescriptionChange={(desc) =>
        onUpdate((prev) => ({ ...prev, description: desc }))
      }
      leftFooter={leftFooter}
      panelBadge="SIO"
      panelBadgeClassName="bg-[#25C2A0]/20 text-[#25C2A0]"
      panelSubtitle={sio.url || "No URL set"}
      snippetDropdownLabel={snippetLang}
      snippetDropdownOpen={showSnippetDropdown}
      onSnippetDropdownOpenChange={setShowSnippetDropdown}
      snippetDropdownItems={SOCKETIO_SNIPPET_LANGS.map((snippet) => ({
        label: snippet.label,
        onClick: () => {
          setSnippetLang(snippet.lang);
          setShowSnippetDropdown(false);
        },
      }))}
      snippetCode={snippetCode}
      snippetViewerLanguage={snippetLanguage}
      action={
        <button
          type="button"
          onClick={onConnect}
          disabled={!sio.url || status !== "disconnected"}
          className="flex absolute right-4 bottom-4 cursor-pointer items-center gap-2 px-4 py-1.5 bg-accent text-background rounded-full text-sm font-semibold hover:bg-accent/90 transition-colors z-20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Connect
        </button>
      }
    />
  );
};
