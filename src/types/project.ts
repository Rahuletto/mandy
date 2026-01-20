import type { ApiRequest, ApiResponse, AuthType } from "../bindings";

export interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
}

export interface RequestFile {
  id: string;
  type: "request";
  name: string;
  description?: string;
  propertyDescriptions?: Record<string, string>;
  request: ApiRequest;
  response: ApiResponse | null;
  useInheritedAuth?: boolean; // true = inherit from project, false/undefined = use request's own auth
}

export interface Folder {
  id: string;
  type: "folder";
  name: string;
  children: (Folder | RequestFile)[];
  expanded?: boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  iconColor?: string;
  baseUrl?: string;
  authorization?: AuthType; // Project-level authorization
  root: Folder;
  environments: Environment[];
  activeEnvironmentId: string | null;
}

export type TreeItem = Folder | RequestFile;

export type SortMode = "manual" | "method" | "alphabetical";
