import React, { useState, useEffect, useMemo } from "react";
import type { RequestFile } from "../types/project";
import {
  generateCurl,
  generateFetch,
  generatePythonRequests,
  generateGo,
  generateRust,
  generateJava,
  generatePHP,
} from "../utils/snippets";
import { CodeViewer } from "./CodeMirror";
import { Dropdown } from "./ui";
import { decodeBody } from "../reqhelpers/rest";
import { ObjectDefinition } from "../types/overview";
import {
  getTypeColor,
  extractDefinitions,
  scrollToId,
} from "../utils/overviewUtils";

interface RequestOverviewProps {
  activeRequest: RequestFile;
  onRun: () => void;
  onUpdateName: (name: string) => void;
  onUpdateDescription: (description: string) => void;
  onUpdatePropertyDescription: (key: string, description: string) => void;
  onSwitchToBody: () => void;
}

export const RequestOverview: React.FC<RequestOverviewProps> = ({
  activeRequest,
  onRun,
  onUpdateName,
  onUpdateDescription,
  onUpdatePropertyDescription,
  onSwitchToBody,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState(activeRequest.name);
  const [description, setDescription] = useState(
    activeRequest.description || "",
  );
  const [snippetLang, setSnippetLang] = useState("Shell cURL");
  const [showSnippetDropdown, setShowSnippetDropdown] = useState(false);
  const [editingProperty, setEditingProperty] = useState<string | null>(null);
  const [propDescValue, setPropDescValue] = useState("");

  useEffect(() => {
    setName(activeRequest.name);
    setDescription(activeRequest.description || "");
  }, [activeRequest]);

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (name.trim() && name !== activeRequest.name) {
      onUpdateName(name.trim());
    } else {
      setName(activeRequest.name);
    }
  };

  const getSnippet = () => {
    switch (snippetLang) {
      case "Shell cURL":
        return {
          code: generateCurl(activeRequest.request),
          lang: "shell" as const,
        };
      case "JavaScript Fetch":
        return {
          code: generateFetch(activeRequest.request),
          lang: "javascript" as const,
        };
      case "Python Requests":
        return {
          code: generatePythonRequests(activeRequest.request),
          lang: "python" as const,
        };
      case "Go Native":
        return { code: generateGo(activeRequest.request), lang: "go" as const };
      case "Rust Reqwest":
        return {
          code: generateRust(activeRequest.request),
          lang: "rust" as const,
        };
      case "Java HttpClient":
        return {
          code: generateJava(activeRequest.request),
          lang: "java" as const,
        };
      case "PHP Guzzle":
        return {
          code: generatePHP(activeRequest.request),
          lang: "php" as const,
        };
      default:
        return { code: "", lang: "text" as const };
    }
  };

  const { code: snippetCode, lang: currentLang } = getSnippet();

  const definitions = useMemo(() => {
    let allDefs: ObjectDefinition[] = [];
    const seen = new Set<string>();

    const reqBody = activeRequest.request.body;
    if (
      reqBody !== "None" &&
      "Raw" in reqBody &&
      reqBody.Raw.content_type?.includes("json")
    ) {
      try {
        const data = JSON.parse(reqBody.Raw.content);
        allDefs = [
          ...allDefs,
          ...extractDefinitions(data, "RequestBody", seen),
        ];
      } catch (e) {}
    }

    if (activeRequest.response) {
      const bodyText = decodeBody(activeRequest.response);
      if (bodyText) {
        try {
          const data = JSON.parse(bodyText);
          allDefs = [
            ...allDefs,
            ...extractDefinitions(data, "ResponseBody", seen),
          ];
        } catch (e) {}
      }
    }

    return allDefs;
  }, [activeRequest]);

  const handlePropDescBlur = (key: string) => {
    onUpdatePropertyDescription(key, propDescValue);
    setEditingProperty(null);
  };

  const renderProperty = (
    key: string,
    value: any,
    context?: string,
    allowDescription?: boolean,
    showTypes: boolean = true,
  ) => {
    const type = Array.isArray(value) ? "array" : typeof value;
    const isObject = type === "object" && value !== null;
    const isObjectArray =
      type === "array" && value.length > 0 && typeof value[0] === "object";

    const fullKey = context ? `${context}.${key}` : key;
    const savedDesc = activeRequest.propertyDescriptions?.[fullKey] || "";

    let targetId = "";
    if (isObject)
      targetId = `def-${key.charAt(0).toUpperCase() + key.slice(1)}`;
    if (isObjectArray)
      targetId = `def-${key.charAt(0).toUpperCase() + key.slice(1)}Item`;

    return (
      <div
        key={key}
        className="py-2 border-b border-white/5 last:border-0 group"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-white font-medium">
            {key}
          </span>
          {showTypes &&
            (targetId ? (
              <button
                onClick={() => scrollToId(targetId)}
                className={`text-[10px] lowercase font-mono cursor-pointer hover:underline ${getTypeColor(type)}`}
              >
                {type}
              </button>
            ) : (
              <span
                className={`text-[10px] lowercase font-mono ${getTypeColor(type)}`}
              >
                {type}
              </span>
            ))}
          {key === "id" && (
            <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded leading-none">
              read-only
            </span>
          )}
        </div>

        {allowDescription && (
          <div className="mt-1 flex items-center min-h-[18px]">
            {editingProperty === fullKey ? (
              <input
                autoFocus
                className="w-full bg-transparent border-none outline-none text-[11px] text-white/80 p-0 m-0 leading-none"
                value={propDescValue}
                onChange={(e) => setPropDescValue(e.target.value)}
                onBlur={() => handlePropDescBlur(fullKey)}
                onKeyDown={(e) =>
                  e.key === "Enter" && handlePropDescBlur(fullKey)
                }
                placeholder="Enter description..."
              />
            ) : (
              <div
                className="w-full text-[11px] text-white/40 cursor-text hover:text-white/60 transition-colors leading-none"
                onClick={() => {
                  setEditingProperty(fullKey);
                  setPropDescValue(savedDesc);
                }}
              >
                {savedDesc || "No description"}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderStructure = (
    title: string,
    data: any,
    showSwitch?: boolean,
    context?: string,
    allowDescription?: boolean,
  ) => {
    if (!data) return null;
    return (
      <div className="mt-4">
        <div className="flex items-center justify-start mb-6 gap-5">
          <h3 className="text-sm font-semibold text-white/70">{title}</h3>
          {showSwitch && (
            <button
              onClick={onSwitchToBody}
              className="text-[10px] cursor-pointer text-white/80 hover:text-white/50 font-medium px-3 py-1 rounded-full bg-white/5 hover:bg-white/2 transition-colors"
            >
              Show Body
            </button>
          )}
        </div>
        <div className="space-y-1">
          {Object.entries(data).map(([key, value]) =>
            renderProperty(
              key,
              value,
              context,
              allowDescription,
              showSwitch || context === "response" || context === "request",
            ),
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="flex min-h-full max-w-[1600px] mx-auto relative pl-8 pr-4 gap-8">
        <div className="flex-1 py-12 w-[40%]">
          <div className="max-w-3xl">
            {isEditingName ? (
              <input
                autoFocus
                className="text-3xl font-bold bg-transparent border-none outline-none text-white w-full mb-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
              />
            ) : (
              <h1
                className="text-3xl font-bold text-white mb-2 cursor-text hover:text-white/90"
                onClick={() => setIsEditingName(true)}
              >
                {activeRequest.name}
              </h1>
            )}

            <textarea
              className="w-full bg-transparent border-none outline-none text-white/60 resize-none overflow-hidden min-h-[1.5rem] mb-3 placeholder:text-white/20"
              placeholder="Add a description..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                onUpdateDescription(e.target.value);
              }}
              style={{ height: "auto" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = target.scrollHeight + "px";
              }}
            />

            <section className="flex flex-col gap-8">
              {Object.keys(activeRequest.request.query_params).length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-white/70 mb-2">
                    Query Parameters
                  </h3>
                  <div className="space-y-1">
                    {Object.entries(activeRequest.request.query_params).map(
                      ([key, value]) =>
                        renderProperty(key, value, "params", true, false),
                    )}
                  </div>
                </div>
              )}

              {(() => {
                const body = activeRequest.request.body;
                if (
                  body !== "None" &&
                  "Raw" in body &&
                  body.Raw.content_type?.includes("json")
                ) {
                  try {
                    return renderStructure(
                      "Request Body",
                      JSON.parse(body.Raw.content),
                      true,
                      "request",
                      true,
                    );
                  } catch (e) {}
                }
                return null;
              })()}

              {(() => {
                if (!activeRequest.response) return null;
                const bodyText = decodeBody(activeRequest.response);
                if (!bodyText) return null;
                try {
                  return renderStructure(
                    "Response Body",
                    JSON.parse(bodyText),
                    false,
                    "response",
                    false,
                  );
                } catch (e) {}
                return null;
              })()}

              {definitions.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-sm font-semibold text-white/70 mb-4">
                    Object Definitions
                  </h3>
                  <div className="space-y-4">
                    {definitions.map((def) => (
                      <div
                        key={def.name}
                        id={`def-${def.name}`}
                        className="scroll-mt-12 transition-colors duration-500 rounded-lg"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-white/20 font-mono text-lg">
                            #
                          </span>
                          <h4 className="text-sm font-mono font-semibold text-accent/70">
                            {def.name}
                          </h4>
                        </div>
                        <div className="space-y-1 ml-2 border-l border-white/5 pl-8">
                          {Object.entries(def.properties).map(([key, value]) =>
                            renderProperty(key, value, def.name, false, true),
                          )}
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
          <div className="h-full rounded-xl bg-background border border-white/5 overflow-hidden flex flex-col shadow-2xl">
            <div className="flex shrink-0 items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    activeRequest.request.method === "GET"
                      ? "bg-green-500/20 text-green-400"
                      : activeRequest.request.method === "POST"
                        ? "bg-blue-500/20 text-blue-400"
                        : activeRequest.request.method === "PUT"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : activeRequest.request.method === "DELETE"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-gray-500/20 text-gray-400"
                  }`}
                >
                  {activeRequest.request.method}
                </span>
                <span className="text-xs text-white/40 truncate max-w-[150px] ">
                  {activeRequest.name || "/"}
                </span>
              </div>

              <div className="relative">
                <button
                  onClick={() => setShowSnippetDropdown(!showSnippetDropdown)}
                  className="text-[11px] text-white/60 hover:text-white flex items-center gap-1"
                >
                  {snippetLang}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {showSnippetDropdown && (
                  <Dropdown
                    className="top-full right-0 mt-1"
                    onClose={() => setShowSnippetDropdown(false)}
                    items={[
                      {
                        label: "Shell cURL",
                        onClick: () => {
                          setSnippetLang("Shell cURL");
                          setShowSnippetDropdown(false);
                        },
                      },
                      {
                        label: "JavaScript Fetch",
                        onClick: () => {
                          setSnippetLang("JavaScript Fetch");
                          setShowSnippetDropdown(false);
                        },
                      },
                      {
                        label: "Python Requests",
                        onClick: () => {
                          setSnippetLang("Python Requests");
                          setShowSnippetDropdown(false);
                        },
                      },
                      {
                        label: "Go Native",
                        onClick: () => {
                          setSnippetLang("Go Native");
                          setShowSnippetDropdown(false);
                        },
                      },
                      {
                        label: "Rust Reqwest",
                        onClick: () => {
                          setSnippetLang("Rust Reqwest");
                          setShowSnippetDropdown(false);
                        },
                      },
                      {
                        label: "Java HttpClient",
                        onClick: () => {
                          setSnippetLang("Java HttpClient");
                          setShowSnippetDropdown(false);
                        },
                      },
                      {
                        label: "PHP Guzzle",
                        onClick: () => {
                          setSnippetLang("PHP Guzzle");
                          setShowSnippetDropdown(false);
                        },
                      },
                    ]}
                  />
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 text-[11px] relative">
              <div className="absolute inset-0 overflow-auto">
                <CodeViewer code={snippetCode} language={currentLang} />
              </div>
              <button
                onClick={onRun}
                className="flex absolute right-4 bottom-4 cursor-pointer items-center gap-2 px-4 py-1.5 bg-accent text-background rounded-full text-sm font-semibold hover:bg-accent/90 transition-colors shadow-lg z-20"
              >
                Run
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
