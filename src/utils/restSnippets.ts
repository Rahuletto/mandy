import type { ApiRequest } from "../bindings";
import type { Language } from "../components/CodeMirror/languageExtensions";

type SnippetGenerator = (request: ApiRequest) => string;

export interface RestSnippetProfile {
	id: string;
	label: string;
	languageGroup: string;
	clientLabel: string;
	viewerLanguage: Language;
	generate: SnippetGenerator;
}

interface RequestPayload {
	headers: Record<string, string>;
	rawBody: string | null;
	jsonBody: string | null;
	formBody: Record<string, string> | null;
}

function getPayload(request: ApiRequest): RequestPayload {
	const headers: Record<string, string> = Object.fromEntries(
		Object.entries(request.headers).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	);
	let rawBody: string | null = null;
	let jsonBody: string | null = null;
	let formBody: Record<string, string> | null = null;

	if (request.body === "None") {
		return { headers, rawBody, jsonBody, formBody };
	}

	if ("Raw" in request.body) {
		const { content, content_type } = request.body.Raw;
		rawBody = content;
		if (content_type && !headers["Content-Type"]) {
			headers["Content-Type"] = content_type;
		}
		if (content_type?.includes("json")) {
			try {
				jsonBody = JSON.stringify(JSON.parse(content), null, 2);
			} catch {
				jsonBody = null;
			}
		}
		return { headers, rawBody, jsonBody, formBody };
	}

	if ("FormUrlEncoded" in request.body) {
		formBody = Object.fromEntries(
			Object.entries(request.body.FormUrlEncoded.fields).filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			),
		);
		headers["Content-Type"] = "application/x-www-form-urlencoded";
	}
	return { headers, rawBody, jsonBody, formBody };
}

function renderJsonRecord(value: Record<string, string>, indent = 2): string {
	return JSON.stringify(value, null, indent);
}

