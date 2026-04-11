//! Native app menu via Tauri (`Menu`, `PredefinedMenuItem`, `MenuItem`), not the JS API.
//! macOS “About …” uses id `about`; [`crate::macos_about_panel`] shows the panel with centered credits.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID};
use tauri::{AppHandle, Runtime};

pub fn set_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        let pkg_info = app.package_info();
        let pkg_name = pkg_info.name.clone();
        let about_label = format!("About {pkg_name}");

        let window_menu = Submenu::with_id_and_items(
            app,
            WINDOW_SUBMENU_ID,
            "Window",
            true,
            &[
                &PredefinedMenuItem::minimize(app, None)?,
                &PredefinedMenuItem::maximize(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::close_window(app, None)?,
            ],
        )?;

        let menu = Menu::with_items(
            app,
            &[
                &Submenu::with_items(
                    app,
                    pkg_name,
                    true,
                    &[
                        &MenuItem::with_id(app, "about", &about_label, true, None::<&str>)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::services(app, None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::hide(app, None)?,
                        &PredefinedMenuItem::hide_others(app, None)?,
                        &PredefinedMenuItem::show_all(app, None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::quit(app, None)?,
                    ],
                )?,
                &Submenu::with_items(
                    app,
                    "File",
                    true,
                    &[&PredefinedMenuItem::close_window(app, None)?],
                )?,
                &Submenu::with_items(
                    app,
                    "Edit",
                    true,
                    &[
                        &PredefinedMenuItem::undo(app, None)?,
                        &PredefinedMenuItem::redo(app, None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::cut(app, None)?,
                        &PredefinedMenuItem::copy(app, None)?,
                        &PredefinedMenuItem::paste(app, None)?,
                        &PredefinedMenuItem::select_all(app, None)?,
                    ],
                )?,
                &Submenu::with_items(
                    app,
                    "View",
                    true,
                    &[&PredefinedMenuItem::fullscreen(app, None)?],
                )?,
                &window_menu,
            ],
        )?;
        menu.set_as_app_menu()?;
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let menu = Menu::default(app)?;
        menu.set_as_app_menu()?;
        Ok(())
    }
}
