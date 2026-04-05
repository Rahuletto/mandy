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

export interface GraphQLKeyValue {
  id: string;
  key: string;
  value: string;
  description: string;
  enabled: boolean;
}

export interface GraphQLFile {
  id: string;
  type: "graphql";
  name: string;
  description?: string;
  url: string;
  query: string;
  variables: string;
  headers: Record<string, string>;
  headerItems?: GraphQLKeyValue[];
  auth?: import("../bindings").AuthType;
  useInheritedAuth?: boolean;
  schema?: string;
  schemaJSON?: string;
  schemaLastFetched?: number;
  response: ApiResponse | null;
}

export interface SocketIOKeyValue {
  id: string;
  key: string;
  value: string;
  description: string;
  enabled: boolean;
}

export interface SocketIOFile {
  id: string;
  type: "socketio";
  name: string;
  description?: string;
  url: string;
  namespace?: string;
  path?: string;
  transport?: "auto" | "websocket" | "polling" | "websocket-upgrade";
  reconnect?: boolean;
  reconnectOnDisconnect?: boolean;
  reconnectDelayMinMs?: number;
  reconnectDelayMaxMs?: number;
  maxReconnectAttempts?: number | null;
  messages: SocketIOMessage[];
  headers: Record<string, string>;
  headerItems?: SocketIOKeyValue[];
  queryItems?: SocketIOKeyValue[];
  auth?: import("../bindings").AuthType;
  authPayload?: string;
  useInheritedAuth?: boolean;
}

export interface SocketIOMessage {
  id: string;
  direction: "send" | "receive" | "system";
  event: string;
  data: string;
  timestamp: number;
}

export interface MQTTSubscription {
  id: string;
  topic: string;
  qos: 0 | 1 | 2;
  enabled?: boolean;
}

export interface MQTTFile {
  id: string;
  type: "mqtt";
  name: string;
  description?: string;
  url: string;
  clientId: string;
  username?: string;
  password?: string;
  cleanSession?: boolean;
  keepAliveSecs?: number;
  subscriptions: MQTTSubscription[];
  messages: MQTTMessage[];
}

export interface MQTTMessage {
  id: string;
  direction: "send" | "receive" | "system";
  topic: string;
  data: string;
  timestamp: number;
  qos?: 0 | 1 | 2;
  retain?: boolean;
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
  children: (Folder | RequestFile | WorkflowFile | WebSocketFile | GraphQLFile | SocketIOFile | MQTTFile)[];
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

export type TreeItem = Folder | RequestFile | WorkflowFile | WebSocketFile | GraphQLFile | SocketIOFile | MQTTFile;

export type SortMode = "manual" | "method" | "alphabetical";
