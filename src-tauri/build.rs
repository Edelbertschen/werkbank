const COMMANDS: &[&str] = &[
    "read_file",
    "write_file",
    "file_info",
    "state_load",
    "state_save",
    "blob_save",
    "blob_load",
    "blob_delete",
    "take_pending_files",
    "reveal_in_folder",
    "open_external",
    "http_fetch",
    "print_view",
    "platform_info",
    "office_info",
    "office_convert",
    "system_font",
    "system_fonts",
    "mcp_enable",
    "mcp_reply",
    "mcp_info",
];

fn main() {
    // Die Oberfläche läuft über http://127.0.0.1 (Remote-Ursprung). Dafür müssen die
    // App-Befehle ausdrücklich freigegeben werden: tauri_build erzeugt je Befehl eine
    // Berechtigung "allow-<befehl>", die capabilities/main.json einträgt.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("tauri-build fehlgeschlagen");
}
