
export function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

export function getStatusColor(status: number): string {
    if (status >= 200 && status < 300) return "#22c55e";
    if (status >= 300 && status < 400) return "#eab308";
    if (status >= 400 && status < 500) return "#f97316";
    if (status >= 500) return "#ef4444";
    return "#6b7280";
}
