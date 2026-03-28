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
    <div className="h-full min-w-0 overflow-y-auto overflow-x-hidden">
      <div className="relative mx-auto flex min-h-full min-w-0 max-w-[1600px] gap-8 pl-8 pr-4">
        <div className="min-w-0 flex-1 py-12 w-[40%]">
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
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white/70 mb-2">
                    Endpoint
                  </h3>
                  <div className="flex min-w-0 items-center gap-2 py-2">
                    <span className="shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-400">
                      POST
                    </span>
                    <span className="min-w-0 truncate text-xs font-mono text-white/60">
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
                  <pre className="max-h-48 min-w-0 max-w-full overflow-auto rounded-lg bg-white/5 p-3 text-xs font-mono text-white/50">
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

        <div className="h-[80vh] w-[60%] shrink-0 self-start py-4 sticky top-0 min-w-0">
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-white/5 bg-background">
            <div className="flex shrink-0 items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-400">
                  GQL
                </span>
                <span className="max-w-[150px] truncate text-xs text-white/40 ">
                  {gql.url || "No URL set"}
                </span>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 text-[11px]">
              <div className="absolute inset-0 min-w-0 overflow-auto">
                <pre className="box-border max-w-full min-w-0 whitespace-pre-wrap break-words p-4 text-xs font-mono text-white/60">
                  {gql.query || "# Write your GraphQL query..."}
                </pre>
                {gql.variables && gql.variables !== "{}" && (
                  <div className="border-t border-white/5 px-4 pb-4 pt-4">
                    <span className="text-[10px] uppercase tracking-wider text-white/30">
                      Variables
                    </span>
                    <pre className="mt-2 max-w-full min-w-0 whitespace-pre-wrap break-words text-xs font-mono text-white/50">
                      {gql.variables}
                    </pre>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onRun}
                disabled={!gql.url}
                className="absolute bottom-4 right-4 z-20 flex cursor-pointer items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-background transition-colors hover:bg-accent/90 disabled:opacity-50"
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
