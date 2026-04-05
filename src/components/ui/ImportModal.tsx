import { useEffect, useRef, useState } from "react";
import { HiX } from "react-icons/hi";
import { SiInsomnia, SiPostman, SiSwagger } from "react-icons/si";
import {
  TbArrowLeft,
  TbChevronRight,
  TbFileDescription,
  TbLink,
  TbUpload,
} from "react-icons/tb";
import { commands } from "../../bindings";
import { Logo } from "./Logo";

type ImportSource =
  | "mandy"
  | "openapi"
  | "openapi-file"
  | "openapi-url"
  | "curl"
  | "postman"
  | "insomnia"
  | "hoppscotch"
  | "gist";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportMandy: (json: string) => void;
  onImportOpenAPI: (spec: object) => void;
  onImportPostman: (json: object) => void;
  onImportInsomnia: (json: object) => void;
  initialSource?: ImportSource | null;
}

export function ImportModal({
  isOpen,
  onClose,
  onImportMandy,
  onImportOpenAPI,
  onImportPostman,
  onImportInsomnia,
  initialSource = null,
}: ImportModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [selectedSource, setSelectedSource] = useState<ImportSource | null>(
    initialSource,
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedSource(initialSource);
    }
  }, [isOpen, initialSource]);
  const [fileContent, setFileContent] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOpenAPIMenu, setShowOpenAPIMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedSource) {
          setSelectedSource(null);
          setError("");
        } else {
          onClose();
        }
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose, selectedSource]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setFileContent(text);
      setError("");
    } catch (_err) {
      setError("Failed to read file");
    }
  };

  const handleImport = async () => {
    setError("");
    setLoading(true);

    try {
      if (selectedSource === "mandy") {
        JSON.parse(fileContent); // Validate JSON
        onImportMandy(fileContent);
        handleClose();
      } else if (selectedSource === "openapi-file") {
        const spec = JSON.parse(fileContent);
        onImportOpenAPI(spec);
        handleClose();
      } else if (selectedSource === "openapi-url") {
        const result = await commands.fetchUrl(urlInput);
        if (result.status === "error") throw new Error(result.error);
        const spec = JSON.parse(result.data.body);
        onImportOpenAPI(spec);
        handleClose();
      } else if (selectedSource === "postman") {
        const collection = JSON.parse(fileContent);
        onImportPostman(collection);
        handleClose();
      } else if (selectedSource === "insomnia") {
        const data = JSON.parse(fileContent);
        onImportInsomnia(data);
        handleClose();
      }
    } catch (err: any) {
      setError(err.message || "Failed to import");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedSource(null);
    setFileContent("");
    setUrlInput("");
    setError("");
    onClose();
  };

  if (!isOpen) return null;

  const importSources = [
    {
      id: "mandy" as ImportSource,
      label: "Import Mandy Project",
      isLogo: true,
      color: "text-accent",
      available: true,
    },
    {
      id: "openapi" as ImportSource,
      label: "Import from OpenAPI",
      icon: SiSwagger,
      color: "text-green",
      available: true,
    },
    {
      id: "postman" as ImportSource,
      label: "Import from Postman",
      icon: SiPostman,
      color: "text-orange-400",
      available: true,
    },
    {
      id: "insomnia" as ImportSource,
      label: "Import from Insomnia",
      icon: SiInsomnia,
      color: "text-purple-400",
      available: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="fade-in absolute inset-0 animate-in bg-black/60 duration-300"
        onClick={handleClose}
      />

      <div
        ref={modalRef}
        className="zoom-in-95 fade-in relative w-full max-w-[320px] animate-in rounded-xl border border-border bg-card shadow-2xl duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-white/5 border-b px-4 py-3">
          {selectedSource && (
            <button
              type="button"
              onClick={() => {
                setSelectedSource(null);
                setFileContent("");
                setUrlInput("");
                setError("");
              }}
              className="absolute top-3 left-3 cursor-pointer text-white/30 transition-colors hover:text-white"
            >
              <TbArrowLeft size={16} />
            </button>
          )}
          <div className="flex-1 text-center">
            <h2 className="font-semibold text-sm text-white">
              {selectedSource ? "Import" : "Import"}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-3 right-3 cursor-pointer text-white/30 transition-colors hover:text-white"
          >
            <HiX size={16} />
          </button>
        </div>

        {!selectedSource ? (
          <div className="space-y-1 p-2">
            {importSources.map((source) => {
              if (source.id === "openapi") {
                return (
                  <div
                    key={source.id}
                    className="group relative"
                    onMouseEnter={() => setShowOpenAPIMenu(true)}
                    onMouseLeave={() => setShowOpenAPIMenu(false)}
                  >
                    <div
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg p-2.5 px-3 text-left transition-colors group-hover:bg-white/5 ${showOpenAPIMenu ? "bg-white/5" : ""}`}
                    >
                      <SiSwagger
                        size={16}
                        className="text-white/40 transition-colors group-hover:text-white/80"
                      />
                      <span className="flex-1 text-sm text-white/70 transition-colors group-hover:text-white">
                        {source.label}
                      </span>
                      <TbChevronRight
                        size={14}
                        className="text-white/20 group-hover:text-white/50"
                      />
                    </div>

                    {showOpenAPIMenu && (
                      <div className="absolute top-0 right-0 z-[60] translate-x-full pl-2">
                        <div className="fade-in slide-in-from-left-2 min-w-[160px] animate-in space-y-1 overflow-hidden rounded-xl border border-border bg-card p-2 shadow-2xl duration-200">
                          <button
                            type="button"
                            onClick={() => setSelectedSource("openapi-file")}
                            className="group/item flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-white/70 text-xs transition-colors hover:bg-white/10 hover:text-white"
                          >
                            <TbFileDescription
                              size={18}
                              className="text-white/40 transition-colors group-hover/item:text-white/80"
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">File</span>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedSource("openapi-url")}
                            className="group/item flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-white/70 text-xs transition-colors hover:bg-white/10 hover:text-white"
                          >
                            <TbLink
                              size={18}
                              className="text-white/40 transition-colors group-hover/item:text-white/80"
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">URL</span>
                            </div>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <button
                  type="button"
                  key={source.id}
                  onClick={() =>
                    source.available && setSelectedSource(source.id)
                  }
                  disabled={!source.available}
                  className={`group flex w-full items-center gap-3 rounded-lg p-2.5 px-3 text-left transition-colors ${
                    source.available
                      ? "cursor-pointer hover:bg-white/5"
                      : "cursor-not-allowed opacity-40"
                  }`}
                >
                  {source.isLogo ? (
                    <Logo
                      width={16}
                      height={16}
                      className={`${source.available ? "text-white/40 group-hover:text-white/80" : "text-white/20"} transition-colors`}
                    />
                  ) : (
                    <>
                      {source.id === "postman" && (
                        <SiPostman
                          size={16}
                          className={`${source.available ? "text-white/40 group-hover:text-white/80" : "text-white/20"} transition-colors`}
                        />
                      )}
                      {source.id === "insomnia" && (
                        <SiInsomnia
                          size={16}
                          className={`${source.available ? "text-white/40 group-hover:text-white/80" : "text-white/20"} transition-colors`}
                        />
                      )}
                    </>
                  )}
                  <span
                    className={`flex-1 text-sm ${source.available ? "text-white/70 group-hover:text-white" : "text-white/30"} transition-colors`}
                  >
                    {source.label}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {selectedSource === "openapi-url" ? (
              <div>
                <label className="mb-2 block pl-1 font-medium text-[11px] text-white/40">
                  OpenAPI Specification URL
                </label>
                <div className="group relative">
                  <TbLink
                    className="absolute top-1/2 left-3 -translate-y-1/2 text-white/20 transition-colors group-focus-within:text-white/50"
                    size={14}
                  />
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && urlInput) handleImport();
                    }}
                    placeholder="https://api.example.com/openapi.json"
                    className="w-full rounded-lg border border-border bg-inset py-2 pr-3 pl-9 font-mono text-sm text-white transition-all placeholder:text-white/20 focus:border-white/20 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`group flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-6 transition-all ${
                    fileContent
                      ? "border-accent/40 bg-accent/5"
                      : "border-white/10 bg-white/2 hover:border-white/20 hover:bg-white/4"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                      fileContent
                        ? "bg-accent/20"
                        : "bg-white/5 group-hover:bg-white/10"
                    }`}
                  >
                    <TbUpload
                      size={16}
                      className={fileContent ? "text-accent" : "text-white/40"}
                    />
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-sm text-white/70">
                      {fileContent ? "File Selected" : "Select File"}
                    </div>
                    <div className="text-[10px] text-white/30">
                      {fileContent ? "Ready to import" : "JSON files only"}
                    </div>
                  </div>
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red/10 bg-red/10 p-3">
                <p className="flex items-center gap-2 text-red text-xs">
                  <span className="h-1 w-1 rounded-full bg-red" />
                  {error}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleImport}
              disabled={
                loading ||
                (selectedSource === "openapi-url" ? !urlInput : !fileContent)
              }
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-black text-sm transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black" />
              ) : (
                <span>Import</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
