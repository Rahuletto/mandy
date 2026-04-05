import type { RequestType } from "../types/project";
import { getItemConfig } from "./registryCore";

function cn(...parts: Array<string | undefined | null | false>): string {
  return parts.filter((p): p is string => Boolean(p?.trim())).join(" ");
}

export interface RequestTypeIconProps {
  type: RequestType;
  /** Pixel size; defaults to registry `treeIconSize`, then 14. */
  size?: number;
  className?: string;
  /**
   * `treeColumn` — file tree leading column (width + alignment).
   * `inline` — icon only (default).
   */
  variant?: "inline" | "treeColumn";
}

export function RequestTypeIcon({
  type,
  size,
  className = "",
  variant = "inline",
}: RequestTypeIconProps) {
  const cfg = getItemConfig(type);
  const Icon = cfg.icon;
  const px = size ?? cfg.treeIconSize ?? 14;
  const tone = cfg.iconClassName ?? "";

  if (variant === "treeColumn") {
    return (
      <span
        className={cn(
          "mr-2 w-10 shrink-0 text-right",
          tone,
          className || undefined,
        )}
      >
        <Icon
          size={px}
          className="relative top-[1px] inline-block align-[-2px]"
          aria-hidden
        />
      </span>
    );
  }

  return (
    <Icon size={px} className={cn(tone, className || undefined)} aria-hidden />
  );
}

/** Compact pill + icon for overview folder lists (GraphQL / Socket.IO / MQTT). */
export function RequestTypeListBadge({ type }: { type: RequestType }) {
  const cfg = getItemConfig(type);
  const badge = cfg.listBadgeClass;
  if (!badge) {
    return <RequestTypeIcon type={type} />;
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${badge}`}
    >
      <RequestTypeIcon type={type} />
    </span>
  );
}
