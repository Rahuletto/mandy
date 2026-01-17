use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Type, Clone)]
pub enum Methods {
    GET,
    POST,
    PUT,
    DELETE,
    PATCH,
    HEAD,
    OPTIONS,
    TRACE,
    CONNECT,
}

#[derive(Serialize, Deserialize, Type, Clone)]
pub enum AuthType {
    None,
    Basic { username: String, password: String },
    Bearer { token: String },
    ApiKey { key: String, value: String, add_to: ApiKeyLocation },
}

#[derive(Serialize, Deserialize, Type, Clone)]
pub enum ApiKeyLocation {
    Header,
    Query,
}

#[derive(Serialize, Deserialize, Type, Clone)]
pub enum BodyType {
    None,
    Raw { content: String, content_type: Option<String> },
    FormUrlEncoded { fields: HashMap<String, String> },
    Multipart { fields: Vec<MultipartField> },
    Binary { data: Vec<u8>, filename: Option<String> },
}

#[derive(Serialize, Deserialize, Type, Clone)]
pub struct MultipartField {
    pub name: String,
    pub value: MultipartValue,
}

#[derive(Serialize, Deserialize, Type, Clone)]
pub enum MultipartValue {
    Text(String),
    File { data: Vec<u8>, filename: String, content_type: Option<String> },
}

#[derive(Serialize, Deserialize, Type, Clone)]
pub struct Cookie {
    pub name: String,
    pub value: String,
    pub domain: Option<String>,
    pub path: Option<String>,
    pub expires: Option<String>,
    pub http_only: Option<bool>,
    pub secure: Option<bool>,
}

#[derive(Serialize, Deserialize, Type, Clone, Default)]
pub enum HttpProtocol {
    #[default]
    Tcp,   // HTTP/1.1 or HTTP/2 over TCP
    Quic,  // HTTP/3 over QUIC
}

#[derive(Serialize, Deserialize, Type, Clone)]
pub struct ApiRequest {
    pub method: Methods,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: BodyType,
    pub auth: AuthType,
    pub query_params: HashMap<String, String>,
    pub cookies: Vec<Cookie>,
    pub timeout_ms: Option<u32>,
    pub follow_redirects: Option<bool>,
    pub max_redirects: Option<u32>,
    pub verify_ssl: Option<bool>,
    pub proxy: Option<ProxyConfig>,
    pub protocol: Option<HttpProtocol>,
}

#[derive(Serialize, Deserialize, Type, Clone)]
pub struct ProxyConfig {
    pub url: String,
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Serialize, Deserialize, Type, Clone, PartialEq)]
pub enum ResponseRenderer {
    Raw,
    Json,
    Xml,
    Html,
    HtmlPreview,
    Image,
    Audio,
    Video,
    Pdf,
}

#[derive(Serialize, Deserialize, Type, Clone)]
pub struct RedirectEntry {
    pub url: String,
    pub status: u16,
}

#[derive(Serialize, Deserialize, Type, Clone)]
pub struct TimingInfo {
    pub total_ms: f64,
    
    pub dns_lookup_ms: f64,
    pub tcp_handshake_ms: f64,
    pub tls_handshake_ms: f64,
    pub transfer_start_ms: f64,  
    pub ttfb_ms: f64,           
    pub content_download_ms: f64,
}

#[derive(Serialize, Deserialize, Type, Clone)]
pub struct SizeInfo {
    pub headers_bytes: u32,
    pub body_bytes: u32,
    pub total_bytes: u32,
}

#[derive(Serialize, Deserialize, Type)]
pub struct ApiResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub cookies: Vec<Cookie>,
    pub body_base64: String,
    pub timing: TimingInfo,
    pub request_size: SizeInfo,
    pub response_size: SizeInfo,
    pub redirects: Vec<RedirectEntry>,
    pub remote_addr: Option<String>,
    pub http_version: String,
    pub available_renderers: Vec<ResponseRenderer>,
    pub detected_content_type: Option<String>,
    pub protocol_used: String, 
    pub error: Option<String>,
}

impl Default for ApiRequest {
    fn default() -> Self {
        Self {
            method: Methods::GET,
            url: String::new(),
            headers: HashMap::new(),
            body: BodyType::None,
            auth: AuthType::None,
            query_params: HashMap::new(),
            cookies: Vec::new(),
            timeout_ms: Some(30000),
            follow_redirects: Some(true),
            max_redirects: Some(10),
            verify_ssl: Some(true),
            proxy: None,
            protocol: None,
        }
    }
}
