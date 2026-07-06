mod combos;
mod outputs;
mod playback;
mod triggers;

use crate::core::profile::{
    Behavior, Binding, BindingOutput, BindingPreset, PlaybackMode, Profile, ProfileDevice,
    ProfileMeta, Trigger,
};

fn single_binding_profile(trigger: Trigger, output: BindingOutput) -> Profile {
    single_binding_profile_with_playback(trigger, output, PlaybackMode::Once)
}

fn single_binding_profile_with_playback(
    trigger: Trigger,
    output: BindingOutput,
    playback: PlaybackMode,
) -> Profile {
    Profile {
        profile: ProfileMeta {
            name: "Default".to_string(),
            device_name: None,
        },
        devices: vec![ProfileDevice {
            id: "keyboard".to_string(),
            vendor_id: 1,
            product_id: 2,
            name: "Keyboard".to_string(),
            raw_name: String::new(),
            layout: String::new(),
            device_kind: String::new(),
            active_binding_preset: "default".to_string(),
            binding_presets: vec![BindingPreset {
                id: "default".to_string(),
                name: "Default".to_string(),
                bindings: vec![Binding {
                    id: "binding".to_string(),
                    enabled: true,
                    from: 30,
                    trigger,
                    behavior: Behavior::Override,
                    output,
                    playback,
                }],
                combos: Vec::new(),
            }],
        }],
        mappings: Vec::new(),
    }
}
