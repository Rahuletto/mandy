//! Tracks whether the main window is focused so we can suppress OS notifications
//! while the user is actively using the app.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Clone)]
pub struct AppFocusState(Arc<AtomicBool>);

impl AppFocusState {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(true)))
    }

    pub fn set_focused(&self, focused: bool) {
        self.0.store(focused, Ordering::Relaxed);
    }

    pub fn is_focused(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}
