import { useState, useEffect } from "react";
import { useToastStore, ToastType } from "../../stores/toastStore";
import {
  BiCheckCircle,
  BiErrorCircle,
  BiInfoCircle,
  BiX,
} from "react-icons/bi";

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: any; onRemove: () => void }) {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsClosing(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  const getIcon = (type: ToastType) => {
    switch (type) {
      case "success":
        return <BiCheckCircle className="text-green-400" size={18} />;
      case "error":
        return <BiErrorCircle className="text-red-400" size={18} />;
      default:
        return <BiInfoCircle className="text-blue-400" size={18} />;
    }
  };

  const handleManualRemove = () => {
    setIsClosing(true);
    setTimeout(onRemove, 500);
  };

  return (
    <div
      className={`flex items-center gap-3 bg-background px-4 py-3 premium-glass border border-white/10 rounded-xl shadow-2xl pointer-events-auto min-w-[200px] ${isClosing ? "animate-blur-out" : "animate-blur-in"}`}
    >
      {getIcon(toast.type)}
      <span className="text-sm text-white/90 font-medium">{toast.message}</span>
      <button
        onClick={handleManualRemove}
        className="ml-auto p-1 text-white/20 hover:text-white/50 transition-colors"
      >
        <BiX size={18} />
      </button>
    </div>
  );
}
