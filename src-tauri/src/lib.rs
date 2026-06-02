use std::sync::Arc;
use specta_typescript::Typescript;
use tauri::Manager;

use tauri_specta::{collect_commands, Builder};

mod app_focus;
mod app_menu;
mod dock_badge;
mod helpers;
mod notifications;
mod macos_appearance;
#[cfg(target_os = "macos")]
mod macos_about_panel;
mod macos_tahoe_icon;
mod types;
mod window;

use helpers::websocket::WsRegistry;
use helpers::socketio::SioRegistry;
use helpers::mqtt::MqttRegistry;
use helpers::sse::SseRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = Builder::<tauri::Wry>::new()
        // ── REST types ──────────────────────────────────────────────────────
        .typ::<types::ApiRequest>()
        .typ::<types::ApiResponse>()
        .typ::<types::Methods>()
        .typ::<types::AuthType>()
        .typ::<types::OAuth2Mode>()
        .typ::<types::BodyType>()
        .typ::<types::Cookie>()
        .typ::<types::ResponseRenderer>()
        .typ::<types::TimingInfo>()
        .typ::<types::RedirectEntry>()
        .typ::<types::OAuth2TokenRequest>()
        .typ::<types::OAuth2TokenResponse>()
        .typ::<types::RestStreamEvent>()
        .typ::<types::RestStreamEventKind>()
        // ── WebSocket types ─────────────────────────────────────────────────
        .typ::<types::WsConnectRequest>()
        .typ::<types::WsConnectResponse>()
        .typ::<types::WsIncomingMessage>()
        .typ::<types::WsClosedEvent>()
        .typ::<types::WsSendRequest>()
        // ── Socket.IO types ─────────────────────────────────────────────────
        .typ::<types::SioConnectRequest>()
        .typ::<types::SioConnectResponse>()
        .typ::<types::SioIncomingMessage>()
        .typ::<types::SioDisconnectedEvent>()
        .typ::<types::SioEmitRequest>()
        .typ::<types::SioEmitAckRequest>()
        .typ::<types::SioEmitAckResponse>()
        // ── MQTT types ───────────────────────────────────────────────────────
        .typ::<types::MqttSubscription>()
        .typ::<types::MqttConnectRequest>()
        .typ::<types::MqttConnectResponse>()
        .typ::<types::MqttIncomingMessage>()
        .typ::<types::MqttDisconnectedEvent>()
        .typ::<types::MqttPublishRequest>()
        .typ::<types::MqttSubscribeRequest>()
        .typ::<types::MqttUnsubscribeRequest>()
        // ── SSE types ────────────────────────────────────────────────────────
        .typ::<types::SseConnectRequest>()
        .typ::<types::SseConnectResponse>()
        .typ::<types::SseIncomingMessage>()
        .typ::<types::SseDisconnectedEvent>()
        // ── gRPC types ───────────────────────────────────────────────────────
        .typ::<types::GrpcCallRequest>()
        .typ::<types::GrpcCallResponse>()
        // ── GraphQL types ────────────────────────────────────────────────────
        .typ::<types::GraphQLIntrospectRequest>()
        .typ::<types::GraphQLIntrospectResponse>()
        // ── Generic fetch type ───────────────────────────────────────────────
        .typ::<types::FetchUrlResponse>()
        // ── Commands ─────────────────────────────────────────────────────────
        .commands(collect_commands![
            helpers::rest::rest_request,
            helpers::rest::rest_cancel_request,
            helpers::rest::rest_oauth2_token,
            helpers::rest::fetch_url,
            dock_badge::set_dock_badge,
            helpers::websocket::ws_connect,
            helpers::websocket::ws_send,
            helpers::websocket::ws_disconnect,
            helpers::graphql::graphql_introspect,
            helpers::socketio::sio_connect,
            helpers::socketio::sio_emit,
            helpers::socketio::sio_emit_with_ack,
            helpers::socketio::sio_disconnect,
            helpers::mqtt::mqtt_connect,
            helpers::mqtt::mqtt_publish,
            helpers::mqtt::mqtt_subscribe,
            helpers::mqtt::mqtt_unsubscribe,
            helpers::mqtt::mqtt_disconnect,
            helpers::sse::sse_connect,
            helpers::sse::sse_disconnect,
            helpers::grpc::grpc_call,
        ]);

    #[cfg(debug_assertions)]
    builder
        .export(Typescript::default(), "../src/bindings.ts")
        .expect("Failed to export typescript bindings");

    let ws_registry = Arc::new(WsRegistry::new());
    let sio_registry = Arc::new(SioRegistry::new());
    let mqtt_registry = Arc::new(MqttRegistry::new());
    let sse_registry = Arc::new(SseRegistry::new());

    let mut tauri_builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_liquid_glass::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(app_focus::AppFocusState::new())
        .manage(ws_registry)
        .manage(sio_registry)
        .manage(mqtt_registry)
        .manage(sse_registry)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(focused) = event {
                if let Some(state) = window.app_handle().try_state::<app_focus::AppFocusState>() {
                    state.set_focused(*focused);
                }
            }
        });

    #[cfg(target_os = "macos")]
    {
        tauri_builder = tauri_builder.plugin(tauri_plugin_macos_haptics::init());
    }

    #[cfg(target_os = "macos")]
    {
        tauri_builder = tauri_builder.on_menu_event(|app, event| {
            if event.id() == "about" {
                macos_about_panel::show_about_panel(app);
            }
        });
    }

    tauri_builder
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            notifications::init(app.handle());
            app_menu::set_app_menu(app.handle())?;
            macos_tahoe_icon::init_tahoe_app_icon(app.handle().clone());
            window::effects(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
