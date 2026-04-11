/**
 * Central place for workspace / Mandy JSON schema migrations.
 * Project files use `schemaVersion`; missing or lower than CURRENT is "legacy".
 */

import type { Folder, Project, RequestItem, TreeItem } from "../types/project";
import { generateId } from "../utils/migration/shared";

/** Bump when on-disk / exported project shape changes in a breaking way. */
export const CURRENT_PROJECT_SCHEMA_VERSION = 1;

/** Zustand persist key version (localStorage layout); separate from project schema. */
export const ZUSTAND_PERSIST_VERSION = 2 as const;

const LEGACY_ACTIVE_ID_KEYS = [
	"activeRequestId",
	"activeWorkflowId",
	"activeWebSocketId",
	"activeGraphQLId",
	"activeSocketIOId",
	"activeMqttId",
] as const;

type LegacyPersistSlice = Partial<
	Record<(typeof LEGACY_ACTIVE_ID_KEYS)[number], string | null>
> & { activeItemId?: string | null };

export function migratePersistedZustandState(
	persisted: unknown,
	fromVersion: number,
): LegacyPersistSlice & Record<string, unknown> {
	if (!persisted || typeof persisted !== "object") return persisted as never;
	const p = persisted as LegacyPersistSlice & Record<string, unknown>;

	if (fromVersion < ZUSTAND_PERSIST_VERSION) {
		let activeItemId: string | null =
			typeof p.activeItemId === "string" || p.activeItemId === null
				? p.activeItemId
				: null;
		if (activeItemId == null) {
			for (const key of LEGACY_ACTIVE_ID_KEYS) {
				const v = p[key];
				if (typeof v === "string" && v.length > 0) {
					activeItemId = v;
					break;
				}
			}
		}
		const next = { ...p, activeItemId };
		for (const key of LEGACY_ACTIVE_ID_KEYS) {
			delete next[key];
		}
		return next;
	}

	return p;
}

export function isLegacyProject(project: Project): boolean {
	return (project.schemaVersion ?? 0) < CURRENT_PROJECT_SCHEMA_VERSION;
}

export function projectNeedsMigration(projects: Project[]): boolean {
	return projects.some(isLegacyProject);
}

function deepClone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/** Legacy: environments stored as flat variable list on first "env". */
function normalizeEnvironments(project: Project): Project {
	const envs = project.environments;
	if (!envs || envs.length === 0) {
		return {
			...project,
			environments: [
				{
					id: generateId(),
					name: "Development",
					variables: [],
				},
			],
			activeEnvironmentId: project.activeEnvironmentId ?? null,
		};
	}
	const first = envs[0];
	if (first && "key" in first && !("variables" in first)) {
		return {
			...project,
			environments: [
				{
					id: generateId(),
					name: "Development",
					variables: envs.map((env: any) => ({
						id: env.id ?? generateId(),
						key: env.key,
						value: env.value,
						enabled: env.enabled ?? true,
					})),
				},
			],
			activeEnvironmentId: null,
		};
	}
	return project;
}

function normalizeTreeItem(item: TreeItem): TreeItem {
	if (item.type === "folder") {
		return {
			...item,
			children: item.children.map((c) => normalizeTreeItem(c)),
		};
	}
	const req = item as RequestItem;
	switch (req.type) {
		case "request":
			return {
				...req,
				useInheritedAuth: req.useInheritedAuth ?? true,
				response: req.response ?? null,
			};
		case "graphql":
			return {
				...req,
				headerItems: req.headerItems ?? [],
				useInheritedAuth: req.useInheritedAuth ?? true,
			};
		case "websocket":
			return {
				...req,
				headerItems: req.headerItems ?? [],
				useInheritedAuth: req.useInheritedAuth ?? true,
			};
		default:
			return req;
	}
}

function normalizeRoot(root: Folder): Folder {
	return {
		...root,
		children: root.children.map(
			(c) => normalizeTreeItem(c) as Folder | RequestItem,
		),
	};
}

/**
 * Apply all transforms for the current schema. Safe to call on already-current projects (no-op).
 */
export function migrateProjectToCurrent(project: Project): Project {
	let p = normalizeEnvironments({ ...project });
	p = {
		...p,
		root: normalizeRoot(p.root),
		recentRequests: p.recentRequests ?? [],
		schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
	};
	return p;
}

export function verifyProject(project: Project): boolean {
	try {
		if (!project.id || !project.name || !project.root) return false;
		if (project.root.type !== "folder") return false;
		if (
			!Array.isArray(project.environments) ||
			project.environments.length === 0
		)
			return false;
		for (const env of project.environments) {
			if (!env.id || !Array.isArray(env.variables)) return false;
		}
		const walk = (folder: Folder): boolean => {
			for (const child of folder.children) {
				if (!child.id || !child.type) return false;
				if (child.type === "folder") {
					if (!walk(child)) return false;
				}
			}
			return true;
		};
		if (!walk(project.root)) return false;
		JSON.stringify(project);
		return true;
	} catch {
		return false;
	}
}

export interface MigrateProjectResult {
	success: boolean;
	project: Project;
	error?: string;
}

/**
 * Backup → migrate → verify. Returns migrated project; on failure returns original + error.
 */
export function migrateProjectWithBackupSteps(
	project: Project,
): MigrateProjectResult {
	const _backup = deepClone(project);
	try {
		const migrated = migrateProjectToCurrent(deepClone(project));
		if (!verifyProject(migrated)) {
			return {
				success: false,
				project,
				error: "Verification failed after migration",
			};
		}
		void _backup;
		return { success: true, project: migrated };
	} catch (e) {
		return {
			success: false,
			project,
			error: e instanceof Error ? e.message : "Migration failed",
		};
	}
}

export interface MandyParseResult {
	project: Project;
	/** True if JSON had no schemaVersion or older than current. */
	wasLegacyFormat: boolean;
}

/**
 * Parse exported Mandy JSON and normalize to current schema (for import / open file).
 * When `preserveStructureIds` is false, regenerates tree ids (legacy import behavior).
 */
export function parseMandyJsonWithMigration(
	json: string,
	options?: { preserveStructureIds?: boolean },
): MandyParseResult | null {
	try {
		const parsed = JSON.parse(json) as Project & { schemaVersion?: number };
		if (!parsed?.root || typeof parsed.name !== "string") return null;

		const preserve = options?.preserveStructureIds ?? false;
		let project: Project;

		if (preserve) {
			project = parsed as Project;
		} else {
			const regenerateIds = (folder: Folder): Folder => ({
				...folder,
				id: generateId(),
				children: folder.children.map((child) =>
					child.type === "folder"
						? regenerateIds(child)
						: ({ ...child, id: generateId() } as RequestItem),
				),
			});
			project = {
				...parsed,
				id: generateId(),
				root: regenerateIds(parsed.root),
			} as Project;
		}

		const wasLegacy =
			(parsed.schemaVersion ?? 0) < CURRENT_PROJECT_SCHEMA_VERSION;
		const migrated = migrateProjectToCurrent(project);
		if (!verifyProject(migrated)) return null;
		return { project: migrated, wasLegacyFormat: wasLegacy };
	} catch {
		return null;
	}
}

/** Suggested backup file path next to a .mandy.json when rewriting on disk. */
export function mandyFileBackupPath(filePath: string): string {
	if (filePath.endsWith(".json")) {
		return filePath.replace(/\.json$/i, ".pre-v1-migration.bak.json");
	}
	return `${filePath}.pre-v1-migration.bak`;
}
