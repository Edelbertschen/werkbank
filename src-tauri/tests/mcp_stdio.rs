// `werkbank mcp` von außen gestartet, wie ein KI-Assistent es tut: Handschlag und Werkzeugliste über stdio.
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

#[test]
fn handschlag_und_werkzeugliste_ueber_stdio() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_werkbank"))
        .arg("mcp")
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
        .spawn().expect("Programm startet");
    let mut stdin = child.stdin.take().unwrap();
    let mut out = BufReader::new(child.stdout.take().unwrap());
    writeln!(stdin, r#"{{"jsonrpc":"2.0","id":1,"method":"initialize","params":{{"protocolVersion":"2025-06-18","capabilities":{{}},"clientInfo":{{"name":"test","version":"1"}}}}}}"#).unwrap();
    writeln!(stdin, r#"{{"jsonrpc":"2.0","method":"notifications/initialized"}}"#).unwrap();
    writeln!(stdin, r#"{{"jsonrpc":"2.0","id":2,"method":"tools/list"}}"#).unwrap();
    let mut line = String::new();
    out.read_line(&mut line).unwrap();
    let init: serde_json::Value = serde_json::from_str(&line).unwrap();
    assert_eq!(init["id"], 1);
    assert_eq!(init["result"]["serverInfo"]["name"], "werkbank");
    line.clear();
    out.read_line(&mut line).unwrap();
    let list: serde_json::Value = serde_json::from_str(&line).unwrap();
    assert_eq!(list["id"], 2);
    assert!(list["result"]["tools"].as_array().unwrap().len() >= 10);
    drop(stdin); // stdin zu → Server endet
    assert!(child.wait().unwrap().success());
}
