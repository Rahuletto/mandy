/** Primary action (Send, Run, Connect) — matches REST editor. */
export const EDITOR_PRIMARY_BUTTON_CLASS =
	"cursor-pointer rounded-full bg-accent px-6 py-2 font-semibold text-background transition-all hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";

/** Disconnect / destructive header action. */
export const EDITOR_DANGER_BUTTON_CLASS =
	"cursor-pointer rounded-full bg-red px-6 py-2 font-semibold text-background transition-all hover:bg-red/90";

export const editorTabButtonClass = (active: boolean) =>
	`cursor-pointer rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
		active ? "bg-accent/10 text-accent" : "text-white/80 hover:text-white/60"
	}`;

/** Overview snippet panel primary action — use div to avoid nesting inside other buttons. */
export const PANEL_PRIMARY_ACTION_CLASS =
	"absolute right-4 bottom-4 z-20 flex cursor-pointer items-center gap-2 rounded-full bg-accent px-4 py-1.5 font-semibold text-background text-sm transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";
