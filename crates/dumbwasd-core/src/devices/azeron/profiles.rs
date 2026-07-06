// ── Profile parsing ──────────────────────────────────────────────

/// A parsed button entry from a profile response.
#[derive(Debug, Clone)]
pub struct ProfileButton {
    pub button_id: u8,
    pub button_type: u8,
    pub key_code: u32,
}

/// Parse the raw `GET_PROFILES` response lines into per-button entries.
///
/// Each line from the Azeron follows the format:
/// `B{profile}|{button_id}|{type}|{pin0}|{pin1}|{key0}|{key1}|{key2}|{key3}|{meta0}|{meta1}|{meta2}|{flags}`
///
/// Lines that don't start with `B` or can't be parsed are skipped.
pub fn parse_profiles(lines: &[String]) -> Vec<ProfileButton> {
    let mut buttons = Vec::new();
    for line in lines {
        // Lines look like: B0|1|1|26|255|61470|0|0|0|0|0|0|0
        if !line.starts_with('B') {
            continue;
        }

        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() < 6 {
            continue;
        }

        // parts[0] = "B0" (profile), parts[1] = button_id, parts[2] = type,
        // parts[3] = pin0, parts[4] = pin1, parts[5] = key_code
        let button_id: u8 = match parts[1].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };
        let button_type: u8 = match parts[2].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };
        let key_code: u32 = match parts[5].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };

        buttons.push(ProfileButton {
            button_id,
            button_type,
            key_code,
        });
    }
    buttons
}
