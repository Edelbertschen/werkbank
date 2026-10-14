# Werkbank

PDFs lesen, bearbeiten, umwandeln und schützen – als schlanke Desktop-App für Windows, macOS und Linux. Alles läuft auf dem eigenen Rechner; keine Datei verlässt das Gerät.

Werkbank baut auf [BentoPDF](https://github.com/alam00000/bentopdf) auf und ergänzt dessen Werkzeuge um eine Oberfläche mit Bandleiste, Tabs, Versionsverlauf und Office-, OCR-, PDF/A- und Signatur-Engines, die vollständig in der App enthalten sind.

## Funktionen (Auswahl)

- **Ansehen**: Tabs, Miniaturen, Lesezeichen, Suche mit Trefferliste, Einzel-/Doppelseite, Präsentation, Nachtmodus, Drucken
- **Seiten**: organisieren per Ziehen, drehen, löschen, einfügen, ersetzen, zusammenführen, teilen (nach Seiten, Lesezeichen, Größe), zuschneiden, n-up, Broschüre, Seitenzahlen, Kopf-/Fußzeile, Bates, Wasserzeichen
- **Bearbeiten**: Elemente verschieben (Textblöcke, Bilder, eigene Elemente; Bilder skalieren, löschen), vorhandenen Text ändern, Text und Bilder einfügen, Unterschrift (zeichnen/tippen/Bild), Stempel, Links, echtes Schwärzen (auch per Suchmuster: E-Mail, IBAN, Telefon …), Inhaltsverzeichnis
- **Kommentieren**: Textmarker, Unterstreichen, Durchstreichen, Notizen, Freihand, Formen; Kommentarliste, Export, Einbrennen
- **Formulare**: Felder anlegen und automatisch erkennen, ausfüllen, Daten exportieren/importieren, abflachen
- **Umwandeln**: Word/Excel/PowerPoint/Bilder/E-Mails/Markdown/HTML → PDF; PDF → Word, Excel, PowerPoint, Bilder, SVG, Text, Markdown, HTML, JSON, EPUB, CBZ, **PDF/A**
- **Optimieren**: Komprimieren, **Texterkennung (OCR, Deutsch/Englisch)**, Begradigen, Graustufen, Schriften in Pfade, Web-Optimierung, Reparatur
- **Schützen**: AES-256-Verschlüsselung mit Berechtigungen, **digitale Signaturen (PAdES)** inkl. Zeitstempel und Prüfung, Bereinigen, Metadaten
- **Analysieren**: Dokumente vergleichen (Bild- und Textvergleich), Eigenschaften, Schriften, Bilder/Tabellen extrahieren, Aufbereitung für KI, **Stapelverarbeitung**

Es gibt kein „Übernehmen“: Jede Änderung – Text, Form, Markierung, Stempel, Verschieben – ist sofort ein Stand im Verlauf (Rückgängig/Wiederholen je Änderung, Sprung zu jedem Stand). Eigene Elemente bleiben in der Sitzung bearbeitbar; beim Speichern und vor Werkzeugen wie Drehen oder Komprimieren werden sie ins PDF geschrieben. Anmerkungen in gespeicherten PDFs – auch aus Acrobat und anderen Programmen (Rechtecke, Ellipsen, Linien, Pfeile, Freihand, Markierungen, Textkommentare, Notizen) – lassen sich unter „Elemente verschieben“ wieder anfassen: verschieben, umfärben, löschen; Autor und Kommentartext bleiben erhalten. Nach einem Absturz werden ungesicherte Dokumente wiederhergestellt.

## Sprachen

Deutsch und Englisch. Die App startet in der Systemsprache; unter Einstellungen › Sprache lässt sie sich festlegen (wirksam nach einem Neustart). Der deutsche Text ist zugleich der Schlüssel der Übersetzung (`src/lib/i18n/en.ts`). Neue Texte: `node scripts/i18n.mjs extract` → übersetzen → `node scripts/i18n.mjs wrap`; `node scripts/i18n.mjs check` (läuft auch in `npm test`) meldet Texte ohne Übersetzung. Eine weitere Sprache ist eine zusätzliche Wörterbuchdatei.

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

Text bearbeiten und einfügen funktioniert wie in einer Textverarbeitung: Schriftart (eingebaut oder installiert), Größe, Fett, Kursiv, Unterstrichen, Farbe – für markierte Wörter oder den ganzen Block –, Ausrichtung und Zeilenabstand; Einfügen übernimmt reinen Text. Die Leiste zeigt die Schrift des Absatzes und ob sie eingebettet, installiert oder durch eine Ersatzschrift vertreten ist; Ersatz ist auch am Text markiert. Beim Bearbeiten von Text behält Werkbank die Schrift: Ist die Originalschrift vollständig eingebettet, wird sie wiederverwendet; sonst eine installierte Schrift gleichen Namens (sofern ihre Lizenz das Einbetten erlaubt); sonst eine metrisch passende Ersatzschrift (Helvetica, Times oder Courier im gleichen Schnitt).

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

## Tests

Testgetrieben im Chicago-Stil: Die Tests prüfen das Ergebnis echter Abläufe mit echten Bausteinen (pdf-lib, pdf.js, WebAssembly-Engines) statt Attrappen.

```bash
npm test           # Kernlogik: Seitenwerkzeuge, Verlauf, Overlay, Textbearbeitung, Suche (Vitest)
npm run test:e2e   # Oberfläche und Engines im echten Chromium gegen den Produktions-Build (Playwright)
```

Der Korpus schwieriger PDFs in `tests/fixtures` (verschlüsselt, beschädigt, gedreht, gemischte Formate, Formulare, Scan, Unicode …) entsteht mit `scripts/make-corpus.py`. Der Workflow `.github/workflows/test.yml` führt alles bei jedem Push aus.

**Härtetest:** `npm run sweep -- <ordner-mit-pdfs>` schickt jede Datei durch die App (öffnen, Element hinzufügen, anhängend speichern, Seite drehen, neu speichern) und prüft jede Ausgabe mit `qpdf --check`. Als Korpus eignen sich die rund 1.000 Testdateien von pdf.js (`test/pdfs`). Voraussetzung: `npm run build:test` und `npx vite preview --port 4173`.

Pakete für alle Systeme baut der Workflow `.github/workflows/release.yml` (Tag `v*` pushen oder manuell starten). Ergebnis: `.dmg` (macOS, Universal), `.msi`/`.exe` (Windows), `.deb`/`.rpm`/`.AppImage` (Linux).

## KI-Assistenten (MCP)

Werkbank lässt sich von KI-Assistenten wie Claude Desktop steuern: Dokumente lesen, durchsuchen, kommentieren (z. B. „markiere jede Stelle mit ‚Kündigung‘“), Formulare ausfüllen, Werkzeuge ausführen, speichern. Jede Änderung ist ein eigener Schritt im Verlauf und lässt sich rückgängig machen; gespeichert wird nur auf ausdrücklichen Aufruf.

1. In Werkbank unter **Einstellungen › KI-Assistenten** die Steuerung erlauben (standardmäßig aus).
2. Den dort angezeigten Eintrag in die Konfiguration des Assistenten übernehmen, z. B. für Claude Desktop:

```json
{ "mcpServers": { "werkbank": { "command": "/Applications/Werkbank.app/Contents/MacOS/werkbank", "args": ["mcp"] } } }
```

`werkbank mcp` spricht MCP über stdin/stdout und reicht jeden Aufruf an die laufende Werkbank weiter (startet sie bei Bedarf). Die Verbindung läuft nur über 127.0.0.1 mit einem Zufallstoken aus einer nur für den Nutzer lesbaren Datei. Die Werkzeuge stehen in `src/lib/mcp-tools.json`.

## Lizenz

GNU Affero General Public License v3.0 – siehe [LICENSE](LICENSE). Die verwendeten Komponenten und ihre Lizenzen stehen in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
