//! System appearance (light vs dark), aligned with System Settings → Appearance.

/// True when macOS is using Dark appearance (`defaults read -g AppleInterfaceStyle` → `Dark`).
#[cfg(target_os = "macos")]
pub fn system_prefers_dark() -> bool {
    std::process::Command::new("defaults")
        .args(["read", "-g", "AppleInterfaceStyle"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim() == "Dark")
        .unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
pub fn system_prefers_dark() -> bool {
    false
}
