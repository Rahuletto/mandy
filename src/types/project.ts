import type { ApiRequest, ApiResponse, AuthType } from "../bindings";
import type { WorkflowFile } from "./workflow";

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
  useInheritedAuth?: boolean;
}

export interface RecentRequest {
  requestId: string;
  name: string;
  method: string;
  url: string;
  timestamp: number;
}

export interface Folder {
  id: string;
  type: "folder";
  name: string;
  children: (Folder | RequestFile | WorkflowFile)[];
  expanded?: boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  iconColor?: string;
  baseUrl?: string;
  authorization?: AuthType;
  root: Folder;
  environments: Environment[];
  activeEnvironmentId: string | null;
  recentRequests: RecentRequest[];
}

export type TreeItem = Folder | RequestFile | WorkflowFile;

export type SortMode = "manual" | "method" | "alphabetical";
