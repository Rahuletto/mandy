import React, { useState } from "react";
import { BiPlus, BiFile } from "react-icons/bi";
import { FaFolder } from "react-icons/fa6";
import { TbChevronDown, TbPlus } from "react-icons/tb";
import { Logo } from "./ui";
import { getShortMethod } from "../utils/methodConstants";

interface WelcomePageProps {
  onNewRequest: () => void;
  onNewFolder: () => void;
  onImportClick: () => void;
  recentRequests: Array<{
    requestId: string;
    method: string;
    name: string;
  }>;
  onSelectRecent: (id: string) => void;
  projects: Array<{ id: string; name: string }>;
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
}

const getMethodColorTw = (method: string) => {
  switch (method.toUpperCase()) {
    case "GET":
      return "text-green-500/60";
    case "POST":
      return "text-yellow-500/60";
    case "PUT":
      return "text-blue-500/60";
    case "PATCH":
      return "text-purple-500/60";
    case "DELETE":
      return "text-red-500/60";
    default:
      return "text-white/20";
  }
};

export const WelcomePage: React.FC<WelcomePageProps> = ({
  onNewRequest,
  onNewFolder,
  onImportClick,
  recentRequests,
  onSelectRecent,
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
}) => {
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-white/30 select-none font-sans overflow-auto py-20 h-full">
      <div className="flex flex-col items-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <div className="relative mb-2">
          <Logo className="w-16 h-16 opacity-[0.3]" />
        </div>

        <div className="relative mt-4">
          <button
            onClick={() => setShowProjectSelector(!showProjectSelector)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] text-white/30 cursor-pointer bg-white/2 hover:text-white/40 hover:bg-white/5 transition-all outline-none"
          >
            <span className="font-medium">
              {activeProject?.name || "Select Project"}
            </span>
            <TbChevronDown
              size={12}
              className={`opacity-30 transition-transform ${showProjectSelector ? "rotate-180" : ""}`}
            />
          </button>

          {showProjectSelector && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowProjectSelector(false)}
              />
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-card border border-border rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-200">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p.id);
                      setShowProjectSelector(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors ${
                      p.id === activeProjectId
                        ? "text-accent bg-accent/10"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
                <div className="h-px bg-white/5 my-1 mx-2" />
                <button
                  onClick={() => {
                    onNewProject();
                    setShowProjectSelector(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <TbPlus size={14} className="opacity-50" />
                  <span>Create Project</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="w-full max-w-[320px] space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
        <div className="space-y-3">
          <h2 className=" text-white/40 text-xs">New</h2>
          <div className="space-y-3.5">
            <button
              onClick={onNewRequest}
              className="group flex cursor-pointer items-center gap-3 text-white/40 hover:text-white/80 transition-all duration-200 text-left w-full"
            >
              <div className="flex items-center justify-center w-4 h-4">
                <BiPlus size={18} />
              </div>
              <span className="text-[14px] font-medium">
                Create a new request
              </span>
            </button>
            <button
              onClick={onNewFolder}
              className="group flex items-center gap-3 text-white/40 cursor-pointer hover:text-white/80 transition-all duration-200 text-left w-full"
            >
              <div className="flex items-center justify-center w-4 h-4">
                <FaFolder size={14} />
              </div>
              <span className="text-[14px] font-medium">
                Create a new folder
              </span>
            </button>
            <button
              onClick={onImportClick}
              className="group flex items-center gap-3 text-white/40 hover:text-white/80 cursor-pointer transition-all duration-200 text-left w-full"
            >
              <div className="flex items-center justify-center w-4 h-4">
                <BiFile size={16} />
              </div>
              <span className="text-[14px] font-medium">Import from file</span>
            </button>
          </div>
        </div>

        <div className="space-y-5">
          <h2 className=" text-white/40 text-xs">Recents</h2>
          <div className="space-y-3.5">
            {recentRequests.length > 0 ? (
              recentRequests.slice(0, 5).map((req) => (
                <button
                  key={req.requestId}
                  onClick={() => onSelectRecent(req.requestId)}
                  className="group flex items-center gap-3 text-white/40 hover:text-white/80 transition-all duration-200 text-left w-full"
                >
                  <div className="w-10 flex justify-end">
                    <span
                      className={`text-[9px] font-bold font-mono transition-colors ${getMethodColorTw(req.method)} group-hover:opacity-100`}
                    >
                      {getShortMethod(req.method)}
                    </span>
                  </div>
                  <span className="text-[14px] font-medium truncate">
                    {req.name}
                  </span>
                </button>
              ))
            ) : (
              <div className="text-[13px] text-white/5 italic pl-7">
                No recent requests
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