function escapeSingleQuotes(value: string): string {
	return value.replace(/'/g, "'\\''");
}

function getDataExpression(payload: RequestPayload): string | null {
	if (payload.formBody) {
		return new URLSearchParams(payload.formBody).toString();
	}
	return payload.rawBody;
}

function generateCurl(request: ApiRequest): string {
	const payload = getPayload(request);
	const parts = ["curl", `--request ${request.method}`, `--url ${request.url}`];

	for (const [key, value] of Object.entries(payload.headers)) {
		if (value) parts.push(`--header '${key}: ${value}'`);
	}

	const data = getDataExpression(payload);
	if (data) parts.push(`--data '${escapeSingleQuotes(data)}'`);
	return parts.join(" \\\n  ");
}

function generateWget(request: ApiRequest): string {
	const payload = getPayload(request);
	const parts = ["wget", `--method=${request.method}`];
	for (const [key, value] of Object.entries(payload.headers)) {
		if (value) parts.push(`--header='${key}: ${value}'`);
	}
	const data = getDataExpression(payload);
	if (data) parts.push(`--body-data='${escapeSingleQuotes(data)}'`);
	parts.push(`'${request.url}'`);
	return parts.join(" \\\n  ");
}

function generateHttpie(request: ApiRequest): string {
	const payload = getPayload(request);
	const parts = ["http", request.method, `'${request.url}'`];
	for (const [key, value] of Object.entries(payload.headers)) {
		if (value) parts.push(`'${key}:${value}'`);
	}
	if (payload.formBody) {
		for (const [key, value] of Object.entries(payload.formBody)) {
			parts.push(`${key}=${JSON.stringify(value)}`);
		}
	} else if (payload.jsonBody) {
		parts.push(`<<< '${escapeSingleQuotes(payload.jsonBody)}'`);
	} else if (payload.rawBody) {
		parts.push(`<<< '${escapeSingleQuotes(payload.rawBody)}'`);
	}
	return parts.join(" ");
}

function generateFetch(request: ApiRequest): string {
	const payload = getPayload(request);
	const bodyExpression = payload.formBody
		? JSON.stringify(new URLSearchParams(payload.formBody).toString())
		: payload.jsonBody
			? `JSON.stringify(${payload.jsonBody})`
			: payload.rawBody
				? JSON.stringify(payload.rawBody)
				: null;

	return `fetch(${JSON.stringify(request.url)}, {
  method: ${JSON.stringify(request.method)},
  headers: ${JSON.stringify(payload.headers, null, 2).split("\n").join("\n  ")}${bodyExpression ? `,\n  body: ${bodyExpression}` : ""}
}).then((response) => response.text())
  .then((result) => console.log(result))
  .catch((error) => console.error(error));`;
}

function generateAxios(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = payload.formBody
		? JSON.stringify(new URLSearchParams(payload.formBody).toString())
		: payload.jsonBody
			? payload.jsonBody
			: payload.rawBody
				? JSON.stringify(payload.rawBody)
				: "undefined";
	return `import axios from "axios";

const response = await axios({
  method: ${JSON.stringify(request.method.toLowerCase())},
  url: ${JSON.stringify(request.url)},
  headers: ${JSON.stringify(payload.headers, null, 2).split("\n").join("\n  ")},
  data: ${data}
});

console.log(response.data);`;
}

function generateOfetch(request: ApiRequest): string {
	const payload = getPayload(request);
	const body = payload.formBody
		? JSON.stringify(new URLSearchParams(payload.formBody).toString())
		: payload.jsonBody
			? payload.jsonBody
			: payload.rawBody
				? JSON.stringify(payload.rawBody)
				: "undefined";
	return `import { ofetch } from "ofetch";

const result = await ofetch(${JSON.stringify(request.url)}, {
  method: ${JSON.stringify(request.method)},
  headers: ${JSON.stringify(payload.headers, null, 2).split("\n").join("\n  ")},
  body: ${body}
});

console.log(result);`;
}

function generateUndici(request: ApiRequest): string {
	const payload = getPayload(request);
	const body = payload.formBody
		? JSON.stringify(new URLSearchParams(payload.formBody).toString())
		: payload.jsonBody
			? `JSON.stringify(${payload.jsonBody})`
			: payload.rawBody
				? JSON.stringify(payload.rawBody)
				: "undefined";
	return `import { request } from "undici";

const { body: responseBody } = await request(${JSON.stringify(request.url)}, {
  method: ${JSON.stringify(request.method)},
  headers: ${JSON.stringify(payload.headers, null, 2).split("\n").join("\n  ")},
  body: ${body}
});

console.log(await responseBody.text());`;
}

function generatePythonRequests(request: ApiRequest): string {
	const payload = getPayload(request);
	const dataArg = payload.formBody
		? `data=${renderJsonRecord(payload.formBody, 4)}`
		: payload.jsonBody
			? `json=${payload.jsonBody}`
			: payload.rawBody
				? `data=${JSON.stringify(payload.rawBody)}`
				: "";
	return `import requests

url = ${JSON.stringify(request.url)}
headers = ${renderJsonRecord(payload.headers, 4)}

response = requests.request(${JSON.stringify(request.method)}, url, headers=headers${dataArg ? `, ${dataArg}` : ""})
print(response.text)`;
}

function generatePythonHttpClient(request: ApiRequest): string {
	const payload = getPayload(request);
	const body = getDataExpression(payload);
	return `import http.client
from urllib.parse import urlparse

parsed = urlparse(${JSON.stringify(request.url)})
conn = http.client.HTTPSConnection(parsed.netloc)
payload = ${JSON.stringify(body ?? "")}
headers = ${renderJsonRecord(payload.headers, 4)}
conn.request(${JSON.stringify(request.method)}, parsed.path or "/", payload, headers)
response = conn.getresponse()
print(response.read().decode())`;
}

function generatePythonAiohttp(request: ApiRequest): string {
	const payload = getPayload(request);
	const body = payload.formBody
		? `data=${renderJsonRecord(payload.formBody, 4)}`
		: payload.jsonBody
			? `json=${payload.jsonBody}`
			: payload.rawBody
				? `data=${JSON.stringify(payload.rawBody)}`
				: "";
	return `import aiohttp
import asyncio

async def main():
    async with aiohttp.ClientSession() as session:
        async with session.request(${JSON.stringify(request.method)}, ${JSON.stringify(request.url)}, headers=${renderJsonRecord(payload.headers, 8)}${body ? `, ${body}` : ""}) as response:
            print(await response.text())

asyncio.run(main())`;
}

function generatePythonHttpxSync(request: ApiRequest): string {
	const payload = getPayload(request);
	const body = payload.formBody
		? `data=${renderJsonRecord(payload.formBody, 4)}`
		: payload.jsonBody
			? `json=${payload.jsonBody}`
			: payload.rawBody
				? `content=${JSON.stringify(payload.rawBody)}`
				: "";
	return `import httpx

response = httpx.request(
    ${JSON.stringify(request.method)},
    ${JSON.stringify(request.url)},
    headers=${renderJsonRecord(payload.headers, 4)}${body ? `,\n    ${body}` : ""}
)
print(response.text)`;
}

function generatePythonHttpxAsync(request: ApiRequest): string {
	const payload = getPayload(request);
	const body = payload.formBody
		? `data=${renderJsonRecord(payload.formBody, 8)}`
		: payload.jsonBody
			? `json=${payload.jsonBody}`
			: payload.rawBody
				? `content=${JSON.stringify(payload.rawBody)}`
				: "";
	return `import asyncio
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        response = await client.request(
            ${JSON.stringify(request.method)},
            ${JSON.stringify(request.url)},
            headers=${renderJsonRecord(payload.headers, 12)}${body ? `,\n            ${body}` : ""}
        )
        print(response.text)

asyncio.run(main())`;
}

function generateGo(request: ApiRequest): string {
	const payload = getPayload(request);
	const body = getDataExpression(payload);
	return `package main

import (
	"fmt"
	"io"
	"net/http"
	"strings"
)

func main() {
	body := strings.NewReader(${JSON.stringify(body ?? "")})
	req, err := http.NewRequest(${JSON.stringify(request.method)}, ${JSON.stringify(request.url)}, body)
	if err != nil {
		panic(err)
	}

${Object.entries(payload.headers)
	.map(
		([key, value]) =>
			`	req.Header.Set(${JSON.stringify(key)}, ${JSON.stringify(value)})`,
	)
	.join("\n")}
	client := &http.Client{}
	res, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer res.Body.Close()
	result, _ := io.ReadAll(res.Body)
	fmt.Println(string(result))
}`;
}

function generateJavaHttpClient(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	return `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class Main {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest.Builder builder = HttpRequest.newBuilder()
            .uri(URI.create(${JSON.stringify(request.url)}));

${Object.entries(payload.headers)
	.map(
		([key, value]) =>
			`        builder.header(${JSON.stringify(key)}, ${JSON.stringify(value)});`,
	)
	.join("\n")}
        HttpRequest request = builder.method(${JSON.stringify(request.method)}, HttpRequest.BodyPublishers.ofString(${JSON.stringify(data ?? "")})).build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println(response.body());
    }
}`;
}

function generateOkHttp(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload) ?? "";
	const contentType = payload.headers["Content-Type"] ?? "application/json";
	return `import okhttp3.*;

OkHttpClient client = new OkHttpClient();
RequestBody body = RequestBody.create(${JSON.stringify(data)}, MediaType.parse(${JSON.stringify(contentType)}));
Request.Builder builder = new Request.Builder().url(${JSON.stringify(request.url)});

${Object.entries(payload.headers)
	.map(
		([key, value]) =>
			`builder.addHeader(${JSON.stringify(key)}, ${JSON.stringify(value)});`,
	)
	.join("\n")}
builder.method(${JSON.stringify(request.method)}, body);
Response response = client.newCall(builder.build()).execute();
System.out.println(response.body().string());`;
}

