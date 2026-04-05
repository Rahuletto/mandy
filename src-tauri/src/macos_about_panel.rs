//! Standard About panel with centered credits (matches typical macOS layout).

use objc2::AnyThread;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_app_kit::{
    NSAboutPanelOptionApplicationIcon, NSAboutPanelOptionApplicationName,
    NSAboutPanelOptionApplicationVersion, NSAboutPanelOptionCredits, NSApplication, NSFont,
    NSFontAttributeName, NSImage, NSMutableParagraphStyle, NSParagraphStyleAttributeName,
    NSTextAlignment,
};
use objc2_foundation::{
    MainThreadMarker, NSMutableAttributedString, NSDictionary, NSRange, NSString,
};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

use crate::macos_appearance::system_prefers_dark;

pub const ABOUT_CREDITS: &str = concat!(
    "GitHub repository\n",
    "https://github.com/Rahuletto/mandy\n\n",
    "Report an issue\n",
    "https://github.com/Rahuletto/mandy/issues\n\n",
    "Made by Rahuletto",
);

pub fn show_about_panel(app: &AppHandle) {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };

    let pkg = app.package_info();
    let name = pkg.name.clone();
    let version = pkg.version.to_string();

    let ns_text = NSString::from_str(ABOUT_CREDITS);
    let attr = NSMutableAttributedString::from_nsstring(&ns_text);
    let ps = NSMutableParagraphStyle::new();
    ps.setAlignment(NSTextAlignment::Center);
    let len = attr.length();
    let range = NSRange {
        location: 0,
        length: len,
    };
    let font = NSFont::systemFontOfSize(11.0);
    unsafe {
        let ps_ref: &NSMutableParagraphStyle = &*ps;
        let ps_any: &AnyObject = &*(ps_ref as *const NSMutableParagraphStyle).cast::<AnyObject>();
        attr.addAttribute_value_range(NSParagraphStyleAttributeName, ps_any, range);

        let font_any: &AnyObject = &*((&*font) as *const NSFont).cast::<AnyObject>();
        attr.addAttribute_value_range(NSFontAttributeName, font_any, range);
    }

    let mut keys = Vec::new();
    let mut objects: Vec<Retained<AnyObject>> = Vec::new();

    keys.push(unsafe { NSAboutPanelOptionApplicationName });
    objects.push(Retained::into_super(Retained::into_super(NSString::from_str(&name))));

    keys.push(unsafe { NSAboutPanelOptionApplicationVersion });
    objects.push(Retained::into_super(Retained::into_super(NSString::from_str(&version))));

    if let Some(icon) = about_icon(app) {
        keys.push(unsafe { NSAboutPanelOptionApplicationIcon });
        objects.push(Retained::into_super(Retained::into_super(icon)));
    }

    keys.push(unsafe { NSAboutPanelOptionCredits });
    let credits_obj: Retained<AnyObject> = Retained::into_super(Retained::into_super(attr)).into();
    objects.push(credits_obj);

    let dict = NSDictionary::from_retained_objects(&keys, &objects);
    unsafe {
        NSApplication::sharedApplication(mtm).orderFrontStandardAboutPanelWithOptions(&dict);
    }
}

fn about_icon(app: &AppHandle) -> Option<Retained<NSImage>> {
    let candidates = if system_prefers_dark() {
        [
            "resources/mandy-about-icon-dark.png",
            "mandy-about-icon-dark.png",
            "resources/mandy-about-icon.png",
            "mandy-about-icon.png",
        ]
    } else {
        [
            "resources/mandy-about-icon.png",
            "mandy-about-icon.png",
            "resources/mandy-about-icon-dark.png",
            "mandy-about-icon-dark.png",
        ]
    };
    let path = candidates
        .into_iter()
        .find_map(|rel| app.path().resolve(rel, BaseDirectory::Resource).ok())?;
    let path_ns = NSString::from_str(&path.to_string_lossy());
    NSImage::initWithContentsOfFile(NSImage::alloc(), &path_ns)
}
