use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_tungstenite::{
    connect_async_tls_with_config,
    tungstenite::{
        handshake::client::generate_key,
        http::Request,
        protocol::Message,
    },
    Connector,
};
use url::Url;

use crate::types::{
    WsClosedEvent, WsConnectRequest, WsConnectResponse, WsIncomingMessage, WsSendRequest,
};

/// A sender handle that lets us push outgoing frames into the live connection.
type WsSender = mpsc::UnboundedSender<Message>;

/// Global registry of active WebSocket connections keyed by connection_id.
pub struct WsRegistry(DashMap<String, WsSender>);

impl WsRegistry {
    pub fn new() -> Self {
        Self(DashMap::new())
    }

    pub fn insert(&self, id: String, tx: WsSender) {
        self.0.insert(id, tx);
    }

    pub fn remove(&self, id: &str) -> Option<(String, WsSender)> {
        self.0.remove(id)
    }

    pub fn get_sender(&self, id: &str) -> Option<WsSender> {
        self.0.get(id).map(|r| r.value().clone())
    }
}

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as f64
}

/// Build the event name for incoming messages for a given connection.
pub fn msg_event(connection_id: &str) -> String {
    format!("ws://message/{}", connection_id)
}

/// Build the event name for the close notification for a given connection.
pub fn closed_event(connection_id: &str) -> String {
    format!("ws://closed/{}", connection_id)
}

/// Establish a new WebSocket connection.
///
/// - Spawns a background task that owns the socket and forwards incoming frames
///   as Tauri events (`ws://message/<connection_id>`).
/// - Returns synchronously once the HTTP upgrade handshake completes (or fails).
/// - A channel sender is stored in `registry` so `ws_send` / `ws_disconnect`
///   can reach the background task.
#[tauri::command]
#[specta::specta]
pub async fn ws_connect(
    req: WsConnectRequest,
    app: AppHandle,
    registry: tauri::State<'_, Arc<WsRegistry>>,
) -> Result<WsConnectResponse, String> {
    // ── 1. Parse & validate URL ──────────────────────────────────────────────
    let parsed = Url::parse(&req.url).map_err(|e| format!("Invalid URL: {e}"))?;

    match parsed.scheme() {
        "ws" | "wss" => {}
        s => return Err(format!("Unsupported scheme '{s}'. Use ws:// or wss://")),
    }

    // ── 2. Build the HTTP upgrade request ───────────────────────────────────
    let host = parsed
        .host_str()
        .ok_or("URL has no host")?
        .to_string();

    let mut http_req_builder = Request::builder()
        .uri(req.url.as_str())
        .header("Host", &host)
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header("Sec-WebSocket-Key", generate_key());

    for proto in &req.protocols {
        http_req_builder =
            http_req_builder.header("Sec-WebSocket-Protocol", proto.as_str());
    }

    for (k, v) in &req.headers {
        http_req_builder = http_req_builder.header(k.as_str(), v.as_str());
    }

    let http_req = http_req_builder
        .body(())
        .map_err(|e| format!("Failed to build HTTP request: {e}"))?;

    // ── 3. Dial ──────────────────────────────────────────────────────────────
    let connector = if parsed.scheme() == "wss" {
        // Accept any cert in dev; could be made configurable via WsConnectRequest
        let tls = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(false)
            .build()
            .map_err(|e| format!("TLS setup error: {e}"))?;
        Some(Connector::NativeTls(tls))
    } else {
        None
    };

    let (ws_stream, upgrade_response) =
        connect_async_tls_with_config(http_req, None, false, connector)
            .await
            .map_err(|e| format!("Connection failed: {e}"))?;

    // ── 4. Collect handshake metadata ────────────────────────────────────────
    let status_code = upgrade_response.status().as_u16();
    let status_text = upgrade_response
        .status()
        .canonical_reason()
        .unwrap_or("Switching Protocols")
        .to_string();

    let response_headers: HashMap<String, String> = upgrade_response
        .headers()
        .iter()
        .map(|(k, v)| {
            (
                k.as_str().to_string(),
                v.to_str().unwrap_or("").to_string(),
            )
        })
        .collect();

    // ── 5. Spin up the background task ───────────────────────────────────────
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let (mut write, mut read) = ws_stream.split();

    let registry_arc = Arc::clone(&registry);
    let connection_id = req.connection_id.clone();
    let app_clone = app.clone();

    // Forward outgoing messages from the channel to the socket.
    let conn_id_write = connection_id.clone();
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if let Err(e) = write.send(msg).await {
                eprintln!("[ws] send error on {conn_id_write}: {e}");
                break;
            }
        }
        // Channel dropped or error — close the write half gracefully.
        let _ = write.close().await;
    });

    // Forward incoming messages from the socket to Tauri events.
    let conn_id_read = connection_id.clone();
    let registry_read = Arc::clone(&registry_arc);
    tokio::spawn(async move {
        while let Some(item) = read.next().await {
            match item {
                Ok(Message::Text(text)) => {
                    let evt = WsIncomingMessage {
                        connection_id: conn_id_read.clone(),
                        id: uuid::Uuid::new_v4().to_string(),
                        data: text.to_string(),
                        binary: false,
                        timestamp_ms: now_ms(),
                    };
                    let _ = app_clone.emit(&msg_event(&conn_id_read), evt);
                }
                Ok(Message::Binary(bytes)) => {
                    // Represent binary frames as a hex string so the frontend
                    // doesn't need to deal with raw bytes over IPC.
                    let hex: String = bytes
                        .iter()
                        .map(|b| format!("{b:02x}"))
                        .collect::<Vec<_>>()
                        .join(" ");
                    let evt = WsIncomingMessage {
                        connection_id: conn_id_read.clone(),
                        id: uuid::Uuid::new_v4().to_string(),
                        data: hex,
                        binary: true,
                        timestamp_ms: now_ms(),
                    };
                    let _ = app_clone.emit(&msg_event(&conn_id_read), evt);
                }
                Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => {
                    // Pings are handled automatically by tungstenite.
                }
                Ok(Message::Close(frame)) => {
                    let (code, reason) = frame
                        .map(|f| (f.code.into(), f.reason.to_string()))
                        .unwrap_or((1000u16, String::new()));
                    registry_read.remove(&conn_id_read);
                    let evt = WsClosedEvent {
                        connection_id: conn_id_read.clone(),
                        code,
                        reason,
                    };
                    let _ = app_clone.emit(&closed_event(&conn_id_read), evt);
                    break;
                }
                Ok(Message::Frame(_)) => {}
                Err(e) => {
                    registry_read.remove(&conn_id_read);
                    let evt = WsClosedEvent {
                        connection_id: conn_id_read.clone(),
                        code: 1006,
                        reason: e.to_string(),
                    };
                    let _ = app_clone.emit(&closed_event(&conn_id_read), evt);
                    break;
                }
            }
        }
    });

    // ── 6. Register the sender so ws_send / ws_disconnect can use it ─────────
    registry_arc.insert(req.connection_id.clone(), tx);

    Ok(WsConnectResponse {
        connection_id: req.connection_id,
        url: req.url,
        status_code,
        status_text,
        response_headers,
        error: None,
    })
}

