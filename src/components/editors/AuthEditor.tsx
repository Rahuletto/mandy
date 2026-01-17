import { useState, useMemo } from "react";
import type { AuthType, ApiKeyLocation } from "../../bindings";
import { Dropdown, EnvInput } from "../ui";
import { BiChevronDown, BiShieldQuarter } from "react-icons/bi";

interface AuthEditorProps {
    auth: AuthType;
    onChange: (auth: AuthType) => void;
    availableVariables?: string[];
}

type AuthMethod = "None" | "Basic" | "Bearer" | "ApiKey";

const AUTH_METHODS: { id: AuthMethod; label: string }[] = [
    { id: "None", label: "None" },
    { id: "Basic", label: "Basic Auth" },
    { id: "Bearer", label: "Bearer" },
    { id: "ApiKey", label: "API Key" },
];

export function AuthEditor({ auth, onChange, availableVariables = [] }: AuthEditorProps) {
    const [showSelector, setShowSelector] = useState(false);

    const activeMethod = useMemo<AuthMethod>(() => {
        if (auth === "None") return "None";
        if (typeof auth === "object") {
            if ("Basic" in auth) return "Basic";
            if ("Bearer" in auth) return "Bearer";
            if ("ApiKey" in auth) return "ApiKey";
        }
        return "None";
    }, [auth]);

    const handleMethodChange = (method: AuthMethod) => {
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

    const dropdownItems = AUTH_METHODS.map(m => ({
        label: m.label,
        active: activeMethod === m.id,
        onClick: () => handleMethodChange(m.id)
    }));

    return (
        <div className="flex flex-col h-full overflow-hidden">

            <div className="flex items-center gap-4 px-4 py-3 border-b border-white/5 shrink-0">
                <div className="text-xs text-white/30">
                    Authorization
                </div>
                <div className="relative">
                    <button
                        onClick={() => setShowSelector(!showSelector)}
                        className="flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 hover:bg-accent/15 transition-colors text-xs font-medium text-white/80"
                    >
                        <span className="text-accent">
                            {AUTH_METHODS.find(m => m.id === activeMethod)?.label}
                        </span>
                        <BiChevronDown className={`text-white/20 transition-transform ${showSelector ? "rotate-180" : ""}`} />
                    </button>

                    {showSelector && (
                        <Dropdown
                            items={dropdownItems}
                            onClose={() => setShowSelector(false)}
                            className="top-full left-0 mt-1"
                            width="w-40"
                        />
                    )}
                </div>
            </div>


            <div className="flex-1 overflow-auto p-6">
                {activeMethod === "None" && (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white/10 mb-4">
                            <BiShieldQuarter size={32} />
                        </div>
                        <div className="text-sm font-medium text-white/60 mb-1">This request does not use any authorization</div>
                        <div className="text-xs text-white/30 max-w-[240px]">Select an authorization type above if you want to include credentials with your request.</div>
                    </div>
                )}

                {activeMethod === "Basic" && typeof auth === "object" && "Basic" in auth && (
                    <div className="max-w-md space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs text-white/40 px-1">Username</label>
                            <EnvInput
                                value={auth.Basic.username}
                                onChange={(v) => onChange({ Basic: { ...auth.Basic, username: v } })}
                                placeholder="Username"
                                availableVariables={availableVariables}
                                className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs text-white/40 px-1">Password</label>
                            <EnvInput
                                type="password"
                                value={auth.Basic.password}
                                onChange={(v) => onChange({ Basic: { ...auth.Basic, password: v } })}
                                placeholder="Password"
                                availableVariables={availableVariables}
                                className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2"
                            />
                        </div>
                        <p className="text-[11px] text-white/20 px-1 italic">The authorization header will be generated automatically as Basic base64(user:pass).</p>
                    </div>
                )}

                {activeMethod === "Bearer" && typeof auth === "object" && "Bearer" in auth && (
                    <div className="max-w-md space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs text-white/40 px-1">Token</label>
                            <EnvInput
                                value={auth.Bearer.token}
                                onChange={(v) => onChange({ Bearer: { token: v } })}
                                placeholder="Token"
                                availableVariables={availableVariables}
                                className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 font-mono"
                            />
                        </div>
                        <p className="text-[11px] text-white/20 px-1 italic">The authorization header will be generated as Bearer &lt;token&gt;.</p>
                    </div>
                )}

                {activeMethod === "ApiKey" && typeof auth === "object" && "ApiKey" in auth && (
                    <div className="max-w-md space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs text-white/40 px-1">Key</label>
                            <EnvInput
                                value={auth.ApiKey.key}
                                onChange={(v) => onChange({ ApiKey: { ...auth.ApiKey, key: v } })}
                                placeholder="e.g. X-API-Key"
                                availableVariables={availableVariables}
                                className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs text-white/40 px-1">Value</label>
                            <EnvInput
                                value={auth.ApiKey.value}
                                onChange={(v) => onChange({ ApiKey: { ...auth.ApiKey, value: v } })}
                                placeholder="Value"
                                availableVariables={availableVariables}
                                className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs text-white/40 px-1">Add to</label>
                            <div className="flex gap-2">
                                {(["Header", "Query"] as ApiKeyLocation[]).map(loc => (
                                    <button
                                        key={loc}
                                        onClick={() => onChange({ ApiKey: { ...(auth as any).ApiKey, add_to: loc } })}
                                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${auth.ApiKey.add_to === loc
                                            ? "bg-accent/10 border-accent/20 text-accent"
                                            : "bg-white/5 border-white/5 text-white/40 hover:text-white/60"
                                            }`}
                                    >
                                        {loc}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
