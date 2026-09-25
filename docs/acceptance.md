# Abnahme

## Automatisierte Nachweise

- TypeScript-Typprüfung und Vite-Produktionsbuild.
- Dokumenttests: kein Schreiben bei Bearbeitung, explizites Speichern, Speicherkonflikte, konkurrierende Eingaben, Speichern vor Build, Speicherfehler verhindern Build, nur letzte Dateireferenz persistieren.
- Editor-/Parser-Tests: Wrapping, vorhandene Klammern, mehrere Argumente, Labels, URLs, Mathematik, Verbatim, verschachtelte Umgebungen und Textpositionen.
- Browser: Snippet-Argumentnavigation, Undo, Suche, feste Endausgaben, ungespeicherte Tabs, echte Browser-Datei-Handles, Entwurf ohne PDF-Export, Final-Ausgabe, Vorschau, Zoom, Wiederöffnung.
- Rust: Origin-/Host-Prüfung, Token-/Sitzungsgrenzen, Traversal, Wrapper-Escaping, Logdiagnosen, Abbruch von Unterprozessen und Ausgabegrenzen.
- Opt-in-Engine-Tests: LuaLaTeX, pdfLaTeX, XeLaTeX, externe Bilder, boolesche/Text-Defines, unveränderte Quelldateien, BibTeX, Biber und bidirektionales SyncTeX.

## Lokal ausgeführt

In dieser Arbeitsumgebung bestanden die TypeScript-Typprüfung, 84 Unit-Tests und 15 Chromium-Browser-Tests. Frühere Prüfungen umfassten 11 Rust-Tests einschließlich echter Builds mit allen drei Engines, BibTeX/Biber und SyncTeX sowie zwei Browserprüfungen der Produktions-PWA für Chromium-Installierbarkeit, Offline-Rechtschreibung und die Kette Browser → Bridge → LuaLaTeX → PDF.js → SyncTeX. Windows x64 sowie macOS arm64/x64 bestanden die Rust-Cross-Typprüfung. Browser-Dateiauswahl wird in automatisierten Tests durch echte OPFS-Handles ersetzt; dies belegt keine native Dateizuordnung oder externe Ordnerberechtigung.

## Native Freigabematrix

Diese Punkte benötigen reale Zielsysteme und sind durch Linux-Tests oder Cross-Compilation nicht bewiesen.

| Prüfung | Windows 11 / Edge | macOS / Edge oder Chrome |
|---|---|---|
| Installer/DMG installieren und deinstallieren | Offen | Offen |
| Bridge startet nach Anmeldung | Offen | Offen |
| PWA installieren, `.tex` zuordnen, per Doppelklick starten | Offen | Offen |
| Mehrere `.tex`-Dateien an bestehendes App-Fenster übergeben | Offen | Offen |
| Externe Datei- und Ordnerberechtigungen nach Browserneustart | Offen | Offen |
| Offline-Neustart mit lokalem TeX und Wörterbüchern | Offen | Offen |
| HiDPI und Zoom bei unterschiedlichen Betriebssystem-Skalierungen | Offen | Offen |
| Windows Job Object bzw. macOS-Prozessabbruch | Offen | Offen |
| Signierung / Notarisierung mit Herausgeberzertifikat | Offen | Offen |

## Manuelles Szenario

1. Zwei gespeicherte `.tex`-Dateien öffnen, beide verändern, nur die erste speichern.
2. Einen Tab-Schließversuch abbrechen; anschließend bewusst verwerfen. Kein ungespeicherter Inhalt darf nach Neustart erscheinen.
3. Eine ältere Begleitdatei mit nur einer gewählten Endausgabe öffnen, beide Endausgaben prüfen und die normalisierte Datei beim nächsten Speichern kontrollieren.
4. Entwurf erstellen: kein PDF und keine Hilfsdatei darf im Originalordner entstehen.
5. Final erstellen: beide PDFs nur nach zwei erfolgreichen Builds exportieren; bestehende PDFs erst nach gemeinsamer Bestätigung ersetzen und bei einem Teilerfolg unangetastet lassen.
6. Datei extern ändern: Speichern/Build muss den Konflikt behandeln. Eine verweigerte Speicherberechtigung darf keinen Build starten.
7. Einen Fehler einfügen: Panel öffnet, relevante Hauptdateizeile wird angesprungen; bestehende Vorschau bleibt erkennbar alt.
8. SyncTeX vorwärts/rückwärts bei mehreren Zoomstufen prüfen; nach Texteingabe muss die Synchronisation gesperrt sein.
9. Internetverbindung trennen, App neu starten, beide Wörterbücher und einen Build verwenden.
10. Bridge während eines Builds beenden und wieder starten: keine fremden Dateien verändern, alte temporäre Jobs nicht wiederherstellen.