function generateCSharpHttpClient(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload) ?? "";
	return `using System.Net.Http;
using System.Text;

using var client = new HttpClient();
using var message = new HttpRequestMessage(HttpMethod.${request.method.charAt(0)}${request.method.slice(1).toLowerCase()}, ${JSON.stringify(request.url)});
message.Content = new StringContent(${JSON.stringify(data)}, Encoding.UTF8, ${JSON.stringify(payload.headers["Content-Type"] ?? "application/json")});
${Object.entries(payload.headers)
	.filter(([key]) => key.toLowerCase() !== "content-type")
	.map(
		([key, value]) =>
			`message.Headers.TryAddWithoutValidation(${JSON.stringify(key)}, ${JSON.stringify(value)});`,
	)
	.join("\n")}
var response = await client.SendAsync(message);
var result = await response.Content.ReadAsStringAsync();
Console.WriteLine(result);`;
}

function generateCSharpRestSharp(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload) ?? "";
	return `using RestSharp;

var client = new RestClient(${JSON.stringify(request.url)});
var request = new RestRequest("", Method.${request.method.charAt(0)}${request.method.slice(1).toLowerCase()});
${Object.entries(payload.headers)
	.map(
		([key, value]) =>
			`request.AddHeader(${JSON.stringify(key)}, ${JSON.stringify(value)});`,
	)
	.join("\n")}
${data ? `request.AddStringBody(${JSON.stringify(data)}, DataFormat.Json);` : ""}
var response = await client.ExecuteAsync(request);
Console.WriteLine(response.Content);`;
}