/// Send a text or binary frame to an existing WebSocket connection.
#[tauri::command]
#[specta::specta]
pub async fn ws_send(
    req: WsSendRequest,
    registry: tauri::State<'_, Arc<WsRegistry>>,
) -> Result<(), String> {
    let sender = registry
        .get_sender(&req.connection_id)
        .ok_or_else(|| format!("No active connection '{}'", req.connection_id))?;

    let msg = if req.binary {
        // Expect a hex-encoded string from the frontend.
        let bytes: Result<Vec<u8>, _> = req
            .data
            .split_whitespace()
            .map(|s| u8::from_str_radix(s, 16))
            .collect();
        Message::Binary(
            bytes
                .map_err(|_| "Invalid hex-encoded binary data".to_string())?
                .into(),
        )
    } else {
        Message::Text(req.data.into())
    };

    sender
        .send(msg)
        .map_err(|_| format!("Connection '{}' is no longer open", req.connection_id))
}

/// Close an active WebSocket connection.
#[tauri::command]
#[specta::specta]
pub async fn ws_disconnect(
    connection_id: String,
    registry: tauri::State<'_, Arc<WsRegistry>>,
) -> Result<(), String> {
    if let Some((_, sender)) = registry.remove(&connection_id) {
        // Sending a Close frame will cause the write task to shut down.
        let _ = sender.send(Message::Close(None));
    }
    Ok(())
}
