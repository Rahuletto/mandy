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