function generateCLibcurl(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	const headers = Object.entries(payload.headers).map(
		([key, value]) => `${key}: ${value}`,
	);
	return `#include <curl/curl.h>

int main(void) {
    CURL *curl = curl_easy_init();
    if (!curl) return 1;

    struct curl_slist *headers = NULL;
${headers.map((line) => `    headers = curl_slist_append(headers, ${JSON.stringify(line)});`).join("\n")}

    curl_easy_setopt(curl, CURLOPT_URL, ${JSON.stringify(request.url)});
    curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, ${JSON.stringify(request.method)});
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
${data ? `    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, ${JSON.stringify(data)});` : ""}

    curl_easy_perform(curl);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    return 0;
}`;
}

function generateClojureCljHttp(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	return `(require '[clj-http.client :as client])

(def response
  (client/request
    {:method ${JSON.stringify(request.method.toLowerCase())}
     :url ${JSON.stringify(request.url)}
     :headers ${renderJsonRecord(payload.headers, 5)}${data ? `\n     :body ${JSON.stringify(data)}` : ""}}))

(println (:status response))
(println (:body response))`;
}

function generateDartHttp(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	return `import 'package:http/http.dart' as http;

Future<void> main() async {
  final response = await http.Request(${JSON.stringify(request.method)}, Uri.parse(${JSON.stringify(request.url)}))
    ..headers.addAll(${renderJsonRecord(payload.headers, 4).replace(/"/g, "'")})
${data ? `    ..body = ${JSON.stringify(data)}` : ""}
    ;

  final streamed = await response.send();
  final text = await streamed.stream.bytesToString();
  print(text);
}`;
}

function generateFSharpHttpClient(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload) ?? "";
	return `open System
open System.Net.Http
open System.Text

let client = new HttpClient()
let message = new HttpRequestMessage(HttpMethod(${JSON.stringify(request.method)}), ${JSON.stringify(request.url)})
message.Content <- new StringContent(${JSON.stringify(data)}, Encoding.UTF8, ${JSON.stringify(payload.headers["Content-Type"] ?? "application/json")})
${Object.entries(payload.headers)
	.filter(([key]) => key.toLowerCase() !== "content-type")
	.map(
		([key, value]) =>
			`message.Headers.TryAddWithoutValidation(${JSON.stringify(key)}, ${JSON.stringify(value)}) |> ignore`,
	)
	.join("\n")}

let response = client.Send(message)
let body = response.Content.ReadAsStringAsync().Result
printfn "%s" body`;
}

/** Path + Host for raw HTTP lines; must not throw on `{{variables}}` or partial URLs. */
function parseRawHttpTarget(url: string): {
	host: string;
	pathWithQuery: string;
} {
	const trimmed = url.trim();
	if (!trimmed) {
		return { host: "localhost", pathWithQuery: "/" };
	}

	try {
		const parsed = new URL(trimmed);
		return {
			host: parsed.host || "localhost",
			pathWithQuery: `${parsed.pathname || "/"}${parsed.search}`,
		};
	} catch {
		// Template variables and other non-URL strings — parse below.
	}

	if (trimmed.startsWith("/")) {
		return { host: "localhost", pathWithQuery: trimmed };
	}

	const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
	const slashIdx = withoutScheme.indexOf("/");
	if (slashIdx >= 0) {
		return {
			host: withoutScheme.slice(0, slashIdx) || "localhost",
			pathWithQuery: withoutScheme.slice(slashIdx) || "/",
		};
	}

	return { host: trimmed, pathWithQuery: "/" };
}

function generateRawHttp(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	const { host, pathWithQuery } = parseRawHttpTarget(request.url);
	const requestLine = `${request.method} ${pathWithQuery} HTTP/1.1`;
	const hostHeader = `Host: ${host}`;
	const headers = Object.entries(payload.headers).map(
		([key, value]) => `${key}: ${value}`,
	);
	const headerBlock = [hostHeader, ...headers].join("\n");
	return `${requestLine}
${headerBlock}

${data ?? ""}`.trim();
}

