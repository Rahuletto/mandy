use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE, COOKIE};
use reqwest::redirect::Policy;
use reqwest::{Client, ClientBuilder, Method, Proxy, Version};
use std::collections::HashMap;
use std::str::FromStr;

use std::time::{Duration, Instant};

use crate::types::{
    ApiKeyLocation, ApiRequest, ApiResponse, AuthType, BodyType, Cookie, Methods,
    MultipartValue, RedirectEntry, ResponseRenderer, TimingInfo,
};

fn convert_headers(map: &HashMap<String, String>) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (key, val) in map {
        if let Ok(name) = HeaderName::from_str(key) {
            if let Ok(value) = HeaderValue::from_str(val) {
                headers.insert(name, value);
            }
        }
    }
    headers
}

fn method_to_reqwest(method: &Methods) -> Method {
    match method {
        Methods::GET => Method::GET,
        Methods::POST => Method::POST,
        Methods::PUT => Method::PUT,
        Methods::DELETE => Method::DELETE,
        Methods::PATCH => Method::PATCH,
        Methods::HEAD => Method::HEAD,
        Methods::OPTIONS => Method::OPTIONS,
        Methods::TRACE => Method::TRACE,
        Methods::CONNECT => Method::CONNECT,
    }
}

fn detect_renderers(content_type: Option<&str>, body: &[u8]) -> Vec<ResponseRenderer> {
    let mut renderers = vec![ResponseRenderer::Raw];

    let ct = content_type.unwrap_or("").to_lowercase();

    if ct.contains("application/json") || ct.contains("+json") {
        if serde_json::from_slice::<serde_json::Value>(body).is_ok() {
            renderers.push(ResponseRenderer::Json);
        }
    } else if body.starts_with(b"{") || body.starts_with(b"[") {
        if serde_json::from_slice::<serde_json::Value>(body).is_ok() {
            renderers.push(ResponseRenderer::Json);
        }
    }

    let is_html_content_type = ct.contains("text/html") || ct.contains("application/xhtml");
    let is_xml_content_type = ct.contains("application/xml") || ct.contains("text/xml") || ct.contains("+xml");

    if is_html_content_type {
        renderers.push(ResponseRenderer::Html);
        renderers.push(ResponseRenderer::HtmlPreview);
    } else if is_xml_content_type {
        renderers.push(ResponseRenderer::Xml);
    } else if !is_html_content_type && !is_xml_content_type {
        let body_str = String::from_utf8_lossy(body);
        if body_str.trim_start().starts_with("<?xml") {
            renderers.push(ResponseRenderer::Xml);
        } else if body_str.trim_start().starts_with("<!DOCTYPE html") 
            || body_str.trim_start().starts_with("<html") 
        {
            renderers.push(ResponseRenderer::Html);
            renderers.push(ResponseRenderer::HtmlPreview);
        }
    }

    if ct.contains("image/png")
        || ct.contains("image/jpeg")
        || ct.contains("image/gif")
        || ct.contains("image/webp")
        || ct.contains("image/svg")
        || ct.contains("image/bmp")
        || ct.contains("image/ico")
    {
        renderers.push(ResponseRenderer::Image);
    }

    if ct.contains("application/pdf") {
        renderers.push(ResponseRenderer::Pdf);
    }

    if ct.contains("audio/") {
        renderers.push(ResponseRenderer::Audio);
    }

    if ct.contains("video/") {
        renderers.push(ResponseRenderer::Video);
    }

    renderers
}

fn parse_set_cookie(header_value: &str) -> Option<Cookie> {
    let parts: Vec<&str> = header_value.split(';').collect();
    if parts.is_empty() {
        return None;
    }

    let name_value: Vec<&str> = parts[0].splitn(2, '=').collect();
    if name_value.len() != 2 {
        return None;
    }

    let mut cookie = Cookie {
        name: name_value[0].trim().to_string(),
        value: name_value[1].trim().to_string(),
        domain: None,
        path: None,
        expires: None,
        http_only: None,
        secure: None,
    };

    for part in parts.iter().skip(1) {
        let attr: Vec<&str> = part.splitn(2, '=').collect();
        let attr_name = attr[0].trim().to_lowercase();
        let attr_value = attr.get(1).map(|v| v.trim().to_string());

        match attr_name.as_str() {
            "domain" => cookie.domain = attr_value,
            "path" => cookie.path = attr_value,
            "expires" => cookie.expires = attr_value,
            "httponly" => cookie.http_only = Some(true),
            "secure" => cookie.secure = Some(true),
            _ => {}
        }
    }

    Some(cookie)
}

fn build_cookie_header(cookies: &[Cookie]) -> String {
    cookies
        .iter()
        .map(|c| format!("{}={}", c.name, c.value))
        .collect::<Vec<_>>()
        .join("; ")
}

