use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use dashmap::DashMap;
use rumqttc::{
    AsyncClient, Event, Incoming, MqttOptions, QoS, Transport,
};
use tauri::{AppHandle, Emitter};
use tokio::task::JoinHandle;
use url::Url;

use crate::types::{
    MqttConnectRequest, MqttConnectResponse, MqttDisconnectedEvent, MqttIncomingMessage,
    MqttPublishRequest, MqttSubscribeRequest, MqttUnsubscribeRequest,
};

struct MqttConnection {
    client: AsyncClient,
    task: JoinHandle<()>,
}

pub struct MqttRegistry(DashMap<String, MqttConnection>);

impl MqttRegistry {
    pub fn new() -> Self {
        Self(DashMap::new())
    }

    fn insert(&self, id: String, connection: MqttConnection) -> Option<MqttConnection> {
        self.0.insert(id, connection)
    }

    fn remove(&self, id: &str) -> Option<(String, MqttConnection)> {
        self.0.remove(id)
    }

    fn get_client(&self, id: &str) -> Option<AsyncClient> {
        self.0.get(id).map(|entry| entry.client.clone())
    }
}

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as f64
}

fn mqtt_message_event(connection_id: &str) -> String {
    format!("mqtt://message/{connection_id}")
}

fn mqtt_disconnected_event(connection_id: &str) -> String {
    format!("mqtt://disconnected/{connection_id}")
}

fn qos_from_u8(value: u8) -> Result<QoS, String> {
    match value {
        0 => Ok(QoS::AtMostOnce),
        1 => Ok(QoS::AtLeastOnce),
        2 => Ok(QoS::ExactlyOnce),
        _ => Err(format!("Unsupported MQTT QoS level '{value}'")),
    }
}

fn effective_client_id(req: &MqttConnectRequest) -> String {
    if req.client_id.trim().is_empty() {
        format!("mandy-{}", uuid::Uuid::new_v4())
    } else {
        req.client_id.trim().to_string()
    }
}

fn build_mqtt_options(req: &MqttConnectRequest) -> Result<MqttOptions, String> {
    let parsed_url = Url::parse(&req.url).map_err(|e| format!("Invalid MQTT URL: {e}"))?;
    let host = parsed_url
        .host_str()
        .ok_or_else(|| "MQTT URL must include a host".to_string())?;

    let client_id = effective_client_id(req);

    let port = parsed_url
        .port_or_known_default()
        .ok_or_else(|| "MQTT URL must include a port or known scheme".to_string())?;

    let mut options = MqttOptions::new(client_id, host, port);
    options.set_clean_session(req.clean_session.unwrap_or(true));
    options.set_keep_alive(std::time::Duration::from_secs(
        req.keep_alive_secs.unwrap_or(30) as u64,
    ));

    let username = req
        .username
        .clone()
        .or_else(|| {
            if parsed_url.username().is_empty() {
                None
            } else {
                Some(parsed_url.username().to_string())
            }
        });
    let password = req.password.clone().or_else(|| parsed_url.password().map(str::to_string));

    if let Some(user) = username {
        options.set_credentials(user, password.unwrap_or_default());
    }

    if parsed_url.scheme() == "mqtts" || parsed_url.scheme() == "ssl" || parsed_url.scheme() == "tls" {
        options.set_transport(Transport::tls_with_default_config());
    }

    Ok(options)
}

