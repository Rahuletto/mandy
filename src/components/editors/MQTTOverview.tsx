import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MQTTFile } from "../../types/project";
import { autoSizeTextarea } from "../../utils";
import { CodeViewer } from "../CodeMirror";
import { Dropdown } from "../ui";
import {
  generateMqttSnippet,
  MQTT_SNIPPET_LANGS,
  type MqttSnippetLang,
} from "../../utils/realtimeSnippets";

interface MQTTOverviewProps {
  mqtt: MQTTFile;
  status: "connected" | "connecting" | "disconnected";
  onUpdate: (updater: (mqtt: MQTTFile) => MQTTFile) => void;
  onConnect: () => void;
}

export function MQTTOverview({
  mqtt,
  status,
  onUpdate,
  onConnect,
}: MQTTOverviewProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState(mqtt.name);
  const [description, setDescription] = useState(mqtt.description || "");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [snippetLang, setSnippetLang] = useState<MqttSnippetLang>("JavaScript");
  const [showSnippetDropdown, setShowSnippetDropdown] = useState(false);

  useEffect(() => {
    setName(mqtt.name);
    setDescription(mqtt.description || "");
  }, [mqtt]);

  useLayoutEffect(() => {
    autoSizeTextarea(descriptionRef.current);
  }, [description]);

  const { code: snippetCode, language: snippetLanguage } = generateMqttSnippet(
    mqtt,
    snippetLang,
  );

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="relative mx-auto flex min-h-full max-w-[1600px] gap-8 pl-8 pr-4">
        <div className="w-[40%] flex-1 py-12">
          <div className="max-w-3xl">
            {isEditingName ? (
              <input
                autoFocus
                className="mb-2 w-full border-none bg-transparent text-2xl font-bold text-white outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  setIsEditingName(false);
                  const next = name.trim();
                  if (next && next !== mqtt.name) {
                    onUpdate((prev) => ({ ...prev, name: next }));
                  } else {
                    setName(mqtt.name);
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
                className="mb-2 cursor-text text-2xl font-bold text-white hover:text-white/90"
                onClick={() => setIsEditingName(true)}
              >
                {mqtt.name}
              </h1>
            )}

            <textarea
              ref={descriptionRef}
              className="mb-3 min-h-6 w-full resize-none overflow-hidden border-none bg-transparent text-sm text-white/60 outline-none placeholder:text-white/20"
              placeholder="Add a description..."
              value={description}
              onChange={(e) => {
                const next = e.target.value;
                setDescription(next);
                onUpdate((prev) => ({ ...prev, description: next }));
              }}
            />

            <section className="mt-4 flex flex-col gap-8">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-white/70">Connection</h3>
                <div className="space-y-1">
                  <div className="border-b border-white/5 py-2">
                    <span className="text-xs text-white/40">Broker URL</span>
                    <p className="mt-1 break-all font-mono text-xs text-white/80">
                      {mqtt.url || "Not set"}
                    </p>
                  </div>
                  <div className="border-b border-white/5 py-2">
                    <span className="text-xs text-white/40">Client ID</span>
                    <p className="mt-1 break-all font-mono text-xs text-white/80">
                      {mqtt.clientId || "Auto-generated"}
                    </p>
                  </div>
                  <div className="border-b border-white/5 py-2">
                    <span className="text-xs text-white/40">Subscriptions</span>
                    <p className="mt-1 break-all font-mono text-xs text-white/80">
                      {mqtt.subscriptions.length > 0
                        ? mqtt.subscriptions.map((sub) => `${sub.topic} (QoS ${sub.qos})`).join(", ")
                        : "None"}
                    </p>
                  </div>
                </div>
              </div>
            </section>
            <div className="h-24" />
          </div>
        </div>

        <div className="sticky top-0 h-[80vh] w-[60%] shrink-0 self-start py-4">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/5 bg-background">
            <div className="flex shrink-0 items-center justify-between border-b border-white/5 bg-white/5 px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded bg-orange-400/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-orange-300">
                  MQTT
                </span>
                <span className="max-w-[220px] truncate text-xs text-white/40">
                  {mqtt.url || "No broker URL set"}
                </span>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowSnippetDropdown(!showSnippetDropdown)}
                  className="flex items-center gap-1 text-[11px] text-white/60 hover:text-white"
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
                    items={MQTT_SNIPPET_LANGS.map((snippet) => ({
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

            <div className="relative min-h-0 flex-1 text-[11px]">
              <div className="absolute inset-0 overflow-auto">
                <CodeViewer code={snippetCode} language={snippetLanguage} />
              </div>
              <button
                type="button"
                onClick={onConnect}
                disabled={!mqtt.url || status !== "disconnected"}
                className="absolute bottom-4 right-4 z-20 flex cursor-pointer items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-background transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
