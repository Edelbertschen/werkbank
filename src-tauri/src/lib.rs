//! Werkbank – Desktop-Hülle
//!
//! Die Oberfläche wird über einen kleinen lokalen HTTP-Server (nur 127.0.0.1) ausgeliefert.
//! Grund: Die gebündelten WebAssembly-Engines (LibreOffice, Tesseract …) brauchen
//! `SharedArrayBuffer`. Den gibt es nur in einem "cross-origin isolated" Kontext, also mit
//! COOP/COEP-Headern auf einem sicheren Ursprung. 127.0.0.1 gilt in allen drei WebViews
//! (WebView2, WKWebView, WebKitGTK) als sicherer Ursprung.

mod sysfont;

use std::{
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    thread,
};

use serde::Serialize;
use tauri::{ipc::Response, AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// Dateien, die beim Start (oder vor dem Laden der Oberfläche) übergeben wurden.
struct PendingFiles(Mutex<Vec<String>>);

// ---------------------------------------------------------------------------
// Lokaler Server
// ---------------------------------------------------------------------------

fn mime_of(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json",
        "wasm" => "application/wasm",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "pfb" => "application/octet-stream",
        "bcmap" => "application/octet-stream",
        "gz" => "application/gzip",
        "whl" | "zip" => "application/zip",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn header(k: &str, v: &str) -> tiny_http::Header {
    tiny_http::Header::from_bytes(k.as_bytes(), v.as_bytes()).expect("gültiger Header")
}

fn security_headers() -> Vec<tiny_http::Header> {
    vec![
        header("Cross-Origin-Opener-Policy", "same-origin"),
        header("Cross-Origin-Embedder-Policy", "require-corp"),
        header("Cross-Origin-Resource-Policy", "same-origin"),
        header("X-Content-Type-Options", "nosniff"),
        header("Referrer-Policy", "no-referrer"),
    ]
}

fn handle_request(mut req: tiny_http::Request, root: &Path) {
    let raw = req.url().split(['?', '#']).next().unwrap_or("/").to_string();
    // Diagnose: Meldungen der Oberfläche (nur mit WERKBANK_DEBUG ausgegeben)
    if raw == "/__log" {
        if std::env::var_os("WERKBANK_DEBUG").is_some() {
            let mut body = String::new();
            let _ = std::io::Read::read_to_string(&mut std::io::Read::take(req.as_reader(), 64 * 1024), &mut body);
            eprintln!("[werkbank/ui] {body}");
        }
        let _ = req.respond(tiny_http::Response::empty(204));
        return;
    }
    let decoded = percent_decode(&raw);
    let rel = decoded.trim_start_matches('/');
    let rel = if rel.is_empty() { "index.html" } else { rel };

    // Nur einfache, relative Pfade innerhalb des Ressourcen-Ordners zulassen.
    let candidate = Path::new(rel);
    let safe = candidate.components().all(|c| matches!(c, Component::Normal(_)));
    let path = root.join(candidate);

    let mut headers = security_headers();
    if safe && path.is_file() {
        if let Ok(file) = fs::File::open(&path) {
            headers.push(header("Content-Type", mime_of(&path)));
            let cache = if rel == "index.html" { "no-cache" } else { "max-age=31536000, immutable" };
            headers.push(header("Cache-Control", cache));
            let mut resp = tiny_http::Response::from_file(file);
            for h in headers {
                resp.add_header(h);
            }
            let _ = req.respond(resp);
            return;
        }
    }
    let mut resp = tiny_http::Response::from_string("Nicht gefunden").with_status_code(404);
    for h in headers {
        resp.add_header(h);
    }
    let _ = req.respond(resp);
}

fn start_server(root: PathBuf) -> u16 {
    let server = tiny_http::Server::http("127.0.0.1:0").expect("lokaler Server konnte nicht starten");
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
    thread::spawn(move || {
        for req in server.incoming_requests() {
            let root = root.clone();
            thread::spawn(move || handle_request(req, &root));
        }
    });
    port
}

// ---------------------------------------------------------------------------
// Befehle für die Oberfläche
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct FileInfo {
    exists: bool,
    size: u64,
    modified: u64,
    name: String,
    dir: String,
}

#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    fs::read(&path).map(Response::new).map_err(|e| format!("{path}: {e}"))
}

/// Schreibt binäre Daten. Der Pfad kommt im Header `x-path`, die Daten roh im Body,
/// damit große PDFs nicht als JSON-Zahlenfeld übertragen werden müssen.
#[tauri::command]
fn write_file(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let path = request
        .headers()
        .get("x-path")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .ok_or("Pfad fehlt")?;
    let data = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b.clone(),
        tauri::ipc::InvokeBody::Json(v) => serde_json::from_value::<Vec<u8>>(v.clone()).map_err(|e| e.to_string())?,
    };
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Erst in eine Nachbardatei schreiben, dann umbenennen: Bei einem Absturz bleibt das Original heil.
    let tmp = target.with_extension("werkbank-tmp");
    fs::write(&tmp, &data).map_err(|e| format!("{path}: {e}"))?;
    fs::rename(&tmp, &target).or_else(|_| {
        let r = fs::copy(&tmp, &target).map(|_| ());
        let _ = fs::remove_file(&tmp);
        r
    }).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
fn file_info(path: String) -> FileInfo {
    let p = PathBuf::from(&path);
    let meta = fs::metadata(&p).ok();
    FileInfo {
        exists: meta.is_some(),
        size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
        modified: meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        name: p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(),
        dir: p.parent().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(),
    }
}

fn state_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn safe_name(name: &str) -> Result<&str, String> {
    if name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') && !name.contains("..") {
        Ok(name)
    } else {
        Err("ungültiger Name".into())
    }
}

