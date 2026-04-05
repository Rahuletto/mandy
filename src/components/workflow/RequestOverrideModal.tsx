import { useEffect, useMemo, useRef, useState } from "react";
import { BiChevronDown } from "react-icons/bi";
import { HiX } from "react-icons/hi";
import type { AuthType } from "../../bindings";
import type { RequestFile } from "../../types/project";
import type {
	AuthOverrideType,
	BodyOverrideType,
	RequestOverrides,
} from "../../types/workflow";
import { getMethodColor } from "../../utils/methodConstants";
import { CodeEditor } from "../CodeMirror";
import { Checkbox } from "../ui/Checkbox";
import { Dropdown } from "../ui/Dropdown";

interface AvailableVariable {
	nodeId: string;
	nodeName: string;
	method?: string;
	paths: { path: string; type: string }[];
}

interface RequestOverrideModalProps {
	isOpen: boolean;
	onClose: () => void;
	overrides: RequestOverrides;
	onSave: (overrides: RequestOverrides) => void;
	availableVariables: AvailableVariable[];
	requestName: string;
	method: string;
	requestFile: RequestFile | null;
}

type TabType = "url" | "params" | "headers" | "auth" | "body";

function generateId() {
	return Math.random().toString(36).substring(2, 9);
}

function getAuthMethod(auth: AuthType): string {
	if (auth === "None") return "None";
	if (typeof auth === "object") {
		if ("Basic" in auth) return "Basic";
		if ("Bearer" in auth) return "Bearer";
		if ("ApiKey" in auth) return "API Key";
	}
	return "None";
}

const AUTH_OVERRIDE_TYPES: { value: AuthOverrideType; label: string }[] = [
	{ value: "inherit", label: "Inherit from request" },
	{ value: "none", label: "None" },
	{ value: "bearer", label: "Bearer Token" },
	{ value: "basic", label: "Basic Auth" },
	{ value: "apikey", label: "API Key" },
	{ value: "cookie", label: "Cookie" },
];

const BODY_OVERRIDE_TYPES: { value: BodyOverrideType; label: string }[] = [
	{ value: "inherit", label: "Inherit from request" },
	{ value: "none", label: "None" },
	{ value: "json", label: "JSON" },
	{ value: "variable", label: "Variable" },
];

