//! Registers notification support at startup.
//!
//! # macOS: dev vs bundled app
//!
//! `tauri-plugin-notification` routes notifications through **`com.apple.Terminal`**
//! while `tauri::is_dev()` is true, so **System Settings → Notifications** will list
//! **Terminal** (or the app that launched `tauri dev`), not Mandy. That is expected.
//!
//! After **`tauri build`**, run the generated **`Mandy.app`**: notifications use your
//! bundle id (`identifier` in `tauri.conf.json`) and **Mandy** appears in Settings
//! once the first notification is shown (or after the app registers with the system).
//!
//! Desktop `request_permission()` is largely a no-op (returns granted), but calling
//! it on startup keeps behavior aligned with mobile and future plugin updates.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

pub fn init(app: &AppHandle) {
    let _ = app.notification().request_permission();
}