#[tauri::command]
fn state_load(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let p = state_dir(&app)?.join(safe_name(&name)?);
    Ok(fs::read_to_string(p).ok())
}

#[tauri::command]
fn state_save(app: AppHandle, name: String, content: String) -> Result<(), String> {
    let dir = state_dir(&app)?;
    let p = dir.join(safe_name(&name)?);
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// Binärer Zwischenspeicher (Wiederherstellung nach Absturz, Signaturbilder …)
#[tauri::command]
fn blob_save(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let name = request.headers().get("x-name").and_then(|v| v.to_str().ok()).ok_or("Name fehlt")?.to_string();
    let dir = state_dir(&app)?.join("blobs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let data = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b.clone(),
        _ => return Err("Rohdaten erwartet".into()),
    };
    fs::write(dir.join(safe_name(&name)?), data).map_err(|e| e.to_string())
}

#[tauri::command]
fn blob_load(app: AppHandle, name: String) -> Result<Response, String> {
    let p = state_dir(&app)?.join("blobs").join(safe_name(&name)?);
    fs::read(p).map(Response::new).map_err(|e| e.to_string())
}

#[tauri::command]
fn blob_delete(app: AppHandle, name: String) -> Result<(), String> {
    let p = state_dir(&app)?.join("blobs").join(safe_name(&name)?);
    let _ = fs::remove_file(p);
    Ok(())
}

#[tauri::command]
fn take_pending_files(state: tauri::State<'_, PendingFiles>) -> Vec<String> {
    let files = std::mem::take(&mut *state.0.lock().unwrap());
    if std::env::var_os("WERKBANK_DEBUG").is_some() {
        eprintln!("[werkbank] take_pending_files -> {:?}", files);
    }
    files
}

#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg("-R").arg(&p).spawn();
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("explorer").arg(format!("/select,{}", p.display())).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(p.parent().unwrap_or(&p)).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:")) {
        return Err("Nur Web-Adressen".into());
    }
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("cmd").args(["/C", "start", "", &url]).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(&url).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

/// HTTP-Anfrage für Zeitstempeldienste (RFC 3161), OCSP und Zertifikatsketten.
/// Läuft hier statt im WebView, weil diese Dienste keine CORS-Header senden.
#[tauri::command]
async fn http_fetch(request: tauri::ipc::Request<'_>) -> Result<Response, String> {
    let h = request.headers();
    let get = |k: &str| h.get(k).and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let url = get("x-url").map(|u| percent_decode(&u)).ok_or("URL fehlt")?;
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("ungültige URL".into());
    }
    let method = get("x-method").unwrap_or_else(|| "GET".into()).to_ascii_uppercase();
    let ctype = get("x-content-type");
    let body = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b.clone(),
        _ => Vec::new(),
    };
    let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(25)).build();
    let mut req = agent.request(&method, &url);
    if let Some(c) = ctype {
        req = req.set("Content-Type", &c);
    }
    let resp = if method == "GET" { req.call() } else { req.send_bytes(&body) }.map_err(|e| format!("{url}: {e}"))?;
    let mut buf = Vec::new();
    resp.into_reader().take(16 * 1024 * 1024).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(Response::new(buf))
}


// ---------------------------------------------------------------------------
// Installiertes LibreOffice (deutlich schneller als die eingebaute WebAssembly-Fassung)
// ---------------------------------------------------------------------------

