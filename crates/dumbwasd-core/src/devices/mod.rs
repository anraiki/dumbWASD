pub mod azeron;
pub mod registry;

/// Information about a discovered input device.
#[derive(Debug, Clone)]
pub struct DeviceInfo {
    pub path: String,
    pub name: String,
    pub vendor_id: u16,
    pub product_id: u16,
    /// Friendly name resolved from device registry (if available).
    pub friendly_name: Option<String>,
}

impl DeviceInfo {
    /// Check if this device matches a known device by vendor and product ID.
    pub fn matches(&self, vendor: u16, product: u16) -> bool {
        self.vendor_id == vendor && self.product_id == product
    }

    /// Check if this device is any known Azeron device.
    pub fn is_azeron(&self) -> bool {
        azeron::KNOWN_DEVICES
            .iter()
            .any(|known| self.matches(known.vendor_id, known.product_id))
    }

    /// Keywords in device names that indicate non-controller devices.
    const IGNORED_KEYWORDS: &[&str] = &["audio", "hdmi", "microphone", "speaker"];

    /// Returns true if this device looks like a physical controller
    /// (i.e. its name doesn't contain any ignored keywords).
    pub fn is_likely_controller(&self) -> bool {
        let lower = self.name.to_lowercase();
        !Self::IGNORED_KEYWORDS.iter().any(|kw| lower.contains(kw))
    }

    /// Returns the best display name: friendly name if available, otherwise OS name.
    pub fn display_name(&self) -> &str {
        self.friendly_name.as_deref().unwrap_or(&self.name)
    }
}

/// Resolve friendly names for a batch of devices using the registry.
/// This is more efficient than resolving one at a time since it
/// only calls external tools (e.g. solaar) once.
pub fn resolve_device_names(devices: &mut [DeviceInfo]) {
    let pairs: Vec<(u16, u16)> = devices
        .iter()
        .map(|d| (d.vendor_id, d.product_id))
        .collect();

    let names = registry::resolve_names(&pairs);

    for device in devices.iter_mut() {
        if let Some(name) = names.get(&(device.vendor_id, device.product_id)) {
            device.friendly_name = Some(name.clone());
        }
    }
}
