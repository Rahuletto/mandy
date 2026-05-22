import type { AuthType } from "../bindings";

export function resolveEffectiveAuth(
	itemAuth: AuthType | undefined,
	useInheritedAuth: boolean | undefined,
	projectAuth: AuthType | undefined,
): AuthType {
	if (useInheritedAuth !== false && projectAuth && projectAuth !== "None") {
		return projectAuth;
	}
	return itemAuth ?? "None";
}
