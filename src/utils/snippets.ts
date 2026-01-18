import type { ApiRequest } from "../bindings";

export function generateCurl(request: ApiRequest): string {
    const parts = ["curl"];
    parts.push(`--request ${request.method}`);
    parts.push(`--url ${request.url}`);

    Object.entries(request.headers).forEach(([key, value]) => {
        if (value) {
            parts.push(`--header '${key}: ${value}'`);
        }
    });

    if (request.body !== "None") {
        if ("Raw" in request.body) {
            const { content, content_type } = request.body.Raw;
            if (content_type && !request.headers["Content-Type"]) {
                parts.push(`--header 'Content-Type: ${content_type}'`);
            }
            if (content_type?.includes("json")) {
                try {
                    const parsed = JSON.parse(content);
                    const formatted = JSON.stringify(parsed, null, 2);
                    parts.push(`--data '${formatted}'`);
                } catch {
                    parts.push(`--data '${content.replace(/'/g, "'\\''")}'`);
                }
            } else {
                parts.push(`--data '${content.replace(/'/g, "'\\''")}'`);
            }
        } else if ("FormUrlEncoded" in request.body) {
            parts.push(`--header 'Content-Type: application/x-www-form-urlencoded'`);
            const params = new URLSearchParams();
            Object.entries(request.body.FormUrlEncoded.fields).forEach(([key, value]) => {
                if (value) params.append(key, value);
            });
            parts.push(`--data '${params.toString()}'`);
        }
    }
    return parts.join(" \\\n  ");
}

export function generateFetch(request: ApiRequest): string {
    let bodyCode = "";
    const headers = { ...request.headers };

    if (request.body !== "None") {
        if ("Raw" in request.body) {
            const { content, content_type } = request.body.Raw;
            if (content_type && !headers["Content-Type"]) {
                headers["Content-Type"] = content_type;
            }
            if (content_type?.includes("json")) {
                try {
                    const parsed = JSON.parse(content);
                    bodyCode = `\n  body: JSON.stringify(${JSON.stringify(parsed, null, 2).split('\n').join('\n  ')})`;
                } catch {
                    bodyCode = `\n  body: '${content}'`;
                }
            } else {
                bodyCode = `\n  body: '${content}'`;
            }
        } else if ("FormUrlEncoded" in request.body) {
            headers["Content-Type"] = "application/x-www-form-urlencoded";
            const params = new URLSearchParams();
            Object.entries(request.body.FormUrlEncoded.fields).forEach(([key, value]) => {
                if (value) params.append(key, value);
            });
            bodyCode = `\n  body: '${params.toString()}'`;
        }
    }

    const options = {
        method: request.method,
        headers: headers,
    };

    let fetchStr = `fetch('${request.url}', {
  method: '${options.method}',
  headers: ${JSON.stringify(options.headers, null, 2).split('\n').join('\n  ')},${bodyCode}
});`;

    return fetchStr;
}

export function generatePythonRequests(request: ApiRequest): string {
    let code = `import requests\n\n`;
    code += `url = "${request.url}"\n`;

    if (Object.keys(request.headers).length > 0) {
        code += `headers = ${JSON.stringify(request.headers, null, 4)}\n`;
    } else {
        code += `headers = {}\n`;
    }

    let dataArg = "";
    if (request.body !== "None") {
        if ("Raw" in request.body) {
            const { content, content_type } = request.body.Raw;
            if (content_type?.includes("json")) {
                try {
                    const parsed = JSON.parse(content);
                    code += `payload = ${JSON.stringify(parsed, null, 4)}\n`;
                    dataArg = ", json=payload";
                } catch {
                    code += `payload = """${content}"""\n`;
                    dataArg = ", data=payload";
                }
            } else {
                code += `payload = """${content}"""\n`;
                dataArg = ", data=payload";
            }
        } else if ("FormUrlEncoded" in request.body) {
            code += `payload = ${JSON.stringify(request.body.FormUrlEncoded.fields, null, 4)}\n`;
            dataArg = ", data=payload";
        }
    }

    code += `response = requests.request("${request.method}", url, headers=headers${dataArg})\n`;
    code += `print(response.text)`;

    return code;
}

export function generateGo(request: ApiRequest): string {
    let code = `package main\n\nimport (\n\t"fmt"\n\t"net/http"\n\t"io/ioutil"\n)\n\nfunc main() {\n`;
    code += `\turl := "${request.url}"\n`;
    code += `\treq, _ := http.NewRequest("${request.method}", url, nil)\n`;

    Object.entries(request.headers).forEach(([key, value]) => {
        code += `\treq.Header.Add("${key}", "${value}")\n`;
    });

    code += `\tclient := &http.Client{}\n`;
    code += `\tres, _ := client.Do(req)\n`;
    code += `\tdefer res.Body.Close()\n`;
    code += `\tbody, _ := ioutil.ReadAll(res.Body)\n`;
    code += `\tfmt.Println(string(body))\n}`;
    return code;
}

export function generateRust(request: ApiRequest): string {
    let code = `use reqwest;\n\n#[tokio::main]\nasync func main() -> Result<(), reqwest::Error> {\n`;
    code += `\tlet client = reqwest::Client::new();\n`;
    code += `\tlet res = client.${request.method.toLowerCase()}("${request.url}")\n`;

    Object.entries(request.headers).forEach(([key, value]) => {
        code += `\t\t.header("${key}", "${value}")\n`;
    });

    code += `\t\t.send()\n\t\t.await?;\n`;
    code += `\tprintln!("{}", res.text().await?);\n\tOk(())\n}`;
    return code;
}

export function generateJava(request: ApiRequest): string {
    let code = `import java.net.URI;\nimport java.net.http.HttpClient;\nimport java.net.http.HttpRequest;\nimport java.net.http.HttpResponse;\n\n`;
    code += `public class Main {\n\tpublic static void main(String[] args) throws Exception {\n`;
    code += `\t\tHttpClient client = HttpClient.newHttpClient();\n`;
    code += `\t\tHttpRequest request = HttpRequest.newBuilder()\n`;
    code += `\t\t\t.uri(URI.create("${request.url}"))\n`;
    code += `\t\t\t.method("${request.method}", HttpRequest.BodyPublishers.noBody())\n`;

    Object.entries(request.headers).forEach(([key, value]) => {
        code += `\t\t\t.header("${key}", "${value}")\n`;
    });

    code += `\t\t\t.build();\n\n`;
    code += `\t\tHttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());\n`;
    code += `\t\tSystem.out.println(response.body());\n\t}\n}`;
    return code;
}

export function generatePHP(request: ApiRequest): string {
    let code = `<?php\n\n$client = new \\GuzzleHttp\\Client();\n\n`;
    code += `$response = $client->request('${request.method}', '${request.url}', [\n`;

    if (Object.keys(request.headers).length > 0) {
        code += `    'headers' => ${JSON.stringify(request.headers, null, 8).replace(/{/g, '[').replace(/}/g, ']')},\n`;
    }

    code += `]);\n\necho $response->getBody();`;
    return code;
}
export function generateSnippet(langId: string, request: ApiRequest): string {
    switch (langId) {
        case "shell":
        case "curl":
            return generateCurl(request);
        case "javascript":
        case "fetch":
            return generateFetch(request);
        case "python":
            return generatePythonRequests(request);
        case "go":
            return generateGo(request);
        case "rust":
            return generateRust(request);
        case "java":
            return generateJava(request);
        case "php":
            return generatePHP(request);
        default:
            return generateCurl(request);
    }
}
