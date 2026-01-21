import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Project,
  Folder,
  RequestFile,
  TreeItem,
  SortMode,
  Environment,
  EnvironmentVariable,
  RecentRequest,
} from "../types/project";
import type { ApiResponse } from "../bindings";
import { createDefaultRequest } from "../reqhelpers/rest";
import { findSecrets } from "../utils/secretDetection";
import type { AuthType } from "../bindings";

function generateId(): string {
  return crypto.randomUUID();
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createEmptyProject(name: string): Project {
  return {
    id: generateId(),
    name,
    root: {
      id: generateId(),
      type: "folder",
      name: "Root",
      children: [],
      expanded: true,
    },
    environments: [
      {
        id: generateId(),
        name: "Development",
        variables: [
          {
            id: generateId(),
            key: "BASE_URL",
            value: "https://api.example.com",
            enabled: true,
          },
        ],
      },
    ],
    activeEnvironmentId: null,
    recentRequests: [],
  };
}

function findParentFolder(root: Folder, targetId: string): Folder | null {
  for (const child of root.children) {
    if (child.id === targetId) return root;
    if (child.type === "folder") {
      const found = findParentFolder(child, targetId);
      if (found) return found;
    }
  }
  return null;
}

function findFolder(root: Folder, folderId: string): Folder | null {
  if (root.id === folderId) return root;
  for (const child of root.children) {
    if (child.type === "folder") {
      const found = findFolder(child, folderId);
      if (found) return found;
    }
  }
  return null;
}

function findItem(root: Folder, itemId: string): TreeItem | null {
  if (root.id === itemId) return root;
  for (const child of root.children) {
    if (child.id === itemId) return child;
    if (child.type === "folder") {
      const found = findItem(child, itemId);
      if (found) return found;
    }
  }
  return null;
}

function cloneTreeItem(item: TreeItem): TreeItem {
  if (item.type === "request") {
    return {
      ...item,
      id: generateId(),
      name: `${item.name} (copy)`,
      request: {
        ...item.request,
        headers: { ...item.request.headers },
        query_params: { ...item.request.query_params },
      },
      response: null,
    };
  }
  return {
    ...item,
    id: generateId(),
    name: `${item.name} (copy)`,
    children: item.children.map(cloneTreeItem),
  };
}

function sortChildren(children: TreeItem[], mode: SortMode): TreeItem[] {
  if (mode === "manual") return children;
  return [...children].sort((a, b) => {
    if (mode === "alphabetical") return a.name.localeCompare(b.name);
    if (mode === "method") {
      const order = [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "HEAD",
        "OPTIONS",
      ];
      const aMethod = a.type === "request" ? a.request.method : "ZZZZ";
      const bMethod = b.type === "request" ? b.request.method : "ZZZZ";
      const diff = order.indexOf(aMethod) - order.indexOf(bMethod);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    }
    return 0;
  });
}

function getAllItemIds(folder: Folder): string[] {
  const ids: string[] = [folder.id];
  for (const child of folder.children) {
    if (child.type === "folder") {
      ids.push(...getAllItemIds(child));
    } else {
      ids.push(child.id);
    }
  }
  return ids;
}

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  activeRequestId: string | null;
  selectedItemId: string | null;
  unsavedChanges: Set<string>;

  addToRecentRequests: (requestId: string) => void;
  getRecentRequests: () => RecentRequest[];

  createProject: (name: string) => string;
  selectProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  updateProjectIcon: (id: string, icon: string) => void;
  updateProjectIconColor: (id: string, color: string) => void;
  updateProjectConfig: (
    id: string,
    config: {
      description?: string;
      baseUrl?: string;
      authorization?: AuthType;
    },
  ) => void;
  deleteProject: (id: string) => void;
  getActiveProject: () => Project | null;

  addEnvironment: (projectId: string, name: string) => string;
  updateEnvironment: (projectId: string, envId: string, name: string) => void;
  deleteEnvironment: (projectId: string, envId: string) => void;
  setActiveEnvironment: (projectId: string, envId: string) => void;
  addEnvironmentVariable: (envId: string, key: string, value: string) => void;
  updateEnvironmentVariable: (
    envId: string,
    varId: string,
    key: string,
    value: string,
    enabled: boolean,
  ) => void;
  deleteEnvironmentVariable: (envId: string, varId: string) => void;
  setEnvironmentVariables: (
    envId: string,
    variables: EnvironmentVariable[],
  ) => void;
  getActiveEnvironmentVariables: (projectId?: string) => EnvironmentVariable[];
  resolveVariables: (text: string, projectId?: string) => string;

  setActiveRequestId: (id: string | null) => void;
  setSelectedItem: (id: string | null) => void;
  addRequest: (parentFolderId: string, name?: string) => string;
  addFolder: (parentFolderId: string, name?: string) => string;
  renameItem: (itemId: string, newName: string) => void;
  deleteItem: (itemId: string) => void;
  duplicateItem: (itemId: string) => void;
  toggleFolder: (folderId: string) => void;
  sortFolder: (folderId: string, mode: SortMode) => void;
  moveItem: (
    itemId: string,
    targetFolderId: string,
    targetIndex: number,
  ) => void;
  moveItemBefore: (itemId: string, beforeItemId: string) => void;
  moveItemAfter: (itemId: string, afterItemId: string) => void;
  updateRequest: (
    requestId: string,
    updater: (r: RequestFile) => RequestFile,
  ) => void;
  setRequestResponse: (requestId: string, response: ApiResponse) => void;
  getActiveRequest: () => RequestFile | null;
  markSaved: (requestId: string) => void;
  markUnsaved: (requestId: string) => void;
  isUnsaved: (requestId: string) => boolean;
  clipboard: { id: string; type: "cut" | "copy" } | null;
  copyToClipboard: (id: string) => void;
  cutToClipboard: (id: string) => void;
  pasteItem: (targetFolderId: string) => void;
  importToFolder: (parentFolderId: string, item: Folder | RequestFile) => void;
  processItemForSecrets: (item: TreeItem) => {
    detected: number;
    variablesCreated: number;
  };
  ensureVariableForSecret: (value: string, typeHint: string) => string;
  processStringForSecrets: (text: string) => {
    processedText: string;
    detectedCount: number;
  };
  createProjectFromImport: (project: Partial<Project>) => string;
  selectedLanguage: string;
  setSelectedLanguage: (lang: string) => void;
}

