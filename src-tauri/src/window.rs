use tauri::Manager;

#[cfg(target_os = "macos")]
use tauri_plugin_liquid_glass::{GlassMaterialVariant, LiquidGlassConfig, LiquidGlassExt};

#[cfg(target_os = "windows")]
use window_vibrancy::apply_mica;

pub fn effects(app: &tauri::App) {
    let windows = app.webview_windows();
    let window = windows.get("main").unwrap();

    #[cfg(target_os = "macos")]
    {
        let _ = app.handle().liquid_glass().set_effect(
            window,
            LiquidGlassConfig {
                tint_color: Some("#1713130E".into()),
                variant: GlassMaterialVariant::Regular,
                ..Default::default()
            },
        );
    }

    #[cfg(target_os = "windows")]
    apply_mica(window, None).unwrap();
}
