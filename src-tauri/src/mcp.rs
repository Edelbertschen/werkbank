//! KI-Assistenten (Model Context Protocol).
//!
//! `werkbank mcp` startet einen MCP-Server über stdin/stdout, wie ihn Claude Desktop und andere
//! Agenten erwarten. Er führt nichts selbst aus, sondern reicht jeden Werkzeugaufruf an die laufende
//! Werkbank weiter – dort stecken die Engines. Die App öffnet dafür einen Steuerkanal nur auf
//! 127.0.0.1, nur wenn der Nutzer es in den Einstellungen erlaubt, und nur mit einem Zufallstoken,
//! das in einer Datei steht, die nur der Nutzer lesen kann.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Werkzeugtabelle – dieselbe Datei liest die Oberfläche
pub const TOOLS: &str = include_str!("../../src/lib/mcp-tools.json");
pub const PROTOCOL: &str = "2025-06-18";
/// Bezeichner der App (wie in tauri.conf.json) – bestimmt den Datenordner
pub const IDENTIFIER: &str = "de.viergutz.werkbank";
const CONTROL_FILE: &str = "mcp-control.json";

// ---------------------------------------------------------------------------
// JSON-RPC (stdio-Seite)
// ---------------------------------------------------------------------------

/// Weiterleitung eines Werkzeugaufrufs an die App
pub trait Bridge {
    fn call(&mut self, tool: &str, args: &Value) -> Result<Value, String>;
}

fn ok(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}
fn err(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// Eine Nachricht verarbeiten. Benachrichtigungen (ohne id) bekommen keine Antwort.
pub fn handle(msg: &Value, bridge: &mut dyn Bridge, version: &str) -> Option<Value> {
    let method = msg.get("method").and_then(|m| m.as_str());
    let id = msg.get("id").cloned();
    let (Some(method), Some(id)) = (method, id) else { return None };
    let params = msg.get("params").cloned().unwrap_or(Value::Null);
    Some(match method {
        "initialize" => {
            let asked = params.get("protocolVersion").and_then(|v| v.as_str()).unwrap_or(PROTOCOL);
            ok(id, json!({
                "protocolVersion": asked,
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "werkbank", "title": "Werkbank", "version": version },
                "instructions": "Werkbank is a PDF desktop app. Open documents with open_document or work on the ones already open (list_documents). Every change is undoable and stays in memory until save_document."
            }))
        }
        "ping" => ok(id, json!({})),
        "tools/list" => ok(id, json!({ "tools": serde_json::from_str::<Value>(TOOLS).unwrap_or(json!([])) })),
        "tools/call" => {
            let name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or(json!({}));
            match bridge.call(name, &args) {
                Ok(v) if v.get("content").is_some() => ok(id, v),
                Ok(v) => ok(id, json!({ "content": [{ "type": "text", "text": v.to_string() }] })),
                Err(e) => ok(id, json!({ "content": [{ "type": "text", "text": e }], "isError": true })),
            }
        }
        _ => err(id, -32601, "Method not found"),
    })
}

/// Zeilenweise JSON-RPC über stdin/stdout, bis stdin endet
pub fn run_stdio(bridge: &mut dyn Bridge, version: &str) {
    let stdin = std::io::stdin();
    let mut out = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() { continue; }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(msg) => handle(&msg, bridge, version),
            Err(_) => Some(err(Value::Null, -32700, "Parse error")),
        };
        if let Some(r) = reply {
            let _ = writeln!(out, "{r}");
            let _ = out.flush();
        }
    }
}

// ---------------------------------------------------------------------------
// Verbindung zur laufenden App
// ---------------------------------------------------------------------------

/// Datenordner der App (wie Tauris app_data_dir), ohne laufende Tauri-Instanz bestimmt
pub fn data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    { std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join(IDENTIFIER)) }
    #[cfg(target_os = "macos")]
    { std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support").join(IDENTIFIER)) }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::var_os("XDG_DATA_HOME").map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
            .map(|p| p.join(IDENTIFIER))
    }
}

