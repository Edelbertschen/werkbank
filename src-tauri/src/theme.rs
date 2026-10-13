//! Farbschema schon vor dem ersten Bild: aus den gespeicherten Einstellungen gelesen,
//! damit Fenster und Splash nicht hell aufblitzen, wenn jemand Dunkel gewählt hat.

/// „light“, „dark“ oder „system“ aus dem Inhalt von prefs.json
pub fn from_prefs(json: Option<&str>) -> &'static str {
    let v: serde_json::Value = json.and_then(|j| serde_json::from_str(j).ok()).unwrap_or_default();
    match v.get("theme").and_then(|t| t.as_str()) {
        Some("dark") => "dark",
        Some("light") => "light",
        _ => "system",
    }
}

/// Hintergrund des Fensterchroms (wie --win in app.css)
pub fn background(dark: bool) -> (u8, u8, u8) {
    if dark { (0x11, 0x14, 0x15) } else { (0xE9, 0xEC, 0xEB) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn liest_das_gespeicherte_schema() {
        assert_eq!(from_prefs(Some(r#"{"theme":"dark","author":"x"}"#)), "dark");
        assert_eq!(from_prefs(Some(r#"{"theme":"light"}"#)), "light");
        assert_eq!(from_prefs(Some(r#"{"theme":"system"}"#)), "system");
    }

    #[test]
    fn ohne_oder_mit_kaputten_einstellungen_wie_system() {
        assert_eq!(from_prefs(None), "system");
        assert_eq!(from_prefs(Some("{kaputt")), "system");
        assert_eq!(from_prefs(Some(r#"{"theme":42}"#)), "system");
    }

    #[test]
    fn hintergrund_passt_zum_fensterchrom() {
        assert_eq!(background(true), (17, 20, 21));
        assert_eq!(background(false), (233, 236, 235));
    }
}
