# SIMCom Serial AT Console

> [English](README.en.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Français](README.fr.md) · **Deutsch** · [Русский](README.ru.md) · [中文](README.zh.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

**AT-Befehls**-Konsole für **SIMCom**-Mobilfunkmodule, die vollständig im Browser läuft. Sie spricht über die serielle Schnittstelle mit dem Modul via **Web Serial API** — ohne Installation — und bringt einen **virtuellen Modus** (integrierter Emulator) mit, um alles ohne Hardware zu testen.

Gebaut für die **A76xx / A7672SA**-Familie, mit visuellen Assistenten (*Wizards*) für die häufigsten Operationen — Netz, Daten, GNSS, SMS, E-Mail, Telefonbuch, Sprachanrufe, TLS, Dateisystem, Hardware, Störerkennung und mehr — plus einer rohen Konsole, um beliebige AT-Befehle von Hand zu senden.

> Befehlsreferenz: *A76XX Series AT Command Manual* (V2.04).

---

## Inhalt

- [Funktionen](#funktionen)
- [Voraussetzungen](#voraussetzungen)
- [Schnellstart](#schnellstart)
- [Virtueller Modus (ohne Hardware)](#virtueller-modus-ohne-hardware)
- [Verbindung mit einem echten Modul](#verbindung-mit-einem-echten-modul)
- [Die Oberfläche](#die-oberfläche)
- [Assistenten (Wizards)](#assistenten-wizards)
- [Projektstruktur](#projektstruktur)
- [Architektur](#architektur)
- [Die Konsole erweitern](#die-konsole-erweitern)
- [Companion-Bibliothek: `simcom-at-parser`](#companion-bibliothek-simcom-at-parser)
- [Hinweise zu echter Hardware](#hinweise-zu-echter-hardware)
- [Browser-Unterstützung](#browser-unterstützung)
- [Bekannte Einschränkungen](#bekannte-einschränkungen)
- [Lizenz](#lizenz)

---

## Funktionen

- **100% im Browser**, kein Backend, keine Abhängigkeiten. Einfach `index.html` öffnen.
- **Web Serial API**, um mit dem Modul über USB/UART zu sprechen.
- **Virtueller Modus**: ein integrierter AT-Emulator, der Dutzende Befehle beantwortet (Netz, Daten, GNSS, SMS, E-Mail, Telefonbuch, Sprache, TLS, FS, Hardware, Störerkennung…), um ohne Platine zu entwickeln und zu demonstrieren.
- **Rohe Konsole**: sende beliebige AT-Befehle, mit Verlauf, Autoscroll, Zeitstempel und optionalem Echo.
- **Schnellbefehle**, in der Seitenleiste nach Gruppe organisiert.
- **Visuelle Assistenten** für über 20 Funktionsbereiche, mit Formularen, Live-Anzeigen, Karten, SVG-Diagrammen und URC-Parsing.
- **Makros** mit verketteten Schritten, Verzögerungen, Dateneingabe und Steuerzeichen (`Ctrl-Z`, `ESC`).
- **10 Sprachen** (en, es, pt, it, fr, de, ru, zh, ja, ko).
- **Helles / dunkles Theme**.
- **Größenveränderbare Panels** per Maus (Breite und Höhe), Doppelklick zum Zurücksetzen, und ein **maximierter** Assistent-Modus.

---

## Voraussetzungen

- Ein **Chromium**-basierter Browser mit Web Serial API: **Chrome**, **Edge** oder **Opera** (Desktop).
  - Firefox und Safari unterstützen Web Serial derzeit **nicht**.
- Zur Verbindung mit Hardware muss das Modul eine **serielle Schnittstelle** (USB-CDC oder UART–USB-Adapter) bereitstellen, die vom Betriebssystem erreichbar ist.
- Unter Linux braucht man meist Rechte am Gerät (z. B. Mitglied der Gruppe `dialout`).

Für die Konsole wird kein Node.js benötigt. Node wird nur für die [Companion-Bibliothek](#companion-bibliothek-simcom-at-parser) und ihre Tests verwendet.

---

## Schnellstart

1. Projekt herunterladen/klonen.
2. **`index.html`** in Chrome oder Edge öffnen.
   - Funktioniert als lokale Datei (`file://`) oder über einen statischen Server.
   - Falls du es servieren möchtest:
     ```bash
     # einfache Option mit Python
     python3 -m http.server 8080
     # dann http://localhost:8080 öffnen
     ```
3. Sprache und Theme oben rechts auswählen.
4. Zum Testen ohne Hardware **Virtual** aktivieren (siehe unten). Für echte Hardware die seriellen Parameter einstellen und **Connect** klicken.

> ⚠️ Die **eingebettete Chat-Vorschau funktioniert nicht**, weil die externen `css/`, `js/` und `lang/` nicht geladen werden. Du musst **das ZIP herunterladen und `index.html` lokal öffnen**.

---

## Virtueller Modus (ohne Hardware)

Aktiviere den **Virtual**-Schalter in der oberen Leiste und klicke **Connect**. Die Konsole verbindet sich mit einem **AT-Emulator**, der ein Modul simuliert (standardmäßig ein *A7672SA-FASE*) und auf Befehle wie die echte Firmware antwortet, inklusive asynchroner **URCs**:

- Modul-, SIM-, Netz- und Signalinfos.
- Öffnen/Schließen der Datensitzung und IP.
- GNSS mit NMEA-Frames (`GSV`/`GGA`) für Sky View und Karte.
- SMS (vorgeladener Posteingang, Senden mit `>`-Prompt).
- Zertifikat-Download nach Bytelänge (`CCERTDOWN`).
- Hardware-Auslesungen (Batterie, Temperatur, ADC, GPIO).
- Störerkennung mit periodischem `+SJDR:`-URC.
- E-Mail (SMTP) mit dem vollständigen Prompt-Ablauf für Betreff/Text.
- Telefonbuch (vorgeladene Einträge, hinzufügen/suchen/löschen) und Sprachanrufe (wählen → aktiv, auflegen).

Das ist der empfohlene Weg, das Werkzeug zu erkunden und Demos zu machen.

---

## Verbindung mit einem echten Modul

Stelle in der oberen Leiste die Port-Parameter ein und klicke **Connect** (der Browser fragt nach dem seriellen Gerät):

| Parameter | Optionen |
|-----------|----------|
| **Baud**  | 9600 · 57600 · 115200 · 230400 · 460800 · 921600 |
| **Data**  | 8 · 7 |
| **Stop**  | 1 · 2 |
| **Parity**| None · Even · Odd |
| **EOL**   | CR · CRLF · LF (Terminator, der an jeden Befehl angehängt wird) |

Die **Statusleiste** zeigt Verbindung (online/offline), Port, Signal, Netzregistrierung und Betreiber.

> Das Ändern der **Baudrate** des Moduls (UART-Assistent → `AT+IPR`) unterbricht die aktuelle serielle Verbindung: du musst dich mit der neuen Geschwindigkeit neu verbinden.

---

## Die Oberfläche

Der Bildschirm ist in drei Zonen unterteilt, alle **größenveränderbar**:

```
┌──────────┬───────────────────┬───────────────────────────┐
│ Sidebar  │  Assistent (wiz)  │  AT-Konsole                │
│ (Gruppen)│  (Menü-Panel)     │  (Log + Befehlseingabe)    │
└──────────┴───────────────────┴───────────────────────────┘
```

- **Obere Leiste**: serielle Parameter, Sprache, Theme, Virtual-Schalter und Connect-Button.
- **Sidebar**: gruppierte Schnellbefehle. Jede Gruppe mit ⚙-Symbol öffnet ihren **Assistenten**.
- **Assistent**: zentrales Panel, das mit dem gewählten Menü öffnet. Hat **Maximieren** (⛶)- und **Schließen** (✕)-Buttons.
- **Konsole**: Sitzungs-Log (mit Schaltern **TIME**, **SHOW ECHO**, **AUTO-SCROLL**), AT-Befehlseingabe und **Makro**-Versand.

### Größenveränderbare Panels

- Ziehe den **Trenner Sidebar │ Assistent**, um die Breite der Seitenleiste zu ändern.
- Ziehe den **Trenner Assistent │ Konsole**, um die Breite des Assistenten zu ändern (oder die **Höhe**, wenn der Bildschirm schmal ist und die Panels gestapelt werden).
- **Doppelklick** auf einen Trenner setzt das jeweilige Panel auf die Standardgröße zurück.
- **Maximieren** eines Assistenten dehnt ihn über die Breite von Panel + Konsole aus (Konsole unten, beginnt im Verhältnis **60/40**); die Trenner funktionieren weiter.

### Makros und Steuerzeichen

Makros verketten mehrere Befehle. Sie unterstützen:

| Token | Aktion |
|-------|--------|
| `@delay` | Warten (konfigurierbare Verzögerung zwischen Schritten) |
| `>data`  | sendet `data` nach einem `>`-Prompt |
| `^Z`     | `Ctrl-Z` (Ende von SMS / Payload) |
| `^[`     | `ESC` (abbrechen) |

Jeder Assistent bietet außerdem einen Schalter **„in den Editor laden statt ausführen“**, praktisch, um den Befehl vor dem Senden zu prüfen.

---

## Assistenten (Wizards)

Jede Sidebar-Gruppe kann einen Assistenten öffnen. Die vier Protokoll-Assistenten (TCP/UDP, HTTP, FTP, MQTT) nutzen ein generisches Formular; der Rest sind maßgeschneiderte Panels.

| Assistent | Was er macht | Wichtigste AT-Befehle |
|-----------|--------------|------------------------|
| **Basics** | Modulinfos (Modell, Revision, IMEI, SIM, Signal), Echo, Fehlerstufe `CMEE`, und **Power/CFUN** (Full/Min/RF off/Reset). | `SIMCOMATI`, `CPIN?`, `CSQ`, `ATE`, `CMEE`, `CFUN` |
| **SIM** | ICCID/IMSI/SPN, PIN-Entsperrung, Lock und PIN-Wechsel. | `CICCID`, `CIMI`, `CSPN?`, `CPIN`, `CLCK`, `CPWD` |
| **Network / signal** | Betreiber, Signal (dBm), Registrierung, Technologie und PS-Attach. **Netzmodus**-Auswahl mit Lesen und Abfrage der unterstützten Modi. | `COPS?`, `CSQ`, `CEREG?`, `CGATT?`, `CNMP` |
| **Data** | Status der Datensitzung und IP, Sitzung öffnen/schließen, und APN (lesen/setzen). | `NETOPEN?`, `IPADDR`, `NETCLOSE`, `CGDCONT`, `CGATT?` |
| **TCP / UDP / Ping** | Formular für Sockets und Ping. | `CIPOPEN`, `CIPSEND`, `CPING`, … |
| **HTTP** | Formular für HTTP(S)-Anfragen. | `HTTPINIT`, `HTTPPARA`, `HTTPACTION`, … |
| **FTP** | Formular für FTP(S)-Übertragungen. | `CFTPSxxx` … |
| **MQTT** | Formular für MQTT(S)-Verbindung und -Veröffentlichung. | `CMQTTxxx` … |
| **File System** | Datei-Browser des Moduls (auflisten, betreten, löschen). | `CFSGFRS`, `CFSWFILE`, `CFSDFILE`, … |
| **GNSS** | Power/Modus, Cold/Warm/Hot-Start, Fix (lat/lon/alt/HDOP/UTC), OSM-Karte, polare **Sky View** SVG und Satelliten-Signalbalken (NMEA `GSV`). | `CGNSSPWR`, `CGPSCOLD/WARM/HOT`, `CGNSSINFO`, `CGNSSTST` |
| **LBS** | Ortung über Basisstation + Karte. | `CLBS` |
| **SMS** | Verfassen/senden (`>`-Prompt + `Ctrl-Z`), geparster Posteingang und Löschen. | `CMGS`, `CMGL`, `CMGD` |
| **TLS / Cert** | Zertifikate auflisten/löschen, **PEM herunterladen** (`CCERTDOWN` nach Bytelänge) und den SSL-Kontext konfigurieren (Version, authmode, CA). | `CCERTLIST`, `CCERTDOWN`, `CCERTDELE`, `CSSLCFG` |
| **Time / diag** | Manuelle Uhr (Kalender + Zeitzone), automatische Zeitzone, NTP und DNS-Auflösung. | `CCLK`, `CTZU`, `CNTP`, `CDNSGIP` |
| **Serial / UART** | Baud, Framing (`ICF`, z. B. 8N1=`2,2`), Flusssteuerung, Sleep und CMUX, mit Statusabfragen. | `IPR`, `ICF`, `IFC`, `CSCLK`, `CMUX` |
| **Hardware** | Batterie, Temperatur und ADC mit SVG-Diagrammen; GPIO (IN/OUT, LOW/HIGH) und Spannungsalarm mit Doppelknopf-Slider. | `CBC`, `CPMUTEMP`, `CADC`, `CGDRT`, `CGSETV`, `CGGETV`, `CVALARM` |
| **Wi-Fi scan** | AP-Scan (BSSID, Kanal, Signal). | `CWSTASCAN` |
| **Jamming** | Erkennung aktivieren, Live-Anzeige via URC (`+SJDR:`) und Konfiguration (Periode, min RxLev, min Kanäle, URC bei Änderung). | `SJDR`, `SJDCFG` |
| **Email** | SMTP(S): Server, Authentifizierung, Verfassen (Von/An/Betreff/Text) und **Senden** mit Ergebnis-URC. Nur SMTP-Versand (kein POP3/IMAP). | `CSMTPSSRV`, `CSMTPSAUTH`, `CSMTPSFROM`, `CSMTPSRCPT`, `CSMTPSSUB`, `CSMTPSBODY`, `CSMTPSSEND` |
| **Telefonbuch** | Speicher (SM/ME/DC/RC/MC/FD) mit belegt/gesamt, Einträge auflisten/hinzufügen/löschen, suchen und eigene Nummer. | `CPBS`, `CPBR`, `CPBW`, `CPBF`, `CNUM` |
| **Sprachanrufe** | Live-Anrufstatus (untätig/wählt/eingehend/im Gespräch), wählen/annehmen/auflegen, DTMF-Tastenfeld und Anrufer-ID-Schalter. | `ATD`, `ATA`, `CHUP`, `CLCC`, `CLIP`, `VTS` |

---

## Projektstruktur

```
.
├── index.html              # einzelne Seite (lädt css/, js/ und lang/)
├── css/
│   ├── styles.css          # Stile und Layout (größenveränderbare Panels und Scrollbars)
│   ├── theme-dark.css      # Variablen des dunklen Themes
│   └── theme-light.css     # Variablen des hellen Themes
├── js/
│   ├── i18n.js             # Internationalisierungs-Engine (Registrierung + t())
│   ├── serial.js           # Web-Serial-Transport, Framer, Klassifizierer,
│   │                       #   AT-Emulator (virtueller Modus) und Live-Parser
│   ├── data.js             # Definition von Schnellbefehlen, Makros und Wizards
│   └── app.js              # UI: Verbindung, Sidebar, Konsole, Wizard-Rendering,
│                           #   größenveränderbare Panels, Theme, Sprache
├── lang/
│   ├── en.js  es.js  pt.js  it.js  fr.js
│   └── de.js  ru.js  zh.js  ja.js  ko.js   # eine registerLang()-Datei pro Sprache
└── docs/                   # dieses README in allen Sprachen
```

**Ladereihenfolge** (klassische Skripte, globaler Scope, funktionieren von `file://`):

```
i18n.js → lang/*.js → serial.js → data.js → app.js
```

---

## Architektur

**Internationalisierung (`i18n.js` + `lang/*.js`).** Jeder sichtbare Text ist ein **Schlüssel**. Jede Sprache registriert sich via `registerLang(code, name, dict)`, und die UI löst mit `t('schlüssel')` auf. Elemente mit `data-i18n` werden automatisch übersetzt; Wizards verwenden `t()` beim Rendern und rendern bei Sprachwechsel neu.

**Serieller Transport (`serial.js`).** Umhüllt die Web Serial API mit einem Transport inkl. *Framer* (baut Zeilen aus dem Stream) und einem **Klassifizierer**, der finale Antworten (`OK`/`ERROR`), Daten und unaufgeforderte **URCs** unterscheidet. Ein *VirtualPort* bietet dieselbe Schnittstelle, steckt aber den **AT-Emulator** statt des physischen Ports ein.

**AT-Emulator (virtueller Modus).** Hält den Zustand (SIM, Netz, Daten, Zertifikate, GPIO, GNSS, Störerkennung, SMTP, Telefonbuch, Anrufe…) und antwortet auf jeden Befehl wie echte Firmware, inkl. Prompts (`>`), Bestätigung nach Bytelänge (Zertifikate, E-Mail) und zeitgesteuerter URC-Ausgabe (NMEA, Störerkennung, Anrufergebnis).

**Assistenten-System (`data.js` + `app.js`).** Jede Schnellbefehl-Gruppe kann `wiz:'id'` deklarieren. Beim Öffnen wird das zentrale Panel eingehängt und die Funktion `render(host)` ausgeführt (oder ein generisches Formular). Schlüsselmechanismen:

- `UI.sendCollect(cmd, {timeout})` → Promise, das Zeilen bis `OK`/`ERROR` sammelt.
- `UI.tap` → Zeilen-Beobachter (für Live-URCs, z. B. NMEA, `+SJDR:`, `RING`).
- `wizCleanup` → Teardown des aktiven Assistenten (stoppt Timer/Taps) beim Schließen oder Sprachwechsel.

---

## Die Konsole erweitern

**Schnellbefehl hinzufügen.** In `js/data.js`, innerhalb der passenden `QUICK`-Gruppe, einen Eintrag `['i18nSchlüssel', "AT+BEFEHL"]` hinzufügen (mit abschließender `1`, wenn Parameter nötig sind). Den Text-Schlüssel in allen 10 `lang/`-Dateien ergänzen.

**Sprache hinzufügen.** `lang/xx.js` erstellen, das `registerLang('xx', 'Name', { ...alle Schlüssel... })` aufruft. Es muss denselben Schlüsselsatz wie `en.js` abdecken.

**Assistent hinzufügen.** In `data.js`: `wiz:'meineId'` an der Gruppe setzen und `{ id:'meineId', title:'...', render: (host) => renderMeineId(host) }` registrieren. In `app.js`: `renderMeineId(host)` mit `UI.sendCollect`, `t()` und (falls nötig) `UI.tap`/`wizCleanup` schreiben. Für den virtuellen Modus die Befehls-Handler im Emulator in `serial.js` ergänzen.

> Empfohlen bei Änderungen: Syntax validieren (gesamtes JS verketten und `node --check`), Konsistenz der i18n-Schlüssel über die 10 Sprachen prüfen, kontrollieren, dass die CSS-Klammern ausgeglichen sind, und die Bibliothekstests ausführen.

---

## Companion-Bibliothek: `simcom-at-parser`

Das Repo enthält außerdem **`simcom-at-parser`** (v0.1.0), eine **Node.js**-Bibliothek (ESM, async), die AT-Antworten von SIMCom A76xx/A7672SA-Modulen parst: Transport, *Framer*, Klassifizierer, *Modem*, Parser und Service-Schichten (TCP, HTTP(S), MQTT(S), FTP(S), TLS, GNSS, SMS, FOTA…), mit einem Emulator für Tests.

```bash
npm test          # ~80 Tests
npm run example   # Basisbeispiel
```

- **Node** ≥ 18.
- Der AT-Emulator der Web-Konsole teilt denselben Geist wie der der Bibliothek.

---

## Hinweise zu echter Hardware

Einiges Verhalten hängt vom Modul und der SIM/dem Netz ab; behalte es im Kopf beim Wechsel vom virtuellen Modus zur Hardware:

- **GNSS**: `GSV`-Frames können je nach Firmware aus einem vom AT-Port getrennten NMEA-Port kommen.
- **LBS / NETOPEN**: erfordern eine registrierte SIM, einen gültigen PDP/APN-Kontext und ein verfügbares Netz.
- **ADC** (`CADC?`): der Rohwert ist nicht in Volt; er muss skaliert werden.
- **Baud / CMUX / CFUN-Reset**: ändern oder unterbrechen die serielle Sitzung; du musst dich neu verbinden.
- **TLS** (`CCERTDOWN`): die angegebene Länge muss **exakt** mit den gesendeten PEM-Bytes übereinstimmen.
- **Jamming**: `mnl` (min RxLev) gilt nur für GSM; für periodische URC-Berichte `period > 0` und `detecstat = 1` setzen.
- **E-Mail**: erfordert eine aktive Datensitzung (APN/PDP); für SMTPS das richtige CA-Zertifikat laden und den SSL-Kontext konfigurieren (im **TLS/Cert**-Menü). Viele Anbieter (Gmail) verlangen ein **App-Passwort**.
- **Sprachanrufe**: erfordern aktivierte Sprachunterstützung/-Codec; mehrere A76xx-Varianten sind *data-only* und lehnen `ATD;` ab. Die Anrufer-ID erscheint nur, wenn das Netz sie liefert und `CLIP=1` aktiv ist.

---

## Browser-Unterstützung

| Browser | Web Serial | Status |
|---------|:----------:|--------|
| Chrome (Desktop)  | ✅ | Unterstützt |
| Edge (Desktop)    | ✅ | Unterstützt |
| Opera (Desktop)   | ✅ | Unterstützt |
| Firefox           | ❌ | Kein Web Serial |
| Safari            | ❌ | Kein Web Serial |
| Mobile Browser    | ❌ | Kein Web Serial |

---

## Bekannte Einschränkungen

- Die Chat-Vorschau lädt keine externen Ressourcen: nutze die lokale `index.html`.
- Web Serial benötigt einen sicheren Kontext (`https://`, `localhost` oder `file://`).
- Das Werkzeug dient der **Diagnose/Entwicklung**; mehrere Befehle ändern den Modulzustand (Netz, Zertifikate, NVRAM, Baud). Auf Produktionshardware mit Bedacht verwenden.

---

## Lizenz

Lege hier die Projektlizenz fest (z. B. MIT) und füge die entsprechende `LICENSE`-Datei hinzu.

---

*Erstellt für die Arbeit mit SIMCom A76xx / A7672SA-Modulen. „AT", die Befehlsnamen und genannten Marken gehören ihren jeweiligen Eigentümern; dieses Projekt ist nicht mit SIMCom verbunden.*

---

[⬆ Zurück zum Haupt-README](../README.md)