#[derive(Debug, PartialEq)]
pub struct Control { pub port: u16, pub token: String }

pub fn parse_control(s: &str) -> Option<Control> {
    let v: Value = serde_json::from_str(s).ok()?;
    Some(Control { port: v.get("port")?.as_u64()? as u16, token: v.get("token")?.as_str()?.to_string() })
}

/// Bridge, die per HTTP mit der App spricht und sie bei Bedarf startet
pub struct AppBridge { started: bool }
impl AppBridge {
    pub fn new() -> Self { Self { started: false } }
    fn control() -> Option<Control> {
        parse_control(&std::fs::read_to_string(data_dir()?.join(CONTROL_FILE)).ok()?)
    }
    fn post(c: &Control, tool: &str, args: &Value) -> Result<Value, ureq::Error> {
        let r = ureq::post(&format!("http://127.0.0.1:{}/call", c.port))
            .set("Authorization", &format!("Bearer {}", c.token))
            .set("Content-Type", "application/json")
            .timeout(Duration::from_secs(600))
            .send_string(&json!({ "tool": tool, "args": args }).to_string())?;
        let text = r.into_string().unwrap_or_default();
        Ok(serde_json::from_str::<Value>(&text).unwrap_or(json!({ "content": [{ "type": "text", "text": "Invalid reply from Werkbank" }], "isError": true })))
    }
}
const NOT_ENABLED: &str = "Werkbank is not reachable. Open Werkbank and turn on Settings → AI assistants (MCP), then try again.";
impl Bridge for AppBridge {
    fn call(&mut self, tool: &str, args: &Value) -> Result<Value, String> {
        if let Some(c) = Self::control() {
            match Self::post(&c, tool, args) {
                Ok(v) => return Ok(v),
                Err(ureq::Error::Status(403, _)) => return Err(NOT_ENABLED.into()),
                Err(ureq::Error::Status(code, r)) => return Err(format!("Werkbank: {code} {}", r.into_string().unwrap_or_default())),
                Err(_) => {} // nicht erreichbar: App starten
            }
        }
        if !self.started {
            self.started = true;
            if let Ok(exe) = std::env::current_exe() {
                let _ = std::process::Command::new(exe)
                    .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null())
                    .spawn();
            }
        }
        let t0 = Instant::now();
        while t0.elapsed() < Duration::from_secs(25) {
            std::thread::sleep(Duration::from_millis(400));
            if let Some(c) = Self::control() {
                if let Ok(v) = Self::post(&c, tool, args) { return Ok(v); }
            }
        }
        Err(NOT_ENABLED.into())
    }
}

// ---------------------------------------------------------------------------
// Steuerkanal in der App
// ---------------------------------------------------------------------------

static ENABLED: AtomicBool = AtomicBool::new(false);
static NEXT: AtomicU64 = AtomicU64::new(1);
static PORT: OnceLock<(u16, String)> = OnceLock::new();
fn waiting() -> &'static Mutex<HashMap<u64, Sender<String>>> {
    static W: OnceLock<Mutex<HashMap<u64, Sender<String>>>> = OnceLock::new();
    W.get_or_init(|| Mutex::new(HashMap::new()))
}

fn random_token() -> String {
    // 32 Byte aus dem Betriebssystem (über die Hash-Zufallsquelle von std), hexadezimal
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    (0..4).map(|i| { let mut h = RandomState::new().build_hasher(); h.write_u64(i ^ std::process::id() as u64); format!("{:016x}", h.finish()) }).collect()
}

/// Antwort der Oberfläche auf einen Aufruf
pub fn reply(id: u64, result: String) {
    if let Some(tx) = waiting().lock().unwrap().remove(&id) { let _ = tx.send(result); }
}