function generateJavaAsyncHttp(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload) ?? "";
	return `import org.asynchttpclient.*;

DefaultAsyncHttpClient client = new DefaultAsyncHttpClient();
BoundRequestBuilder builder = client.prepare(${JSON.stringify(request.method)}, ${JSON.stringify(request.url)});
${Object.entries(payload.headers)
	.map(
		([key, value]) =>
			`builder.addHeader(${JSON.stringify(key)}, ${JSON.stringify(value)});`,
	)
	.join("\n")}
${data ? `builder.setBody(${JSON.stringify(data)});` : ""}

builder.execute().toCompletableFuture().thenAccept(response -> {
    System.out.println(response.getResponseBody());
    client.close();
});`;
}

function generateJavaUnirest(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	return `import kong.unirest.*;

HttpResponse<String> response = Unirest.request(${JSON.stringify(request.method)}, ${JSON.stringify(request.url)})
${Object.entries(payload.headers)
	.map(
		([key, value]) =>
			`    .header(${JSON.stringify(key)}, ${JSON.stringify(value)})`,
	)
	.join("\n")}${data ? `\n    .body(${JSON.stringify(data)})` : ""}
    .asString();

System.out.println(response.getBody());`;
}

function generateObjectiveCNSURLSession(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	return `NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:@${JSON.stringify(request.url)}]];
request.HTTPMethod = @${JSON.stringify(request.method)};
${Object.entries(payload.headers)
	.map(
		([key, value]) =>
			`[request setValue:@${JSON.stringify(value)} forHTTPHeaderField:@${JSON.stringify(key)}];`,
	)
	.join("\n")}
${data ? `request.HTTPBody = [@${JSON.stringify(data)} dataUsingEncoding:NSUTF8StringEncoding];` : ""}

NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
    if (data) NSLog(@"%@", [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]);
}];
[task resume];`;
}

function generateOCamlCohttp(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload) ?? "";
	return `open Lwt.Infix
open Cohttp
open Cohttp_lwt_unix

let () =
  let uri = Uri.of_string ${JSON.stringify(request.url)} in
  let headers = Header.of_list [${Object.entries(payload.headers)
		.map(([key, value]) => `(${JSON.stringify(key)}, ${JSON.stringify(value)})`)
		.join("; ")}] in
  let body = Cohttp_lwt.Body.of_string ${JSON.stringify(data)} in
  Client.call ~headers ~body (Code.method_of_string ${JSON.stringify(
		request.method,
	)}) uri
  >>= fun (_, body) -> Cohttp_lwt.Body.to_string body
  >>= fun text -> Lwt_io.printl text
  |> Lwt_main.run`;
}

function generatePhpLaravelHttpClient(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	return `<?php

use Illuminate\\Support\\Facades\\Http;

$response = Http::withHeaders(${renderJsonRecord(payload.headers, 4)})
    ->send(${JSON.stringify(request.method)}, ${JSON.stringify(request.url)}, [${data ? `\n        'body' => ${JSON.stringify(data)},\n    ` : ""}]);

echo $response->body();`;
}

function generatePowerShellInvokeWebRequest(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	return `$headers = ${renderJsonRecord(payload.headers, 2).replace(/"/g, "'")}
$response = Invoke-WebRequest -Uri ${JSON.stringify(request.url)} -Method ${request.method} -Headers $headers${data ? ` -Body ${JSON.stringify(data)}` : ""}
$response.Content`;
}

function generatePowerShellInvokeRestMethod(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	return `$headers = ${renderJsonRecord(payload.headers, 2).replace(/"/g, "'")}
$response = Invoke-RestMethod -Uri ${JSON.stringify(request.url)} -Method ${request.method} -Headers $headers${data ? ` -Body ${JSON.stringify(data)}` : ""}
$response | ConvertTo-Json -Depth 10`;
}

function generateRHttr2(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	return `library(httr2)

req <- request(${JSON.stringify(request.url)}) |>
  req_method(${JSON.stringify(request.method)})
${Object.entries(payload.headers)
	.map(
		([key, value]) =>
			`req <- req |> req_headers(${JSON.stringify(key)} = ${JSON.stringify(value)})`,
	)
	.join("\n")}
${data ? `req <- req |> req_body_raw(${JSON.stringify(data)})` : ""}

resp <- req_perform(req)
resp_body_string(resp)`;
}

