import type { ComponentType } from "react";
import type { ItemOfType, RequestType } from "../types/project";

export interface ItemTypeConfig<T extends RequestType> {
	readonly type: T;
	readonly label: string;
	readonly shortLabel: string;
	readonly icon: ComponentType<{ size?: number; className?: string }>;
	readonly iconClassName: string;

	/** Default icon pixel size in file tree / overlays when not overridden. */
	readonly treeIconSize?: number;

	/**
	 * Project overview: full-height sidebar cell behind the type icon (e.g. WebSocket / Workflow cards).
	 */
	readonly overviewSidebarCellClass?: string;

	/** Project overview: vertical accent stripe at card left edge. */
	readonly overviewStripeClass?: string;

	/**
	 * Compact list row badge (e.g. GraphQL / Socket.IO / MQTT in folder tree).
	 * Should include layout + background; icon color comes from `iconClassName`.
	 */
	readonly listBadgeClass?: string;

	/**
	 * When false, welcome recents do not match this type by `shortLabel` alone
	 * (REST recents store real HTTP methods; `shortLabel` is only a menu default).
	 */
	readonly matchRecentsByShortLabel?: boolean;

	/** Create a fresh default item of this type */
	createDefault(args: { id: string; name?: string }): ItemOfType<T>;

	/** Deep-clone an item of this type */
	clone(item: ItemOfType<T>, args: { id: string }): ItemOfType<T>;

	/** Get metadata for the recents list */
	getRecentMeta(item: ItemOfType<T>): { methodLabel: string; url: string };

	/** Whether this type shows in "add new" menus (workflow and folder are separate) */
	readonly isCreatable: boolean;

	/** Sort order in menus */
	readonly menuOrder: number;
}

export function defineItemType<T extends RequestType>(
	config: ItemTypeConfig<T>,
): ItemTypeConfig<T> {
	return config;
}
