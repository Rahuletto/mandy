//! Desktop notifications when REST / GraphQL work completes while the app is in the background.
//!
//! On macOS **dev** builds, the OS attributes notifications to **Terminal** (see
//! `crate::notifications`); use a **bundled `.app`** from `tauri build` to see **Mandy**
//! in System Settings → Notifications.

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::app_focus::AppFocusState;

pub fn notify_request_completed_if_background(app: &AppHandle, request_display_name: &str) {
    let Some(state) = app.try_state::<AppFocusState>() else {
        return;
    };
    if state.is_focused() {
        return;
    }
    let _ = app
        .notification()
        .builder()
        .title("Mandy")
        .body(format!("{} received the response", request_display_name))
        .show();
}

pub fn pick_display_name(label: &Option<String>, fallback: &str) -> String {
    label
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| fallback.to_string())
}
