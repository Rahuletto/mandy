import { useState, useEffect, useRef } from "react";
import { HiX } from "react-icons/hi";
import { TbUpload, TbArrowLeft, TbPlus, TbChevronRight } from "react-icons/tb";
import { SiPostman, SiInsomnia } from "react-icons/si";

type NewProjectSource = "blank" | "postman" | "insomnia";

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateBlank: (name: string) => void;
  onCreateFromPostman: (collection: object) => void;
  onCreateFromInsomnia: (data: object) => void;
}

export function NewProjectModal({
  isOpen,
  onClose,
  onCreateBlank,
  onCreateFromPostman,
  onCreateFromInsomnia,
}: NewProjectModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [selectedSource, setSelectedSource] = useState<NewProjectSource | null>(
    null,
  );
  const [projectName, setProjectName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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

  const handleCreate = async () => {
    setError("");
    setLoading(true);

    try {
      if (selectedSource === "blank") {
        if (!projectName.trim()) {
          setError("Project name is required");
          return;
        }
        onCreateBlank(projectName.trim());
        handleClose();
      } else if (selectedSource === "postman") {
        const collection = JSON.parse(fileContent);
        onCreateFromPostman(collection);
        handleClose();
      } else if (selectedSource === "insomnia") {
        const data = JSON.parse(fileContent);
        onCreateFromInsomnia(data);
        handleClose();
      }
    } catch (err: any) {
      setError(err.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedSource(null);
    setProjectName("");
    setFileContent("");
    setError("");
    onClose();
  };

  if (!isOpen) return null;

  const sources = [
    {
      id: "blank" as NewProjectSource,
      label: "Blank Project",
      icon: TbPlus,
      color: "text-accent",
    },
    {
      id: "postman" as NewProjectSource,
      label: "Import from Postman",
      icon: SiPostman,
      color: "text-orange-400",
    },
    {
      id: "insomnia" as NewProjectSource,
      label: "Import from Insomnia",
      icon: SiInsomnia,
      color: "text-purple-400",
    },
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 animate-in fade-in duration-300"
        onClick={handleClose}
      />

      <div
        ref={modalRef}
        className="relative w-full max-w-[320px] bg-card border border-border rounded-xl shadow-2xl animate-in zoom-in-95 fade-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          {selectedSource && (
            <button
              onClick={() => {
                setSelectedSource(null);
                setFileContent("");
                setProjectName("");
                setError("");
              }}
              className="absolute left-3 top-3 text-white/30 hover:text-white transition-colors cursor-pointer"
            >
              <TbArrowLeft size={16} />
            </button>
          )}
          <div className="flex-1 text-center">
            <h2 className="text-sm font-semibold text-white">
              {selectedSource === "blank"
                ? "New Project"
                : selectedSource
                  ? "Import Project"
                  : "New Project"}
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
            {sources.map((source) => {
              const Icon = source.icon;
              return (
                <button
                  key={source.id}
                  onClick={() => setSelectedSource(source.id)}
                  className="w-full flex items-center gap-3 p-2.5 px-3 rounded-lg transition-colors text-left group hover:bg-white/5 cursor-pointer"
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
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {selectedSource === "blank" ? (
              <div>
                <label className="block text-[11px] font-medium text-white/40 mb-2 pl-1">
                  Project Name
                </label>
                <input
                  type="text"
                  autoFocus
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && projectName.trim()) handleCreate();
                  }}
                  placeholder="My awesome project"
                  className="w-full bg-inset border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-all"
                />
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
                  className={`w-full flex flex-col items-center gap-2 p-6 border border-dashed transition-all rounded-lg group ${
                    fileContent
                      ? "border-accent/40 bg-accent/5"
                      : "border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.04]"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
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
              onClick={handleCreate}
              disabled={
                loading ||
                (selectedSource === "blank"
                  ? !projectName.trim()
                  : !fileContent)
              }
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-white text-black hover:bg-white/90 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <span>
                  {selectedSource === "blank"
                    ? "Create Project"
                    : "Import Project"}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
