export function formatMessageTimestamp(ts: number): string {
	const d = new Date(ts);
	const h = d.getHours().toString().padStart(2, "0");
	const m = d.getMinutes().toString().padStart(2, "0");
	const s = d.getSeconds().toString().padStart(2, "0");
	const ms = d.getMilliseconds().toString().padStart(3, "0");
	return `${h}:${m}:${s}.${ms}`;
}
