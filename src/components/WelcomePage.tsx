import React, { useState, useRef, useEffect } from "react";
import { BiFile } from "react-icons/bi";
import { FaFolder } from "react-icons/fa6";
import { SiMqtt, SiSocketdotio } from "react-icons/si";
import {
  TbChevronDown,
  TbPlus,
  TbWorld,
  TbPlugConnected,
  TbBrandGraphql,
} from "react-icons/tb";
import { VscTypeHierarchySub } from "react-icons/vsc";
import { Logo } from "./ui";
import { getMethodColor, getShortMethod } from "../utils/methodConstants";

interface WelcomePageProps {
  onNewRequest: () => void;
  onNewWebSocket: () => void;
  onNewGraphQL: () => void;
  onNewSocketIO: () => void;
  onNewMqtt: () => void;
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

/** Recents type icons: same classes as FileTree row badges. Sizes: 14px Tabler/VSC, 12px SI marks. */
const RECENT_ICON_TABLER = 14;
const RECENT_ICON_SI = 12;

function RecentTypeIcon({ method }: { method: string }) {
  const m = method.toUpperCase();
  switch (m) {
    case "WS":
      return (
        <TbPlugConnected
          size={RECENT_ICON_TABLER}
          className="shrink-0 text-emerald-400"
          aria-hidden
        />
      );
    case "GQL":
      return (
        <TbBrandGraphql
          size={RECENT_ICON_TABLER}
          className="shrink-0 text-fuchsia-400"
          aria-hidden
        />
      );
    case "SIO":
      return (
        <SiSocketdotio
          size={RECENT_ICON_SI}
          className="shrink-0 text-[#25C2A0]"
          aria-hidden
        />
      );
    case "MQTT":
      return (
        <SiMqtt
          size={RECENT_ICON_SI}
          className="shrink-0 text-orange-300"
          aria-hidden
        />
      );
    case "WF":
      return (
        <VscTypeHierarchySub
          size={RECENT_ICON_TABLER}
          className="shrink-0 text-accent"
          aria-hidden
        />
      );
    default:
      return (
        <span
          className="font-mono text-[11px] font-bold shrink-0 text-right"
          style={{ color: getMethodColor(method) }}
        >
          {getShortMethod(method)}
        </span>
      );
  }
}

export const WelcomePage: React.FC<WelcomePageProps> = ({
  onNewRequest,
  onNewWebSocket,
  onNewGraphQL,
  onNewSocketIO,
  onNewMqtt,
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
  const [showRequestTypes, setShowRequestTypes] = useState(false);
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const requestDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showRequestTypes) return;
    const handleClick = (e: MouseEvent) => {
      if (
        requestDropdownRef.current &&
        !requestDropdownRef.current.contains(e.target as Node)
      ) {
        setShowRequestTypes(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowRequestTypes(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [showRequestTypes]);

  const requestTypes = [
    {
      label: "REST Request",
      icon: <TbWorld size={16} />,
      color: "text-emerald-400",
      onClick: onNewRequest,
    },
    {
      label: "WebSocket",
      icon: <TbPlugConnected size={16} />,
      color: "text-emerald-400",
      onClick: onNewWebSocket,
    },
    {
      label: "GraphQL",
      icon: <TbBrandGraphql size={16} />,
      color: "text-fuchsia-400",
      onClick: onNewGraphQL,
    },
    {
      label: "Socket.IO",
      icon: <SiSocketdotio size={16} />,
      color: "text-[#25C2A0]",
      onClick: onNewSocketIO,
    },
    {
      label: "MQTT",
      icon: <SiMqtt size={14} />,
      color: "text-orange-300",
      onClick: onNewMqtt,
    },
  ];

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
          <h2 className="text-white/40 text-xs">New</h2>
          <div className="space-y-3.5">
            <div className="relative" ref={requestDropdownRef}>
              <button
                onClick={() => setShowRequestTypes(!showRequestTypes)}
                className={`group flex cursor-pointer items-center gap-3 text-white transition-all duration-200 text-left w-full ${
                  showRequestTypes
                    ? "opacity-90"
                    : "opacity-50 hover:opacity-80"
                }`}
              >
                <div className="flex items-center justify-center w-4 h-4">
                  <TbPlus size={18} />
                </div>
                <span className="text-[14px] font-medium">New Request</span>
                <TbChevronDown
                  size={12}
                  className={`ml-auto opacity-30 transition-transform duration-200 ${showRequestTypes ? "rotate-180" : ""}`}
                />
              </button>

              {showRequestTypes && (
                <div className="absolute min-w-[200px] z-50 mt-2 ml-7 bg-card border border-border rounded-xl shadow-2xl py-1.5 animate-in fade-in slide-in-from-top-2 zoom-in-95 duration-200 origin-top">
                  {requestTypes.map((rt) => (
                    <button
                      key={rt.label}
                      onClick={() => {
                        rt.onClick();
                        setShowRequestTypes(false);
                      }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <span className={rt.color}>{rt.icon}</span>
                      <span className="text-[13px] font-medium">
                        {rt.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onNewFolder}
              className={`group flex items-center gap-3 cursor-pointer text-white transition-all duration-200 text-left w-full ${
                showRequestTypes
                  ? "opacity-20 pointer-events-none"
                  : "opacity-50 hover:opacity-80"
              }`}
            >
              <div className="flex items-center justify-center w-4 h-4">
                <FaFolder size={14} />
              </div>
              <span className="text-[14px] font-medium">New Folder</span>
            </button>
            <button
              onClick={onImportClick}
              className={`group flex items-center gap-3 text-white cursor-pointer transition-all duration-200 text-left w-full ${
                showRequestTypes
                  ? "opacity-20 pointer-events-none"
                  : "opacity-50 hover:opacity-80"
              }`}
            >
              <div className="flex items-center justify-center w-4 h-4">
                <BiFile size={16} />
              </div>
              <span className="text-[14px] font-medium">Import from file</span>
            </button>
          </div>
        </div>

        <div
          className={`space-y-5 transition-opacity duration-200 ${
            showRequestTypes ? "opacity-20 pointer-events-none" : ""
          }`}
        >
          <h2 className="text-white/40 text-xs">Recents</h2>
          <div className="space-y-3.5">
            {recentRequests.length > 0 ? (
              recentRequests.slice(0, 5).map((req) => (
                <button
                  key={req.requestId}
                  onClick={() => onSelectRecent(req.requestId)}
                  className="group flex items-center gap-3 text-white/40 hover:text-white/80 transition-all duration-200 text-left w-full"
                >
                  <div className="flex w-10 shrink-0 items-center justify-end opacity-80 group-hover:opacity-100 transition-opacity [&_svg]:max-h-[14px] [&_svg]:max-w-[14px]">
                    <RecentTypeIcon method={req.method} />
                  </div>
                  <span className="text-[14px] font-medium truncate">
                    {req.name}
                  </span>
                </button>
              ))
            ) : (
              <div className="text-[13px] text-white/5 italic pl-10">
                No recent requests
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
