import type { ComponentType } from "react";
import type { RequestType, ItemOfType } from "../types/project";

export interface ItemTypeConfig<T extends RequestType> {
  readonly type: T;
  readonly label: string;
  readonly shortLabel: string;
  readonly icon: ComponentType<{ size?: number; className?: string }>;
  readonly iconClassName: string;

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
