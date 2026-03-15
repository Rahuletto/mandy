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

export interface WebSocketKeyValue {
  id: string;
  key: string;
  value: string;
  description: string;
  enabled: boolean;
}

export interface WebSocketFile {
  id: string;
  type: "websocket";
  name: string;
  description?: string;
  url: string;
  protocols?: string[];
  messages: WebSocketMessage[];
  headers: Record<string, string>;
  params?: WebSocketKeyValue[];
  headerItems?: WebSocketKeyValue[];
  cookies?: WebSocketKeyValue[];
  auth?: import("../bindings").AuthType;
  useInheritedAuth?: boolean;
}

export interface WebSocketMessage {
  id: string;
  direction: "send" | "receive" | "system";
  data: string;
  timestamp: number;
  type: "text" | "binary" | "connection" | "close";
  handshake?: {
    requestUrl: string;
    requestMethod: string;
    statusCode: string;
    requestHeaders: Record<string, string>;
    responseHeaders: Record<string, string>;
  };
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
  children: (Folder | RequestFile | WorkflowFile | WebSocketFile)[];
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

export type TreeItem = Folder | RequestFile | WorkflowFile | WebSocketFile;

export type SortMode = "manual" | "method" | "alphabetical";