function generateRubyNetHttp(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	const methodClass =
		request.method.charAt(0) + request.method.slice(1).toLowerCase();
	return `require "net/http"
require "uri"

uri = URI(${JSON.stringify(request.url)})
http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = uri.scheme == "https"
request = Net::HTTP::${methodClass}.new(uri)
${Object.entries(payload.headers)
	.map(
		([key, value]) =>
			`request[${JSON.stringify(key)}] = ${JSON.stringify(value)}`,
	)
	.join("\n")}
${data ? `request.body = ${JSON.stringify(data)}` : ""}

response = http.request(request)
puts response.body`;
}

function generateSwiftNSURLSession(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	return `import Foundation

var request = URLRequest(url: URL(string: ${JSON.stringify(request.url)})!)
request.httpMethod = ${JSON.stringify(request.method)}
${Object.entries(payload.headers)
	.map(
		([key, value]) =>
			`request.setValue(${JSON.stringify(value)}, forHTTPHeaderField: ${JSON.stringify(key)})`,
	)
	.join("\n")}
${data ? `request.httpBody = ${JSON.stringify(data)}.data(using: .utf8)` : ""}

URLSession.shared.dataTask(with: request) { data, _, error in
    if let data {
        print(String(decoding: data, as: UTF8.self))
    } else if let error {
        print(error)
    }
}.resume()`;
}

function generateRustReqwest(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload) ?? "";
	return `use reqwest::Client;

#[tokio::main]
async fn main() -> Result<(), reqwest::Error> {
    let client = Client::new();
    let response = client
        .request(reqwest::Method::${request.method}, ${JSON.stringify(request.url)})
${Object.entries(payload.headers)
	.map(
		([key, value]) =>
			`        .header(${JSON.stringify(key)}, ${JSON.stringify(value)})`,
	)
	.join("\n")}
        .body(${JSON.stringify(data)})
        .send()
        .await?;

    println!("{}", response.text().await?);
    Ok(())
}`;
}

function generatePhpCurl(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	const headerLines = Object.entries(payload.headers).map(
		([key, value]) => `'${key}: ${value}'`,
	);
	return `<?php
$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => ${JSON.stringify(request.url)},
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => ${JSON.stringify(request.method)},
    CURLOPT_HTTPHEADER => [${headerLines.join(", ")}],${data ? `\n    CURLOPT_POSTFIELDS => ${JSON.stringify(data)},` : ""}
]);

$response = curl_exec($curl);
curl_close($curl);
echo $response;`;
}

function generatePhpGuzzle(request: ApiRequest): string {
	const payload = getPayload(request);
	const data = getDataExpression(payload);
	return `<?php
use GuzzleHttp\\Client;

$client = new Client();
$response = $client->request(${JSON.stringify(request.method)}, ${JSON.stringify(request.url)}, [
    'headers' => ${renderJsonRecord(payload.headers, 4)},${data ? `\n    'body' => ${JSON.stringify(data)},` : ""}
]);

echo $response->getBody();`;
}

