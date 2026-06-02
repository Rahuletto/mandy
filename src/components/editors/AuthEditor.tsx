import { useMemo, useState } from "react";
import { BiChevronDown, BiLinkExternal, BiShieldQuarter } from "react-icons/bi";
import type { ApiKeyLocation, AuthType } from "../../bindings";
import { getOAuth2TokenCached } from "../../reqhelpers/rest";
import { Dropdown, EnvInput } from "../ui";

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

type AuthMethod =
	| "None"
	| "Basic"
	| "Bearer"
	| "ApiKey"
	| "Digest"
	| "Ntlm"
	| "MutualTls"
	| "OAuth2";

const AUTH_METHODS: { id: AuthMethod; label: string }[] = [
	{ id: "None", label: "None" },
	{ id: "Basic", label: "Basic Auth" },
	{ id: "Bearer", label: "Bearer" },
	{ id: "ApiKey", label: "API Key" },
	{ id: "Digest", label: "Digest Auth" },
	{ id: "Ntlm", label: "NTLM" },
	{ id: "MutualTls", label: "mTLS" },
	{ id: "OAuth2", label: "OAuth 2.0" },
];

function getAuthMethod(auth: AuthType): AuthMethod {
	if (auth === "None") return "None";
	if (typeof auth === "object") {
		if ("Basic" in auth) return "Basic";
		if ("Bearer" in auth) return "Bearer";
		if ("ApiKey" in auth) return "ApiKey";
		if ("Digest" in auth) return "Digest";
		if ("Ntlm" in auth) return "Ntlm";
		if ("MutualTls" in auth) return "MutualTls";
		if ("OAuth2" in auth) return "OAuth2";
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
	isProject,
}: AuthEditorProps) {
	const [showSelector, setShowSelector] = useState(false);
	const [oauthTokenLoading, setOauthTokenLoading] = useState(false);
	const [oauthTokenError, setOauthTokenError] = useState<string | null>(null);

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
			case "Digest":
				onChange({ Digest: { username: "", password: "" } });
				break;
			case "Ntlm":
				onChange({ Ntlm: { username: "", password: "", domain: null } });
				break;
			case "MutualTls":
				onChange({
					MutualTls: {
						cert_pem: "",
						key_pem: "",
						key_passphrase: null,
						ca_pem: null,
						insecure_skip_verify: null,
					},
				});
				break;
			case "OAuth2":
				onChange({
					OAuth2: {
						mode: "ClientCredentials",
						token: null,
						client_id: null,
						client_secret: null,
						token_url: null,
						scopes: null,
						auth_url: null,
						redirect_uri: null,
						pkce: null,
						refresh_token: null,
					},
				});
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

	const dropdownItems = AUTH_METHODS.map((m) => ({
		label: m.label,
		active: activeMethod === m.id,
		onClick: () => handleMethodChange(m.id),
	}));

	const renderAuthFields = (authValue: AuthType, disabled: boolean = false) => {
		const method = getAuthMethod(authValue);

		if (method === "None") return null;

		return (
			<div className="max-w-md space-y-6">
				<div className="space-y-4">
					{method === "Basic" &&
						typeof authValue === "object" &&
						"Basic" in authValue && (
							<>
								<div className="space-y-1.5">
									<label className="px-1 font-medium text-[10px] text-white/30">
										Username
									</label>
									<EnvInput
										value={authValue.Basic.username}
										onChange={(v) =>
											!disabled &&
											onChange({ Basic: { ...authValue.Basic, username: v } })
										}
										placeholder="Username"
										availableVariables={availableVariables}
										disabled={disabled}
										className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="px-1 font-medium text-[10px] text-white/30">
										Password
									</label>
									<EnvInput
										type="password"
										value={authValue.Basic.password}
										onChange={(v) =>
											!disabled &&
											onChange({ Basic: { ...authValue.Basic, password: v } })
										}
										placeholder="Password"
										availableVariables={availableVariables}
										disabled={disabled}
										className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
									/>
								</div>
							</>
						)}

					{method === "Bearer" &&
						typeof authValue === "object" &&
						"Bearer" in authValue && (
							<div className="space-y-1.5">
								<label className="px-1 font-medium text-[10px] text-white/30">
									Token
								</label>
								<EnvInput
									value={authValue.Bearer.token}
									onChange={(v) =>
										!disabled && onChange({ Bearer: { token: v } })
									}
									placeholder="Token"
									availableVariables={availableVariables}
									disabled={disabled}
									className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
								/>
							</div>
						)}

					{method === "ApiKey" &&
						typeof authValue === "object" &&
						"ApiKey" in authValue && (
							<>
								<div className="space-y-1.5">
									<label className="px-1 font-bold text-[10px] text-white/30">
										Key
									</label>
									<EnvInput
										value={authValue.ApiKey.key}
										onChange={(v) =>
											!disabled &&
											onChange({ ApiKey: { ...authValue.ApiKey, key: v } })
										}
										placeholder="e.g. X-API-Key"
										availableVariables={availableVariables}
										disabled={disabled}
										className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="px-1 font-bold text-[10px] text-white/30">
										Value
									</label>
									<EnvInput
										value={authValue.ApiKey.value}
										onChange={(v) =>
											!disabled &&
											onChange({ ApiKey: { ...authValue.ApiKey, value: v } })
										}
										placeholder="Value"
										availableVariables={availableVariables}
										disabled={disabled}
										className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="px-1 font-bold text-[10px] text-white/30">
										Add to
									</label>
									<div className="flex gap-2">
										{(["Header", "Query"] as ApiKeyLocation[]).map((loc) => (
											<button
												type="button"
												key={loc}
												disabled={disabled}
												onClick={() =>
													!disabled &&
													onChange({
														ApiKey: {
															...(authValue as any).ApiKey,
															add_to: loc,
														},
													})
												}
												className={`flex-1 rounded-lg border px-3 py-2 font-medium text-xs transition-all ${
													authValue.ApiKey.add_to === loc
														? "border-accent/20 bg-accent/10 text-accent"
														: "border-white/5 bg-white/5 text-white/40" +
															(!disabled
																? "hover:bg-white/10 hover:text-white/60"
																: "")
												} ${disabled ? "cursor-default" : "cursor-pointer"}`}
											>
												{loc}
											</button>
										))}
									</div>
								</div>
							</>
						)}
					{method === "Digest" &&
						typeof authValue === "object" &&
						"Digest" in authValue && (
							<>
								<div className="space-y-1.5">
									<label className="px-1 font-medium text-[10px] text-white/30">
										Username
									</label>
									<EnvInput
										value={authValue.Digest.username}
										onChange={(v) =>
											!disabled &&
											onChange({
												Digest: { ...authValue.Digest, username: v },
											})
										}
										placeholder="Username"
										availableVariables={availableVariables}
										disabled={disabled}
										className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="px-1 font-medium text-[10px] text-white/30">
										Password
									</label>
									<EnvInput
										type="password"
										value={authValue.Digest.password}
										onChange={(v) =>
											!disabled &&
											onChange({
												Digest: { ...authValue.Digest, password: v },
											})
										}
										placeholder="Password"
										availableVariables={availableVariables}
										disabled={disabled}
										className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
									/>
								</div>
							</>
						)}
					{method === "Ntlm" &&
						typeof authValue === "object" &&
						"Ntlm" in authValue && (
							<>
								<div className="space-y-1.5">
									<label className="px-1 font-medium text-[10px] text-white/30">
										Username
									</label>
									<EnvInput
										value={authValue.Ntlm.username}
										onChange={(v) =>
											!disabled &&
											onChange({ Ntlm: { ...authValue.Ntlm, username: v } })
										}
										placeholder="Username"
										availableVariables={availableVariables}
										disabled={disabled}
										className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="px-1 font-medium text-[10px] text-white/30">
										Password
									</label>
									<EnvInput
										type="password"
										value={authValue.Ntlm.password}
										onChange={(v) =>
											!disabled &&
											onChange({ Ntlm: { ...authValue.Ntlm, password: v } })
										}
										placeholder="Password"
										availableVariables={availableVariables}
										disabled={disabled}
										className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="px-1 font-medium text-[10px] text-white/30">
										Domain (optional)
									</label>
									<EnvInput
										value={authValue.Ntlm.domain ?? ""}
										onChange={(v) =>
											!disabled &&
											onChange({
												Ntlm: {
													...authValue.Ntlm,
													domain: v.trim() ? v : null,
												},
											})
										}
										placeholder="MYDOMAIN"
										availableVariables={availableVariables}
										disabled={disabled}
										className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
									/>
								</div>
							</>
						)}
					{method === "MutualTls" &&
						typeof authValue === "object" &&
						"MutualTls" in authValue && (
							<>
								<div className="space-y-1.5">
									<label className="px-1 font-medium text-[10px] text-white/30">
										Client certificate PEM
									</label>
									<textarea
										value={authValue.MutualTls.cert_pem}
										onChange={(e) =>
											!disabled &&
											onChange({
												MutualTls: {
													...authValue.MutualTls,
													cert_pem: e.target.value,
												},
											})
										}
										placeholder="-----BEGIN CERTIFICATE-----"
										disabled={disabled}
										className="h-24 w-full resize-none rounded-lg border border-white/5 bg-white/5 p-2.5 font-mono text-xs transition-all focus:border-accent/30 focus:outline-none"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="px-1 font-medium text-[10px] text-white/30">
										Client private key PEM
									</label>
									<textarea
										value={authValue.MutualTls.key_pem}
										onChange={(e) =>
											!disabled &&
											onChange({
												MutualTls: {
													...authValue.MutualTls,
													key_pem: e.target.value,
												},
											})
										}
										placeholder="-----BEGIN PRIVATE KEY-----"
										disabled={disabled}
										className="h-24 w-full resize-none rounded-lg border border-white/5 bg-white/5 p-2.5 font-mono text-xs transition-all focus:border-accent/30 focus:outline-none"
									/>
								</div>
							</>
						)}
					{method === "OAuth2" &&
						typeof authValue === "object" &&
						"OAuth2" in authValue && (
							<>
								<div className="space-y-1.5">
									<label className="px-1 font-medium text-[10px] text-white/30">
										Mode
									</label>
									<div className="flex gap-2">
										{(
											[
												{
													id: "ClientCredentials",
													label: "Client Credentials",
												},
												{
													id: "AuthorizationCodePkce",
													label: "Auth Code + PKCE",
												},
												{ id: "ManualBearer", label: "Manual Bearer" },
											] as const
										).map((m) => (
											<button
												type="button"
												key={m.id}
												disabled={disabled}
												onClick={() =>
													!disabled &&
													onChange({
														OAuth2: {
															...authValue.OAuth2,
															mode: m.id,
														},
													})
												}
												className={`rounded-lg border px-3 py-2 font-medium text-xs transition-all ${
													authValue.OAuth2.mode === m.id
														? "border-accent/20 bg-accent/10 text-accent"
														: "border-white/5 bg-white/5 text-white/40"
												}`}
											>
												{m.label}
											</button>
										))}
									</div>
								</div>
								<div className="space-y-1.5">
									<label className="px-1 font-medium text-[10px] text-white/30">
										Access token
									</label>
									<EnvInput
										value={authValue.OAuth2.token ?? ""}
										onChange={(v) =>
											!disabled &&
											onChange({
												OAuth2: { ...authValue.OAuth2, token: v || null },
											})
										}
										placeholder="Bearer token"
										availableVariables={availableVariables}
										disabled={disabled}
										className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="px-1 font-medium text-[10px] text-white/30">
										Token URL
									</label>
									<EnvInput
										value={authValue.OAuth2.token_url ?? ""}
										onChange={(v) =>
											!disabled &&
											onChange({
												OAuth2: { ...authValue.OAuth2, token_url: v || null },
											})
										}
										placeholder="https://auth.example.com/oauth/token"
										availableVariables={availableVariables}
										disabled={disabled}
										className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
									/>
								</div>
								<div className="grid grid-cols-2 gap-3">
									<div className="space-y-1.5">
										<label className="px-1 font-medium text-[10px] text-white/30">
											Client ID
										</label>
										<EnvInput
											value={authValue.OAuth2.client_id ?? ""}
											onChange={(v) =>
												!disabled &&
												onChange({
													OAuth2: { ...authValue.OAuth2, client_id: v || null },
												})
											}
											placeholder="client_id"
											availableVariables={availableVariables}
											disabled={disabled}
											className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
										/>
									</div>
									<div className="space-y-1.5">
										<label className="px-1 font-medium text-[10px] text-white/30">
											Client Secret
										</label>
										<EnvInput
											type="password"
											value={authValue.OAuth2.client_secret ?? ""}
											onChange={(v) =>
												!disabled &&
												onChange({
													OAuth2: {
														...authValue.OAuth2,
														client_secret: v || null,
													},
												})
											}
											placeholder="client_secret"
											availableVariables={availableVariables}
											disabled={disabled}
											className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
										/>
									</div>
								</div>
								<div className="space-y-1.5">
									<label className="px-1 font-medium text-[10px] text-white/30">
										Scopes (space separated)
									</label>
									<EnvInput
										value={authValue.OAuth2.scopes?.join(" ") ?? ""}
										onChange={(v) =>
											!disabled &&
											onChange({
												OAuth2: {
													...authValue.OAuth2,
													scopes: v.trim() ? v.trim().split(/\s+/) : null,
												},
											})
										}
										placeholder="read write"
										availableVariables={availableVariables}
										disabled={disabled}
										className="w-full rounded-lg border border-white/5 bg-white/5 py-2.5 transition-all focus-within:border-accent/30"
									/>
								</div>
								<div className="flex items-center gap-2">
									<button
										type="button"
										disabled={
											disabled ||
											oauthTokenLoading ||
											!authValue.OAuth2.token_url ||
											!authValue.OAuth2.client_id
										}
										onClick={async () => {
											try {
												setOauthTokenError(null);
												setOauthTokenLoading(true);
												const tokenResp = await getOAuth2TokenCached({
													token_url: authValue.OAuth2.token_url || "",
													client_id: authValue.OAuth2.client_id || "",
													client_secret: authValue.OAuth2.client_secret,
													scopes: authValue.OAuth2.scopes,
													grant_type: "client_credentials",
													refresh_token: authValue.OAuth2.refresh_token,
												});
												onChange({
													OAuth2: {
														...authValue.OAuth2,
														token: tokenResp.access_token,
														refresh_token: tokenResp.refresh_token,
													},
												});
											} catch (error) {
												setOauthTokenError(
													error instanceof Error
														? error.message
														: "Token fetch failed",
												);
											} finally {
												setOauthTokenLoading(false);
											}
										}}
										className="rounded-lg bg-accent px-3 py-2 font-medium text-background text-xs transition-all hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
									>
										{oauthTokenLoading ? "Fetching..." : "Fetch token"}
									</button>
									{oauthTokenError && (
										<span className="text-[11px] text-red">
											{oauthTokenError}
										</span>
									)}
								</div>
							</>
						)}
				</div>

				{disabled ? (
					<div className="flex flex-col gap-3 pt-2">
						<div className="flex items-center gap-2 rounded-xl bg-white/5 p-3">
							<p className="text-[11px] text-white/40 leading-relaxed">
								Values are inherited from project config and are read-only here.
								To modify them, click button below.
							</p>
						</div>
						<div className="flex gap-2">
							{onOpenProjectSettings && (
								<button
									type="button"
									onClick={onOpenProjectSettings}
									className="group flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 font-medium text-white/80 text-xs transition-all hover:bg-white/10 hover:text-white"
								>
									<BiLinkExternal
										size={14}
										className="text-white/40 group-hover:text-white/60"
									/>
									Open Project Auth
								</button>
							)}
							<button
								type="button"
								onClick={handleOverwrite}
								className="flex-1 cursor-pointer rounded-full bg-accent px-5 py-3 font-medium text-background text-xs transition-all hover:bg-accent/80"
							>
								Overwrite for Request
							</button>
						</div>
					</div>
				) : (
					<p className="px-1 text-[11px] text-white/20 italic">
						{method === "Basic" &&
							"The authorization header will be generated automatically as Basic base64(user:pass)."}
						{method === "Bearer" &&
							"The authorization header will be generated as Bearer <token>."}
						{method === "Digest" &&
							"Digest challenge-response is negotiated by Mandy automatically."}
						{method === "Ntlm" &&
							"NTLM challenge-response is negotiated by Mandy automatically."}
						{method === "MutualTls" &&
							"Client certificate is attached during TLS handshake."}
						{method === "OAuth2" &&
							"OAuth 2.0 uses the configured bearer token for this request."}
					</p>
				)}
			</div>
		);
	};

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-4 border-white/5 border-b px-4 py-3">
				<div className="text-white/30 text-xs">Authorization</div>

				<div className="relative">
					<button
						type="button"
						onClick={() => {
							const locked = isInherited && hasProjectAuth;
							if (!locked) setShowSelector(!showSelector);
						}}
						className={`flex items-center gap-2 rounded-full px-3 py-1 font-medium text-xs transition-all ${
							isInherited && hasProjectAuth
								? "cursor-default bg-accent/10 text-accent"
								: "cursor-pointer bg-white/5 text-white/80 hover:bg-white/10"
						}`}
					>
						<span>
							{AUTH_METHODS.find((m) => m.id === activeMethod)?.label}
						</span>
						{!(isInherited && hasProjectAuth) && (
							<BiChevronDown
								className={`text-white/20 transition-transform ${showSelector ? "rotate-180" : ""}`}
							/>
						)}
						{isInherited && hasProjectAuth && (
							<BiLinkExternal className="ml-1 opacity-50" size={12} />
						)}
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
						type="button"
						onClick={handleInherit}
						className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent px-3 py-1 text-[11px] text-white/40 transition-all hover:border-accent/20 hover:bg-accent/5 hover:text-accent"
					>
						<BiLinkExternal size={12} />
						Use project auth
					</button>
				)}
			</div>

			<div className="flex-1 overflow-auto p-8">
				{activeMethod === "None" ? (
					<div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center p-8 text-center">
						<div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white/3 text-white/10">
							<BiShieldQuarter size={32} />
						</div>
						<div className="mb-1 font-medium text-sm text-white/60">
							{isProject
								? "This project does not have auth"
								: "This request does not use any authorization"}
						</div>
						<p className="max-w-[240px] text-white/30 text-xs leading-relaxed">
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
