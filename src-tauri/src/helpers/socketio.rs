use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use dashmap::DashMap;
use rust_socketio::asynchronous::{Client, ClientBuilder};
use rust_socketio::{Payload, TransportType};
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Mutex};
use tokio::time::{timeout, Duration};

use crate::types::{
    SioConnectRequest, SioConnectResponse, SioDisconnectedEvent, SioEmitAckRequest,
    SioEmitAckResponse, SioEmitRequest, SioIncomingMessage,
};

pub struct SioRegistry(DashMap<String, Client>);

impl SioRegistry {
    pub fn new() -> Self {
        Self(DashMap::new())
    }

    pub fn insert(&self, id: String, client: Client) -> Option<Client> {
        self.0.insert(id, client)
    }

    pub fn remove(&self, id: &str) -> Option<(String, Client)> {
        self.0.remove(id)
    }

    pub fn get_client(&self, id: &str) -> Option<Client> {
        self.0.get(id).map(|r| r.value().clone())
    }
}

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as f64
}

const SIO_CONNECT_TIMEOUT_SECS: u64 = 15;
const SIO_RECONNECT_DELAY_MIN_MS: u64 = 300;
const SIO_RECONNECT_DELAY_MAX_MS: u64 = 5_000;
const SIO_MAX_RECONNECT_ATTEMPTS: u8 = 20;
const ACK_IPC_BUFFER_MS: u64 = 250;

pub fn msg_event(connection_id: &str) -> String {
    format!("sio://message/{}", connection_id)
}

pub fn disconnected_event(connection_id: &str) -> String {
    format!("sio://disconnected/{}", connection_id)
}

fn transport_from_request(transport: Option<&str>) -> TransportType {
    match transport.unwrap_or("websocket") {
        "polling" => TransportType::Polling,
        "websocket-upgrade" => TransportType::WebsocketUpgrade,
        "auto" => TransportType::Any,
        _ => TransportType::Websocket,
    }
}

