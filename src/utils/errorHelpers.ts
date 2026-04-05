/** Normalize thrown values for user-facing messages (strict `unknown` catches). */
export function getErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === "string") return err;
	if (
		err &&
		typeof err === "object" &&
		"message" in err &&
		typeof (err as { message: unknown }).message === "string"
	) {
		return (err as { message: string }).message;
	}
	try {
		const serialized = JSON.stringify(err);
		if (typeof serialized === "string") return serialized;
	} catch {
		/* circular / non-serializable */
	}
	try {
		return String(err);
	} catch {
		return "Unknown error";
	}
}
