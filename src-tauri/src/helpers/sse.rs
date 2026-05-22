use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use dashmap::DashMap;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, ACCEPT};
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;
use tokio::task::JoinHandle;
use url::Url;

use crate::helpers::auth::apply_auth_to_headers;
use crate::types::{
    AuthType, SseConnectRequest, SseConnectResponse, SseDisconnectedEvent, SseIncomingMessage,
};

struct SseConnection {
    cancel: watch::Sender<bool>,
    task: JoinHandle<()>,
}

pub struct SseRegistry(DashMap<String, SseConnection>);

impl SseRegistry {
    pub fn new() -> Self {
        Self(DashMap::new())
    }

    fn insert(&self, id: String, connection: SseConnection) -> Option<SseConnection> {
        self.0.insert(id, connection)
    }

    fn remove(&self, id: &str) -> Option<(String, SseConnection)> {
        self.0.remove(id)
    }
}

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as f64
}

fn message_event(connection_id: &str) -> String {
    format!("sse://message/{connection_id}")
}

fn disconnected_event(connection_id: &str) -> String {
    format!("sse://disconnected/{connection_id}")
}

struct SseEventBuilder {
    event: String,
    data_lines: Vec<String>,
    id: Option<String>,
}

impl SseEventBuilder {
    fn new() -> Self {
        Self {
            event: "message".to_string(),
            data_lines: Vec::new(),
            id: None,
        }
    }

    fn take_message(&mut self) -> Option<(String, String, Option<String>)> {
        if self.data_lines.is_empty() {
            return None;
        }
        let data = self.data_lines.join("\n");
        let event_name = if self.event.is_empty() {
            "message".to_string()
        } else {
            std::mem::take(&mut self.event)
        };
        self.event = "message".to_string();
        let id = self.id.take();
        self.data_lines.clear();
        Some((event_name, data, id))
    }
}

fn build_header_map(headers: &HashMap<String, String>, auth: &AuthType) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    let mut merged = headers.clone();
    apply_auth_to_headers(&mut merged, auth);

    for (key, value) in merged {
        if key.eq_ignore_ascii_case("accept") {
            continue;
        }
        let name = HeaderName::try_from(key.as_str())
            .map_err(|e| format!("Invalid header name '{key}': {e}"))?;
        let val = HeaderValue::try_from(value.as_str())
            .map_err(|e| format!("Invalid header value for '{key}': {e}"))?;
        map.insert(name, val);
    }

    map.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
    Ok(map)
}

fn apply_last_event_id(headers: &mut HeaderMap, last_event_id: Option<&str>) {
    if let Some(id) = last_event_id.filter(|s| !s.is_empty()) {
        if let Ok(val) = HeaderValue::from_str(id) {
            if let Ok(name) = HeaderName::try_from("Last-Event-ID") {
                headers.insert(name, val);
            }
        }
    }
}

fn process_sse_chunk(buffer: &mut String, builder: &mut SseEventBuilder) -> Vec<(String, String, Option<String>)> {
    let mut out = Vec::new();
    loop {
        let pos = match buffer.find("\n\n") {
            Some(p) => p,
            None => break,
        };
        let block = buffer.drain(..pos + 2).collect::<String>();
        for line in block.lines() {
            let line = line.strip_suffix('\r').unwrap_or(line);
            if line.is_empty() {
                continue;
            }
            if let Some(rest) = line.strip_prefix("event:") {
                builder.event = rest.trim().to_string();
            } else if let Some(rest) = line.strip_prefix("data:") {
                builder.data_lines.push(rest.trim_start().to_string());
            } else if let Some(rest) = line.strip_prefix("id:") {
                builder.id = Some(rest.trim().to_string());
            } else if line.starts_with(':') {
                // comment / heartbeat
            }
        }
        if let Some(msg) = builder.take_message() {
            out.push(msg);
        } else if !builder.data_lines.is_empty() || builder.id.is_some() {
            // partial without blank line — wait for next block
        }
    }
    out
}