/// Prüft eine Anfrage an den Steuerkanal. Ok(tool, args) oder Err(status, text).
pub fn check_request(method: &str, path: &str, auth: Option<&str>, token: &str, enabled: bool, body: &str) -> Result<(String, Value), (u16, String)> {
    if method != "POST" || path != "/call" { return Err((404, "not found".into())); }
    if auth != Some(&format!("Bearer {token}")) { return Err((401, "unauthorized".into())); }
    if !enabled { return Err((403, "AI assistants are turned off in Werkbank settings".into())); }
    let v: Value = serde_json::from_str(body).map_err(|_| (400, "bad request".to_string()))?;
    let tool = v.get("tool").and_then(|t| t.as_str()).ok_or((400, "tool missing".to_string()))?.to_string();
    Ok((tool, v.get("args").cloned().unwrap_or(json!({}))))
}

/// Steuerkanal ein- oder ausschalten. `emit` schickt einen Aufruf an die Oberfläche.
pub fn set_enabled(enabled: bool, dir: PathBuf, emit: impl Fn(Value) + Send + Sync + 'static) -> Result<(), String> {
    ENABLED.store(enabled, Ordering::SeqCst);
    let file = dir.join(CONTROL_FILE);
    if !enabled { let _ = std::fs::remove_file(&file); return Ok(()); }
    let (port, token) = PORT.get_or_init(|| {
        let server = tiny_http::Server::http("127.0.0.1:0").expect("Steuerkanal");
        let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
        let token = random_token();
        let tok = token.clone();
        let emit = std::sync::Arc::new(emit);
        std::thread::spawn(move || {
            for mut req in server.incoming_requests() {
                let tok = tok.clone();
                let emit = emit.clone();
                std::thread::spawn(move || {
                    let mut body = String::new();
                    let _ = std::io::Read::read_to_string(&mut std::io::Read::take(req.as_reader(), 4 * 1024 * 1024), &mut body);
                    let auth = req.headers().iter().find(|h| h.field.equiv("Authorization")).map(|h| h.value.as_str().to_string());
                    let method = req.method().to_string().to_uppercase();
                    let res = check_request(&method, req.url(), auth.as_deref(), &tok, ENABLED.load(Ordering::SeqCst), &body);
                    let (status, text) = match res {
                        Err(e) => e,
                        Ok((tool, args)) => {
                            let id = NEXT.fetch_add(1, Ordering::SeqCst);
                            let (tx, rx) = channel();
                            waiting().lock().unwrap().insert(id, tx);
                            emit(json!({ "id": id, "tool": tool, "args": args }));
                            match rx.recv_timeout(Duration::from_secs(600)) {
                                Ok(r) => (200, r),
                                Err(_) => { waiting().lock().unwrap().remove(&id); (504, "Werkbank did not answer in time".into()) }
                            }
                        }
                    };
                    let resp = tiny_http::Response::from_string(text).with_status_code(status)
                        .with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap());
                    let _ = req.respond(resp);
                });
            }
        });
        (port, token)
    }).clone();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let content = json!({ "port": port, "token": token, "pid": std::process::id() }).to_string();
    write_private(&file, &content)
}

/// Datei nur für den Nutzer lesbar schreiben
fn write_private(path: &std::path::Path, content: &str) -> Result<(), String> {
    let _ = std::fs::remove_file(path);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(path).map_err(|e| e.to_string())?;
        f.write_all(content.as_bytes()).map_err(|e| e.to_string())
    }
    #[cfg(not(unix))]
    { std::fs::write(path, content).map_err(|e| e.to_string()) }
}

/// Beim Beenden: Steuerdatei entfernen
pub fn shutdown(dir: PathBuf) { let _ = std::fs::remove_file(dir.join(CONTROL_FILE)); }

#[cfg(test)]
mod tests {
    use super::*;

    struct Fake(Vec<(String, Value)>, Result<Value, String>);
    impl Bridge for Fake {
        fn call(&mut self, tool: &str, args: &Value) -> Result<Value, String> { self.0.push((tool.into(), args.clone())); self.1.clone() }
    }
    fn fake(r: Result<Value, String>) -> Fake { Fake(vec![], r) }

