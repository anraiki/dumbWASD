use std::ffi::CString;

use anyhow::{Context, Result};
use hidapi::{HidApi, HidDevice};

pub const VENDOR_ID: u16 = 0x046D;

#[derive(Debug, Clone)]
pub struct LogitechHidDeviceInfo {
    pub path: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub interface_number: i32,
    pub usage_page: u16,
    pub usage: u16,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
}

pub fn list_hidraw_devices() -> Result<Vec<LogitechHidDeviceInfo>> {
    let api = HidApi::new().context("failed to initialize HID API")?;
    let devices = api
        .device_list()
        .filter(|device| device.vendor_id() == VENDOR_ID)
        .map(|device| LogitechHidDeviceInfo {
            path: device.path().to_string_lossy().into_owned(),
            vendor_id: device.vendor_id(),
            product_id: device.product_id(),
            interface_number: device.interface_number(),
            usage_page: device.usage_page(),
            usage: device.usage(),
            manufacturer: device.manufacturer_string().map(ToOwned::to_owned),
            product: device.product_string().map(ToOwned::to_owned),
            serial_number: device.serial_number().map(ToOwned::to_owned),
        })
        .collect();

    Ok(devices)
}

pub fn open_hidraw_path(path: &str) -> Result<HidDevice> {
    let api = HidApi::new().context("failed to initialize HID API")?;
    let c_path = CString::new(path)
        .with_context(|| format!("invalid hidraw path (contains NUL byte): {path}"))?;

    api.open_path(c_path.as_c_str())
        .with_context(|| format!("failed to open HID device at {path}"))
}