#[tauri::command]
#[specta::specta]
pub async fn sse_connect(
    req: SseConnectRequest,
    app: AppHandle,
    registry: tauri::State<'_, Arc<SseRegistry>>,
) -> Result<SseConnectResponse, String> {
    let parsed = Url::parse(&req.url).map_err(|e| format!("Invalid URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => {}
        s => return Err(format!("Unsupported scheme '{s}'. Use http:// or https://")),
    }

    if let Some((_, previous)) = registry.remove(&req.connection_id) {
        let _ = previous.cancel.send(true);
        previous.task.abort();
    }

    let mut header_map = build_header_map(&req.headers, &req.auth)?;
    apply_last_event_id(&mut header_map, req.last_event_id.as_deref());
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let (cancel_tx, cancel_rx) = watch::channel(false);
    let conn_id = req.connection_id.clone();
    let conn_id_task = conn_id.clone();
    let url = req.url.clone();
    let app_handle = app.clone();
    let registry_arc = Arc::clone(&registry);

    let task = tokio::spawn(async move {
        let mut cancel_rx = cancel_rx;
        let response = client.get(&url).headers(header_map).send().await;

        let response = match response {
            Ok(r) => r,
            Err(e) => {
                registry_arc.remove(&conn_id_task);
                let _ = app_handle.emit(
                    &disconnected_event(&conn_id_task),
                    SseDisconnectedEvent {
                        connection_id: conn_id_task.clone(),
                        reason: e.to_string(),
                    },
                );
                return;
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            registry_arc.remove(&conn_id_task);
            let _ = app_handle.emit(
                &disconnected_event(&conn_id_task),
                SseDisconnectedEvent {
                    connection_id: conn_id_task.clone(),
                    reason: format!("HTTP {status}: {body}"),
                },
            );
            return;
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut builder = SseEventBuilder::new();

        loop {
            if *cancel_rx.borrow() {
                break;
            }

            let next = tokio::select! {
                biased;
                _ = cancel_rx.changed() => {
                    if *cancel_rx.borrow() {
                        break;
                    }
                    continue;
                }
                chunk = stream.next() => chunk,
            };

            let Some(chunk) = next else {
                break;
            };

            let chunk = match chunk {
                Ok(c) => c,
                Err(e) => {
                    registry_arc.remove(&conn_id_task);
                    let _ = app_handle.emit(
                        &disconnected_event(&conn_id_task),
                        SseDisconnectedEvent {
                            connection_id: conn_id_task.clone(),
                            reason: e.to_string(),
                        },
                    );
                    return;
                }
            };

            buffer.push_str(&String::from_utf8_lossy(&chunk));
            for (event, data, sse_id) in process_sse_chunk(&mut buffer, &mut builder) {
                let evt = SseIncomingMessage {
                    connection_id: conn_id_task.clone(),
                    id: uuid::Uuid::new_v4().to_string(),
                    event,
                    data,
                    timestamp_ms: now_ms(),
                    sse_id,
                };
                let _ = app_handle.emit(&message_event(&conn_id_task), evt);
            }
        }

        registry_arc.remove(&conn_id_task);
        let _ = app_handle.emit(
            &disconnected_event(&conn_id_task),
            SseDisconnectedEvent {
                connection_id: conn_id_task,
                reason: "Connection closed".to_string(),
            },
        );
    });

    if let Some(previous) = registry.insert(
        conn_id.clone(),
        SseConnection {
            cancel: cancel_tx,
            task,
        },
    ) {
        let _ = previous.cancel.send(true);
        previous.task.abort();
    }

    Ok(SseConnectResponse {
        connection_id: conn_id,
        url: req.url,
        error: None,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn sse_disconnect(
    connection_id: String,
    registry: tauri::State<'_, Arc<SseRegistry>>,
) -> Result<(), String> {
    if let Some((_, conn)) = registry.remove(&connection_id) {
        let _ = conn.cancel.send(true);
        conn.task.abort();
    }
    Ok(())
}
