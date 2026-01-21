import { useState, useEffect, useRef } from "react";
import { HiX } from "react-icons/hi";
import {
  TbUpload,
  TbLink,
  TbFileDescription,
  TbArrowLeft,
  TbChevronRight,
} from "react-icons/tb";
import { SiSwagger, SiPostman, SiInsomnia } from "react-icons/si";

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
  onImportMatchstick: (json: string) => void;
  onImportOpenAPI: (spec: object) => void;
  onImportPostman: (json: object) => void;
  onImportInsomnia: (json: object) => void;
  initialSource?: ImportSource | null;
}

export function ImportModal({
  isOpen,
  onClose,
  onImportMatchstick,
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
    } catch (err) {
      setError("Failed to read file");
    }
  };

  const handleImport = async () => {
    setError("");
    setLoading(true);

    try {
      if (selectedSource === "mandy") {
        JSON.parse(fileContent); // Validate JSON
        onImportMatchstick(fileContent);
        handleClose();
      } else if (selectedSource === "openapi-file") {
        const spec = JSON.parse(fileContent);
        onImportOpenAPI(spec);
        handleClose();
      } else if (selectedSource === "openapi-url") {
        const response = await fetch(urlInput);
        if (!response.ok) throw new Error("Failed to fetch URL");
        const spec = await response.json();
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
      label: "Import from Mandy",
      icon: TbFileDescription,
      color: "text-accent",
      available: true,
    },
    {
      id: "openapi" as ImportSource,
      label: "Import from OpenAPI",
      icon: SiSwagger,
      color: "text-green-400",
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
        className="absolute inset-0 bg-black/60 animate-in fade-in duration-300"
        onClick={handleClose}
      />

      <div
        ref={modalRef}
        className="relative w-full max-w-[320px] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl animate-in zoom-in-95 fade-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          {selectedSource && (
            <button
              onClick={() => {
                setSelectedSource(null);
                setFileContent("");
                setUrlInput("");
                setError("");
              }}
              className="absolute left-3 top-3 text-white/30 hover:text-white transition-colors cursor-pointer"
            >
              <TbArrowLeft size={16} />
            </button>
          )}
          <div className="flex-1 text-center">
            <h2 className="text-sm font-semibold text-white">
              {selectedSource ? "Import" : "Import"}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="absolute right-3 top-3 text-white/30 hover:text-white transition-colors cursor-pointer"
          >
            <HiX size={16} />
          </button>
        </div>

        {!selectedSource ? (
          <div className="p-2 space-y-1">
            {importSources.map((source) => {
              const Icon = source.icon;

              if (source.id === "openapi") {
                return (
                  <div
                    key={source.id}
                    className="relative group"
                    onMouseEnter={() => setShowOpenAPIMenu(true)}
                    onMouseLeave={() => setShowOpenAPIMenu(false)}
                  >
                    <div
                      className={`w-full flex items-center gap-3 p-2.5 px-3 rounded-lg transition-colors text-left group-hover:bg-white/5 cursor-pointer ${showOpenAPIMenu ? "bg-white/5" : ""}`}
                    >
                      <Icon
                        size={16}
                        className="text-white/40 group-hover:text-white/80 transition-colors"
                      />
                      <span className="flex-1 text-sm text-white/70 group-hover:text-white transition-colors">
                        {source.label}
                      </span>
                      <TbChevronRight
                        size={14}
                        className="text-white/20 group-hover:text-white/50"
                      />
                    </div>

                    {showOpenAPIMenu && (
                      <div className="absolute right-0 top-0 translate-x-full pl-2 z-[60]">
                        <div className="min-w-[160px] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-left-2 duration-200 p-2 space-y-1">
                          <button
                            onClick={() => setSelectedSource("openapi-file")}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors text-left group/item"
                          >
                            <TbFileDescription
                              size={18}
                              className="text-white/40 group-hover/item:text-white/80 transition-colors"
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">File</span>
                            </div>
                          </button>
                          <button
                            onClick={() => setSelectedSource("openapi-url")}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors text-left group/item"
                          >
                            <TbLink
                              size={18}
                              className="text-white/40 group-hover/item:text-white/80 transition-colors"
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
                  key={source.id}
                  onClick={() =>
                    source.available && setSelectedSource(source.id)
                  }
                  disabled={!source.available}
                  className={`w-full flex items-center gap-3 p-2.5 px-3 rounded-lg transition-colors text-left group ${source.available
                    ? "hover:bg-white/5 cursor-pointer"
                    : "opacity-40 cursor-not-allowed"
                    }`}
                >
                  <Icon
                    size={16}
                    className={`${source.available ? "text-white/40 group-hover:text-white/80" : "text-white/20"} transition-colors`}
                  />
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
          <div className="p-4 space-y-4">
            {selectedSource === "openapi-url" ? (
              <div>
                <label className="block text-[11px] font-medium text-white/40 mb-2 pl-1">
                  OpenAPI Specification URL
                </label>
                <div className="relative group">
                  <TbLink
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white/50 transition-colors"
                    size={14}
                  />
                  <input
                    type="url"
                    autoFocus
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && urlInput) handleImport();
                    }}
                    placeholder="https://api.example.com/openapi.json"
                    className="w-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all font-mono"
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
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full flex flex-col items-center gap-2 p-6 border border-dashed transition-all rounded-lg group ${fileContent
                    ? "border-accent/40 bg-accent/5"
                    : "border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.04]"
                    }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${fileContent
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
                    <div className="text-sm font-medium text-white/70">
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
              <div className="p-3 bg-red-500/10 border border-red-500/10 rounded-lg">
                <p className="text-xs text-red-400 flex items-center gap-2">
                  <span className="w-1 h-1 bg-red-400 rounded-full" />
                  {error}
                </p>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={
                loading ||
                (selectedSource === "openapi-url" ? !urlInput : !fileContent)
              }
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-white text-black hover:bg-white/90 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
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
