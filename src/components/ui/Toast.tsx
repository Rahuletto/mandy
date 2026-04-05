import { useEffect, useState } from "react";
import {
	BiCheckCircle,
	BiErrorCircle,
	BiInfoCircle,
	BiX,
} from "react-icons/bi";
import { type ToastType, useToastStore } from "../../stores/toastStore";

export function ToastContainer() {
	const { toasts, removeToast } = useToastStore();

	if (toasts.length === 0) return null;

	return (
		<div className="pointer-events-none fixed bottom-8 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2">
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
				return <BiCheckCircle className="min-w-4.5 text-green" size={18} />;
			case "error":
				return <BiErrorCircle className="min-w-4.5 text-red" size={18} />;
			case "warning":
				return (
					<BiErrorCircle className="min-w-4.5 text-orange-400" size={18} />
				);
			default:
				return <BiInfoCircle className="min-w-4.5 text-blue-400" size={18} />;
		}
	};

	const handleManualRemove = () => {
		setIsClosing(true);
		setTimeout(onRemove, 500);
	};

	return (
		<div
			className={`pointer-events-auto flex min-w-[200px] max-w-[450px] items-center gap-3 rounded-xl border border-white/10 bg-background px-4 py-3 shadow-2xl ${isClosing ? "animate-blur-out" : "animate-blur-in"}`}
		>
			{getIcon(toast.type)}
			<span className="font-medium text-sm text-white/90">{toast.message}</span>
			<button
				type="button"
				onClick={handleManualRemove}
				className="ml-auto p-1 text-white/20 transition-colors hover:text-white/50"
			>
				<BiX size={18} />
			</button>
		</div>
	);
}