export const REST_SNIPPET_PROFILES: RestSnippetProfile[] = [
	{
		id: "c-libcurl",
		label: "C / Libcurl",
		languageGroup: "C",
		clientLabel: "Libcurl",
		viewerLanguage: "c",
		generate: generateCLibcurl,
	},
	{
		id: "shell-curl",
		label: "Shell / cURL",
		languageGroup: "Shell",
		clientLabel: "cURL",
		viewerLanguage: "shell",
		generate: generateCurl,
	},
	{
		id: "shell-wget",
		label: "Shell / Wget",
		languageGroup: "Shell",
		clientLabel: "Wget",
		viewerLanguage: "shell",
		generate: generateWget,
	},
	{
		id: "shell-httpie",
		label: "Shell / HTTPie",
		languageGroup: "Shell",
		clientLabel: "HTTPie",
		viewerLanguage: "shell",
		generate: generateHttpie,
	},
	{
		id: "javascript-fetch",
		label: "JavaScript / Fetch",
		languageGroup: "JavaScript",
		clientLabel: "Fetch",
		viewerLanguage: "javascript",
		generate: generateFetch,
	},
	{
		id: "javascript-axios",
		label: "JavaScript / Axios",
		languageGroup: "JavaScript",
		clientLabel: "Axios",
		viewerLanguage: "javascript",
		generate: generateAxios,
	},
	{
		id: "javascript-ofetch",
		label: "JavaScript / ofetch",
		languageGroup: "JavaScript",
		clientLabel: "ofetch",
		viewerLanguage: "javascript",
		generate: generateOfetch,
	},
	{
		id: "node-undici",
		label: "Node.js / undici",
		languageGroup: "Node.js",
		clientLabel: "undici",
		viewerLanguage: "javascript",
		generate: generateUndici,
	},
	{
		id: "python-requests",
		label: "Python / Requests",
		languageGroup: "Python",
		clientLabel: "Requests",
		viewerLanguage: "python",
		generate: generatePythonRequests,
	},
	{
		id: "python-http-client",
		label: "Python / http.client",
		languageGroup: "Python",
		clientLabel: "http.client",
		viewerLanguage: "python",
		generate: generatePythonHttpClient,
	},
	{
		id: "python-aiohttp",
		label: "Python / aiohttp",
		languageGroup: "Python",
		clientLabel: "aiohttp",
		viewerLanguage: "python",
		generate: generatePythonAiohttp,
	},
	{
		id: "python-httpx-sync",
		label: "Python / HTTPX (Sync)",
		languageGroup: "Python",
		clientLabel: "HTTPX (Sync)",
		viewerLanguage: "python",
		generate: generatePythonHttpxSync,
	},
	{
		id: "python-httpx-async",
		label: "Python / HTTPX (Async)",
		languageGroup: "Python",
		clientLabel: "HTTPX (Async)",
		viewerLanguage: "python",
		generate: generatePythonHttpxAsync,
	},
	{
		id: "go-net-http",
		label: "Go / NewRequest",
		languageGroup: "Go",
		clientLabel: "NewRequest",
		viewerLanguage: "go",
		generate: generateGo,
	},
	{
		id: "java-http-client",
		label: "Java / HttpClient",
		languageGroup: "Java",
		clientLabel: "java.net.http",
		viewerLanguage: "java",
		generate: generateJavaHttpClient,
	},
	{
		id: "kotlin-okhttp",
		label: "Kotlin / OkHttp",
		languageGroup: "Kotlin",
		clientLabel: "OkHttp",
		viewerLanguage: "kotlin",
		generate: generateOkHttp,
	},
	{
		id: "csharp-http-client",
		label: "C# / HttpClient",
		languageGroup: "C#",
		clientLabel: "HttpClient",
		viewerLanguage: "csharp",
		generate: generateCSharpHttpClient,
	},
	{
		id: "csharp-restsharp",
		label: "C# / RestSharp",
		languageGroup: "C#",
		clientLabel: "RestSharp",
		viewerLanguage: "csharp",
		generate: generateCSharpRestSharp,
	},
	{
		id: "clojure-clj-http",
		label: "Clojure / clj-http",
		languageGroup: "Clojure",
		clientLabel: "clj-http",
		viewerLanguage: "clojure",
		generate: generateClojureCljHttp,
	},
	{
		id: "dart-http",
		label: "Dart / Http",
		languageGroup: "Dart",
		clientLabel: "Http",
		viewerLanguage: "dart",
		generate: generateDartHttp,
	},
	{
		id: "fsharp-http-client",
		label: "F# / HttpClient",
		languageGroup: "F#",
		clientLabel: "HttpClient",
		viewerLanguage: "fsharp",
		generate: generateFSharpHttpClient,
	},
	{
		id: "rust-reqwest",
		label: "Rust / reqwest",
		languageGroup: "Rust",
		clientLabel: "reqwest",
		viewerLanguage: "rust",
		generate: generateRustReqwest,
	},
	{
		id: "php-curl",
		label: "PHP / cURL",
		languageGroup: "PHP",
		clientLabel: "cURL",
		viewerLanguage: "php",
		generate: generatePhpCurl,
	},
	{
		id: "php-guzzle",
		label: "PHP / Guzzle",
		languageGroup: "PHP",
		clientLabel: "Guzzle",
		viewerLanguage: "php",
		generate: generatePhpGuzzle,
	},
	{
		id: "php-laravel-http-client",
		label: "PHP / Laravel HTTP Client",
		languageGroup: "PHP",
		clientLabel: "Laravel HTTP Client",
		viewerLanguage: "php",
		generate: generatePhpLaravelHttpClient,
	},
	{
		id: "http-raw",
		label: "HTTP / Raw",
		languageGroup: "HTTP",
		clientLabel: "Raw",
		viewerLanguage: "http",
		generate: generateRawHttp,
	},
	{
		id: "java-async-http",
		label: "Java / AsyncHttp",
		languageGroup: "Java",
		clientLabel: "AsyncHttp",
		viewerLanguage: "java",
		generate: generateJavaAsyncHttp,
	},
	{
		id: "java-unirest",
		label: "Java / Unirest",
		languageGroup: "Java",
		clientLabel: "Unirest",
		viewerLanguage: "java",
		generate: generateJavaUnirest,
	},
	{
		id: "node-fetch",
		label: "Node.js / Fetch",
		languageGroup: "Node.js",
		clientLabel: "Fetch",
		viewerLanguage: "javascript",
		generate: generateFetch,
	},
	{
		id: "node-axios",
		label: "Node.js / Axios",
		languageGroup: "Node.js",
		clientLabel: "Axios",
		viewerLanguage: "javascript",
		generate: generateAxios,
	},
	{
		id: "node-ofetch",
		label: "Node.js / ofetch",
		languageGroup: "Node.js",
		clientLabel: "ofetch",
		viewerLanguage: "javascript",
		generate: generateOfetch,
	},
	{
		id: "objectivec-nsurl-session",
		label: "Objective-C / NSURLSession",
		languageGroup: "Objective-C",
		clientLabel: "NSURLSession",
		viewerLanguage: "objectivec",
		generate: generateObjectiveCNSURLSession,
	},
	{
		id: "ocaml-cohttp",
		label: "OCaml / Cohttp",
		languageGroup: "OCaml",
		clientLabel: "Cohttp",
		viewerLanguage: "ocaml",
		generate: generateOCamlCohttp,
	},
	{
		id: "powershell-invoke-web-request",
		label: "PowerShell / Invoke-WebRequest",
		languageGroup: "PowerShell",
		clientLabel: "Invoke-WebRequest",
		viewerLanguage: "powershell",
		generate: generatePowerShellInvokeWebRequest,
	},
	{
		id: "powershell-invoke-rest-method",
		label: "PowerShell / Invoke-RestMethod",
		languageGroup: "PowerShell",
		clientLabel: "Invoke-RestMethod",
		viewerLanguage: "powershell",
		generate: generatePowerShellInvokeRestMethod,
	},
	{
		id: "r-httr2",
		label: "R / httr2",
		languageGroup: "R",
		clientLabel: "httr2",
		viewerLanguage: "r",
		generate: generateRHttr2,
	},
	{
		id: "ruby-net-http",
		label: "Ruby / net::http",
		languageGroup: "Ruby",
		clientLabel: "net::http",
		viewerLanguage: "ruby",
		generate: generateRubyNetHttp,
	},
	{
		id: "swift-nsurl-session",
		label: "Swift / NSURLSession",
		languageGroup: "Swift",
		clientLabel: "NSURLSession",
		viewerLanguage: "swift",
		generate: generateSwiftNSURLSession,
	},
];