    #[test]
    fn initialize_meldet_werkzeuge_und_version() {
        let mut b = fake(Ok(json!({})));
        let r = handle(&json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}), &mut b, "1.2.3").unwrap();
        assert_eq!(r["result"]["protocolVersion"], "2025-03-26");
        assert_eq!(r["result"]["serverInfo"]["name"], "werkbank");
        assert_eq!(r["result"]["serverInfo"]["version"], "1.2.3");
        assert!(r["result"]["capabilities"]["tools"].is_object());
    }

    #[test]
    fn benachrichtigungen_ohne_antwort() {
        let mut b = fake(Ok(json!({})));
        assert!(handle(&json!({"jsonrpc":"2.0","method":"notifications/initialized"}), &mut b, "1").is_none());
    }

    #[test]
    fn tools_list_aus_der_gemeinsamen_tabelle() {
        let mut b = fake(Ok(json!({})));
        let r = handle(&json!({"jsonrpc":"2.0","id":"a","method":"tools/list"}), &mut b, "1").unwrap();
        let names: Vec<&str> = r["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
        for n in ["list_documents", "open_document", "get_text", "add_comment", "fill_form", "run_tool", "save_document"] { assert!(names.contains(&n), "{n}"); }
        for t in r["result"]["tools"].as_array().unwrap() { assert_eq!(t["inputSchema"]["type"], "object"); }
    }

    #[test]
    fn tools_call_wird_weitergereicht() {
        let mut b = fake(Ok(json!({"content":[{"type":"text","text":"ok"}]})));
        let r = handle(&json!({"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_text","arguments":{"pages":"1"}}}), &mut b, "1").unwrap();
        assert_eq!(r["id"], 7);
        assert_eq!(r["result"]["content"][0]["text"], "ok");
        assert_eq!(b.0, vec![("get_text".to_string(), json!({"pages":"1"}))]);
    }

    #[test]
    fn fehler_der_app_werden_zu_iserror() {
        let mut b = fake(Err("nicht erreichbar".into()));
        let r = handle(&json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"undo"}}), &mut b, "1").unwrap();
        assert_eq!(r["result"]["isError"], true);
        assert_eq!(r["result"]["content"][0]["text"], "nicht erreichbar");
    }

    #[test]
    fn unbekannte_methode() {
        let mut b = fake(Ok(json!({})));
        let r = handle(&json!({"jsonrpc":"2.0","id":3,"method":"resources/list"}), &mut b, "1").unwrap();
        assert_eq!(r["error"]["code"], -32601);
    }

    #[test]
    fn steuerkanal_prueft_token_und_freigabe() {
        let body = r#"{"tool":"list_documents","args":{}}"#;
        assert_eq!(check_request("POST", "/call", Some("Bearer abc"), "abc", true, body).unwrap().0, "list_documents");
        assert_eq!(check_request("POST", "/call", Some("Bearer falsch"), "abc", true, body).unwrap_err().0, 401);
        assert_eq!(check_request("POST", "/call", None, "abc", true, body).unwrap_err().0, 401);
        assert_eq!(check_request("POST", "/call", Some("Bearer abc"), "abc", false, body).unwrap_err().0, 403);
        assert_eq!(check_request("GET", "/call", Some("Bearer abc"), "abc", true, body).unwrap_err().0, 404);
        assert_eq!(check_request("POST", "/call", Some("Bearer abc"), "abc", true, "{kaputt").unwrap_err().0, 400);
    }

    #[test]
    fn steuerdatei_lesen() {
        assert_eq!(parse_control(r#"{"port":4711,"token":"t","pid":1}"#), Some(Control { port: 4711, token: "t".into() }));
        assert_eq!(parse_control("{}"), None);
    }

    #[test]
    fn bezeichner_wie_in_der_tauri_konfiguration() {
        let conf: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["identifier"], IDENTIFIER);
    }

    #[test]
    fn token_ist_lang_und_zufaellig() {
        let a = random_token(); let b = random_token();
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
    }
}
