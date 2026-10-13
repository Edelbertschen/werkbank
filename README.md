# Werkbank

PDFs lesen, bearbeiten, umwandeln und schützen – als schlanke Desktop-App für Windows, macOS und Linux. Alles läuft auf dem eigenen Rechner; keine Datei verlässt das Gerät.

Werkbank baut auf [BentoPDF](https://github.com/alam00000/bentopdf) auf und ergänzt dessen Werkzeuge um eine Oberfläche mit Bandleiste, Tabs, Versionsverlauf und Office-, OCR-, PDF/A- und Signatur-Engines, die vollständig in der App enthalten sind.

## Funktionen (Auswahl)

- **Ansehen**: Tabs, Miniaturen, Lesezeichen, Suche mit Trefferliste, Einzel-/Doppelseite, Präsentation, Nachtmodus, Drucken
- **Seiten**: organisieren per Ziehen, drehen, löschen, einfügen, ersetzen, zusammenführen, teilen (nach Seiten, Lesezeichen, Größe), zuschneiden, n-up, Broschüre, Seitenzahlen, Kopf-/Fußzeile, Bates, Wasserzeichen
- **Bearbeiten**: vorhandenen Text ändern, Text und Bilder einfügen, Unterschrift (zeichnen/tippen/Bild), Stempel, Links, echtes Schwärzen (auch per Suchmuster: E-Mail, IBAN, Telefon …), Inhaltsverzeichnis
- **Kommentieren**: Textmarker, Unterstreichen, Durchstreichen, Notizen, Freihand, Formen; Kommentarliste, Export, Einbrennen
- **Formulare**: Felder anlegen und automatisch erkennen, ausfüllen, Daten exportieren/importieren, abflachen
- **Umwandeln**: Word/Excel/PowerPoint/Bilder/E-Mails/Markdown/HTML → PDF; PDF → Word, Excel, PowerPoint, Bilder, SVG, Text, Markdown, HTML, JSON, EPUB, CBZ, **PDF/A**
- **Optimieren**: Komprimieren, **Texterkennung (OCR, Deutsch/Englisch)**, Begradigen, Graustufen, Schriften in Pfade, Web-Optimierung, Reparatur
- **Schützen**: AES-256-Verschlüsselung mit Berechtigungen, **digitale Signaturen (PAdES)** inkl. Zeitstempel und Prüfung, Bereinigen, Metadaten
- **Analysieren**: Dokumente vergleichen (Bild- und Textvergleich), Eigenschaften, Schriften, Bilder/Tabellen extrahieren, Aufbereitung für KI, **Stapelverarbeitung**

Jede Änderung erzeugt einen Stand im Verlauf (Rückgängig/Wiederholen, Sprung zu jedem Stand). Nach einem Absturz werden ungesicherte Dokumente wiederhergestellt.

## Technik

| Teil | Umsetzung |
| --- | --- |
| Hülle | [Tauri 2](https://tauri.app) (Rust), System-WebView – kein mitgeliefertes Chromium |
| Oberfläche | Svelte 5, TypeScript, Vite |
| Anzeige | PDF.js inkl. Anmerkungs-Editoren |
| Bearbeitung | pdf-lib, PyMuPDF (MuPDF über Pyodide/WebAssembly) |
| Office | installiertes LibreOffice, sonst eingebaute WebAssembly-Fassung |
| PDF/A, Graustufen | Ghostscript (WebAssembly) |
| OCR | Tesseract (WebAssembly) |
| Verschlüsselung | qpdf (WebAssembly) |
| Signaturen | zgapdfsigner, node-forge |

Ist LibreOffice installiert, nutzt Werkbank es automatisch für Office-Umwandlungen (etwa 1 Sekunde statt Startzeit der eingebauten Engine). Die PDF-Engine wird im Hintergrund vorbereitet, sobald ein Dokument offen ist.

Die App liefert ihre Oberfläche über einen kleinen lokalen Server (nur `127.0.0.1`) mit Cross-Origin-Isolation aus, damit die WebAssembly-Engines mehrere Threads nutzen können.

## Entwickeln

Voraussetzungen: Node.js 20+, Rust (stable) und die [Tauri-Voraussetzungen](https://tauri.app/start/prerequisites/) für das jeweilige System.

```bash
npm install
npm run engines        # Engines aus node_modules nach public/engines kopieren
npx tauri dev          # App im Entwicklungsmodus
npx tauri build        # Installationspakete bauen
npm run check          # Typprüfung
```

Pakete für alle Systeme baut der Workflow `.github/workflows/release.yml` (Tag `v*` pushen oder manuell starten). Ergebnis: `.dmg` (macOS, Universal), `.msi`/`.exe` (Windows), `.deb`/`.rpm`/`.AppImage` (Linux).

## Lizenz

GNU Affero General Public License v3.0 – siehe [LICENSE](LICENSE). Die verwendeten Komponenten und ihre Lizenzen stehen in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