const PROFILE_MAP = new Map(
	REST_SNIPPET_PROFILES.map((profile) => [profile.id, profile]),
);

export function getRestSnippetProfile(
	snippetId: string,
): RestSnippetProfile | undefined {
	// Legacy duplicate entry; output was always HTTP/1.1.
	const id = snippetId === "http-1-1-raw" ? "http-raw" : snippetId;
	return PROFILE_MAP.get(id);
}

export function generateRestSnippet(
	snippetId: string,
	request: ApiRequest,
): { code: string; language: Language } {
	const profile = getRestSnippetProfile(snippetId) ?? REST_SNIPPET_PROFILES[0];
	return { code: profile.generate(request), language: profile.viewerLanguage };
}

export function getDefaultRestSnippetId(): string {
	return REST_SNIPPET_PROFILES[0].id;
}

export function getLegacyLanguageSnippetId(language: string): string {
	switch (language) {
		case "javascript":
			return "javascript-fetch";
		case "python":
			return "python-requests";
		case "go":
			return "go-net-http";
		case "rust":
			return "rust-reqwest";
		case "java":
			return "java-http-client";
		case "php":
			return "php-guzzle";
		case "shell":
		default:
			return "shell-curl";
	}
}

export function listRestSnippetProfiles(): RestSnippetProfile[] {
	return REST_SNIPPET_PROFILES;
}
