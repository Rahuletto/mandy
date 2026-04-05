use tauri::Manager;

#[cfg(target_os = "macos")]
use tauri::AppHandle;
#[cfg(target_os = "macos")]
use tauri_plugin_liquid_glass::{GlassMaterialVariant, LiquidGlassConfig, LiquidGlassExt};

#[cfg(target_os = "macos")]
use crate::macos_appearance::system_prefers_dark;

#[cfg(target_os = "windows")]
use window_vibrancy::apply_mica;

#[cfg(target_os = "macos")]
const LIQUID_GLASS_TINT_DARK: &str = "#231F1F66";
#[cfg(target_os = "macos")]
const LIQUID_GLASS_TINT_LIGHT: &str = "#FAFAFA66";

#[cfg(target_os = "macos")]
fn liquid_glass_tint_for_system_appearance() -> String {
    if system_prefers_dark() {
        LIQUID_GLASS_TINT_DARK.into()
    } else {
        LIQUID_GLASS_TINT_LIGHT.into()
    }
}

#[cfg(target_os = "macos")]
pub fn refresh_liquid_glass_theme(app: &AppHandle) {
    let runner = app.clone();
    let for_closure = app.clone();
    let _ = runner.run_on_main_thread(move || apply_liquid_glass_sync(&for_closure));
}

#[cfg(target_os = "macos")]
fn apply_liquid_glass_sync(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = app.liquid_glass().set_effect(
        &window,
        LiquidGlassConfig {
            tint_color: Some(liquid_glass_tint_for_system_appearance()),
            variant: GlassMaterialVariant::Monogram,
            ..Default::default()
        },
    );
}

pub fn effects(app: &tauri::App) {
    #[cfg(target_os = "macos")]
    {
        refresh_liquid_glass_theme(app.handle());
    }

    #[cfg(target_os = "windows")]
    {
        let windows = app.webview_windows();
        let window = windows.get("main").unwrap();
        apply_mica(window, None).unwrap();
    }
}
