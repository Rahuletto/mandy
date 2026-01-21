export const METHOD_COLORS: Record<string, string> = {
  GET: "#22c55e",
  POST: "#f97316",
  PUT: "#3b82f6",
  PATCH: "#a855f7",
  DELETE: "#ef4444",
  HEAD: "#6b7280",
  OPTIONS: "#06b6d4",
};

export const METHOD_COLORS_TAILWIND: Record<string, { bg: string; text: string; bgHover: string }> = {
  GET: {
    bg: "bg-green-500/10",
    text: "text-green-400",
    bgHover: "hover:bg-green-500/20",
  },
  POST: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    bgHover: "hover:bg-blue-500/20",
  },
  PUT: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-400",
    bgHover: "hover:bg-yellow-500/20",
  },
  PATCH: {
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    bgHover: "hover:bg-purple-500/20",
  },
  DELETE: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    bgHover: "hover:bg-red-500/20",
  },
  HEAD: {
    bg: "bg-gray-500/10",
    text: "text-gray-400",
    bgHover: "hover:bg-gray-500/20",
  },
  OPTIONS: {
    bg: "bg-cyan-500/10",
    text: "text-cyan-400",
    bgHover: "hover:bg-cyan-500/20",
  },
};

export const SHORT_METHODS: Record<string, string> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PCH",
  DELETE: "DEL",
  HEAD: "HEAD",
  OPTIONS: "OPT",
};

export function getShortMethod(method: string): string {
  return SHORT_METHODS[method.toUpperCase()] || method;
}

export function getMethodColor(method: string): string {
  return METHOD_COLORS[method.toUpperCase()] || "#888";
}

export function getMethodColorTailwind(method: string) {
  return METHOD_COLORS_TAILWIND[method.toUpperCase()] || METHOD_COLORS_TAILWIND.GET;
}
