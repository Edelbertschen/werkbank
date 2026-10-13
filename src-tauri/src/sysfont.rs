//! Installierte Schriften finden, die zum Namen einer Schrift im PDF passen.
//!
//! PDFs nennen Schriften mit PostScript-Namen ("ABCDEF+ArialMT", "Arial-BoldMT",
//! "TimesNewRomanPSMT", "Calibri,Bold"). Gesucht wird zuerst nach dem exakten
//! PostScript-Namen, dann nach der Familie mit passender Strichstärke und Lage.
//! Schriften, deren Lizenz das Einbetten verbietet, werden nicht herausgegeben.
//! Einzelne Schnitte aus Sammlungen (.ttc) werden als eigenständige Schrift geliefert,
//! weil MuPDF beim Einbetten keinen Schnitt-Index kennt.

use fontdb::{Database, Style, ID};
use std::sync::OnceLock;

static DB: OnceLock<Database> = OnceLock::new();

fn system_db() -> &'static Database {
    DB.get_or_init(|| {
        let mut db = Database::new();
        db.load_system_fonts();
        db
    })
}

/// Schrift für `name` (Name aus dem PDF) aus den installierten Schriften, als eigenständige Datei
pub fn lookup(name: &str, bold: bool, italic: bool) -> Option<Vec<u8>> {
    let db = system_db();
    let id = find(db, name, bold, italic)?;
    face_bytes(db, id)
}

/// Kleinbuchstaben und Ziffern, ohne Herstellerkürzel am Ende ("MT", "PS", "PSMT", "Std", "Pro")
pub fn normalize(s: &str) -> String {
    let mut n: String = s.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_ascii_lowercase();
    for suffix in ["psmt", "mt", "ps", "std", "pro"] {
        if n.len() > suffix.len() + 2 && n.ends_with(suffix) {
            n.truncate(n.len() - suffix.len());
            break;
        }
    }
    n
}

/// Teilschrift-Präfix ("ABCDEF+") entfernen und Komma-Schreibweise ("Arial,Bold") vereinheitlichen
fn clean(name: &str) -> String {
    let n = match name.split_once('+') {
        Some((p, rest)) if p.len() == 6 && p.chars().all(|c| c.is_ascii_uppercase()) => rest,
        _ => name,
    };
    n.replace(',', "-").trim().to_string()
}

/// Zielstärke aus dem Stil-Teil des Namens (100–900)
fn weight_of(style: &str, bold: bool) -> u16 {
    let s = style.to_ascii_lowercase();
    let table: [(&str, u16); 12] = [
        ("extralight", 200), ("ultralight", 200), ("thin", 100), ("light", 300), ("semibold", 600), ("demibold", 600),
        ("demi", 600), ("extrabold", 800), ("ultrabold", 800), ("black", 900), ("heavy", 900), ("medium", 500),
    ];
    for (k, w) in table {
        if s.contains(k) {
            return w;
        }
    }
    if bold || s.contains("bold") { 700 } else { 400 }
}

pub fn find(db: &Database, name: &str, bold: bool, italic: bool) -> Option<ID> {
    let name = clean(name);
    if name.is_empty() {
        return None;
    }
    // 1. Exakter PostScript-Name
    let ps = name.replace(' ', "").to_ascii_lowercase();
    // (nur wenn er nicht der verlangten Strichstärke oder Lage widerspricht)
    if let Some(f) = db.faces().find(|f| f.post_script_name.to_ascii_lowercase() == ps) {
        if (!bold || f.weight.0 >= 600) && (!italic || f.style != Style::Normal) {
            return Some(f.id);
        }
    }
    // 2. Familie + Schnitt
    let (fam, style) = name.split_once('-').unwrap_or((name.as_str(), ""));
    let want_fam = normalize(fam);
    let want_italic = italic || style.to_ascii_lowercase().contains("italic") || style.to_ascii_lowercase().contains("oblique");
    let want_weight = weight_of(style, bold);
    db.faces()
        .filter(|f| f.families.iter().any(|(n, _)| normalize(n) == want_fam))
        .min_by_key(|f| {
            let it = f.style != Style::Normal;
            (if it != want_italic { 10_000 } else { 0 }) + (f.weight.0 as i32 - want_weight as i32).unsigned_abs()
        })
        .map(|f| f.id)
}