function VariableInput({
	value,
	onChange,
	placeholder,
	variables,
	className = "",
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	variables: AvailableVariable[];
	className?: string;
}) {
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [filter, setFilter] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const allPaths = useMemo(() => {
		const paths: { path: string; node: string; type: string }[] = [];
		for (const v of variables) {
			for (const p of v.paths) {
				paths.push({ path: p.path, node: v.nodeName, type: p.type });
			}
		}
		return paths;
	}, [variables]);

	const filteredPaths = useMemo(() => {
		if (!filter) return allPaths.slice(0, 20);
		const lower = filter.toLowerCase();
		return allPaths
			.filter((p) => p.path.toLowerCase().includes(lower))
			.slice(0, 20);
	}, [allPaths, filter]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value;
		onChange(newValue);

		const bracketMatch = newValue.match(/\{\{([^}]*?)$/);
		if (bracketMatch) {
			setFilter(bracketMatch[1]);
			setShowSuggestions(true);
		} else {
			setShowSuggestions(false);
			setFilter("");
		}
	};

	const handleSelect = (path: string) => {
		const bracketMatch = value.match(/^(.*)\{\{([^}]*?)$/);
		if (bracketMatch) {
			onChange(bracketMatch[1] + path);
		} else {
			onChange(value + path);
		}
		setShowSuggestions(false);
		setFilter("");
		inputRef.current?.focus();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			setShowSuggestions(false);
		}
	};

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setShowSuggestions(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	return (
		<div ref={containerRef} className={`relative ${className}`}>
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				onFocus={() => {
					const bracketMatch = value.match(/\{\{([^}]*?)$/);
					if (bracketMatch) {
						setFilter(bracketMatch[1]);
						setShowSuggestions(true);
					}
				}}
				placeholder={placeholder}
				className="w-full bg-transparent text-white/80 font-mono placeholder:text-white/20 focus:outline-none"
			/>
			{showSuggestions && filteredPaths.length > 0 && (
				<div className="absolute top-full left-0 mt-1 z-50 w-64 max-h-48 overflow-auto bg-card border border-white/10 rounded-lg">
					{filteredPaths.map((p, i) => (
						<button
							key={`${p.path}-${i}`}
							type="button"
							onClick={() => handleSelect(p.path)}
							className="w-full text-left px-3 py-1.5 hover:bg-white/5 transition-colors flex items-center justify-between"
						>
							<span className="text-xs font-mono text-accent truncate">
								{p.path}
							</span>
							<span className="text-[10px] text-white/30 shrink-0 ml-2">
								{p.type}
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function ParamsTab({
	requestFile,
	overrides,
	onChange,
	variables,
}: {
	requestFile: RequestFile | null;
	overrides: RequestOverrides;
	onChange: (o: RequestOverrides) => void;
	variables: AvailableVariable[];
}) {
	const existingParams = useMemo(() => {
		if (!requestFile?.request?.query_params) return [];
		return Object.entries(requestFile.request.query_params)
			.filter(([_, v]) => v !== undefined && v !== null)
			.map(([key, value]) => ({ key, value: String(value || "") }));
	}, [requestFile]);

	const getOverride = (key: string) =>
		overrides.params.find((o) => o.key === key);

	const toggleOverride = (key: string) => {
		const existing = getOverride(key);
		if (existing) {
			onChange({
				...overrides,
				params: overrides.params.filter((o) => o.key !== key),
			});
		} else {
			onChange({
				...overrides,
				params: [
					...overrides.params,
					{ id: generateId(), key, value: "", enabled: true },
				],
			});
		}
	};

	const updateOverrideValue = (key: string, value: string) => {
		onChange({
			...overrides,
			params: overrides.params.map((o) =>
				o.key === key ? { ...o, value } : o,
			),
		});
	};

	if (existingParams.length === 0) {
		return (
			<div className="h-full flex flex-col items-center justify-center p-8 text-center">
				<div className="text-sm text-white/60 mb-1">No query parameters</div>
				<div className="text-xs text-white/30">
					This request has no query parameters to override
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 overflow-auto">
				<table className="w-full text-xs">
					<thead className="sticky top-0 z-10 bg-card">
						<tr className="border-b border-white/10">
							<th className="w-10 px-3 py-2.5 border-r border-white/10" />
							<th className="text-left px-3 py-2.5 font-medium text-white/40 border-r border-white/10 w-[140px]">
								Key
							</th>
							<th className="text-left px-3 py-2.5 font-medium text-white/40 border-r border-white/10 w-[140px]">
								Original
							</th>
							<th className="text-left px-3 py-2.5 font-medium text-white/40">
								Override Value
							</th>
						</tr>
					</thead>
					<tbody>
						{existingParams.map(({ key, value }) => {
							const override = getOverride(key);
							return (
								<tr
									key={key}
									className={`border-b border-white/5 transition-colors ${override ? "bg-accent/5" : "hover:bg-white/[0.02]"}`}
								>
									<td className="px-3 py-2 border-r border-white/5">
										<Checkbox
											checked={!!override}
											onChange={() => toggleOverride(key)}
										/>
									</td>
									<td className="px-3 py-2 border-r border-white/5 text-white/80">
										{key}
									</td>
									<td className="px-3 py-2 border-r border-white/5 text-white/40 font-mono truncate">
										{value || "—"}
									</td>
									<td className="px-3 py-2">
										{override ? (
											<VariableInput
												value={override.value}
												onChange={(v) => updateOverrideValue(key, v)}
												placeholder="Type {{ for variables"
												variables={variables}
											/>
										) : (
											<span className="text-white/20 italic">—</span>
										)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function HeadersTab({
	requestFile,
	overrides,
	onChange,
	variables,
}: {
	requestFile: RequestFile | null;
	overrides: RequestOverrides;
	onChange: (o: RequestOverrides) => void;
	variables: AvailableVariable[];
}) {
	const existingHeaders = useMemo(() => {
		if (!requestFile?.request?.headers) return [];
		return Object.entries(requestFile.request.headers)
			.filter(([_, v]) => v !== undefined && v !== null)
			.map(([key, value]) => ({ key, value: String(value || "") }));
	}, [requestFile]);

	const getOverride = (key: string) =>
		overrides.headers.find((o) => o.key === key);
	const additionalHeaders = overrides.headers.filter(
		(o) => !existingHeaders.find((h) => h.key === o.key),
	);

	const toggleOverride = (key: string) => {
		const existing = getOverride(key);
		if (existing) {
			onChange({
				...overrides,
				headers: overrides.headers.filter((o) => o.key !== key),
			});
		} else {
			onChange({
				...overrides,
				headers: [
					...overrides.headers,
					{ id: generateId(), key, value: "", enabled: true },
				],
			});
		}
	};

	const updateOverrideValue = (key: string, value: string) => {
		onChange({
			...overrides,
			headers: overrides.headers.map((o) =>
				o.key === key ? { ...o, value } : o,
			),
		});
	};

	const updateAdditionalHeader = (
		id: string,
		field: "key" | "value",
		value: string,
	) => {
		onChange({
			...overrides,
			headers: overrides.headers.map((o) =>
				o.id === id ? { ...o, [field]: value } : o,
			),
		});
	};

	const removeAdditionalHeader = (id: string) => {
		onChange({
			...overrides,
			headers: overrides.headers.filter((o) => o.id !== id),
		});
	};

	const [newKey, setNewKey] = useState("");
	const [newValue, setNewValue] = useState("");

	const addHeader = () => {
		if (!newKey.trim()) return;
		onChange({
			...overrides,
			headers: [
				...overrides.headers,
				{
					id: generateId(),
					key: newKey.trim(),
					value: newValue,
					enabled: true,
				},
			],
		});
		setNewKey("");
		setNewValue("");
	};

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 overflow-auto">
				<table className="w-full text-xs">
					<thead className="sticky top-0 z-10 bg-card">
						<tr className="border-b border-white/10">
							<th className="w-10 px-3 py-2.5 border-r border-white/10" />
							<th className="text-left px-3 py-2.5 font-medium text-white/40 border-r border-white/10 w-[140px]">
								Key
							</th>
							<th className="text-left px-3 py-2.5 font-medium text-white/40 border-r border-white/10 w-[140px]">
								Original
							</th>
							<th className="text-left px-3 py-2.5 font-medium text-white/40">
								Override Value
							</th>
							<th className="w-10 px-3 py-2.5" />
						</tr>
					</thead>
					<tbody>
						{existingHeaders.map(({ key, value }) => {
							const override = getOverride(key);
							return (
								<tr
									key={key}
									className={`border-b border-white/5 transition-colors ${override ? "bg-accent/5" : "hover:bg-white/[0.02]"}`}
								>
									<td className="px-3 py-2 border-r border-white/5">
										<Checkbox
											checked={!!override}
											onChange={() => toggleOverride(key)}
										/>
									</td>
									<td className="px-3 py-2 border-r border-white/5 text-white/80">
										{key}
									</td>
									<td className="px-3 py-2 border-r border-white/5 text-white/40 font-mono truncate max-w-[140px]">
										{value || "—"}
									</td>
									<td className="px-3 py-2">
										{override ? (
											<VariableInput
												value={override.value}
												onChange={(v) => updateOverrideValue(key, v)}
												placeholder="Type {{ for variables"
												variables={variables}
											/>
										) : (
											<span className="text-white/20 italic">—</span>
										)}
									</td>
									<td className="px-3 py-2" />
								</tr>
							);
						})}

						{additionalHeaders.map((h) => (
							<tr
								key={h.id}
								className="border-b border-white/5 bg-green/5 hover:bg-green/10 transition-colors"
							>
								<td className="px-3 py-2 border-r border-white/5">
									<span className="text-green text-[10px]">NEW</span>
								</td>
								<td className="px-3 py-2 border-r border-white/5">
									<input
										type="text"
										value={h.key}
										onChange={(e) =>
											updateAdditionalHeader(h.id, "key", e.target.value)
										}
										placeholder="Header name"
										className="w-full bg-transparent text-white/80 placeholder:text-white/20 focus:outline-none"
									/>
								</td>
								<td className="px-3 py-2 border-r border-white/5 text-white/20 italic">
									—
								</td>
								<td className="px-3 py-2">
									<VariableInput
										value={h.value}
										onChange={(v) => updateAdditionalHeader(h.id, "value", v)}
										placeholder="Type {{ for variables"
										variables={variables}
									/>
								</td>
								<td className="px-3 py-2 text-center">
									<button
										type="button"
										onClick={() => removeAdditionalHeader(h.id)}
										className="w-5 h-5 flex items-center justify-center rounded text-white/30 hover:text-red hover:bg-red/10 transition-all mx-auto"
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
										>
											<path d="M18 6L6 18M6 6l12 12" />
										</svg>
									</button>
								</td>
							</tr>
						))}

						<tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
							<td className="px-3 py-2 border-r border-white/5" />
							<td className="px-3 py-2 border-r border-white/5">
								<input
									type="text"
									value={newKey}
									onChange={(e) => setNewKey(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && addHeader()}
									placeholder="Add header..."
									className="w-full bg-transparent text-white/80 placeholder:text-white/20 focus:outline-none"
								/>
							</td>
							<td className="px-3 py-2 border-r border-white/5" />
							<td className="px-3 py-2">
								<VariableInput
									value={newValue}
									onChange={setNewValue}
									placeholder="Value"
									variables={variables}
								/>
							</td>
							<td className="px-3 py-2" />
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	);
}

function AuthTab({
	requestFile,
	overrides,
	onChange,
	variables,
}: {
	requestFile: RequestFile | null;
	overrides: RequestOverrides;
	onChange: (o: RequestOverrides) => void;
	variables: AvailableVariable[];
}) {
	const [showSelector, setShowSelector] = useState(false);
	const auth = overrides.auth;
	const originalAuth = requestFile?.request?.auth;
	const originalMethod = originalAuth ? getAuthMethod(originalAuth) : "None";

	const dropdownItems = AUTH_OVERRIDE_TYPES.map((t) => ({
		label: t.label,
		active: auth.type === t.value,
		onClick: () => {
			onChange({ ...overrides, auth: { ...auth, type: t.value, value: "" } });
			setShowSelector(false);
		},
	}));

	return (
		<div className="p-4">
			<div className="flex items-center gap-4 mb-6">
				<div className="text-xs text-white/40">Override</div>
				<div className="relative">
					<button
						type="button"
						onClick={() => setShowSelector(!showSelector)}
						className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 hover:bg-accent/15 transition-colors text-xs font-medium cursor-pointer"
					>
						<span className="text-accent">
							{AUTH_OVERRIDE_TYPES.find((t) => t.value === auth.type)?.label}
						</span>
						<BiChevronDown
							className={`text-white/20 transition-transform ${showSelector ? "rotate-180" : ""}`}
						/>
					</button>
					{showSelector && (
						<Dropdown
							items={dropdownItems}
							onClose={() => setShowSelector(false)}
							className="top-full left-0 mt-1"
							width="w-48"
						/>
					)}
				</div>
			</div>

			{auth.type === "inherit" && (
				<div className="p-4 bg-white/[0.02] rounded-lg border border-white/5">
					<div className="text-xs text-white/40 mb-2">
						Original Authorization
					</div>
					<div className="text-sm text-white/80">{originalMethod}</div>
					{originalAuth &&
						originalAuth !== "None" &&
						typeof originalAuth === "object" && (
							<div className="mt-2 text-xs text-white/40 font-mono">
								{"Bearer" in originalAuth &&
									`Token: ${originalAuth.Bearer.token?.slice(0, 20)}...`}
								{"Basic" in originalAuth &&
									`Username: ${originalAuth.Basic.username}`}
								{"ApiKey" in originalAuth && `Key: ${originalAuth.ApiKey.key}`}
							</div>
						)}
				</div>
			)}

			{auth.type === "bearer" && (
				<div className="space-y-2">
					<label className="text-[10px] font-medium text-white/40 px-1">
						Token
					</label>
					<div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
						<VariableInput
							value={auth.value}
							onChange={(v) =>
								onChange({ ...overrides, auth: { ...auth, value: v } })
							}
							placeholder="Type {{ for variables, e.g. {{body.token}}"
							variables={variables}
						/>
					</div>
				</div>
			)}

			{auth.type === "basic" && (
				<div className="space-y-2">
					<label className="text-[10px] font-medium text-white/40 px-1">
						Credentials (user:pass)
					</label>
					<div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
						<VariableInput
							value={auth.value}
							onChange={(v) =>
								onChange({ ...overrides, auth: { ...auth, value: v } })
							}
							placeholder="{{body.user}}:{{body.pass}} or username:password"
							variables={variables}
						/>
					</div>
				</div>
			)}

			{auth.type === "apikey" && (
				<div className="space-y-4">
					<div className="space-y-2">
						<label className="text-[10px] font-medium text-white/40 px-1">
							Header Name
						</label>
						<input
							type="text"
							value={auth.headerName || ""}
							onChange={(e) =>
								onChange({
									...overrides,
									auth: { ...auth, headerName: e.target.value },
								})
							}
							placeholder="X-API-Key"
							className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-accent/30"
						/>
					</div>
					<div className="space-y-2">
						<label className="text-[10px] font-medium text-white/40 px-1">
							Value
						</label>
						<div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
							<VariableInput
								value={auth.value}
								onChange={(v) =>
									onChange({ ...overrides, auth: { ...auth, value: v } })
								}
								placeholder="Type {{ for variables"
								variables={variables}
							/>
						</div>
					</div>
				</div>
			)}

			{auth.type === "cookie" && (
				<div className="space-y-2">
					<label className="text-[10px] font-medium text-white/40 px-1">
						Cookie Value
					</label>
					<div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
						<VariableInput
							value={auth.value}
							onChange={(v) =>
								onChange({ ...overrides, auth: { ...auth, value: v } })
							}
							placeholder="Type {{ for variables, e.g. {{cookies.session}}"
							variables={variables}
						/>
					</div>
				</div>
			)}
		</div>
	);
}

function URLTab({
	requestFile,
	overrides,
	onChange,
	variables,
}: {
	requestFile: RequestFile | null;
	overrides: RequestOverrides;
	onChange: (o: RequestOverrides) => void;
	variables: AvailableVariable[];
}) {
	const originalUrl = requestFile?.request?.url || "";

	// Parse URL to extract host and path
	const parseUrl = (url: string) => {
		try {
			const urlObj = new URL(url);
			return {
				base: `${urlObj.protocol}//${urlObj.host}`,
				path: urlObj.pathname + urlObj.search,
				valid: true,
			};
		} catch {
			return { base: "", path: "", valid: false };
		}
	};

	const originalParsed = parseUrl(originalUrl);
	const overridePath = overrides.url || originalParsed.path;

	return (
		<div className="flex flex-col h-full">
			<div className="p-4 space-y-3 flex-1 overflow-auto">
				<div className="space-y-2">
					<label className="text-[10px] font-medium text-white/40 px-1">
						Host
					</label>
					<div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs font-mono text-white/40">
						{originalParsed.valid ? originalParsed.base : originalUrl}
					</div>
				</div>

				<div className="space-y-2">
					<label className="text-[10px] font-medium text-white/40 px-1">
						Path
					</label>
					<div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
						<VariableInput
							value={overridePath}
							onChange={(v) => onChange({ ...overrides, url: v })}
							variables={variables}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function BodyTab({
	requestFile,
	overrides,
	onChange,
	variables,
}: {
	requestFile: RequestFile | null;
	overrides: RequestOverrides;
	onChange: (o: RequestOverrides) => void;
	variables: AvailableVariable[];
}) {
	const [showSelector, setShowSelector] = useState(false);
	const body = overrides.body;
	const originalBody = requestFile?.request?.body;

	const getOriginalBodyPreview = () => {
		if (!originalBody || originalBody === "None") return null;
		if (typeof originalBody === "object" && "Raw" in originalBody) {
			return originalBody.Raw.content;
		}
		return JSON.stringify(originalBody, null, 2);
	};

	const dropdownItems = BODY_OVERRIDE_TYPES.map((t) => ({
		label: t.label,
		active: body.type === t.value,
		onClick: () => {
			onChange({ ...overrides, body: { ...body, type: t.value, value: "" } });
			setShowSelector(false);
		},
	}));

	return (
		<div className="p-4 flex flex-col h-full">
			<div className="flex items-center gap-4 mb-4 shrink-0">
				<div className="text-xs text-white/40">Override</div>
				<div className="relative">
					<button
						type="button"
						onClick={() => setShowSelector(!showSelector)}
						className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 hover:bg-accent/15 transition-colors text-xs font-medium cursor-pointer"
					>
						<span className="text-accent">
							{BODY_OVERRIDE_TYPES.find((t) => t.value === body.type)?.label}
						</span>
						<BiChevronDown
							className={`text-white/20 transition-transform ${showSelector ? "rotate-180" : ""}`}
						/>
					</button>
					{showSelector && (
						<Dropdown
							items={dropdownItems}
							onClose={() => setShowSelector(false)}
							className="top-full left-0 mt-1"
							width="w-48"
						/>
					)}
				</div>
			</div>

			<div className="flex-1 min-h-0">
				{body.type === "inherit" && (
					<div className="h-full flex flex-col">
						<div className="text-[10px] text-white/40 mb-2">Original Body</div>
						{getOriginalBodyPreview() ? (
							<pre className="flex-1 p-3 bg-white/[0.02] rounded-lg border border-white/5 text-xs font-mono text-white/60 overflow-auto">
								{getOriginalBodyPreview()}
							</pre>
						) : (
							<div className="flex-1 flex items-center justify-center text-xs text-white/30 bg-white/[0.02] rounded-lg border border-white/5">
								No body
							</div>
						)}
					</div>
				)}

				{body.type === "json" && (
					<div className="h-full flex flex-col">
						<div className="flex-1 rounded-lg overflow-hidden border border-white/10">
							<CodeEditor
								code={body.value || getOriginalBodyPreview() || "{\n  \n}"}
								language="json"
								onChange={(v) =>
									onChange({ ...overrides, body: { ...body, value: v } })
								}
							/>
						</div>
						<div className="text-[10px] text-white/30 mt-2">
							Use variables like: {`{"token": "{{body.access_token}}"}`}
						</div>
					</div>
				)}

				{body.type === "variable" && (
					<div className="space-y-2">
						<label className="text-[10px] font-medium text-white/40 px-1">
							Variable Path
						</label>
						<div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
							<VariableInput
								value={body.value}
								onChange={(v) =>
									onChange({ ...overrides, body: { ...body, value: v } })
								}
								placeholder="Type {{ for variables, e.g. {{body.data}}"
								variables={variables}
							/>
						</div>
						<p className="text-[10px] text-white/30 px-1">
							Pass entire response body or nested path from previous node
						</p>
					</div>
				)}

				{body.type === "none" && (
					<div className="h-full flex items-center justify-center text-xs text-white/30 bg-white/[0.02] rounded-lg border border-white/5">
						No body will be sent
					</div>
				)}
			</div>
		</div>
	);
}

export function RequestOverrideModal({
	isOpen,
	onClose,
	overrides,
	onSave,
	availableVariables,
	requestName,
	method,
	requestFile,
}: RequestOverrideModalProps) {
	const [activeTab, setActiveTab] = useState<TabType>("url");
	const [localOverrides, setLocalOverrides] = useState<RequestOverrides>(
		() => ({
			headers: [],
			params: [],
			auth: { type: "inherit", value: "" },
			body: { type: "inherit", value: "" },
		}),
	);
	const modalRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (isOpen) {
			setLocalOverrides({
				headers: Array.isArray(overrides?.headers) ? overrides.headers : [],
				params: Array.isArray(overrides?.params) ? overrides.params : [],
				auth: overrides?.auth?.type
					? overrides.auth
					: { type: "inherit", value: "" },
				body: overrides?.body?.type
					? overrides.body
					: { type: "inherit", value: "" },
				url: overrides?.url || undefined,
			});
		}
	}, [isOpen, overrides]);

	useEffect(() => {
		if (!isOpen) return;
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handleEscape);
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", handleEscape);
			document.body.style.overflow = "";
		};
	}, [isOpen, onClose]);

	const handleSave = () => {
		onSave(localOverrides);
		onClose();
	};

	const tabs: { id: TabType; label: string; badge?: number | string }[] = [
		{ id: "url", label: "URL", badge: localOverrides.url ? "•" : undefined },
		{
			id: "params",
			label: "Params",
			badge: localOverrides.params.length || undefined,
		},
		{
			id: "headers",
			label: "Headers",
			badge: localOverrides.headers.length || undefined,
		},
		{
			id: "auth",
			label: "Auth",
			badge: localOverrides.auth.type !== "inherit" ? "•" : undefined,
		},
		{
			id: "body",
			label: "Body",
			badge: localOverrides.body.type !== "inherit" ? "•" : undefined,
		},
	];

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
			<div
				className="absolute inset-0 bg-black/60 animate-in fade-in duration-300"
				onClick={onClose}
			/>
			<div
				ref={modalRef}
				className="relative w-full max-w-[700px] h-[520px] bg-card border border-border rounded-xl overflow-hidden animate-in zoom-in-95 fade-in duration-300 flex flex-col"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
					<div className="flex items-center gap-2">
						<span
							className="text-xs font-mono font-bold"
							style={{ color: getMethodColor(method) }}
						>
							{method}
						</span>
						<span className="text-sm font-medium text-white/90">
							{requestName}
						</span>
						<span className="text-xs text-white/30">— Workflow Overrides</span>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="text-white/30 hover:text-white transition-colors cursor-pointer"
					>
						<HiX size={16} />
					</button>
				</div>

				<div className="flex items-center gap-1 px-4 py-2 border-b border-white/5 shrink-0">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={`px-2 py-0.5 text-xs cursor-pointer font-medium rounded-md transition-colors ${
								activeTab === tab.id
									? "text-accent bg-accent/10"
									: "text-white/60 hover:text-white/80"
							}`}
						>
							{tab.label}
							{tab.badge && (
								<span className="ml-1 text-[10px] text-accent">
									{tab.badge}
								</span>
							)}
						</button>
					))}
				</div>

				<div className="flex-1 overflow-hidden">
					{activeTab === "url" && (
						<URLTab
							requestFile={requestFile}
							overrides={localOverrides}
							onChange={setLocalOverrides}
							variables={availableVariables}
						/>
					)}
					{activeTab === "params" && (
						<ParamsTab
							requestFile={requestFile}
							overrides={localOverrides}
							onChange={setLocalOverrides}
							variables={availableVariables}
						/>
					)}
					{activeTab === "headers" && (
						<HeadersTab
							requestFile={requestFile}
							overrides={localOverrides}
							onChange={setLocalOverrides}
							variables={availableVariables}
						/>
					)}
					{activeTab === "auth" && (
						<AuthTab
							requestFile={requestFile}
							overrides={localOverrides}
							onChange={setLocalOverrides}
							variables={availableVariables}
						/>
					)}
					{activeTab === "body" && (
						<BodyTab
							requestFile={requestFile}
							overrides={localOverrides}
							onChange={setLocalOverrides}
							variables={availableVariables}
						/>
					)}
				</div>

				<div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-white/[0.02] shrink-0">
					<div className="text-[10px] text-white/30">
						Changes only affect this workflow, not the original request
					</div>
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={onClose}
							className="px-3 py-2 text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-colors cursor-pointer"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleSave}
							className="px-4 py-2 text-xs font-semibold rounded-full bg-accent hover:bg-accent/90 text-background transition-colors cursor-pointer"
						>
							Save
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
