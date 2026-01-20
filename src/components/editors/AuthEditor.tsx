import { useState, useMemo } from "react";
import type { AuthType, ApiKeyLocation } from "../../bindings";
import { Dropdown, EnvInput } from "../ui";
import { BiChevronDown, BiShieldQuarter, BiLinkExternal } from "react-icons/bi";

interface AuthEditorProps {
    auth: AuthType;
    onChange: (auth: AuthType) => void;
    availableVariables?: string[];
    projectAuth?: AuthType;
    isInherited?: boolean;
    onInheritChange?: (inherit: boolean) => void;
    onOpenProjectSettings?: () => void;
    isProject?: boolean;
}

type AuthMethod = "None" | "Basic" | "Bearer" | "ApiKey";

const AUTH_METHODS: { id: AuthMethod; label: string }[] = [
    { id: "None", label: "None" },
    { id: "Basic", label: "Basic Auth" },
    { id: "Bearer", label: "Bearer" },
    { id: "ApiKey", label: "API Key" },
];

function getAuthMethod(auth: AuthType): AuthMethod {
    if (auth === "None") return "None";
    if (typeof auth === "object") {
        if ("Basic" in auth) return "Basic";
        if ("Bearer" in auth) return "Bearer";
        if ("ApiKey" in auth) return "ApiKey";
    }
    return "None";
}

