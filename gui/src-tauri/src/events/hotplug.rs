//! Hotplug watcher — notices input nodes appearing or disappearing and tells
//! the frontend to re-enumerate.
//!
//! evdev exposes no hotplug signal, and the project takes no libudev
//! dependency, so this watches the `/dev/input` directory listing instead.
//! That is a plain `readdir` — no device is opened, nothing is grabbed — and
//! node creation there is the same event udev itself reacts to.

use std::collections::BTreeSet;
use std::path::Path;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

const INPUT_DIR: &str = "/dev/input";

/// How often the directory listing is compared.
const POLL_INTERVAL: Duration = Duration::from_millis(750);

/// A replug creates the node *before* udev applies its uaccess ACL, so a read
/// that wins that race gets EACCES. Waiting for the listing to stop moving
/// lets the rules finish before anything tries to open the device.
const SETTLE_DELAY: Duration = Duration::from_millis(400);

#[derive(Debug, Clone, Serialize)]
pub struct DevicesChanged {
    pub added: Vec<String>,
    pub removed: Vec<String>,
}

fn event_nodes(dir: &Path) -> BTreeSet<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return BTreeSet::new();
    };

    entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.starts_with("event"))
        .collect()
}

fn diff(previous: &BTreeSet<String>, current: &BTreeSet<String>) -> DevicesChanged {
    DevicesChanged {
        added: current.difference(previous).cloned().collect(),
        removed: previous.difference(current).cloned().collect(),
    }
}

/// Watch for input nodes coming and going for as long as the app runs.
pub fn spawn_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let input_dir = Path::new(INPUT_DIR);
        let mut known = event_nodes(input_dir);
        tracing::info!("watching {INPUT_DIR} for hotplug ({} nodes)", known.len());

        loop {
            tokio::time::sleep(POLL_INTERVAL).await;

            let current = event_nodes(input_dir);
            if current == known {
                continue;
            }

            // Let udev finish before announcing anything. If the listing is
            // still moving after the delay, the next tick picks up the rest.
            tokio::time::sleep(SETTLE_DELAY).await;
            let settled = event_nodes(input_dir);

            let change = diff(&known, &settled);
            known = settled;

            if change.added.is_empty() && change.removed.is_empty() {
                continue;
            }

            tracing::info!(
                added = ?change.added,
                removed = ?change.removed,
                "input devices changed"
            );

            if let Err(e) = app.emit("devices-changed", &change) {
                tracing::warn!("failed to emit devices-changed: {e}");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set(names: &[&str]) -> BTreeSet<String> {
        names.iter().map(|name| name.to_string()).collect()
    }

    #[test]
    fn reports_nodes_added_and_removed() {
        let change = diff(&set(&["event1", "event2"]), &set(&["event2", "event9"]));
        assert_eq!(change.added, vec!["event9".to_string()]);
        assert_eq!(change.removed, vec!["event1".to_string()]);
    }

    #[test]
    fn reads_only_event_nodes_from_a_directory() {
        let dir = std::env::temp_dir().join(format!("dumbwasd-hotplug-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for name in ["event3", "event11", "js0", "mice", "by-id"] {
            std::fs::write(dir.join(name), b"").unwrap();
        }

        let nodes = event_nodes(&dir);
        std::fs::remove_dir_all(&dir).unwrap();

        assert_eq!(nodes, set(&["event11", "event3"]));
    }

    #[test]
    fn a_missing_directory_is_not_an_error() {
        assert!(event_nodes(Path::new("/nonexistent/dumbwasd")).is_empty());
    }

    #[test]
    fn an_unchanged_listing_reports_nothing() {
        let change = diff(&set(&["event1"]), &set(&["event1"]));
        assert!(change.added.is_empty());
        assert!(change.removed.is_empty());
    }
}
