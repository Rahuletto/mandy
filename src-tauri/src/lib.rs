use serde::{Deserialize, Serialize};
use specta_typescript::Typescript;
use specta::Type;

use tauri_specta::{collect_commands, Builder};
use std::collections::HashMap;
use std::str::FromStr;
use reqwest::{Client};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};

#[derive(Serialize, Deserialize, Type)]
pub enum Methods {
    GET,
    POST,
    PUT,
    DELETE,
    PATCH,
    HEAD,
}

#[derive(Serialize, Deserialize, Type)]
pub struct ApiRequest {
    method: Methods,
    url: String,
    headers: HashMap<String, String>,
    body: String,
}

#[derive(Serialize, Deserialize, Type)]
pub struct ApiResponse {
    status: u16,
    headers: HashMap<String, String>,
    raw_body: String,

     #[specta(skip)]
    json_body: Option<serde_json::Value>,

    time_ms: u32
}

fn convert_headers(map: HashMap<String, String>) -> HeaderMap {
    let mut headers = HeaderMap::new();

    for (key, val) in map {
        if let Ok(name) = HeaderName::from_str(&key) {
            if let Ok(value) = HeaderValue::from_str(&val) {
                headers.insert(name, value);
            }
        }
    }

    headers
}

#[tauri::command]
#[specta::specta]
async fn rest_request(req: ApiRequest) -> Result<ApiResponse, String> {
    let client = Client::new();
    let start = std::time::Instant::now();
    let response = match req.method {
        Methods::GET => client.get(&req.url).headers(convert_headers(req.headers)).send().await,
        Methods::POST => client.post(&req.url).headers(convert_headers(req.headers)).body(req.body).send().await,
        Methods::PUT => client.put(&req.url).headers(convert_headers(req.headers)).body(req.body).send().await,
        Methods::DELETE => client.delete(&req.url).headers(convert_headers(req.headers)).send().await,
        Methods::PATCH => client.patch(&req.url).headers(convert_headers(req.headers)).body(req.body).send().await,
        Methods::HEAD => client.head(&req.url).headers(convert_headers(req.headers)).send().await,
    };
    let response = response.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let headers = response.headers().iter().map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string())).collect();
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let parsed_json: Option<serde_json::Value> =
        serde_json::from_slice(&bytes).ok();
    let raw = String::from_utf8_lossy(&bytes).to_string();

    let time_ms = start.elapsed().as_millis();
    Ok(ApiResponse { status, headers, raw_body: raw,
        json_body: parsed_json, time_ms: time_ms.try_into().unwrap() })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = Builder::<tauri::Wry>::new().typ::<ApiRequest>().typ::<ApiResponse>().typ::<Methods>()
        .commands(collect_commands![rest_request]);

    #[cfg(debug_assertions)] // <- Only export on non-release builds
    builder
        .export(Typescript::default(), "../src/bindings.ts")
        .expect("Failed to export typescript bindings");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
