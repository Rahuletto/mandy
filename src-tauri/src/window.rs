use tauri::Manager;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg(target_os = "windows")]
use window_vibrancy::apply_mica;

pub fn effects(app: &tauri::App) {
    let windows = app.webview_windows();
    let window = windows.get("main").unwrap();

    #[cfg(target_os = "macos")]
    apply_vibrancy(
        window,
        NSVisualEffectMaterial::UnderWindowBackground,
        None,
        None
    ).unwrap();

    #[cfg(target_os = "windows")]
    apply_mica(window, None).unwrap();
}
