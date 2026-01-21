use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use curl::easy::{Easy, HttpVersion, List};
use std::collections::HashMap;
use std::io::Read;
use std::time::Duration;
use url::Url;

use crate::types::{
    ApiKeyLocation, ApiRequest, ApiResponse, AuthType, BodyType, Cookie, HttpProtocol,
    Methods, ResponseRenderer, SizeInfo, TimingInfo,
};

fn method_to_curl_string(method: &Methods) -> &'static str {
    match method {
        Methods::GET => "GET",
        Methods::POST => "POST",
        Methods::PUT => "PUT",
        Methods::DELETE => "DELETE",
        Methods::PATCH => "PATCH",
        Methods::HEAD => "HEAD",
        Methods::OPTIONS => "OPTIONS",
        Methods::TRACE => "TRACE",
        Methods::CONNECT => "CONNECT",
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
    let is_xml_content_type =
        ct.contains("application/xml") || ct.contains("text/xml") || ct.contains("+xml");

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

fn build_url_with_params(
    base_url: &str,
    params: &HashMap<String, String>,
    api_key_param: Option<(&str, &str)>,
) -> Result<String, String> {
    let mut url = Url::parse(base_url).map_err(|e| format!("Invalid URL: {}", e))?;

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

fn execute_curl_request(req: ApiRequest) -> Result<ApiResponse, String> {
    let mut easy = Easy::new();

    let api_key_query = match &req.auth {
        AuthType::ApiKey {
            key,
            value,
            add_to: ApiKeyLocation::Query,
        } => Some((key.as_str(), value.as_str())),
        _ => None,
    };

    let url = build_url_with_params(&req.url, &req.query_params, api_key_query)?;
    easy.url(&url).map_err(|e| format!("URL error: {}", e))?;

    match req.method {
        Methods::GET => easy.get(true).map_err(|e| e.to_string())?,
        Methods::POST => easy.post(true).map_err(|e| e.to_string())?,
        Methods::PUT => easy.put(true).map_err(|e| e.to_string())?,
        Methods::HEAD => {
            easy.nobody(true).map_err(|e| e.to_string())?;
            easy.custom_request("HEAD").map_err(|e| e.to_string())?;
        }
        _ => {
            easy.custom_request(method_to_curl_string(&req.method))
                .map_err(|e| e.to_string())?;
        }
    }

    // Always use HTTP/2 over TCP (QUIC removed)
    easy.http_version(HttpVersion::V2TLS)
        .map_err(|e| e.to_string())?;

    if let Some(timeout) = req.timeout_ms {
        easy.timeout(Duration::from_millis(timeout as u64))
            .map_err(|e| e.to_string())?;
    }

    let follow = req.follow_redirects.unwrap_or(true);
    easy.follow_location(follow).map_err(|e| e.to_string())?;
    if follow {
        let max = req.max_redirects.unwrap_or(10);
        easy.max_redirections(max).map_err(|e| e.to_string())?;
    }

    let verify = req.verify_ssl.unwrap_or(true);
    easy.ssl_verify_peer(verify).map_err(|e| e.to_string())?;
    easy.ssl_verify_host(verify).map_err(|e| e.to_string())?;

    if let Some(ref proxy) = req.proxy {
        easy.proxy(&proxy.url).map_err(|e| e.to_string())?;
        if let (Some(user), Some(pass)) = (&proxy.username, &proxy.password) {
            easy.proxy_username(user).map_err(|e| e.to_string())?;
            easy.proxy_password(pass).map_err(|e| e.to_string())?;
        }
    }

    let mut header_list = List::new();

    for (key, val) in &req.headers {
        header_list
            .append(&format!("{}: {}", key, val))
            .map_err(|e| e.to_string())?;
    }

    match &req.auth {
        AuthType::Basic { username, password } => {
            easy.username(username).map_err(|e| e.to_string())?;
            easy.password(password).map_err(|e| e.to_string())?;
        }
        AuthType::Bearer { token } => {
            header_list
                .append(&format!("Authorization: Bearer {}", token))
                .map_err(|e| e.to_string())?;
        }
        AuthType::ApiKey {
            key,
            value,
            add_to: ApiKeyLocation::Header,
        } => {
            header_list
                .append(&format!("{}: {}", key, value))
                .map_err(|e| e.to_string())?;
        }
        AuthType::None | AuthType::ApiKey { .. } => {}
    }

    if !req.cookies.is_empty() {
        let cookie_str = build_cookie_header(&req.cookies);
        header_list
            .append(&format!("Cookie: {}", cookie_str))
            .map_err(|e| e.to_string())?;
    }

    let mut request_body_size: u32 = 0;
    let post_data: Option<Vec<u8>> = match &req.body {
        BodyType::None => None,
        BodyType::Raw { content, content_type } => {
            if let Some(ct) = content_type {
                header_list
                    .append(&format!("Content-Type: {}", ct))
                    .map_err(|e| e.to_string())?;
            }
            request_body_size = content.len() as u32;
            Some(content.as_bytes().to_vec())
        }
        BodyType::FormUrlEncoded { fields } => {
            let encoded: String = fields
                .iter()
                .map(|(k, v)| format!("{}={}", urlencoding(k), urlencoding(v)))
                .collect::<Vec<_>>()
                .join("&");
            header_list
                .append("Content-Type: application/x-www-form-urlencoded")
                .map_err(|e| e.to_string())?;
            request_body_size = encoded.len() as u32;
            Some(encoded.into_bytes())
        }
        BodyType::Multipart { fields } => {

            let boundary = format!("----WebKitFormBoundary{}", uuid_simple());
            let mut body = Vec::new();

            for field in fields {
                body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
                match &field.value {
                    crate::types::MultipartValue::Text(text) => {
                        body.extend_from_slice(
                            format!(
                                "Content-Disposition: form-data; name=\"{}\"\r\n\r\n",
                                field.name
                            )
                            .as_bytes(),
                        );
                        body.extend_from_slice(text.as_bytes());
                        body.extend_from_slice(b"\r\n");
                    }
                    crate::types::MultipartValue::File {
                        data,
                        filename,
                        content_type,
                    } => {
                        let ct = content_type
                            .as_ref()
                            .map(|s| s.as_str())
                            .unwrap_or("application/octet-stream");
                        body.extend_from_slice(
                            format!(
                                "Content-Disposition: form-data; name=\"{}\"; filename=\"{}\"\r\n",
                                field.name, filename
                            )
                            .as_bytes(),
                        );
                        body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", ct).as_bytes());
                        body.extend_from_slice(data);
                        body.extend_from_slice(b"\r\n");
                    }
                }
            }
            body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

            header_list
                .append(&format!(
                    "Content-Type: multipart/form-data; boundary={}",
                    boundary
                ))
                .map_err(|e| e.to_string())?;
            request_body_size = body.len() as u32;
            Some(body)
        }
        BodyType::Binary { data, .. } => {
            header_list
                .append("Content-Type: application/octet-stream")
                .map_err(|e| e.to_string())?;
            request_body_size = data.len() as u32;
            Some(data.clone())
        }
    };

    easy.http_headers(header_list)
        .map_err(|e| e.to_string())?;

    if let Some(ref data) = post_data {
        easy.post_field_size(data.len() as u64)
            .map_err(|e| e.to_string())?;
    }

    let mut response_headers_raw: Vec<u8> = Vec::new();
    let mut response_body: Vec<u8> = Vec::new();

    {
        let mut transfer = easy.transfer();

        transfer
            .header_function(|header| {
                response_headers_raw.extend_from_slice(header);
                true
            })
            .map_err(|e| e.to_string())?;

        transfer
            .write_function(|data| {
                response_body.extend_from_slice(data);
                Ok(data.len())
            })
            .map_err(|e| e.to_string())?;

        if let Some(ref data) = post_data {
            let mut data_reader = std::io::Cursor::new(data.clone());
            transfer
                .read_function(move |into| {
                    let read = data_reader.read(into).unwrap_or(0);
                    Ok(read)
                })
                .map_err(|e| e.to_string())?;
        }

        transfer.perform().map_err(|e| format_curl_error(&e))?;
    }

    let total_time = easy.total_time().unwrap_or_default().as_secs_f64() * 1000.0;
    let namelookup_time = easy.namelookup_time().unwrap_or_default().as_secs_f64() * 1000.0;
    let connect_time = easy.connect_time().unwrap_or_default().as_secs_f64() * 1000.0;
    let appconnect_time = easy.appconnect_time().unwrap_or_default().as_secs_f64() * 1000.0;
    let pretransfer_time = easy.pretransfer_time().unwrap_or_default().as_secs_f64() * 1000.0;
    let starttransfer_time = easy.starttransfer_time().unwrap_or_default().as_secs_f64() * 1000.0;

    let timing = TimingInfo {
        total_ms: total_time,
        dns_lookup_ms: namelookup_time,
        tcp_handshake_ms: (connect_time - namelookup_time).max(0.0),
        tls_handshake_ms: (appconnect_time - connect_time).max(0.0),
        transfer_start_ms: (pretransfer_time - appconnect_time).max(0.0),
        ttfb_ms: (starttransfer_time - pretransfer_time).max(0.0),
        content_download_ms: (total_time - starttransfer_time).max(0.0),
    };

    let request_header_size = easy.request_size().unwrap_or(0) as u32;
    let response_header_size = easy.header_size().unwrap_or(0) as u32;

    let request_size = SizeInfo {
        headers_bytes: request_header_size,
        body_bytes: request_body_size,
        total_bytes: request_header_size + request_body_size,
    };

    let response_size = SizeInfo {
        headers_bytes: response_header_size,
        body_bytes: response_body.len() as u32,
        total_bytes: response_header_size + response_body.len() as u32,
    };

    let headers_str = String::from_utf8_lossy(&response_headers_raw);
    let mut response_headers: HashMap<String, String> = HashMap::new();
    let mut response_cookies: Vec<Cookie> = Vec::new();
    let mut http_version = String::from("HTTP/1.1");

    for line in headers_str.lines() {
        if line.starts_with("HTTP/") {

            let parts: Vec<&str> = line.splitn(3, ' ').collect();
            if !parts.is_empty() {
                http_version = parts[0].to_string();
            }
        } else if let Some((name, value)) = line.split_once(':') {
            let name = name.trim().to_string();
            let value = value.trim().to_string();

            if name.to_lowercase() == "set-cookie" {
                if let Some(cookie) = parse_set_cookie(&value) {
                    response_cookies.push(cookie);
                }
            }

            if let Some(existing) = response_headers.get_mut(&name) {
                existing.push_str(", ");
                existing.push_str(&value);
            } else {
                response_headers.insert(name, value);
            }
        }
    }

    let status = easy.response_code().unwrap_or(0) as u16;
    let status_text_str = status_text(status);

    let content_type = response_headers
        .get("content-type")
        .or_else(|| response_headers.get("Content-Type"))
        .cloned();

    let available_renderers = detect_renderers(content_type.as_deref(), &response_body);

    let remote_addr = easy.primary_ip().ok().and_then(|opt| opt.map(|s| s.to_string()));

    let protocol_used = if http_version.contains("3") {
        "HTTP/3".to_string()
    } else if http_version.contains("2") {
        "HTTP/2".to_string()
    } else {
        http_version.clone()
    };

    let body_base64 = BASE64.encode(&response_body);

    Ok(ApiResponse {
        status,
        status_text: status_text_str,
        headers: response_headers,
        cookies: response_cookies,
        body_base64,
        timing,
        request_size,
        response_size,
        redirects: Vec::new(), // TODO: Track redirects if needed
        remote_addr,
        http_version,
        available_renderers,
        detected_content_type: content_type,
        protocol_used,
        error: None,
    })
}

fn format_curl_error(e: &curl::Error) -> String {
    let mut msg = String::new();

    if e.is_couldnt_resolve_host() {
        msg.push_str("Could not resolve host. ");
    }
    if e.is_couldnt_connect() {
        msg.push_str("Could not connect. ");
    }
    if e.is_operation_timedout() {
        msg.push_str("Operation timed out. ");
    }
    if e.is_ssl_connect_error() {
        msg.push_str("SSL connect error. ");
    }
    if e.is_peer_failed_verification() {
        msg.push_str("SSL certificate verification failed. ");
    }

    msg.push_str(&e.to_string());
    msg
}

fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{:x}{:x}", now.as_secs(), now.subsec_nanos())
}

#[tauri::command]
#[specta::specta]
pub async fn rest_request(req: ApiRequest) -> Result<ApiResponse, String> {

    tokio::task::spawn_blocking(move || execute_curl_request(req))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}
