export interface PostmanInfo {
  name: string;
  _postman_id?: string;
  description?: string;
  schema: string;
}

export interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
  disabled?: boolean;
}

export interface PostmanAuthAttribute {
  key: string;
  value: any;
  type?: string;
}

export interface PostmanAuth {
  type:
    | "noauth"
    | "basic"
    | "bearer"
    | "apikey"
    | "oauth1"
    | "oauth2"
    | "digest"
    | "hawk"
    | "awsv4"
    | "ntlm"
    | "edgegrid";
  noauth?: null;
  basic?: PostmanAuthAttribute[];
  bearer?: PostmanAuthAttribute[];
  apikey?: PostmanAuthAttribute[];
}

export interface PostmanUrl {
  raw: string;
  protocol?: string;
  host?: string[];
  port?: string;
  path?: string[];
  query?: Array<{
    key: string;
    value: string;
    disabled?: boolean;
    description?: string;
  }>;
  hash?: string;
}

export interface PostmanHeader {
  key: string;
  value: string;
  disabled?: boolean;
  description?: string;
}

export interface PostmanBodyUrlEncoded {
  key: string;
  value: string;
  disabled?: boolean;
  description?: string;
}

export interface PostmanBodyFormData {
  key: string;
  value?: string;
  type?: "text" | "file";
  src?: string | null;
  disabled?: boolean;
  description?: string;
  contentType?: string;
}

export interface PostmanBody {
  mode: "raw" | "urlencoded" | "formdata" | "file" | "graphql";
  raw?: string;
  urlencoded?: PostmanBodyUrlEncoded[];
  formdata?: PostmanBodyFormData[];
  file?: { src?: string | null; content?: string };
  graphql?: { query?: string; variables?: string };
  options?: {
    raw?: { language?: string };
  };
  disabled?: boolean;
}

export interface PostmanRequest {
  method: string;
  header: PostmanHeader[] | string;
  body?: PostmanBody | null;
  url: PostmanUrl | string;
  auth?: PostmanAuth | null;
  description?: string;
}

export interface PostmanResponse {
  id?: string;
  name?: string;
  originalRequest?: PostmanRequest;
  status?: string;
  code?: number;
  header?: PostmanHeader[];
  body?: string;
  responseTime?: number | string | null;
}

export interface PostmanItem {
  name: string;
  request: PostmanRequest;
  response?: PostmanResponse[];
  description?: string;
}

export interface PostmanItemGroup {
  name: string;
  item: (PostmanItem | PostmanItemGroup)[];
  description?: string;
  auth?: PostmanAuth | null;
}

export interface PostmanCollection {
  info: PostmanInfo;
  item: (PostmanItem | PostmanItemGroup)[];
  variable?: PostmanVariable[];
  auth?: PostmanAuth | null;
}