/// Daten eines Schnitts, nur wenn Einbetten erlaubt ist; Sammlungen werden aufgelöst
pub fn face_bytes(db: &Database, id: ID) -> Option<Vec<u8>> {
    db.with_face_data(id, |data, index| {
        let face = ttf_parser::Face::parse(data, index).ok()?;
        if matches!(face.permissions(), Some(ttf_parser::Permissions::Restricted)) {
            return None;
        }
        if data.starts_with(b"ttcf") { extract_from_collection(data, index) } else { Some(data.to_vec()) }
    })?
}

fn be16(d: &[u8], o: usize) -> Option<u16> { Some(u16::from_be_bytes(d.get(o..o + 2)?.try_into().ok()?)) }
fn be32(d: &[u8], o: usize) -> Option<u32> { Some(u32::from_be_bytes(d.get(o..o + 4)?.try_into().ok()?)) }

/// Einen Schnitt aus einer TrueType/OpenType-Sammlung als eigenständige Schrift herauslösen
pub fn extract_from_collection(data: &[u8], index: u32) -> Option<Vec<u8>> {
    let count = be32(data, 8)?;
    if index >= count {
        return None;
    }
    let dir = be32(data, 12 + 4 * index as usize)? as usize;
    let num = be16(data, dir + 4)? as usize;
    let header_len = 12 + 16 * num;
    let mut out = Vec::with_capacity(header_len);
    out.extend_from_slice(data.get(dir..dir + 12)?);
    let mut tables = Vec::with_capacity(num);
    let mut offset = header_len;
    for i in 0..num {
        let rec = dir + 12 + 16 * i;
        let (tag, sum, off, len) = (data.get(rec..rec + 4)?, be32(data, rec + 4)?, be32(data, rec + 8)? as usize, be32(data, rec + 12)? as usize);
        let body = data.get(off..off + len)?;
        out.extend_from_slice(tag);
        out.extend_from_slice(&sum.to_be_bytes());
        out.extend_from_slice(&(offset as u32).to_be_bytes());
        out.extend_from_slice(&(len as u32).to_be_bytes());
        offset += (len + 3) & !3;
        tables.push(body);
    }
    for body in tables {
        out.extend_from_slice(body);
        out.resize((out.len() + 3) & !3, 0);
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fonts_dir() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../node_modules/pdfjs-dist/standard_fonts") }
    fn db() -> Database {
        let mut db = Database::new();
        db.load_fonts_dir(fonts_dir());
        db
    }
    fn ps_of(db: &Database, id: ID) -> String { db.face(id).unwrap().post_script_name.clone() }

    #[test]
    fn findet_teilschrift_namen_ueber_postscript_namen() {
        let db = db();
        assert_eq!(ps_of(&db, find(&db, "BAAAAA+LiberationSans-Bold", false, false).unwrap()), "LiberationSans-Bold");
        assert_eq!(ps_of(&db, find(&db, "LiberationSans-Italic", false, false).unwrap()), "LiberationSans-Italic");
    }

    #[test]
    fn findet_familie_mit_passendem_schnitt() {
        let db = db();
        assert_eq!(ps_of(&db, find(&db, "Liberation Sans", false, false).unwrap()), "LiberationSans");
        assert_eq!(ps_of(&db, find(&db, "Liberation Sans", true, false).unwrap()), "LiberationSans-Bold");
        assert_eq!(ps_of(&db, find(&db, "LiberationSans,BoldItalic", false, false).unwrap()), "LiberationSans-BoldItalic");
        assert_eq!(ps_of(&db, find(&db, "LiberationSansMT-Semibold", false, false).unwrap()), "LiberationSans-Bold");
    }

    #[test]
    fn unbekannte_schrift_liefert_nichts() {
        let db = db();
        assert!(find(&db, "FrutigerLTStd-Roman", false, false).is_none());
        assert!(find(&db, "", true, false).is_none());
    }

    #[test]
    fn namen_vereinheitlichen() {
        assert_eq!(normalize("TimesNewRomanPSMT"), "timesnewroman");
        assert_eq!(normalize("Times New Roman"), "timesnewroman");
        assert_eq!(normalize("Frutiger LT Std"), normalize("FrutigerLTStd"));
        assert_eq!(normalize("ArialMT"), "arial");
    }

    #[test]
    fn liefert_eingebettete_schrift_als_datei() {
        let db = db();
        let bytes = face_bytes(&db, find(&db, "LiberationSans", false, false).unwrap()).unwrap();
        assert_eq!(ttf_parser::Face::parse(&bytes, 0).unwrap().names().into_iter().count() > 0, true);
    }

    /// Sammlung aus zwei Schriften bauen (wie macOS-.ttc) und den zweiten Schnitt herauslösen
    #[test]
    fn loest_schnitt_aus_sammlung() {
        let a = std::fs::read(fonts_dir().join("LiberationSans-Regular.ttf")).unwrap();
        let b = std::fs::read(fonts_dir().join("LiberationSans-Bold.ttf")).unwrap();
        let ttc = build_ttc(&[&a, &b]);
        let face = ttf_parser::Face::parse(&ttc, 1).unwrap();
        assert!(face.is_bold());
        let single = extract_from_collection(&ttc, 1).unwrap();
        let f = ttf_parser::Face::parse(&single, 0).unwrap();
        assert!(f.is_bold());
        assert_eq!(f.number_of_glyphs(), ttf_parser::Face::parse(&b, 0).unwrap().number_of_glyphs());
        assert!(f.glyph_index('ß').is_some());
        assert!(extract_from_collection(&ttc, 2).is_none());
    }

    /// Minimaler TTC-Bauer für den Test: Tabellen jeder Schrift hintereinander, Verzeichnisse mit absoluten Offsets
    fn build_ttc(fonts: &[&[u8]]) -> Vec<u8> {
        let dirs_len: usize = fonts.iter().map(|f| 12 + 16 * be16(f, 4).unwrap() as usize).sum();
        let mut out = b"ttcf".to_vec();
        out.extend_from_slice(&0x0001_0000u32.to_be_bytes());
        out.extend_from_slice(&(fonts.len() as u32).to_be_bytes());
        let head = 12 + 4 * fonts.len();
        let mut dir_off = head;
        let mut data_off = head + dirs_len;
        let mut dirs = Vec::new();
        let mut bodies = Vec::new();
        for f in fonts {
            out.extend_from_slice(&(dir_off as u32).to_be_bytes());
            let num = be16(f, 4).unwrap() as usize;
            dirs.extend_from_slice(&f[0..12]);
            for i in 0..num {
                let rec = 12 + 16 * i;
                let (off, len) = (be32(f, rec + 8).unwrap() as usize, be32(f, rec + 12).unwrap() as usize);
                dirs.extend_from_slice(&f[rec..rec + 8]);
                dirs.extend_from_slice(&(data_off as u32).to_be_bytes());
                dirs.extend_from_slice(&(len as u32).to_be_bytes());
                bodies.extend_from_slice(&f[off..off + len]);
                bodies.resize((bodies.len() + 3) & !3, 0);
                data_off = head + dirs_len + bodies.len();
            }
            dir_off += 12 + 16 * num;
        }
        out.extend_from_slice(&dirs);
        out.extend_from_slice(&bodies);
        out
    }
}
