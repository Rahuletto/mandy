import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/** Keyboard support for clickable non-`<button>` surfaces (a11y). */
export function onActivateKeyDown(
	onActivate: () => void,
): (e: ReactKeyboardEvent) => void {
	return (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onActivate();
		}
	};
}
