use dumbwasd_core::devices::azeron::JoystickState as AzeronJoystickState;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ButtonState {
    pub code: u16,
    pub pressed: bool,
    pub device_path: String,
    pub device_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AxisState {
    pub axis: u16,
    pub value: i32,
    pub device_path: String,
    pub device_name: String,
    pub minimum: Option<i32>,
    pub maximum: Option<i32>,
    pub flat: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AzeronHidReport {
    pub length: usize,
    pub hex: String,
    pub ascii: Option<String>,
    pub parsed_source: Option<String>,
}

pub(super) enum MonitoredEvent {
    Button(ButtonState),
    Axis(AxisState),
    AzeronHidReport(AzeronHidReport),
    AzeronJoystick(AzeronJoystickState),
}
