import { useState, useEffect } from "react";
import { BiTrash } from "react-icons/bi";
import type { Project } from "../types/project";
import { useProjectStore } from "../stores/projectStore";
import { KeyValueTable, type KeyValueItem } from "./KeyValueTable";

interface OverviewModalProps {
  projectId: string;
  onClose: () => void;
  onUpdateProject: (updates: Partial<Project>) => void;
  onAddEnvironment: (name: string) => string;
  onUpdateEnvironment: (envId: string, name: string) => void;
  onDeleteEnvironment: (envId: string) => void;
  onSetActiveEnvironment: (envId: string) => void;
  onAddEnvVar: (envId: string, key: string, value: string) => void;
  onUpdateEnvVar: (
    envId: string,
    varId: string,
    key: string,
    value: string,
    enabled: boolean,
  ) => void;
  onDeleteEnvVar: (envId: string, varId: string) => void;
}

export function OverviewModal({
  projectId,
  onClose,
  onUpdateProject,
  onAddEnvironment,
  onUpdateEnvironment,
  onDeleteEnvironment,
  onSetActiveEnvironment,
  onAddEnvVar,
  onUpdateEnvVar,
  onDeleteEnvVar,
}: OverviewModalProps) {
  const projects = useProjectStore((state) => state.projects);
  const project = projects.find((p) => p.id === projectId);
  const [projectName, setProjectName] = useState(project?.name || "");
  const [newEnvName, setNewEnvName] = useState("");
  const [expandedEnvId, setExpandedEnvId] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setProjectName(project.name);
      if (project.activeEnvironmentId) {
        setExpandedEnvId(project.activeEnvironmentId);
      }
    }
  }, [project?.name, project?.activeEnvironmentId]);

  function handleSave() {
    onUpdateProject({ name: projectName });
  }

  function handleAddEnvironment() {
    if (newEnvName.trim()) {
      const newId = onAddEnvironment(newEnvName.trim());
      setExpandedEnvId(newId);
      setNewEnvName("");
    }
  }

  function toggleEnv(envId: string) {
    if (expandedEnvId === envId) {
      setExpandedEnvId(null);
    } else {
      setExpandedEnvId(envId);
      onSetActiveEnvironment(envId);
    }
  }

  if (!project) return null;

  const environments = project.environments || [];

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-inset border border-white/10 rounded-lg w-[500px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <span className="text-sm font-medium">Overview</span>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div>
            <label className="block text-xs text-white/50 mb-2">
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={handleSave}
              className="w-full bg-background border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
            />
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-2">
              Environments
            </label>
            <div className="space-y-1">
              {environments.map((env) => (
                <div
                  key={env.id}
                  className="border border-white/10 rounded overflow-hidden"
                >
                  <div
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${env.id === project.activeEnvironmentId
                      ? "bg-accent/10"
                      : "hover:bg-white/5"
                      }`}
                    onClick={() => toggleEnv(env.id)}
                  >
                    <span className="text-xs text-white/40">
                      {expandedEnvId === env.id ? "▼" : "▶"}
                    </span>
                    <input
                      type="text"
                      value={env.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateEnvironment(env.id, e.target.value)}
                      className={`text-xs flex-1 bg-transparent border-none focus:outline-none transition-colors px-1 py-0.5 rounded focus:bg-white/5 ${env.id === project.activeEnvironmentId
                        ? "text-accent font-medium"
                        : "text-white/70"
                        }`}
                    />
                    <span className="text-xs text-white/30">
                      ({env.variables.length})
                    </span>
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          if (confirm(`Delete environment "${env.name}"?`)) {
                            onDeleteEnvironment(env.id);
                          }
                        }}
                        disabled={environments.length <= 1}
                        className="p-1 rounded text-white/40 hover:text-red-400 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-white/40 disabled:hover:bg-transparent transition-colors"
                        title={environments.length <= 1 ? "Cannot delete the only environment" : "Delete environment"}
                      >
                        <BiTrash size={14} />
                      </button>
                    </div>
                  </div>

                  {expandedEnvId === env.id && (
                    <div className="border-t border-white/10">
                      <KeyValueTable
                        items={env.variables
                          .filter(v => v.key.trim() || v.value.trim())
                          .map(v => ({ ...v, description: "" }))
                        }
                        onChange={(items: KeyValueItem[]) => {

                          const validItems = items.filter(i => i.key.trim() || i.value.trim());

                          const existingIds = new Set(env.variables.map(v => v.id));
                          const newIds = new Set(validItems.map(i => i.id));

                          env.variables.forEach(v => {
                            if (!newIds.has(v.id)) onDeleteEnvVar(env.id, v.id);
                          });

                          validItems.forEach(i => {
                            if (existingIds.has(i.id)) {
                              const old = env.variables.find(v => v.id === i.id);
                              if (old && (old.key !== i.key || old.value !== i.value || old.enabled !== i.enabled)) {
                                onUpdateEnvVar(env.id, i.id, i.key, i.value, i.enabled);
                              }
                            } else {
                              onAddEnvVar(env.id, i.key, i.value);
                            }
                          });
                        }}
                        showDescription={false}
                        placeholder={{
                          key: "VARIABLE_NAME",
                          value: "value"
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                  placeholder="New environment..."
                  className="flex-1 bg-background border border-white/10 rounded px-2 py-1.5 text-xs placeholder:text-white/30 focus:outline-none focus:border-accent/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddEnvironment();
                  }}
                />
                <button
                  onClick={handleAddEnvironment}
                  disabled={!newEnvName.trim()}
                  className="px-3 py-1.5 bg-accent hover:bg-accent/80 disabled:opacity-30 rounded text-xs transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
