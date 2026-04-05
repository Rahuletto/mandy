import type { Project } from "../../../types/project";
import {
  migrateProjectToCurrent,
  parseMandyJsonWithMigration,
} from "../../../migration";

export function exportToMandyJSON(project: Project): string {
  return JSON.stringify(migrateProjectToCurrent(project), null, 2);
}

/** Import path: new ids on the tree (avoids collisions when merging into workspace). */
export function parseMandyJSON(json: string): Project | null {
  return (
    parseMandyJsonWithMigration(json, { preserveStructureIds: false })?.project ??
    null
  );
}
