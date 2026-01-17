
use specta_typescript::Typescript;
use tauri_specta::{collect_commands, Builder};

mod window;
mod types;
mod helpers;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = Builder::<tauri::Wry>::new()
        .typ::<types::ApiRequest>()
        .typ::<types::ApiResponse>()
        .typ::<types::Methods>()
        .typ::<types::AuthType>()
        .typ::<types::BodyType>()
        .typ::<types::Cookie>()
        .typ::<types::ResponseRenderer>()
        .typ::<types::TimingInfo>()
        .typ::<types::RedirectEntry>()
        .commands(collect_commands![helpers::rest::rest_request]);

    #[cfg(debug_assertions)] // <- Only export on non-release builds
    builder
        .export(Typescript::default(), "../src/bindings.ts")
        .expect("Failed to export typescript bindings");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            window::effects(app);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
