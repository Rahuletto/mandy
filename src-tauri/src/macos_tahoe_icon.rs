//! Replace the bundled `.icns` Dock icon with appearance-specific PNGs (`Mandy-iOS-Dark` vs Clear Light).
//! PNGs are preprocessed with a safe-zone inset (see `scripts/prep-mandy-icon.mjs`) so the glyph
//! isn’t oversized next to system icons. Rebuild after changing `CONTENT_SCALE` or exports.
//!
//! Listens for `AppleInterfaceThemeChangedNotification` so the Dock icon updates when the user
//! switches light / dark / liquid-glass (clear) appearance.

use std::path::PathBuf;
use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "macos")]
use crate::macos_appearance::system_prefers_dark;

/// Which Tahoe runtime asset was applied (`dark` / `light` / `clear` in JSON).
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TahoeIconVariant {
    Dark,
    Light,
    Clear,
}

#[derive(Debug, Clone, Serialize)]
pub struct TahoeAppIconAppliedPayload {
    pub variant: TahoeIconVariant,
}

#[cfg(target_os = "macos")]
static TAHOE_APP: OnceLock<AppHandle> = OnceLock::new();

#[cfg(target_os = "macos")]
fn tahoe_icon_variant(mtm: objc2::MainThreadMarker) -> TahoeIconVariant {
    use objc2_app_kit::{NSAppearanceNameAqua, NSApplication};
    use objc2_foundation::NSString;

    if system_prefers_dark() {
        return TahoeIconVariant::Dark;
    }

    let ns_app = NSApplication::sharedApplication(mtm);
    let eff = ns_app.effectiveAppearance();
    let name = eff.name();
    let glass = NSString::from_str("Glass");
    let liquid = NSString::from_str("Liquid");
    if name.containsString(&glass) || name.containsString(&liquid) {
        return TahoeIconVariant::Clear;
    }

    unsafe {
        if name.isEqualToString(NSAppearanceNameAqua) {
            return TahoeIconVariant::Light;
        }
    }

    TahoeIconVariant::Light
}

#[cfg(target_os = "macos")]
fn tahoe_runtime_icon_path(
    resource_dir: &std::path::Path,
    variant: TahoeIconVariant,
) -> Option<PathBuf> {
    let dark = resource_dir.join("resources/macos-tahoe-tinted-dark.png");
    let light = resource_dir.join("resources/macos-tahoe-light.png");
    let clear_light = resource_dir.join("resources/macos-tahoe-light.png");
    let clear_only = resource_dir.join("resources/macos-tahoe-clear.png");

    let candidates: &[PathBuf] = match variant {
        TahoeIconVariant::Dark => std::slice::from_ref(&dark),
        TahoeIconVariant::Light => &[light, clear_light.clone()],
        TahoeIconVariant::Clear => &[clear_only, clear_light],
    };

    for p in candidates {
        if p.exists() {
            return Some(p.clone());
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn apply_tahoe_icon_on_main(app: &AppHandle) -> Option<TahoeIconVariant> {
    use objc2::rc::Retained;
    use objc2::AnyThread;
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::{MainThreadMarker, NSString};

    let Ok(resource_dir) = app.path().resource_dir() else {
        return None;
    };

    let Some(mtm) = MainThreadMarker::new() else {
        return None;
    };

    let variant = tahoe_icon_variant(mtm);
    let Some(path) = tahoe_runtime_icon_path(&resource_dir, variant) else {
        return None;
    };

    let path_str = path.to_string_lossy();
    let path_ns = NSString::from_str(&path_str);
    let image: Option<Retained<NSImage>> =
        NSImage::initWithContentsOfFile(NSImage::alloc(), &path_ns);
    let Some(image) = image else {
        return None;
    };

    let ns_app = NSApplication::sharedApplication(mtm);
    unsafe {
        ns_app.setApplicationIconImage(Some(&*image));
    }

    Some(variant)
}

#[cfg(target_os = "macos")]
fn emit_icon_applied(app: &AppHandle, variant: TahoeIconVariant) {
    let payload = TahoeAppIconAppliedPayload { variant };
    let _ = app.emit("tahoe-app-icon-applied", payload);
}

#[cfg(target_os = "macos")]
pub fn apply_tahoe_app_icon_if_needed(app: &AppHandle) {
    if let Some(v) = apply_tahoe_icon_on_main(app) {
        emit_icon_applied(app, v);
    }
}

#[cfg(target_os = "macos")]
mod theme_observer {
    use super::{apply_tahoe_app_icon_if_needed, TAHOE_APP};
    use objc2::rc::{Allocated, Retained};
    use objc2::runtime::NSObjectProtocol;
    use objc2::{define_class, msg_send, AnyThread, ClassType};
    use objc2_foundation::{NSDistributedNotificationCenter, NSNotificationSuspensionBehavior};
    use objc2_foundation::{NSNotification, NSObject, NSString};

    #[derive(Default)]
    struct TahoeThemeObserverIvars;

    define_class!(
        #[unsafe(super(NSObject))]
        #[thread_kind = AnyThread]
        #[ivars = TahoeThemeObserverIvars]
        struct TahoeThemeObserver;

        impl TahoeThemeObserver {
            #[unsafe(method_id(init))]
            fn init(this: Allocated<Self>) -> Retained<Self> {
                let this = this.set_ivars(TahoeThemeObserverIvars::default());
                unsafe { msg_send![super(this), init] }
            }

            #[unsafe(method(themeChanged:))]
            fn theme_changed(&self, _notification: &NSNotification) {
                if let Some(app) = TAHOE_APP.get() {
                    apply_tahoe_app_icon_if_needed(app);
                }
            }
        }

        unsafe impl NSObjectProtocol for TahoeThemeObserver {}
    );

    pub fn register() {
        use objc2::sel;
        use objc2::MainThreadMarker;

        let Some(_mtm) = MainThreadMarker::new() else {
            return;
        };

        let observer: Retained<TahoeThemeObserver> =
            unsafe { msg_send![TahoeThemeObserver::class(), new] };

        let center = NSDistributedNotificationCenter::defaultCenter();
        let name = NSString::from_str("AppleInterfaceThemeChangedNotification");
        unsafe {
            center.addObserver_selector_name_object_suspensionBehavior(
                &*observer,
                sel!(themeChanged:),
                Some(&name),
                None,
                NSNotificationSuspensionBehavior::DeliverImmediately,
            );
        }

        // Notification center does not retain the observer; leak so it lives for the app lifetime.
        std::mem::forget(observer);
    }
}

/// Call once at startup: applies the correct icon, then subscribes to system appearance changes.
#[cfg(target_os = "macos")]
pub fn init_tahoe_app_icon(app: AppHandle) {
    let _ = TAHOE_APP.set(app.clone());
    apply_tahoe_app_icon_if_needed(&app);
    theme_observer::register();
}

#[cfg(not(target_os = "macos"))]
pub fn init_tahoe_app_icon(_app: AppHandle) {}