fn status_text(status: u16) -> String {
    match status {
        100 => "Continue".to_string(),
        101 => "Switching Protocols".to_string(),
        200 => "OK".to_string(),
        201 => "Created".to_string(),
        202 => "Accepted".to_string(),
        204 => "No Content".to_string(),
        206 => "Partial Content".to_string(),
        301 => "Moved Permanently".to_string(),
        302 => "Found".to_string(),
        303 => "See Other".to_string(),
        304 => "Not Modified".to_string(),
        307 => "Temporary Redirect".to_string(),
        308 => "Permanent Redirect".to_string(),
        400 => "Bad Request".to_string(),
        401 => "Unauthorized".to_string(),
        403 => "Forbidden".to_string(),
        404 => "Not Found".to_string(),
        405 => "Method Not Allowed".to_string(),
        408 => "Request Timeout".to_string(),
        409 => "Conflict".to_string(),
        410 => "Gone".to_string(),
        413 => "Payload Too Large".to_string(),
        414 => "URI Too Long".to_string(),
        415 => "Unsupported Media Type".to_string(),
        422 => "Unprocessable Entity".to_string(),
        429 => "Too Many Requests".to_string(),
        500 => "Internal Server Error".to_string(),
        501 => "Not Implemented".to_string(),
        502 => "Bad Gateway".to_string(),
        503 => "Service Unavailable".to_string(),
        504 => "Gateway Timeout".to_string(),
        _ => format!("Status {}", status),
    }
}

fn http_version_string(version: Version) -> String {
    match version {
        Version::HTTP_09 => "HTTP/0.9".to_string(),
        Version::HTTP_10 => "HTTP/1.0".to_string(),
        Version::HTTP_11 => "HTTP/1.1".to_string(),
        Version::HTTP_2 => "HTTP/2".to_string(),
        Version::HTTP_3 => "HTTP/3".to_string(),
        _ => "Unknown".to_string(),
    }
}

fn build_client(req: &ApiRequest, no_redirect: bool) -> Result<Client, String> {
    let mut builder = ClientBuilder::new();

    if let Some(timeout) = req.timeout_ms {
        builder = builder.timeout(Duration::from_millis(timeout as u64));
    }

    builder = builder.connect_timeout(Duration::from_secs(30));

    if no_redirect {
        builder = builder.redirect(Policy::none());
    } else {
        let follow = req.follow_redirects.unwrap_or(true);
        if follow {
            let max = req.max_redirects.unwrap_or(10) as usize;
            builder = builder.redirect(Policy::limited(max));
        } else {
            builder = builder.redirect(Policy::none());
        }
    }

    let verify_ssl = req.verify_ssl.unwrap_or(true);
    if !verify_ssl {
        builder = builder.danger_accept_invalid_certs(true);
    }

    if let Some(ref proxy_config) = req.proxy {
        let mut proxy = Proxy::all(&proxy_config.url).map_err(|e| format!("Proxy error: {}", e))?;
        if let (Some(user), Some(pass)) = (&proxy_config.username, &proxy_config.password) {
            proxy = proxy.basic_auth(user, pass);
        }
        builder = builder.proxy(proxy);
    }

    builder.build().map_err(|e| format!("Client build error: {}", e))
}



