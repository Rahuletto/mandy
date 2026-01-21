import type { Project, Folder, RequestFile } from "../../../types/project";
import type { AuthType, BodyType } from "../../../bindings";
import { generatePrefixedId } from "../shared";
import type {
  InsomniaExport,
  InsomniaResourceType,
  InsomniaWorkspace,
  InsomniaEnvironment,
  InsomniaCookieJar,
  InsomniaRequestGroup,
  InsomniaRequest,
  InsomniaHeader,
  InsomniaParameter,
  InsomniaBody,
  InsomniaAuthentication,
} from "./types";

function generateId(): string {
  return generatePrefixedId("req");
}

function generateWorkspaceId(): string {
  return generatePrefixedId("wrk");
}

function generateFolderId(): string {
  return generatePrefixedId("fld");
}

function generateEnvId(): string {
  return generatePrefixedId("env");
}

function convertAuthToInsomnia(auth: AuthType): InsomniaAuthentication {
  if (auth === "None") {
    return { type: "none" };
  }
  if ("Bearer" in auth) {
    return { type: "bearer", token: auth.Bearer.token };
  }
  if ("Basic" in auth) {
    return {
      type: "basic",
      username: auth.Basic.username,
      password: auth.Basic.password,
    };
  }
  if ("ApiKey" in auth) {
    return {
      type: "apikey",
      key: auth.ApiKey.key,
      value: auth.ApiKey.value,
      addTo: auth.ApiKey.add_to === "Header" ? "header" : "queryParams",
    };
  }
  return { type: "none" };
}

function convertBodyToInsomnia(body: BodyType): InsomniaBody {
  if (body === "None") {
    return {};
  }
  if ("Raw" in body) {
    return {
      mimeType: body.Raw.content_type || "text/plain",
      text: body.Raw.content,
    };
  }
  if ("FormUrlEncoded" in body) {
    return {
      mimeType: "application/x-www-form-urlencoded",
      params: Object.entries(body.FormUrlEncoded.fields).map(
        ([name, value]) => ({
          name,
          value: value || "",
        }),
      ),
    };
  }
  if ("Multipart" in body) {
    return {
      mimeType: "multipart/form-data",
      params: body.Multipart.fields.map((field) => {
        if ("Text" in field.value) {
          return {
            name: field.name,
            value: field.value.Text,
            type: "text",
          };
        } else {
          return {
            name: field.name,
            value: "",
            type: "file",
            fileName: field.value.File.filename,
          };
        }
      }),
    };
  }
  if ("Binary" in body) {
    return {
      mimeType: "application/octet-stream",
      fileName: body.Binary.filename || undefined,
    };
  }
  return {};
}

function convertRequestToInsomnia(
  req: RequestFile,
  parentId: string,
  sortKey: number,
): InsomniaRequest {
  const apiReq = req.request;

  const parameters: InsomniaParameter[] = Object.entries(apiReq.query_params)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({
      name,
      value: value || "",
    }));

  const headers: InsomniaHeader[] = Object.entries(apiReq.headers)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({
      name,
      value: value || "",
    }));

  if (apiReq.cookies.length > 0) {
    const cookieValue = apiReq.cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    headers.push({ name: "Cookie", value: cookieValue });
  }

  return {
    _id: generateId(),
    _type: "request",
    parentId,
    name: req.name,
    description: req.description,
    url: apiReq.url,
    method: apiReq.method,
    headers,
    body: convertBodyToInsomnia(apiReq.body),
    parameters,
    authentication: convertAuthToInsomnia(apiReq.auth),
    metaSortKey: sortKey,
    settingStoreCookies: true,
    settingSendCookies: true,
    settingDisableRenderRequestBody: false,
    settingEncodeUrl: true,
    settingRebuildPath: true,
    settingFollowRedirects: "global",
  };
}

function convertFolderToInsomnia(
  folder: Folder,
  parentId: string,
  sortKeyBase: number,
): InsomniaResourceType[] {
  const resources: InsomniaResourceType[] = [];

  const folderId = generateFolderId();
  const folderResource: InsomniaRequestGroup = {
    _id: folderId,
    _type: "request_group",
    parentId,
    name: folder.name,
    metaSortKey: sortKeyBase,
  };
  resources.push(folderResource);

  let childSortKey = 0;
  for (const child of folder.children) {
    if (child.type === "folder") {
      resources.push(...convertFolderToInsomnia(child, folderId, childSortKey));
    } else {
      resources.push(convertRequestToInsomnia(child, folderId, childSortKey));
    }
    childSortKey++;
  }

  return resources;
}

export function generateInsomniaExport(project: Project): InsomniaExport {
  const resources: InsomniaResourceType[] = [];
  const workspaceId = generateWorkspaceId();

  const workspace: InsomniaWorkspace = {
    _id: workspaceId,
    _type: "workspace",
    parentId: null,
    name: project.name,
    description: project.description,
    scope: "collection",
  };
  resources.push(workspace);

  const baseEnvId = generateEnvId();
  const baseEnv: InsomniaEnvironment = {
    _id: baseEnvId,
    _type: "environment",
    parentId: workspaceId,
    name: "Base Environment",
    data: {},
    isPrivate: false,
  };
  resources.push(baseEnv);

  for (const env of project.environments) {
    const envData: Record<string, string> = {};
    for (const v of env.variables) {
      if (v.enabled) {
        envData[v.key] = v.value;
      }
    }

    const subEnv: InsomniaEnvironment = {
      _id: generateEnvId(),
      _type: "environment",
      parentId: baseEnvId,
      name: env.name,
      data: envData,
      isPrivate: false,
    };
    resources.push(subEnv);
  }

  const cookieJar: InsomniaCookieJar = {
    _id: generatePrefixedId("jar"),
    _type: "cookie_jar",
    parentId: workspaceId,
    name: "Default Jar",
    cookies: [],
  };
  resources.push(cookieJar);

  let sortKey = 0;
  for (const child of project.root.children) {
    if (child.type === "folder") {
      resources.push(...convertFolderToInsomnia(child, workspaceId, sortKey));
    } else {
      resources.push(convertRequestToInsomnia(child, workspaceId, sortKey));
    }
    sortKey++;
  }

  return {
    _type: "export",
    __export_format: 4,
    __export_date: new Date().toISOString(),
    __export_source: "mandy.app",
    resources,
  };
}