export function AuthEditor({
    auth,
    onChange,
    availableVariables = [],
    projectAuth,
    isInherited,
    onInheritChange,
    onOpenProjectSettings,
    isProject
}: AuthEditorProps) {
    const [showSelector, setShowSelector] = useState(false);

    const hasProjectAuth = projectAuth && projectAuth !== "None";
    const effectiveAuth = isInherited && hasProjectAuth ? projectAuth : auth;

    const activeMethod = useMemo<AuthMethod>(() => {
        return getAuthMethod(effectiveAuth);
    }, [effectiveAuth]);

    const handleMethodChange = (method: AuthMethod) => {
        if (isInherited && onInheritChange) {
            onInheritChange(false);
        }

        switch (method) {
            case "None":
                onChange("None");
                break;
            case "Basic":
                onChange({ Basic: { username: "", password: "" } });
                break;
            case "Bearer":
                onChange({ Bearer: { token: "" } });
                break;
            case "ApiKey":
                onChange({ ApiKey: { key: "", value: "", add_to: "Header" } });
                break;
        }
        setShowSelector(false);
    };

    const handleOverwrite = () => {
        if (onInheritChange) {
            onInheritChange(false);
        }
        if (projectAuth && projectAuth !== "None") {
            onChange(JSON.parse(JSON.stringify(projectAuth)));
        }
    };

    const handleInherit = () => {
        if (onInheritChange) {
            onInheritChange(true);
        }
    };

    const dropdownItems = AUTH_METHODS.map(m => ({
        label: m.label,
        active: activeMethod === m.id,
        onClick: () => handleMethodChange(m.id)
    }));

    const renderAuthFields = (authValue: AuthType, disabled: boolean = false) => {
        const method = getAuthMethod(authValue);

        if (method === "None") return null;

        return (
            <div className="max-w-md space-y-6">
                <div className="space-y-4">
                    {method === "Basic" && typeof authValue === "object" && "Basic" in authValue && (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-medium text-white/30 px-1">Username</label>
                                <EnvInput
                                    value={authValue.Basic.username}
                                    onChange={(v) => !disabled && onChange({ Basic: { ...authValue.Basic, username: v } })}
                                    placeholder="Username"
                                    availableVariables={availableVariables}
                                    disabled={disabled}
                                    className="w-full bg-white/5 border border-white/5 rounded-lg py-2.5 transition-all focus-within:border-accent/30"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-medium text-white/30 px-1">Password</label>
                                <EnvInput
                                    type="password"
                                    value={authValue.Basic.password}
                                    onChange={(v) => !disabled && onChange({ Basic: { ...authValue.Basic, password: v } })}
                                    placeholder="Password"
                                    availableVariables={availableVariables}
                                    disabled={disabled}
                                    className="w-full bg-white/5 border border-white/5 rounded-lg py-2.5 transition-all focus-within:border-accent/30"
                                />
                            </div>
                        </>
                    )}

                    {method === "Bearer" && typeof authValue === "object" && "Bearer" in authValue && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-medium text-white/30 px-1">Token</label>
                            <EnvInput
                                value={authValue.Bearer.token}
                                onChange={(v) => !disabled && onChange({ Bearer: { token: v } })}
                                placeholder="Token"
                                availableVariables={availableVariables}
                                disabled={disabled}
                                className="w-full bg-white/5 border border-white/5 rounded-lg py-2.5 transition-all focus-within:border-accent/30"
                            />
                        </div>
                    )}

                    {method === "ApiKey" && typeof authValue === "object" && "ApiKey" in authValue && (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-white/30 px-1">Key</label>
                                <EnvInput
                                    value={authValue.ApiKey.key}
                                    onChange={(v) => !disabled && onChange({ ApiKey: { ...authValue.ApiKey, key: v } })}
                                    placeholder="e.g. X-API-Key"
                                    availableVariables={availableVariables}
                                    disabled={disabled}
                                    className="w-full bg-white/5 border border-white/5 rounded-lg py-2.5 transition-all focus-within:border-accent/30"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-white/30 px-1">Value</label>
                                <EnvInput
                                    value={authValue.ApiKey.value}
                                    onChange={(v) => !disabled && onChange({ ApiKey: { ...authValue.ApiKey, value: v } })}
                                    placeholder="Value"
                                    availableVariables={availableVariables}
                                    disabled={disabled}
                                    className="w-full bg-white/5 border border-white/5 rounded-lg py-2.5 transition-all focus-within:border-accent/30"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px]  font-bold text-white/30 px-1">Add to</label>
                                <div className="flex gap-2">
                                    {(["Header", "Query"] as ApiKeyLocation[]).map(loc => (
                                        <button
                                            key={loc}
                                            disabled={disabled}
                                            onClick={() => !disabled && onChange({ ApiKey: { ...(authValue as any).ApiKey, add_to: loc } })}
                                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${authValue.ApiKey.add_to === loc
                                                ? "bg-accent/10 border-accent/20 text-accent"
                                                : "bg-white/5 border-white/5 text-white/40" + (!disabled ? " hover:text-white/60 hover:bg-white/10" : "")
                                                } ${disabled ? "cursor-default" : "cursor-pointer"}`}
                                        >
                                            {loc}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {disabled ? (
                    <div className="flex flex-col gap-3 pt-2">
                        <div className="flex items-center gap-2 p-3 bg-white/5 rounded-xl">

                            <p className="text-[11px] text-white/40 leading-relaxed">
                                Values are inherited from project config and are read-only here. To modify them, click button below.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            {onOpenProjectSettings && (
                                <button
                                    onClick={onOpenProjectSettings}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-medium text-white/80 hover:text-white transition-all cursor-pointer group"
                                >
                                    <BiLinkExternal size={14} className="text-white/40 group-hover:text-white/60" />
                                    Open Project Auth
                                </button>
                            )}
                            <button
                                onClick={handleOverwrite}
                                className="flex-1 px-5 py-3 bg-accent hover:bg-accent/80  rounded-full text-xs font-medium text-background transition-all cursor-pointer"
                            >
                                Overwrite for Request
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="text-[11px] text-white/20 px-1 italic">
                        {method === "Basic" && "The authorization header will be generated automatically as Basic base64(user:pass)."}
                        {method === "Bearer" && "The authorization header will be generated as Bearer <token>."}
                    </p>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-4 px-4 py-3 border-b border-white/5 shrink-0">
                <div className="text-xs text-white/30">
                    Authorization
                </div>

                <div className="relative">
                    <button
                        onClick={() => {
                            const locked = isInherited && hasProjectAuth;
                            if (!locked) setShowSelector(!showSelector);
                        }}
                        className={`flex items-center gap-2 px-3 py-1 rounded-full transition-all text-xs font-medium ${isInherited && hasProjectAuth
                            ? "bg-accent/10 text-accent cursor-default"
                            : "bg-white/5 hover:bg-white/10 text-white/80 cursor-pointer"
                            }`}
                    >
                        <span>{AUTH_METHODS.find(m => m.id === activeMethod)?.label}</span>
                        {!(isInherited && hasProjectAuth) && <BiChevronDown className={`text-white/20 transition-transform ${showSelector ? "rotate-180" : ""}`} />}
                        {isInherited && hasProjectAuth && <BiLinkExternal className="ml-1 opacity-50" size={12} />}
                    </button>

                    {showSelector && (
                        <Dropdown
                            items={dropdownItems}
                            onClose={() => setShowSelector(false)}
                            className="top-full left-0 mt-2"
                            width="w-44"
                        />
                    )}
                </div>

                {hasProjectAuth && !isInherited && onInheritChange && (
                    <button
                        onClick={handleInherit}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1 text-[11px] text-white/40 hover:text-accent hover:bg-accent/5 rounded-full transition-all cursor-pointer border border-transparent hover:border-accent/20"
                    >
                        <BiLinkExternal size={12} />
                        Use project auth
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-auto p-8">
                {activeMethod === "None" ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto">
                        <div className="w-16 h-16 bg-white/[0.03] rounded-full flex items-center justify-center text-white/10 mb-6">
                            <BiShieldQuarter size={32} />
                        </div>
                        <div className="text-sm font-medium text-white/60 mb-1">
                            {isProject ? "This project does not have auth" : "This request does not use any authorization"}
                        </div>
                        <p className="text-xs text-white/30 max-w-[240px] leading-relaxed">
                            {isProject
                                ? "This authorization method will be used for every request in this collection. You can override this by specifying one in the request."
                                : "Select an authorization type above if you want to include credentials with your request."}
                        </p>
                    </div>
                ) : (
                    renderAuthFields(effectiveAuth, isInherited && hasProjectAuth)
                )}
            </div>
        </div>
    );
}

