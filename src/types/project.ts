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

export interface Project {
  id: string;
  name: string;
  root: Folder;
  environments: Environment[];
  activeEnvironmentId: string | null;
}

export type TreeItem = Folder | RequestFile;

export type SortMode = "manual" | "method" | "alphabetical";
