//! macOS Dock tile badge (in-flight activity count). No-op on other platforms.

use tauri::AppHandle;

#[cfg(target_os = "macos")]
fn apply_dock_badge(label: Option<&str>) {
	use objc2_app_kit::NSApplication;
	use objc2_foundation::{MainThreadMarker, NSString};

	let Some(mtm) = MainThreadMarker::new() else {
		return;
	};
	let app = NSApplication::sharedApplication(mtm);
	let tile = app.dockTile();
	match label {
		Some(s) if !s.is_empty() => {
			tile.setBadgeLabel(Some(&NSString::from_str(s)));
			tile.setShowsApplicationBadge(true);
		}
		_ => {
			tile.setBadgeLabel(None);
			tile.setShowsApplicationBadge(false);
		}
	}
	tile.display();
}

#[cfg(not(target_os = "macos"))]
fn apply_dock_badge(_label: Option<&str>) {}

#[tauri::command]
#[specta::specta]
pub fn set_dock_badge(app: AppHandle, label: Option<String>) -> Result<(), String> {
	app.run_on_main_thread(move || {
		apply_dock_badge(label.as_deref());
	})
	.map_err(|e| e.to_string())
}