#[tauri::command]
#[specta::specta]
pub async fn mqtt_connect(
    req: MqttConnectRequest,
    app: AppHandle,
    registry: tauri::State<'_, Arc<MqttRegistry>>,
) -> Result<MqttConnectResponse, String> {
    let client_id = effective_client_id(&req);
    let options = build_mqtt_options(&req)?;

    if let Some((_, previous)) = registry.remove(&req.connection_id) {
        let _ = previous.client.disconnect().await;
        previous.task.abort();
    }

    let (client, mut event_loop) = AsyncClient::new(options, 50);

    for subscription in &req.subscriptions {
        client
            .subscribe(subscription.topic.clone(), qos_from_u8(subscription.qos)?)
            .await
            .map_err(|e| format!("Subscribe failed for '{}': {e}", subscription.topic))?;
    }

    let conn_id = req.connection_id.clone();
    let conn_id_for_task = conn_id.clone();
    let app_handle = app.clone();
    let registry_for_task = Arc::clone(&registry);

    let task = tokio::spawn(async move {
        loop {
            match event_loop.poll().await {
                Ok(Event::Incoming(Incoming::Publish(message))) => {
                    let payload = String::from_utf8_lossy(&message.payload).to_string();
                    let evt = MqttIncomingMessage {
                        connection_id: conn_id_for_task.clone(),
                        id: uuid::Uuid::new_v4().to_string(),
                        topic: message.topic,
                        data: payload,
                        qos: match message.qos {
                            QoS::AtMostOnce => 0,
                            QoS::AtLeastOnce => 1,
                            QoS::ExactlyOnce => 2,
                        },
                        retain: message.retain,
                        timestamp_ms: now_ms(),
                    };
                    let _ = app_handle.emit(&mqtt_message_event(&conn_id_for_task), evt);
                }
                Ok(_) => {}
                Err(error) => {
                    registry_for_task.remove(&conn_id_for_task);
                    let _ = app_handle.emit(
                        &mqtt_disconnected_event(&conn_id_for_task),
                        MqttDisconnectedEvent {
                            connection_id: conn_id_for_task.clone(),
                            reason: error.to_string(),
                        },
                    );
                    break;
                }
            }
        }
    });

    if let Some(previous) = registry.insert(
        conn_id.clone(),
        MqttConnection {
            client: client.clone(),
            task,
        },
    ) {
        let _ = previous.client.disconnect().await;
        previous.task.abort();
    }

    Ok(MqttConnectResponse {
        connection_id: conn_id,
        url: req.url,
        client_id,
        error: None,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn mqtt_publish(
    req: MqttPublishRequest,
    registry: tauri::State<'_, Arc<MqttRegistry>>,
) -> Result<(), String> {
    let client = registry
        .get_client(&req.connection_id)
        .ok_or_else(|| format!("No active MQTT connection '{}'", req.connection_id))?;

    client
        .publish(
            req.topic,
            qos_from_u8(req.qos)?,
            req.retain.unwrap_or(false),
            req.data.into_bytes(),
        )
        .await
        .map_err(|e| format!("Publish failed: {e}"))
}

#[tauri::command]
#[specta::specta]
pub async fn mqtt_subscribe(
    req: MqttSubscribeRequest,
    registry: tauri::State<'_, Arc<MqttRegistry>>,
) -> Result<(), String> {
    let client = registry
        .get_client(&req.connection_id)
        .ok_or_else(|| format!("No active MQTT connection '{}'", req.connection_id))?;

    client
        .subscribe(req.topic, qos_from_u8(req.qos)?)
        .await
        .map_err(|e| format!("Subscribe failed: {e}"))
}

#[tauri::command]
#[specta::specta]
pub async fn mqtt_unsubscribe(
    req: MqttUnsubscribeRequest,
    registry: tauri::State<'_, Arc<MqttRegistry>>,
) -> Result<(), String> {
    let client = registry
        .get_client(&req.connection_id)
        .ok_or_else(|| format!("No active MQTT connection '{}'", req.connection_id))?;

    client
        .unsubscribe(req.topic)
        .await
        .map_err(|e| format!("Unsubscribe failed: {e}"))
}

#[tauri::command]
#[specta::specta]
pub async fn mqtt_disconnect(
    connection_id: String,
    registry: tauri::State<'_, Arc<MqttRegistry>>,
) -> Result<(), String> {
    if let Some((_, connection)) = registry.remove(&connection_id) {
        let _ = connection.client.disconnect().await;
        connection.task.abort();
    }
    Ok(())
}