fn find_soffice() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("WERKBANK_SOFFICE") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    #[cfg(target_os = "windows")]
    {
        for var in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
            if let Some(base) = std::env::var_os(var) {
                candidates.push(PathBuf::from(base).join("LibreOffice").join("program").join("soffice.exe"));
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/Applications/LibreOffice.app/Contents/MacOS/soffice"));
        if let Some(home) = std::env::var_os("HOME") {
            candidates.push(PathBuf::from(home).join("Applications/LibreOffice.app/Contents/MacOS/soffice"));
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(path) = std::env::var_os("PATH") {
            for dir in std::env::split_paths(&path) {
                for name in ["soffice", "libreoffice"] {
                    candidates.push(dir.join(name));
                }
            }
        }
        for p in ["/usr/lib/libreoffice/program/soffice", "/usr/lib64/libreoffice/program/soffice", "/opt/libreoffice/program/soffice", "/snap/bin/libreoffice"] {
            candidates.push(PathBuf::from(p));
        }
    }
    candidates.into_iter().find(|p| p.is_file())
}

static SOFFICE: std::sync::OnceLock<Option<PathBuf>> = std::sync::OnceLock::new();
fn soffice() -> Option<PathBuf> {
    SOFFICE.get_or_init(find_soffice).clone()
}

#[tauri::command]
fn office_info() -> serde_json::Value {
    match soffice() {
        Some(p) => serde_json::json!({ "available": true, "path": p.to_string_lossy() }),
        None => serde_json::json!({ "available": false }),
    }
}

fn office_filter(ext: &str, format: &str, pdfa: Option<u8>) -> String {
    if format != "pdf" {
        return format.to_string();
    }
    let Some(level) = pdfa else { return "pdf".into() };
    let family = match ext {
        "xls" | "xlsx" | "xlsm" | "ods" | "csv" | "fods" => "calc_pdf_Export",
        "ppt" | "pptx" | "odp" | "pps" | "ppsx" | "fodp" => "impress_pdf_Export",
        "odg" | "vsd" | "vsdx" => "draw_pdf_Export",
        _ => "writer_pdf_Export",
    };
    format!(r#"pdf:{family}:{{"SelectPdfVersion":{{"type":"long","value":"{level}"}}}}"#)
}

fn office_run(data: Vec<u8>, ext: String, format: String, pdfa: Option<u8>) -> Result<Vec<u8>, String> {
    let exe = soffice().ok_or("LibreOffice ist nicht installiert")?;
    let ext = ext.trim_start_matches('.').to_ascii_lowercase();
    if ext.is_empty() || !ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("ungültige Dateiendung".into());
    }
    let work = std::env::temp_dir().join(format!("werkbank-office-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)));
    let out_dir = work.join("out");
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let input = work.join(format!("dokument.{ext}"));
    fs::write(&input, &data).map_err(|e| e.to_string())?;
    // Eigenes Profil: läuft unabhängig von einem offenen LibreOffice-Fenster des Nutzers
    let profile = std::env::temp_dir().join("werkbank-lo-profile");
    let profile_url = format!("file:///{}", profile.to_string_lossy().replace('\\', "/").trim_start_matches('/'));
    let mut cmd = std::process::Command::new(&exe);
    cmd.arg(format!("-env:UserInstallation={profile_url}"))
        .args(["--headless", "--invisible", "--nologo", "--nodefault", "--norestore", "--nolockcheck", "--convert-to"])
        .arg(office_filter(&ext, &format, pdfa))
        .arg("--outdir")
        .arg(&out_dir)
        .arg(&input)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().map_err(|e| format!("LibreOffice ließ sich nicht starten: {e}"))?;
    let limit = std::time::Duration::from_secs(60 + (data.len() as u64 / 1_048_576) * 20);
    let started = std::time::Instant::now();
    let status = loop {
        if let Some(st) = child.try_wait().map_err(|e| e.to_string())? {
            break st;
        }
        if started.elapsed() > limit {
            let _ = child.kill();
            let _ = fs::remove_dir_all(&work);
            return Err("LibreOffice antwortet nicht (Zeitüberschreitung)".into());
        }
        thread::sleep(std::time::Duration::from_millis(50));
    };
    let mut err = String::new();
    if let Some(mut e) = child.stderr.take() {
        let _ = e.read_to_string(&mut err);
    }
    let produced = fs::read_dir(&out_dir).ok().and_then(|mut it| it.find_map(|e| e.ok().map(|e| e.path())));
    let result = match produced {
        Some(p) => fs::read(&p).map_err(|e| e.to_string()),
        None => Err(format!("LibreOffice hat keine Datei erzeugt ({status}) {}", err.trim())),
    };
    let _ = fs::remove_dir_all(&work);
    result
}

/// Umwandlung mit dem installierten LibreOffice. Daten roh im Body,
/// Endung (`x-ext`), Zielformat (`x-format`) und optional PDF/A-Stufe (`x-pdfa`) im Header.
#[tauri::command]
async fn office_convert(request: tauri::ipc::Request<'_>) -> Result<Response, String> {
    let h = request.headers();
    let get = |k: &str| h.get(k).and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let ext = get("x-ext").ok_or("Endung fehlt")?;
    let format = get("x-format").unwrap_or_else(|| "pdf".into());
    if !format.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("ungültiges Zielformat".into());
    }
    let pdfa = get("x-pdfa").and_then(|v| v.parse::<u8>().ok()).filter(|v| (1..=3).contains(v));
    let data = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b.clone(),
        _ => return Err("Daten fehlen".into()),
    };
    let out = tauri::async_runtime::spawn_blocking(move || office_run(data, ext, format, pdfa))
        .await
        .map_err(|e| e.to_string())??;
    Ok(Response::new(out))
}

#[tauri::command]
fn print_view(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

#[tauri::command]
fn platform_info() -> serde_json::Value {
    serde_json::json!({ "os": std::env::consts::OS, "arch": std::env::consts::ARCH })
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

fn file_args(args: &[String], cwd: Option<&Path>) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|a| {
            let p = PathBuf::from(a);
            let p = if p.is_relative() { cwd.map(|c| c.join(&p)).unwrap_or(p) } else { p };
            fs::canonicalize(&p).unwrap_or(p)
        })
        .filter(|p| p.is_file())
        .map(|p| {
            let s = p.to_string_lossy().to_string();
            // Windows: canonicalize liefert \\?\-Pfade, die Dialoge und Anzeigen verwirren
            s.strip_prefix(r"\\?\").map(|x| x.to_string()).unwrap_or(s)
        })
        .collect()
}

fn deliver_files(app: &AppHandle, files: Vec<String>) {
    if files.is_empty() {
        return;
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    app.state::<PendingFiles>().0.lock().unwrap().extend(files.clone());
    let _ = app.emit("open-files", files);
}

/// Namen der installierten Schriftfamilien (für die Schriftwahl beim Bearbeiten)
#[tauri::command]
async fn system_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(sysfont::families).await.map_err(|e| e.to_string())
}

/// Installierte Schrift zum Namen einer PDF-Schrift (leere Antwort: keine passende oder Einbetten nicht erlaubt)
#[tauri::command]
async fn system_font(name: String, bold: bool, italic: bool) -> Result<Response, String> {
    let found = tauri::async_runtime::spawn_blocking(move || sysfont::lookup(&name, bold, italic))
        .await
        .map_err(|e| e.to_string())?;
    Ok(Response::new(found.unwrap_or_default()))
}

pub fn run() {
    // WebKitGTK gibt SharedArrayBuffer nur mit dieser JavaScriptCore-Option frei.
    // Ohne sie laufen LibreOffice und andere Multithread-Engines unter Linux nicht.
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::set_var("JSC_useSharedArrayBuffer", "1");
    }

    let startup_files = file_args(&std::env::args().collect::<Vec<_>>(), std::env::current_dir().ok().as_deref());

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            deliver_files(app, file_args(&args, Some(Path::new(&cwd))));
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingFiles(Mutex::new(startup_files)))
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            file_info,
            state_load,
            state_save,
            blob_save,
            blob_load,
            blob_delete,
            take_pending_files,
            reveal_in_folder,
            open_external,
            http_fetch,
            print_view,
            platform_info,
            office_info,
            office_convert,
            system_font,
            system_fonts
        ])
        .setup(|app| {
            let root = app
                .path()
                .resource_dir()
                .map(|d| d.join("frontend"))
                .unwrap_or_else(|_| PathBuf::from("frontend"));
            let root = if root.join("index.html").is_file() {
                root
            } else {
                // Entwicklung: direkt aus dem Vite-Build lesen
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist")
            };
            if std::env::var_os("WERKBANK_DEBUG").is_some() {
                eprintln!("[werkbank] resource_dir={:?} root={:?}", app.path().resource_dir(), root);
            }
            let port = start_server(root);
            let url = format!("http://127.0.0.1:{port}/");

            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse().unwrap()))
                .title("Werkbank")
                .inner_size(1380.0, 880.0)
                .min_inner_size(880.0, 600.0)
                .center()
                .visible(true);
            #[cfg(target_os = "macos")]
            let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
            builder.build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Werkbank konnte nicht starten");

    app.run(|_app, _event| {
        #[cfg(target_os = "macos")]
        if let RunEvent::Opened { urls } = &_event {
            let files: Vec<String> = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            deliver_files(_app, files);
        }
        let _ = RunEvent::Ready; // hält den Import auf allen Plattformen benutzt
    });
}
