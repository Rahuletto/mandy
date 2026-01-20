export interface InsomniaResource {
  _id: string;
  _type: string;
  parentId: string | null;
  name: string;
  created?: number;
  modified?: number;
}

export interface InsomniaWorkspace extends InsomniaResource {
  _type: "workspace";
  description?: string;
  scope?: string;
}

export interface InsomniaRequestGroup extends InsomniaResource {
  _type: "request_group";
  description?: string;
  environment?: Record<string, any>;
  environmentPropertyOrder?: any;
  metaSortKey?: number;
}

export interface InsomniaHeader {
  name: string;
  value: string;
  disabled?: boolean;
}

export interface InsomniaParameter {
  name: string;
  value: string;
  disabled?: boolean;
}

export interface InsomniaAuthentication {
  type:
    | "none"
    | "basic"
    | "bearer"
    | "apikey"
    | "oauth1"
    | "oauth2"
    | "hawk"
    | "digest"
    | "ntlm"
    | "aws-iam";
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
  addTo?: "header" | "queryParams";
  disabled?: boolean;
}

export interface InsomniaBody {
  mimeType?: string;
  text?: string;
  params?: Array<{
    name: string;
    value: string;
    disabled?: boolean;
    type?: string;
    fileName?: string;
  }>;
  fileName?: string;
}

export interface InsomniaRequest extends InsomniaResource {
  _type: "request";
  description?: string;
  url: string;
  method: string;
  headers: InsomniaHeader[];
  body: InsomniaBody;
  parameters: InsomniaParameter[];
  authentication: InsomniaAuthentication;
  metaSortKey?: number;
  settingStoreCookies?: boolean;
  settingSendCookies?: boolean;
  settingDisableRenderRequestBody?: boolean;
  settingEncodeUrl?: boolean;
  settingRebuildPath?: boolean;
  settingFollowRedirects?: string;
}

export interface InsomniaEnvironment extends InsomniaResource {
  _type: "environment";
  data: Record<string, string>;
  dataPropertyOrder?: any;
  color?: string;
  isPrivate?: boolean;
  metaSortKey?: number;
}

export interface InsomniaCookieJar extends InsomniaResource {
  _type: "cookie_jar";
  cookies: Array<{
    key: string;
    value: string;
    domain: string;
    path: string;
    expires?: string | null;
    httpOnly?: boolean;
    secure?: boolean;
  }>;
}

export type InsomniaResourceType =
  | InsomniaWorkspace
  | InsomniaRequestGroup
  | InsomniaRequest
  | InsomniaEnvironment
  | InsomniaCookieJar;

export interface InsomniaExport {
  _type: "export";
  __export_format: 4;
  __export_date: string;
  __export_source: string;
  resources: InsomniaResourceType[];
}