fn payload_to_string(payload: Payload) -> String {
    match payload {
        Payload::Text(values) => {
            if values.is_empty() {
                String::new()
            } else if values.len() == 1 {
                values[0].to_string()
            } else {
                serde_json::Value::Array(values).to_string()
            }
        }
        Payload::Binary(bytes) => bytes
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<Vec<_>>()
            .join(" "),
        _ => String::new(),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn sio_connect(
    req: SioConnectRequest,
    app: AppHandle,
    registry: tauri::State<'_, Arc<SioRegistry>>,
) -> Result<SioConnectResponse, String> {
    let namespace = req.namespace.clone().unwrap_or_else(|| "/".to_string());
    let connection_id = req.connection_id.clone();
    let url = req.url.clone();

    let conn_id_msg = connection_id.clone();
    let app_msg = app.clone();

    let conn_id_disc = connection_id.clone();
    let app_disc = app.clone();
    let registry_disc = Arc::clone(&registry);

    let mut builder = ClientBuilder::new(&req.url)
        .namespace(&namespace)
        .transport_type(transport_from_request(req.transport.as_deref()))
        .reconnect(req.reconnect.unwrap_or(true))
        .reconnect_on_disconnect(req.reconnect_on_disconnect.unwrap_or(false))
        .reconnect_delay(
            req.reconnect_delay_min_ms
                .map(|value| value as u64)
                .unwrap_or(SIO_RECONNECT_DELAY_MIN_MS),
            req.reconnect_delay_max_ms
                .map(|value| value as u64)
                .unwrap_or(SIO_RECONNECT_DELAY_MAX_MS),
        )
        .max_reconnect_attempts(
            req.max_reconnect_attempts
                .unwrap_or(SIO_MAX_RECONNECT_ATTEMPTS),
        )
        .on_any(move |event, payload, _client| {
            let conn_id = conn_id_msg.clone();
            let app_handle = app_msg.clone();
            Box::pin(async move {
                let data = payload_to_string(payload);

                let evt = SioIncomingMessage {
                    connection_id: conn_id.clone(),
                    id: uuid::Uuid::new_v4().to_string(),
                    event: event.as_str().to_string(),
                    data,
                    timestamp_ms: now_ms(),
                };
                let _ = app_handle.emit(&msg_event(&conn_id), evt);
            })
        })
        .on("disconnect", move |_payload, _client| {
            let conn_id = conn_id_disc.clone();
            let app_handle = app_disc.clone();
            let reg = Arc::clone(&registry_disc);
            Box::pin(async move {
                reg.remove(&conn_id);
                let evt = SioDisconnectedEvent {
                    connection_id: conn_id.clone(),
                    reason: "server disconnect".to_string(),
                };
                let _ = app_handle.emit(&disconnected_event(&conn_id), evt);
            })
        });

    // Add custom headers
    for (k, v) in &req.headers {
        builder = builder.opening_header(k.as_str(), v.as_str());
    }

    // Add auth payload if provided
    if let Some(auth_json) = &req.auth {
        let auth_val = serde_json::from_str::<serde_json::Value>(auth_json)
            .map_err(|e| format!("Invalid Socket.IO auth payload JSON: {e}"))?;
        builder = builder.auth(auth_val);
    }

    // Ensure a stale connection with the same ID does not survive.
    if let Some((_, old_client)) = registry.remove(&connection_id) {
        let _ = old_client.disconnect().await;
    }

    let client = timeout(Duration::from_secs(SIO_CONNECT_TIMEOUT_SECS), builder.connect())
        .await
        .map_err(|_| {
            format!(
                "Socket.IO connection timed out after {}s",
                SIO_CONNECT_TIMEOUT_SECS
            )
        })?
        .map_err(|e| format!("Socket.IO connection failed: {e}"))?;

    if let Some(previous_client) = registry.insert(connection_id.clone(), client) {
        // In case of a connect race for the same connection_id, ensure only the
        // newest client stays alive.
        let _ = previous_client.disconnect().await;
    }

    Ok(SioConnectResponse {
        connection_id,
        url,
        namespace,
        error: None,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn sio_emit(
    req: SioEmitRequest,
    registry: tauri::State<'_, Arc<SioRegistry>>,
) -> Result<(), String> {
    let client = registry
        .get_client(&req.connection_id)
        .ok_or_else(|| format!("No active Socket.IO connection '{}'", req.connection_id))?;

    let payload: serde_json::Value = serde_json::from_str(&req.data)
        .unwrap_or_else(|_| serde_json::Value::String(req.data.clone()));

    client
        .emit(req.event.as_str(), payload)
        .await
        .map_err(|e| format!("Emit failed: {e}"))
}

#[tauri::command]
#[specta::specta]
pub async fn sio_emit_with_ack(
    req: SioEmitAckRequest,
    registry: tauri::State<'_, Arc<SioRegistry>>,
) -> Result<SioEmitAckResponse, String> {
    let client = registry
        .get_client(&req.connection_id)
        .ok_or_else(|| format!("No active Socket.IO connection '{}'", req.connection_id))?;

    let payload: serde_json::Value = serde_json::from_str(&req.data)
        .unwrap_or_else(|_| serde_json::Value::String(req.data.clone()));

    let (tx, rx) = oneshot::channel::<String>();
    let sender = Arc::new(Mutex::new(Some(tx)));

    client
        .emit_with_ack(
            req.event.as_str(),
            payload,
            Duration::from_millis(req.timeout_ms as u64),
            {
                let sender = Arc::clone(&sender);
                move |payload, _client| {
                    let sender = Arc::clone(&sender);
                    Box::pin(async move {
                        let mut guard = sender.lock().await;
                        if let Some(tx) = guard.take() {
                            let _ = tx.send(payload_to_string(payload));
                        }
                    })
                }
            },
        )
        .await
        .map_err(|e| format!("Emit with ack failed: {e}"))?;

    match timeout(Duration::from_millis(req.timeout_ms as u64 + ACK_IPC_BUFFER_MS), rx).await {
        Ok(Ok(data)) => Ok(SioEmitAckResponse {
            event: req.event,
            data,
            timed_out: false,
        }),
        _ => Ok(SioEmitAckResponse {
            event: req.event,
            data: String::new(),
            timed_out: true,
        }),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn sio_disconnect(
    connection_id: String,
    registry: tauri::State<'_, Arc<SioRegistry>>,
) -> Result<(), String> {
    if let Some((_, client)) = registry.remove(&connection_id) {
        client
            .disconnect()
            .await
            .map_err(|e| format!("Disconnect failed: {e}"))?;
    }
    Ok(())
}
