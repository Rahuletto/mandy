import { useEffect, useRef } from "react";
import { HiX } from "react-icons/hi";
import { SiSwagger, SiPostman, SiInsomnia } from "react-icons/si";
import { Logo } from "./Logo";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportOpenAPI: () => void;
  onExportMandy: () => void;
  onExportPostman: () => void;
  onExportInsomnia: () => void;
}

export function ExportModal({
  isOpen,
  onClose,
  onExportOpenAPI,
  onExportMandy,
  onExportPostman,
  onExportInsomnia,
}: ExportModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const exportOptions = [
    {
      id: "mandy",
      label: "Mandy Project",
      isLogo: true,
      onClick: onExportMandy,
    },
    {
      id: "openapi",
      label: "OpenAPI Spec",
      icon: SiSwagger,
      onClick: onExportOpenAPI,
    },
    {
      id: "postman",
      label: "Postman Collection",
      icon: SiPostman,
      onClick: onExportPostman,
    },
    {
      id: "insomnia",
      label: "Insomnia Export",
      icon: SiInsomnia,
      onClick: onExportInsomnia,
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div
        ref={modalRef}
        className="relative w-full max-w-[320px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex-1 text-center">
            <h2 className="text-sm font-semibold text-white">Export</h2>
          </div>
          <button
            onClick={onClose}
            className="absolute right-3 top-3 text-white/30 hover:text-white transition-colors cursor-pointer"
          >
            <HiX size={16} />
          </button>
        </div>

        <div className="p-2 space-y-1">
           {exportOptions.map((option) => {
             return (
               <button
                 key={option.id}
                 onClick={() => {
                   option.onClick();
                   onClose();
                 }}
                 className="w-full flex items-center gap-3 p-2.5 px-3 hover:bg-white/5 rounded-lg transition-colors cursor-pointer text-left group"
               >
                 {option.isLogo ? (
                   <Logo width={16} height={16} className="text-white/40 group-hover:text-white/80 transition-colors" />
                 ) : (
                   <>
                     {option.id === "openapi" && <SiSwagger size={16} className="text-white/40 group-hover:text-white/80 transition-colors" />}
                     {option.id === "postman" && <SiPostman size={16} className="text-white/40 group-hover:text-white/80 transition-colors" />}
                     {option.id === "insomnia" && <SiInsomnia size={16} className="text-white/40 group-hover:text-white/80 transition-colors" />}
                   </>
                 )}
                 <span className="flex-1 text-sm text-white/70 group-hover:text-white transition-colors">
                   {option.label}
                 </span>
               </button>
             );
           })}
         </div>
      </div>
    </div>
  );
}