const initialProject = createEmptyProject("My Project");

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [initialProject],
      activeProjectId: initialProject.id,
      activeRequestId: null,
      selectedItemId: null,
      unsavedChanges: new Set(),
      clipboard: null,
      selectedLanguage: "shell",

      setSelectedLanguage: (lang) => set({ selectedLanguage: lang }),

      createProject: (name) => {
        const newProject = createEmptyProject(name);
        set((state) => ({
          projects: [...state.projects, newProject],
          activeProjectId: newProject.id,
          activeRequestId: null,
        }));
        return newProject.id;
      },

      selectProject: (id) => {
        set({
          activeProjectId: id,
          activeRequestId: null,
          selectedItemId: null,
        });
      },

      renameProject: (id, name) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, name } : p,
          ),
        }));
      },

      updateProjectIcon: (id, icon) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, icon } : p,
          ),
        }));
      },

      updateProjectIconColor: (id, color) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, iconColor: color } : p,
          ),
        }));
      },

      updateProjectConfig: (id, config) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...config } : p,
          ),
        }));
      },

      deleteProject: (id) => {
        set((state) => {
          const remaining = state.projects.filter((p) => p.id !== id);
          if (remaining.length === 0) {
            const newProject = createEmptyProject("My Project");
            return {
              projects: [newProject],
              activeProjectId: newProject.id,
              activeRequestId: null,
            };
          }
          return {
            projects: remaining,
            activeProjectId:
              state.activeProjectId === id
                ? remaining[0].id
                : state.activeProjectId,
            activeRequestId:
              state.activeProjectId === id ? null : state.activeRequestId,
          };
        });
      },

      getActiveProject: () => {
        const state = get();
        return (
          state.projects.find((p) => p.id === state.activeProjectId) || null
        );
      },

      getActiveEnvironmentVariables: (projectId) => {
        const state = get();
        const pid = projectId || state.activeProjectId;
        const project = state.projects.find((p) => p.id === pid);
        if (!project) return [];
        const activeEnv = project.environments.find(
          (e) => e.id === project.activeEnvironmentId,
        );
        if (!activeEnv) return [];
        return activeEnv.variables.filter((v) => v.enabled) || [];
      },

      addEnvironment: (projectId, name) => {
        const newId = generateId();
        const newEnv: Environment = {
          id: newId,
          name,
          variables: [],
        };
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              environments: [...p.environments, newEnv],
              activeEnvironmentId: p.activeEnvironmentId || newEnv.id,
            };
          }),
        }));
        return newId;
      },

      updateEnvironment: (projectId, envId, name) => {
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== projectId) return p;
            return {
              ...p,
              environments: p.environments.map((e) =>
                e.id === envId ? { ...e, name } : e,
              ),
            };
          }),
        }));
      },

      deleteEnvironment: (projectId, envId) => {
        set((state) => {
          const project = state.projects.find((p) => p.id === projectId);
          if (!project || project.environments.length <= 1) return state;
          const remainingEnvs = project.environments.filter(
            (e) => e.id !== envId,
          );
          return {
            projects: state.projects.map((p) => {
              if (p.id !== projectId) return p;
              return {
                ...p,
                environments: remainingEnvs,
                activeEnvironmentId:
                  p.activeEnvironmentId === envId
                    ? remainingEnvs[0]?.id || null
                    : p.activeEnvironmentId,
              };
            }),
          };
        });
      },

      setActiveEnvironment: (projectId, envId) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, activeEnvironmentId: envId } : p,
          ),
        }));
      },

      addEnvironmentVariable: (envId, key, value) => {
        set((state) => ({
          projects: state.projects.map((p) => ({
            ...p,
            environments: p.environments.map((e) => {
              if (e.id !== envId) return e;
              return {
                ...e,
                variables: [
                  ...e.variables,
                  { id: generateId(), key, value, enabled: true },
                ],
              };
            }),
          })),
        }));
      },

      updateEnvironmentVariable: (envId, varId, key, value, enabled) => {
        set((state) => ({
          projects: state.projects.map((p) => ({
            ...p,
            environments: p.environments.map((e) => {
              if (e.id !== envId) return e;
              return {
                ...e,
                variables: e.variables.map((v) =>
                  v.id === varId ? { ...v, key, value, enabled } : v,
                ),
              };
            }),
          })),
        }));
      },

      deleteEnvironmentVariable: (envId, varId) => {
        set((state) => ({
          projects: state.projects.map((p) => ({
            ...p,
            environments: p.environments.map((e) => {
              if (e.id !== envId) return e;
              return {
                ...e,
                variables: e.variables.filter((v) => v.id !== varId),
              };
            }),
          })),
        }));
      },

      setEnvironmentVariables: (envId, variables) => {
        set((state) => ({
          projects: state.projects.map((p) => ({
            ...p,
            environments: p.environments.map((e) => {
              if (e.id !== envId) return e;
              return { ...e, variables };
            }),
          })),
        }));
      },

      resolveVariables: (text, projectId) => {
        const envVars = get().getActiveEnvironmentVariables(projectId);
        let result = text;
        for (const env of envVars) {
          const regex = new RegExp(`\\{\\{${escapeRegExp(env.key)}\\}\\}`, "g");
          result = result.replace(regex, env.value);
        }
        return result;
      },

      setActiveRequestId: (id) => {
        set({ activeRequestId: id });
        if (id) {
          get().addToRecentRequests(id);
        }
      },
      setSelectedItem: (id) => set({ selectedItemId: id }),

      addRequest: (parentFolderId, name = "New Request") => {
        const newId = generateId();
        const request: RequestFile = {
          id: newId,
          type: "request",
          name,
          request: createDefaultRequest(),
          response: null,
          useInheritedAuth: true,
        };

        set((state) => ({
          ...state,
          projects: state.projects.map((p) => {
            if (p.id !== state.activeProjectId) return p;

            const addChildToFolder = (folder: Folder): Folder => {
              if (folder.id === parentFolderId) {
                return { ...folder, children: [...folder.children, request] };
              }
              return {
                ...folder,
                children: folder.children.map((child) =>
                  child.type === "folder" ? addChildToFolder(child) : child
                )
              };
            };

            return { ...p, root: addChildToFolder(p.root) };
          }),
          activeRequestId: newId,
        }));
        get().addToRecentRequests(newId);
        return newId;
      },

      addFolder: (parentFolderId, name = "New Folder") => {
        const newId = generateId();
        const newFolder: Folder = {
          id: newId,
          type: "folder",
          name,
          children: [],
          expanded: true,
        };

        set((state) => ({
          ...state,
          projects: state.projects.map((p) => {
            if (p.id !== state.activeProjectId) return p;

            const addChildToFolder = (folder: Folder): Folder => {
              if (folder.id === parentFolderId) {
                return { ...folder, children: [...folder.children, newFolder] };
              }
              return {
                ...folder,
                children: folder.children.map((child) =>
                  child.type === "folder" ? addChildToFolder(child) : child
                )
              };
            };

            return { ...p, root: addChildToFolder(p.root) };
          }),
        }));
        return newId;
      },

      ensureVariableForSecret: (value, typeHint) => {
        const { projects, activeProjectId } = get();
        const project = projects.find((p) => p.id === activeProjectId);
        if (!project) return value;

        const mainEnv =
          project.environments.find((e) => e.name === "main") ||
          project.environments[0];
        if (!mainEnv) return value;

        // Check if value already exists as a variable
        const existing = mainEnv.variables.find((v) => v.value === value);
        if (existing) return `{{${existing.key}}}`;

        // Create new variable
        const baseKey = typeHint.toUpperCase().replace(/\s+/g, "_");
        let key = baseKey;
        let counter = 1;
        while (mainEnv.variables.some((v) => v.key === key)) {
          key = `${baseKey}_${counter++}`;
        }

        const newVarId = generateId();
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== activeProjectId) return p;
            return {
              ...p,
              environments: p.environments.map((e) => {
                if (e.id !== mainEnv.id) return e;
                return {
                  ...e,
                  variables: [
                    ...e.variables,
                    { id: newVarId, key, value, enabled: true },
                  ],
                };
              }),
            };
          }),
        }));

        return `{{${key}}}`;
      },

      processStringForSecrets: (text: string) => {
        if (!text) return { processedText: text, detectedCount: 0 };
        const secrets = findSecrets(text);
        if (secrets.length === 0)
          return { processedText: text, detectedCount: 0 };

        let processedText = text;
        let detectedCount = 0;
        const { ensureVariableForSecret } = get();
        const sortedSecrets = [...secrets].sort(
          (a, b) => b.value.length - a.value.length,
        );

        for (const secret of sortedSecrets) {
          const varPlaceholder = ensureVariableForSecret(
            secret.value,
            secret.patternName,
          );
          if (varPlaceholder !== secret.value) {
            processedText = processedText.replace(
              new RegExp(escapeRegExp(secret.value), "g"),
              varPlaceholder,
            );
            detectedCount++;
          }
        }
        return { processedText, detectedCount };
      },

      processItemForSecrets: (item) => {
        let detectedCount = 0;
        const { ensureVariableForSecret } = get();

        const processString = (text: string | undefined): string => {
          if (!text) return text || "";
          const secrets = findSecrets(text);
          if (secrets.length === 0) return text;

          let processedText = text;
          const sortedSecrets = [...secrets].sort(
            (a, b) => b.value.length - a.value.length,
          );

          for (const secret of sortedSecrets) {
            const varPlaceholder = ensureVariableForSecret(
              secret.value,
              secret.patternName,
            );
            if (varPlaceholder !== secret.value) {
              processedText = processedText.replace(
                new RegExp(escapeRegExp(secret.value), "g"),
                varPlaceholder,
              );
              detectedCount++;
            }
          }
          return processedText;
        };

        const processRequest = (req: RequestFile) => {
          req.name = processString(req.name);
          req.request.url = processString(req.request.url);

          const newHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.request.headers)) {
            newHeaders[k] = processString(v);
          }
          req.request.headers = newHeaders;

          const newParams: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.request.query_params)) {
            newParams[k] = processString(v);
          }
          req.request.query_params = newParams;

          if (req.request.auth && req.request.auth !== "None") {
            const auth = req.request.auth;
            if ("Basic" in auth) {
              auth.Basic.username = processString(auth.Basic.username);
              auth.Basic.password = processString(auth.Basic.password);
            } else if ("Bearer" in auth) {
              auth.Bearer.token = processString(auth.Bearer.token);
            } else if ("ApiKey" in auth) {
              auth.ApiKey.key = processString(auth.ApiKey.key);
              auth.ApiKey.value = processString(auth.ApiKey.value);
            }
          }

          if (req.request.body && typeof req.request.body !== "string") {
            if ("Raw" in req.request.body) {
              req.request.body.Raw.content = processString(
                req.request.body.Raw.content,
              );
            } else if ("FormUrlEncoded" in req.request.body) {
              const newFields: Record<string, string> = {};
              for (const [k, v] of Object.entries(
                req.request.body.FormUrlEncoded.fields,
              )) {
                newFields[k] = processString(v);
              }
              req.request.body.FormUrlEncoded.fields = newFields;
            }
          }
        };

        const processNode = (node: TreeItem) => {
          if (node.type === "request") {
            processRequest(node);
          } else {
            node.name = processString(node.name);
            node.children.forEach(processNode);
          }
        };

        processNode(item);
        return { detected: detectedCount, variablesCreated: detectedCount };
      },

      renameItem: (itemId, newName) => {
        set((state) => {
          const project = state.projects.find(
            (p) => p.id === state.activeProjectId,
          );
          if (!project) return state;
          const item = findItem(project.root, itemId);
          if (item) item.name = newName;
          return { projects: [...state.projects] };
        });
      },

      deleteItem: (itemId) => {
        set((state) => {
          const project = state.projects.find(
            (p) => p.id === state.activeProjectId,
          );
          if (!project) return state;
          const parent = findParentFolder(project.root, itemId);
          if (parent) {
            parent.children = parent.children.filter((c) => c.id !== itemId);
          }
          const newUnsaved = new Set(state.unsavedChanges);
          newUnsaved.delete(itemId);
          return {
            projects: [...state.projects],
            activeRequestId:
              state.activeRequestId === itemId ? null : state.activeRequestId,
            unsavedChanges: newUnsaved,
          };
        });
      },

      duplicateItem: (itemId) => {
        set((state) => {
          const project = state.projects.find(
            (p) => p.id === state.activeProjectId,
          );
          if (!project) return state;
          const parent = findParentFolder(project.root, itemId);
          const item = findItem(project.root, itemId);
          if (parent && item) {
            const cloned = cloneTreeItem(item);
            const idx = parent.children.findIndex((c) => c.id === itemId);
            parent.children.splice(idx + 1, 0, cloned);
          }
          return { projects: [...state.projects] };
        });
      },

      toggleFolder: (folderId) => {
        set((state) => {
          const project = state.projects.find(
            (p) => p.id === state.activeProjectId,
          );
          if (!project) return state;
          const folder = findFolder(project.root, folderId);
          if (folder) folder.expanded = !folder.expanded;
          return { projects: [...state.projects] };
        });
      },

      sortFolder: (folderId, mode) => {
        set((state) => {
          const project = state.projects.find(
            (p) => p.id === state.activeProjectId,
          );
          if (!project) return state;
          const folder = findFolder(project.root, folderId);
          if (folder) folder.children = sortChildren(folder.children, mode);
          return { projects: [...state.projects] };
        });
      },

      moveItem: (itemId, targetFolderId, targetIndex) => {
        set((state) => {
          const project = state.projects.find(
            (p) => p.id === state.activeProjectId,
          );
          if (!project) return state;

          const item = findItem(project.root, itemId);
          if (!item) return state;
          if (item.id === targetFolderId) return state;
          if (
            item.type === "folder" &&
            getAllItemIds(item).includes(targetFolderId)
          )
            return state;

          const sourceParent = findParentFolder(project.root, itemId);
          const targetFolder = findFolder(project.root, targetFolderId);

          if (!sourceParent || !targetFolder) return state;

          const newProjects = state.projects.map((p) => {
            if (p.id !== state.activeProjectId) return p;

            const newRoot = JSON.parse(JSON.stringify(p.root)) as Folder;
            const newSourceParent = findFolder(newRoot, sourceParent.id);
            const newTargetFolder = findFolder(newRoot, targetFolderId);
            const itemToMove = findItem(newRoot, itemId);

            if (!newSourceParent || !newTargetFolder || !itemToMove) return p;

            newSourceParent.children = newSourceParent.children.filter(
              (c) => c.id !== itemId,
            );
            newTargetFolder.children.splice(targetIndex, 0, itemToMove);

            return { ...p, root: newRoot };
          });

          return { projects: newProjects };
        });
      },

      moveItemBefore: (itemId, beforeItemId) => {
        const state = get();
        const project = state.projects.find(
          (p) => p.id === state.activeProjectId,
        );
        if (!project) return;
        const targetParent = findParentFolder(project.root, beforeItemId);
        if (!targetParent) return;
        const idx = targetParent.children.findIndex(
          (c) => c.id === beforeItemId,
        );
        get().moveItem(itemId, targetParent.id, idx);
      },

      moveItemAfter: (itemId, afterItemId) => {
        const state = get();
        const project = state.projects.find(
          (p) => p.id === state.activeProjectId,
        );
        if (!project) return;
        const targetParent = findParentFolder(project.root, afterItemId);
        if (!targetParent) return;
        const idx = targetParent.children.findIndex(
          (c) => c.id === afterItemId,
        );
        get().moveItem(itemId, targetParent.id, idx + 1);
      },

      updateRequest: (requestId, updater) => {
        set((state) => {
          const project = state.projects.find(
            (p) => p.id === state.activeProjectId,
          );
          if (!project) return state;
          const item = findItem(project.root, requestId);
          if (item && item.type === "request") {
            const updated = updater(item);
            Object.assign(item, updated);
            const newUnsaved = new Set(state.unsavedChanges);
            newUnsaved.add(requestId);
            return {
              projects: [...state.projects],
              unsavedChanges: newUnsaved,
            };
          }
          return state;
        });
      },

      setRequestResponse: (requestId, response) => {
        set((state) => {
          const project = state.projects.find(
            (p) => p.id === state.activeProjectId,
          );
          if (!project) return state;
          const item = findItem(project.root, requestId);
          if (item && item.type === "request") {
            item.response = response;
          }
          return { projects: [...state.projects] };
        });
      },

      getActiveRequest: () => {
        const state = get();
        const project = state.projects.find(
          (p) => p.id === state.activeProjectId,
        );
        if (!project || !state.activeRequestId) return null;
        const item = findItem(project.root, state.activeRequestId);
        return item?.type === "request" ? item : null;
      },

      markSaved: (requestId) => {
        set((state) => {
          const newUnsaved = new Set(state.unsavedChanges);
          newUnsaved.delete(requestId);
          return { unsavedChanges: newUnsaved };
        });
      },

      markUnsaved: (requestId) => {
        set((state) => {
          const newUnsaved = new Set(state.unsavedChanges);
          newUnsaved.add(requestId);
          return { unsavedChanges: newUnsaved };
        });
      },

      isUnsaved: (requestId) => {
        return get().unsavedChanges.has(requestId);
      },

      copyToClipboard: (id) => set({ clipboard: { id, type: "copy" } }),
      cutToClipboard: (id) => set({ clipboard: { id, type: "cut" } }),

      pasteItem: (targetFolderId) => {
        const { clipboard, activeProjectId, projects, moveItem } = get();
        if (!clipboard) return;

        const project = projects.find((p) => p.id === activeProjectId);
        if (!project) return;

        const item = findItem(project.root, clipboard.id);
        if (!item) return;

        if (clipboard.type === "cut") {
          moveItem(clipboard.id, targetFolderId, 0);
          set({ clipboard: null });
        } else {
          const targetFolder = findFolder(project.root, targetFolderId);
          if (targetFolder) {
            const cloned = cloneTreeItem(item);
            get().processItemForSecrets(cloned);
            targetFolder.children.push(cloned);
            set({ projects: [...projects] });
          }
        }
      },

      importToFolder: (parentFolderId, item) => {
        set((state) => {
          const project = state.projects.find(
            (p) => p.id === state.activeProjectId,
          );
          if (!project) return state;
          const folder = findFolder(project.root, parentFolderId);
          if (folder) {
            folder.children.push(item);
          }
          return { projects: [...state.projects] };
        });
      },

      createProjectFromImport: (partialProject) => {
        const id = partialProject.id || generateId();
        const newProject: Project = {
          id,
          name: partialProject.name || "Imported Project",
          root: partialProject.root || {
            id: generateId(),
            type: "folder",
            name: "Root",
            children: [],
            expanded: true,
          },
          environments: partialProject.environments || [
            {
              id: generateId(),
              name: "main",
              variables: [],
            },
          ],
          activeEnvironmentId: partialProject.activeEnvironmentId || null,
          icon: partialProject.icon,
          iconColor: partialProject.iconColor,
          description: partialProject.description,
          baseUrl: partialProject.baseUrl,
          authorization: partialProject.authorization,
          recentRequests: [],
        };

        set((state) => ({
          projects: [...state.projects, newProject],
          activeProjectId: newProject.id,
          activeRequestId: null,
        }));

        return newProject.id;
      },

      addToRecentRequests: (requestId) => {
        set((state) => {
          const project = state.projects.find(
            (p) => p.id === state.activeProjectId,
          );
          if (!project) return state;

          const item = findItem(project.root, requestId);
          if (!item || item.type !== "request") return state;

          const recent: RecentRequest = {
            requestId: item.id,
            name: item.name,
            method: item.request.method,
            url: item.request.url,
            timestamp: Date.now(),
          };

          const filtered = project.recentRequests.filter(
            (r) => r.requestId !== requestId,
          );
          const updated = [recent, ...filtered].slice(0, 10);

          return {
            projects: state.projects.map((p) =>
              p.id === project.id ? { ...p, recentRequests: updated } : p,
            ),
          };
        });
      },

      getRecentRequests: () => {
        const state = get();
        const project = state.projects.find(
          (p) => p.id === state.activeProjectId,
        );
        return project?.recentRequests || [];
      },
    }),
    {
      name: "mandy-projects",
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        activeRequestId: state.activeRequestId,
        selectedItemId: state.selectedItemId,
        selectedLanguage: state.selectedLanguage,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.unsavedChanges = new Set();
          if (state.projects && state.projects.length > 0) {
            state.projects = state.projects.map((p) => {
              if (p.environments && p.environments.length > 0) {
                const first = p.environments[0];
                if (first && "key" in first) {
                  return {
                    ...p,
                    environments: [
                      {
                        id: generateId(),
                        name: "Development",
                        variables: p.environments.map((env: any) => ({
                          id: env.id,
                          key: env.key,
                          value: env.value,
                          enabled: env.enabled,
                        })),
                      },
                    ],
                    activeEnvironmentId: null,
                  };
                }
              }
              if (!p.environments) {
                return {
                  ...p,
                  environments: [
                    {
                      id: generateId(),
                      name: "Development",
                      variables: [],
                    },
                  ],
                  activeEnvironmentId: null,
                };
              }
              return p;
            });
          } else {
            state.projects = [
              {
                id: generateId(),
                name: "My Project",
                root: {
                  id: generateId(),
                  type: "folder",
                  name: "Root",
                  children: [],
                  expanded: true,
                },
                environments: [
                  {
                    id: generateId(),
                    name: "Development",
                    variables: [],
                  },
                ],
                activeEnvironmentId: null,
                recentRequests: [],
              },
            ];
            state.activeProjectId = state.projects[0].id;
          }
        }
      },
    },
  ),
);
