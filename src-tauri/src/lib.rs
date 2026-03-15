use std::sync::Arc;
use specta_typescript::Typescript;

use tauri_specta::{collect_commands, Builder};

mod helpers;
mod types;
mod window;

use helpers::websocket::WsRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = Builder::<tauri::Wry>::new()
        // ── REST types ──────────────────────────────────────────────────────
        .typ::<types::ApiRequest>()
        .typ::<types::ApiResponse>()
        .typ::<types::Methods>()
        .typ::<types::AuthType>()
        .typ::<types::BodyType>()
        .typ::<types::Cookie>()
        .typ::<types::ResponseRenderer>()
        .typ::<types::TimingInfo>()
        .typ::<types::RedirectEntry>()
        // ── WebSocket types ─────────────────────────────────────────────────
        .typ::<types::WsConnectRequest>()
        .typ::<types::WsConnectResponse>()
        .typ::<types::WsIncomingMessage>()
        .typ::<types::WsClosedEvent>()
        .typ::<types::WsSendRequest>()
        // ── GraphQL types ────────────────────────────────────────────────────
        .typ::<types::GraphQLIntrospectRequest>()
        .typ::<types::GraphQLIntrospectResponse>()
        // ── Generic fetch type ───────────────────────────────────────────────
        .typ::<types::FetchUrlResponse>()
        // ── Commands ─────────────────────────────────────────────────────────
        .commands(collect_commands![
            helpers::rest::rest_request,
            helpers::rest::fetch_url,
            helpers::websocket::ws_connect,
            helpers::websocket::ws_send,
            helpers::websocket::ws_disconnect,
            helpers::graphql::graphql_introspect,
        ]);

    #[cfg(debug_assertions)]
    builder
        .export(Typescript::default(), "../src/bindings.ts")
        .expect("Failed to export typescript bindings");

    let ws_registry = Arc::new(WsRegistry::new());

    let mut tauri_builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(ws_registry);

    #[cfg(target_os = "macos")]
    {
        tauri_builder = tauri_builder.plugin(tauri_plugin_macos_haptics::init());
    }

    tauri_builder
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            window::effects(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
