import type { ApiRequest, ApiResponse } from "../bindings";

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
}

export interface Folder {
  id: string;
  type: "folder";
  name: string;
  children: (Folder | RequestFile)[];
  expanded?: boolean;
}

export interface ProjectAuthorization {
  type: "none" | "bearer" | "basic" | "api-key";
  token?: string;
  username?: string;
  password?: string;
  headerName?: string;
  headerValue?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  iconColor?: string;
  baseUrl?: string;
  authorization?: ProjectAuthorization;
  root: Folder;
  environments: Environment[];
  activeEnvironmentId: string | null;
}

export type TreeItem = Folder | RequestFile;

export type SortMode = "manual" | "method" | "alphabetical";