fn build_url_with_params(base_url: &str, params: &HashMap<String, String>, api_key_param: Option<(&str, &str)>) -> Result<String, String> {
    let mut url = reqwest::Url::parse(base_url).map_err(|e| format!("Invalid URL: {}", e))?;

    {
        let mut query_pairs = url.query_pairs_mut();
        for (key, value) in params {
            query_pairs.append_pair(key, value);
        }
        if let Some((key, value)) = api_key_param {
            query_pairs.append_pair(key, value);
        }
    }

    Ok(url.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn rest_request(req: ApiRequest) -> Result<ApiResponse, String> {
    let start = Instant::now();

    let client = build_client(&req, false)?;

    let api_key_query = match &req.auth {
        AuthType::ApiKey { key, value, add_to: ApiKeyLocation::Query } => Some((key.as_str(), value.as_str())),
        _ => None,
    };

    let url = build_url_with_params(&req.url, &req.query_params, api_key_query)?;

    let method = method_to_reqwest(&req.method);
    let mut request_builder = client.request(method, &url);

    let mut headers = convert_headers(&req.headers);

    match &req.auth {
        AuthType::Basic { username, password } => {
            let credentials = format!("{}:{}", username, password);
            let encoded = BASE64.encode(credentials.as_bytes());
            if let Ok(value) = HeaderValue::from_str(&format!("Basic {}", encoded)) {
                headers.insert(AUTHORIZATION, value);
            }
        }
        AuthType::Bearer { token } => {
            if let Ok(value) = HeaderValue::from_str(&format!("Bearer {}", token)) {
                headers.insert(AUTHORIZATION, value);
            }
        }
        AuthType::ApiKey { key, value, add_to: ApiKeyLocation::Header } => {
            if let (Ok(name), Ok(val)) = (HeaderName::from_str(key), HeaderValue::from_str(value)) {
                headers.insert(name, val);
            }
        }
        AuthType::None | AuthType::ApiKey { .. } => {}
    }

    if !req.cookies.is_empty() {
        let cookie_str = build_cookie_header(&req.cookies);
        if let Ok(value) = HeaderValue::from_str(&cookie_str) {
            headers.insert(COOKIE, value);
        }
    }

    request_builder = request_builder.headers(headers.clone());

    request_builder = match &req.body {
        BodyType::None => request_builder,
        BodyType::Raw { content, content_type } => {
            let mut rb = request_builder.body(content.clone());
            if let Some(ct) = content_type {
                if let Ok(value) = HeaderValue::from_str(ct) {
                    rb = rb.header(CONTENT_TYPE, value);
                }
            }
            rb
        }
        BodyType::FormUrlEncoded { fields } => {
            request_builder.form(fields)
        }
        BodyType::Multipart { fields } => {
            let mut form = reqwest::multipart::Form::new();
            for field in fields {
                match &field.value {
                    MultipartValue::Text(text) => {
                        form = form.text(field.name.clone(), text.clone());
                    }
                    MultipartValue::File { data, filename, content_type } => {
                        let part = reqwest::multipart::Part::bytes(data.clone())
                            .file_name(filename.clone());
                        let part = if let Some(ct) = content_type {
                            part.mime_str(ct).ok()
                        } else {
                            Some(part)
                        };
                        if let Some(p) = part {
                            form = form.part(field.name.clone(), p);
                        }
                    }
                }
            }
            request_builder.multipart(form)
        }
        BodyType::Binary { data, .. } => {
            request_builder.body(data.clone())
        }
    };

    let redirects: Vec<RedirectEntry> = Vec::new();

    let response = request_builder.send().await;

    let response = match response {
        Ok(resp) => resp,
        Err(e) => {
            let elapsed = start.elapsed().as_millis() as u32;
            return Ok(ApiResponse {
                status: 0,
                status_text: "Request Failed".to_string(),
                headers: HashMap::new(),
                cookies: Vec::new(),
                body_base64: String::new(),
                body_size_bytes: 0,
                timing: TimingInfo { total_ms: elapsed },
                redirects: Vec::new(),
                remote_addr: None,
                http_version: "Unknown".to_string(),
                available_renderers: vec![ResponseRenderer::Raw],
                detected_content_type: None,
                error: Some(format_error(&e)),
            });
        }
    };

    let status = response.status().as_u16();
    let status_text_str = status_text(status);
    let http_version = http_version_string(response.version());
    let remote_addr = response.remote_addr().map(|a| a.to_string());

    let mut response_headers: HashMap<String, String> = HashMap::new();
    let mut response_cookies: Vec<Cookie> = Vec::new();

    for (name, value) in response.headers().iter() {
        let name_str = name.to_string();
        let value_str = value.to_str().unwrap_or("").to_string();

        if name_str.to_lowercase() == "set-cookie" {
            if let Some(cookie) = parse_set_cookie(&value_str) {
                response_cookies.push(cookie);
            }
        }

        if let Some(existing) = response_headers.get_mut(&name_str) {
            existing.push_str(", ");
            existing.push_str(&value_str);
        } else {
            response_headers.insert(name_str, value_str);
        }
    }

    let content_type = response_headers
        .get("content-type")
        .or_else(|| response_headers.get("Content-Type"))
        .cloned();

    let body_bytes = response.bytes().await.map_err(|e| format!("Body read error: {}", e))?;
    let body_size = body_bytes.len() as u32;
    let body_base64 = BASE64.encode(&body_bytes);

    let available_renderers = detect_renderers(content_type.as_deref(), &body_bytes);

    let elapsed = start.elapsed().as_millis() as u32;

    Ok(ApiResponse {
        status,
        status_text: status_text_str,
        headers: response_headers,
        cookies: response_cookies,
        body_base64,
        body_size_bytes: body_size,
        timing: TimingInfo { total_ms: elapsed },
        redirects,
        remote_addr,
        http_version,
        available_renderers,
        detected_content_type: content_type,
        error: None,
    })
}

fn format_error(e: &reqwest::Error) -> String {
    let mut msg = String::new();

    if e.is_timeout() {
        msg.push_str("Request timed out. ");
    }
    if e.is_connect() {
        msg.push_str("Connection failed. ");
    }
    if e.is_redirect() {
        msg.push_str("Too many redirects. ");
    }
    if e.is_body() {
        msg.push_str("Body error. ");
    }
    if e.is_decode() {
        msg.push_str("Decode error. ");
    }

    if let Some(url) = e.url() {
        msg.push_str(&format!("URL: {}. ", url));
    }

    msg.push_str(&e.to_string());
    msg
}
