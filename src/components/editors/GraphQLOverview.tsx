import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { autoSizeTextarea } from "../../utils";
import type { GraphQLFile } from "../../types/project";

interface GraphQLOverviewProps {
  gql: GraphQLFile;
  onUpdate: (updater: (gql: GraphQLFile) => GraphQLFile) => void;
  onRun: () => void;
}

export const GraphQLOverview = ({
  gql,
  onUpdate,
  onRun,
}: GraphQLOverviewProps) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState(gql.name);
  const [description, setDescription] = useState(gql.description || "");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setName(gql.name);
    setDescription(gql.description || "");
  }, [gql]);

  useLayoutEffect(() => {
    autoSizeTextarea(descriptionRef.current);
  }, [description]);

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (name.trim() && name !== gql.name) {
      onUpdate((prev) => ({ ...prev, name: name.trim() }));
    } else {
      setName(gql.name);
    }
  };

  const headerCount = (gql.headerItems || []).filter(
    (h) => h.enabled && h.key,
  ).length;

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="flex min-h-full max-w-[1600px] mx-auto relative pl-8 pr-4 gap-8">
        <div className="flex-1 py-12 w-[40%]">
          <div className="max-w-3xl">
            {isEditingName ? (
              <input
                autoFocus
                className="text-2xl font-bold bg-transparent border-none outline-none text-white w-full mb-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
              />
            ) : (
              <h1
                className="text-2xl font-bold text-white mb-2 cursor-text hover:text-white/90"
                onClick={() => setIsEditingName(true)}
              >
                {gql.name}
              </h1>
            )}

            <textarea
              ref={descriptionRef}
              className="w-full bg-transparent border-none outline-none text-sm text-white/60 resize-none overflow-hidden min-h-6 mb-3 placeholder:text-white/20"
              placeholder="Add a description..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                onUpdate((prev) => ({
                  ...prev,
                  description: e.target.value,
                }));
              }}
            />

            <section className="flex flex-col gap-8">
              {gql.url && (
                <div>
                  <h3 className="text-sm font-semibold text-white/70 mb-2">
                    Endpoint
                  </h3>
                  <div className="flex items-center gap-2 py-2">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-400">
                      POST
                    </span>
                    <span className="text-xs font-mono text-white/60 truncate">
                      {gql.url}
                    </span>
                  </div>
                </div>
              )}

              {gql.query && gql.query.trim() !== "query {\n  \n}" && (
                <div>
                  <h3 className="text-sm font-semibold text-white/70 mb-2">
                    Query
                  </h3>
                  <pre className="text-xs font-mono text-white/50 bg-white/5 rounded-lg p-3 overflow-x-auto max-h-48">
                    {gql.query}
                  </pre>
                </div>
              )}

              {headerCount > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-white/70 mb-2">
                    Headers
                  </h3>
                  <div className="space-y-1">
                    {(gql.headerItems || [])
                      .filter((h) => h.enabled && h.key)
                      .map((h) => (
                        <div
                          key={h.id}
                          className="py-2 border-b border-white/5 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-white font-medium">
                              {h.key}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </section>

            <div className="h-24" />
          </div>
        </div>

        <div className="w-[60%] shrink-0 py-4 self-start sticky top-0 h-[80vh]">
          <div className="h-full rounded-xl bg-background border border-white/5 overflow-hidden flex flex-col">
            <div className="flex shrink-0 items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-400">
                  GQL
                </span>
                <span className="text-xs text-white/40 truncate max-w-[200px]">
                  {gql.url || "No URL set"}
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-0 text-[11px] relative">
              <div className="absolute inset-0 overflow-auto p-4">
                <pre className="text-xs font-mono text-white/60 whitespace-pre-wrap">
                  {gql.query || "# Write your GraphQL query..."}
                </pre>
                {gql.variables && gql.variables !== "{}" && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <span className="text-[10px] text-white/30 uppercase tracking-wider">
                      Variables
                    </span>
                    <pre className="text-xs font-mono text-white/50 mt-2">
                      {gql.variables}
                    </pre>
                  </div>
                )}
              </div>
              <button
                onClick={onRun}
                disabled={!gql.url}
                className="flex absolute right-4 bottom-4 cursor-pointer items-center gap-2 px-4 py-1.5 bg-accent disabled:opacity-50 text-background rounded-full text-sm font-semibold hover:bg-accent/90 transition-colors z-20"
              >
                Run Query
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
