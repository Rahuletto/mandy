import { ApiRequest, Methods } from "../../bindings";

export function parseCurlCommand(curl: string): Partial<ApiRequest> {
  const request: Partial<ApiRequest> = {
    method: "GET",
    headers: {},
    query_params: {},
    cookies: [],
  };

  const cleanedLineContinuations = curl.replace(/\\\n/g, " ");
  const tokens: string[] = [];
  const tokenRegex = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+)/g;
  let match;
  while ((match = tokenRegex.exec(cleanedLineContinuations)) !== null) {
    if (match[1] !== undefined) tokens.push(match[1].replace(/\\"/g, '"'));
    else if (match[2] !== undefined) tokens.push(match[2].replace(/\\'/g, "'"));
    else tokens.push(match[3]);
  }

  let data = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.startsWith("http")) {
      request.url = token;
      const qIndex = token.indexOf("?");
      if (qIndex !== -1) {
        const queryString = token.slice(qIndex + 1);
        queryString.split("&").forEach((part) => {
          if (!part) return;
          const [k, v] = part.split("=");
          if (k) {
            try {
              request.query_params![decodeURIComponent(k)] = v ? decodeURIComponent(v) : "";
            } catch {
              request.query_params![k] = v || "";
            }
          }
        });
      }
      continue;
    }


    switch (token) {
      case "-X":
      case "--request":
        if (tokens[i + 1]) {
          request.method = tokens[++i].toUpperCase() as Methods;
        }
        break;
      case "-H":
      case "--header":
        if (tokens[i + 1]) {
          const header = tokens[++i];
          const colonIndex = header.indexOf(":");
          if (colonIndex > 0) {
            const key = header.slice(0, colonIndex).trim();
            const value = header.slice(colonIndex + 1).trim();
            request.headers![key] = value;
          }
        }
        break;
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
        if (tokens[i + 1]) {
          data += (data ? "&" : "") + tokens[++i];
          if (request.method === "GET") request.method = "POST";
        }
        break;
      case "-b":
      case "--cookie":
        if (tokens[i + 1]) {
          const cookieStr = tokens[++i];
          cookieStr.split(";").forEach((pair) => {
            const [name, ...valParts] = pair.trim().split("=");
            if (name) {
              request.cookies!.push({
                name,
                value: valParts.join("="),
                domain: "",
                path: "/",
                expires: null,
                http_only: false,
                secure: false,
              });
            }
          });
        }
        break;
      case "-u":
      case "--user":
        if (tokens[i + 1]) {
          const userPass = tokens[++i];
          const [username, ...passwordParts] = userPass.split(":");
          request.auth = {
            Basic: {
              username: username || "",
              password: passwordParts.join(":") || "",
            },
          };
        }
        break;
      case "-k":
      case "--insecure":
        request.verify_ssl = false;
        break;
      case "-L":
      case "--location":
        request.follow_redirects = true;
        break;
    }
  }

  if (!request.url && tokens.length > 1) {
    for (const t of tokens) {
      if (
        t !== "curl" &&
        !t.startsWith("-") &&
        (t.startsWith("http") || t.includes("."))
      ) {
        request.url = t;
        break;
      }
    }
  }

  const contentTypeHeader = Object.entries(request.headers!).find(
    ([k]) => k.toLowerCase() === "content-type",
  );
  const contentType = contentTypeHeader?.[1]?.toLowerCase() || "";

  if (data) {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const fields: Record<string, string> = {};
      data.split("&").forEach((pair) => {
        const [key, val] = pair.split("=");
        if (key) {
          try {
            fields[decodeURIComponent(key.replace(/\+/g, " "))] =
              decodeURIComponent((val || "").replace(/\+/g, " "));
          } catch {
            fields[key] = val || "";
          }
        }
      });
      request.body = { FormUrlEncoded: { fields } };
    } else if (contentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(data);
        request.body = {
          Raw: {
            content: JSON.stringify(parsed, null, 2),
            content_type: "application/json",
          },
        };
      } catch {
        request.body = {
          Raw: { content: data, content_type: "application/json" },
        };
      }
    } else {
      request.body = {
        Raw: { content: data, content_type: contentType || null },
      };
    }
  }

  return request;
}
