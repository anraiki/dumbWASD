use crate::macro_runner::MacroRunner;
use dumbwasd_core::core::macros::{MacroLibrary, SavedMacro};

#[tauri::command]
pub fn list_macros() -> Result<Vec<SavedMacro>, String> {
    MacroLibrary::load()
        .map(|library| library.macros)
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub fn save_macro(definition: SavedMacro) -> Result<Vec<SavedMacro>, String> {
    let mut library = MacroLibrary::load().map_err(|e| format!("{e:#}"))?;
    library.upsert(definition);
    library.save().map_err(|e| format!("{e:#}"))?;
    Ok(library.macros)
}

#[tauri::command]
pub fn delete_macro(id: String) -> Result<Vec<SavedMacro>, String> {
    let mut library = MacroLibrary::load().map_err(|e| format!("{e:#}"))?;
    library.remove(&id);
    library.save().map_err(|e| format!("{e:#}"))?;
    Ok(library.macros)
}

/// Start playing a macro, or stop it if it is already playing.
/// `definition` is the profile-embedded snapshot - playback never consults
/// the library. Returns true when playback started, false when stopped.
#[tauri::command]
pub fn toggle_macro_playback(
    definition: SavedMacro,
    state: tauri::State<'_, MacroRunner>,
) -> Result<bool, String> {
    state.toggle(definition)
}

/// Start playing a macro (no-op when already playing).
/// Returns true when playback started.
#[tauri::command]
pub fn start_macro_playback(
    definition: SavedMacro,
    state: tauri::State<'_, MacroRunner>,
) -> Result<bool, String> {
    state.start(definition)
}

/// Stop a playing macro (no-op when not playing).
/// Returns true when a playback was stopped.
#[tauri::command]
pub fn stop_macro_playback(
    id: String,
    state: tauri::State<'_, MacroRunner>,
) -> Result<bool, String> {
    state.stop(&id)
}
