use dumbwasd_core::core::config;
use dumbwasd_core::core::profile::{Profile, ProfileMeta};

#[tauri::command]
pub fn list_profiles() -> Result<Vec<String>, String> {
    config::list_profiles().map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub fn get_profile(name: String) -> Result<Profile, String> {
    Profile::load(&name).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub fn save_profile(name: String, profile: Profile) -> Result<String, String> {
    let path = profile.save(&name).map_err(|e| format!("{e:#}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_profile(name: String) -> Result<String, String> {
    let slug = name.to_lowercase().replace(' ', "-");
    let profile = Profile {
        profile: ProfileMeta {
            name: name.clone(),
            device_name: None,
        },
        devices: Vec::new(),
        mappings: Vec::new(),
    };
    profile.save(&slug).map_err(|e| format!("{e:#}"))?;
    Ok(slug)
}
