import { useRef, useState } from "react";

/** Shared hover-open / delayed-close behavior for TimingPopover / SizePopover. */
export function usePopoverHover() {
	const [open, setOpen] = useState(false);
	const timeoutRef = useRef<number | null>(null);

	const onEnter = () => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
		setOpen(true);
	};

	const onLeave = () => {
		timeoutRef.current = window.setTimeout(() => setOpen(false), 200);
	};

	return { open, setOpen, onEnter, onLeave };
}
