# SIMCom Serial AT Console

> **English** · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [中文](README.zh.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

A browser-based **AT command** console for **SIMCom** cellular modules. It talks to the module over the serial port using the **Web Serial API** — nothing to install — and ships with a **virtual mode** (built-in emulator) so you can try everything without hardware.

Built for the **A76xx / A7672SA** family, with visual *wizards* for the most common operations — network, data, GNSS, SMS, email, phonebook, voice calls, TLS, file system, hardware, jamming and more — plus a raw console to send any AT command by hand.

> Command reference: *A76XX Series AT Command Manual* (V2.04).

---

## Table of contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Virtual mode (no hardware)](#virtual-mode-no-hardware)
- [Connecting to a real module](#connecting-to-a-real-module)
- [The interface](#the-interface)
- [Wizards](#wizards)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [Extending the console](#extending-the-console)
- [Companion library: `simcom-at-parser`](#companion-library-simcom-at-parser)
- [Real-hardware notes](#real-hardware-notes)
- [Browser support](#browser-support)
- [Known limitations](#known-limitations)
- [License](#license)

---

## Features

- **100% in the browser**, no backend or dependencies. Just open `index.html`.
- **Web Serial API** to talk to the module over USB/UART.
- **Virtual mode**: a built-in AT emulator that answers dozens of commands (network, data, GNSS, SMS, email, phonebook, voice, TLS, FS, hardware, jamming…) to develop and demo without a board.
- **Raw console**: send any AT command, with history, autoscroll, timestamps and optional echo.
- **Quick commands** organized by group in the sidebar.
- **Visual wizards** for 20+ functional areas, with forms, live indicators, maps, SVG charts and URC parsing.
- **Macros** with chained steps, delays, data input and control characters (`Ctrl-Z`, `ESC`).
- **10 languages** (en, es, pt, it, fr, de, ru, zh, ja, ko).
- **Light / dark theme**.
- **Resizable panels** by mouse (width and height), double-click to reset, and a **maximized** wizard mode.

---

## Requirements

- A **Chromium**-based browser with the Web Serial API: **Chrome**, **Edge** or **Opera** (desktop).
  - Firefox and Safari **do not** currently support Web Serial.
- To connect to hardware, the module must expose a **serial port** (USB-CDC or a UART–USB adapter) visible to the OS.
- On Linux you usually need permission on the device (e.g. being a member of the `dialout` group).

You don't need Node.js to use the console. Node is only used for the [companion library](#companion-library-simcom-at-parser) and its tests.

---

## Quick start

1. Download/clone the project.
2. Open **`index.html`** in Chrome or Edge.
   - It works opened as a local file (`file://`) or served from a static server.
   - If you prefer to serve it:
     ```bash
     # simple option with Python
     python3 -m http.server 8080
     # then open http://localhost:8080
     ```
3. Pick a language and theme in the top-right.
4. To try it without hardware, enable **Virtual** (see below). For real hardware, set the serial parameters and click **Connect**.

> ⚠️ The **embedded chat preview does not work** because it doesn't load the external `css/`, `js/` and `lang/`. You must **download the ZIP and open `index.html` locally**.

---

## Virtual mode (no hardware)

Toggle **Virtual** in the top bar and click **Connect**. The console connects to an **AT emulator** that simulates a module (an *A7672SA-FASE* by default) and answers commands as the real firmware would, including asynchronous **URCs**:

- Module, SIM, network and signal info.
- Data session open/close and IP.
- GNSS with NMEA frames (`GSV`/`GGA`) for the Sky View and the map.
- SMS (preloaded inbox, send with `>` prompt).
- Certificate download by byte length (`CCERTDOWN`).
- Hardware readings (battery, temperature, ADC, GPIO).
- Jamming detection with periodic `+SJDR:` URC.
- Email (SMTP) with the full subject/body prompt flow.
- Phonebook (preloaded entries, add/find/delete) and voice calls (dial → active, hang up).

It's the recommended way to explore the tool and to run demos.

---

## Connecting to a real module

In the top bar set the port parameters and click **Connect** (the browser will ask you to pick the serial device):

| Parameter | Options |
|-----------|---------|
| **Baud**  | 9600 · 57600 · 115200 · 230400 · 460800 · 921600 |
| **Data**  | 8 · 7 |
| **Stop**  | 1 · 2 |
| **Parity**| None · Even · Odd |
| **EOL**   | CR · CRLF · LF (terminator appended to each command) |

The **status** bar shows the link (online/offline), port, signal, network registration and operator.

> Changing the module **baud rate** (UART wizard → `AT+IPR`) breaks the current serial link: you'll have to reconnect at the new speed.

---

## The interface

The screen is split into three zones, all **resizable**:

```
┌──────────┬───────────────────┬───────────────────────────┐
│ Sidebar  │  Wizard panel     │  AT console                │
│ (groups) │  (selected menu)  │  (log + command input)     │
└──────────┴───────────────────┴───────────────────────────┘
```

- **Top bar**: serial parameters, language, theme, Virtual toggle and Connect button.
- **Sidebar**: quick commands grouped. Each group with a ⚙ icon opens its **wizard**.
- **Wizard**: center panel that opens with the chosen menu. Has **maximize** (⛶) and **close** (✕) buttons.
- **Console**: session log (with **TIME**, **SHOW ECHO**, **AUTO-SCROLL** toggles), AT command input and **macro** sending.

### Resizable panels

- Drag the **sidebar │ wizard** divider to change the sidebar width.
- Drag the **wizard │ console** divider to change the wizard width (or the **height**, when the screen is narrow and panels stack).
- **Double-click** any divider to reset that panel to its default size.
- **Maximizing** a wizard expands it over the panel + console width (console below, starts at a **60/40** ratio); the dividers keep working.

### Macros and control characters

Macros chain several commands. They support:

| Token | Action |
|-------|--------|
| `@delay` | wait (configurable delay between steps) |
| `>data`  | send `data` after a `>` prompt |
| `^Z`     | `Ctrl-Z` (end of SMS / payload) |
| `^[`     | `ESC` (cancel) |

Every wizard also offers a **"load to editor instead of running"** toggle, handy to review a command before sending it.

---

## Wizards

Each sidebar group can open a wizard. The four protocol ones (TCP/UDP, HTTP, FTP, MQTT) use a generic form; the rest are custom panels.

| Wizard | What it does | Main AT commands |
|--------|--------------|-------------------|
| **Basics** | Module info (model, revision, IMEI, SIM, signal), echo, error verbosity `CMEE`, and **Power/CFUN** (Full/Min/RF off/Reset). | `SIMCOMATI`, `CPIN?`, `CSQ`, `ATE`, `CMEE`, `CFUN` |
| **SIM** | ICCID/IMSI/SPN, PIN unlock, lock and PIN change. | `CICCID`, `CIMI`, `CSPN?`, `CPIN`, `CLCK`, `CPWD` |
| **Network / signal** | Operator, signal (dBm), registration, technology and PS attach. **Network mode** selector with read and supported-modes query. | `COPS?`, `CSQ`, `CEREG?`, `CGATT?`, `CNMP` |
| **Data** | Data session state and IP, open/close session, and APN (read/set). | `NETOPEN?`, `IPADDR`, `NETCLOSE`, `CGDCONT`, `CGATT?` |
| **TCP / UDP / Ping** | Form for sockets and ping. | `CIPOPEN`, `CIPSEND`, `CPING`, … |
| **HTTP** | HTTP(S) request form. | `HTTPINIT`, `HTTPPARA`, `HTTPACTION`, … |
| **FTP** | FTP(S) transfer form. | `CFTPSxxx` … |
| **MQTT** | MQTT(S) connect/publish form. | `CMQTTxxx` … |
| **File System** | Module file browser (list, enter, delete). | `CFSGFRS`, `CFSWFILE`, `CFSDFILE`, … |
| **GNSS** | Power/mode, Cold/Warm/Hot start, fix (lat/lon/alt/HDOP/UTC), OSM map, polar **Sky View** SVG and satellite signal bars (NMEA `GSV`). | `CGNSSPWR`, `CGPSCOLD/WARM/HOT`, `CGNSSINFO`, `CGNSSTST` |
| **LBS** | Base-station location + map. | `CLBS` |
| **SMS** | Compose/send (`>` prompt + `Ctrl-Z`), parsed inbox and delete. | `CMGS`, `CMGL`, `CMGD` |
| **TLS / Cert** | List/delete certificates, **download PEM** (`CCERTDOWN` by byte length) and configure the SSL context (version, authmode, CA). | `CCERTLIST`, `CCERTDOWN`, `CCERTDELE`, `CSSLCFG` |
| **Time / diag** | Manual clock (calendar + time zone), automatic time zone, NTP and DNS resolution. | `CCLK`, `CTZU`, `CNTP`, `CDNSGIP` |
| **Serial / UART** | Baud, framing (`ICF`, e.g. 8N1=`2,2`), flow control, sleep and CMUX, with state reads. | `IPR`, `ICF`, `IFC`, `CSCLK`, `CMUX` |
| **Hardware** | Battery, temperature and ADC with SVG charts; GPIO (IN/OUT, LOW/HIGH) and voltage alarm with a dual-knob slider. | `CBC`, `CPMUTEMP`, `CADC`, `CGDRT`, `CGSETV`, `CGGETV`, `CVALARM` |
| **Wi-Fi scan** | AP scan (BSSID, channel, signal). | `CWSTASCAN` |
| **BLE** *(A7672SA-FASE)* | Power, status, host name/address; **central** live scan with RSSI bars (`+BLESCANRST` URC) and per-device connect; **peripheral** GATT server + advertising start/stop. Gated by the `ble` capability of the selected module. | `BLEPOWER`, `BLESTATUS`, `BLEHOST`, `BLEADDR`, `BLECREG`, `BLESCAN`, `BLECCON`, `BLESREG`, `BLESSSTART`, `BLESLSTART` |
| **Jamming** | Enable detection, live URC indicator (`+SJDR:`), and config (period, min RxLev, min channels, URC on change). | `SJDR`, `SJDCFG` |
| **Email** | SMTP(S): server, authentication, compose (From/To/Subject/Body) and **send** with result URC. SMTP send only (no POP3/IMAP). | `CSMTPSSRV`, `CSMTPSAUTH`, `CSMTPSFROM`, `CSMTPSRCPT`, `CSMTPSSUB`, `CSMTPSBODY`, `CSMTPSSEND` |
| **Phonebook** | Storage (SM/ME/DC/RC/MC/FD) with used/total, list/add/delete entries, find and own number. | `CPBS`, `CPBR`, `CPBW`, `CPBF`, `CNUM` |
| **Voice calls** | Live call state (idle/dialing/incoming/in-call), dial/answer/hang up, DTMF keypad and caller-ID toggle. | `ATD`, `ATA`, `CHUP`, `CLCC`, `CLIP`, `VTS` |

---

## Project structure

```
.
├── index.html              # single page (loads css/, js/ and lang/)
├── css/
│   ├── styles.css          # styles and layout (incl. resizable panels and scrollbars)
│   ├── theme-dark.css      # dark theme variables
│   └── theme-light.css     # light theme variables
├── js/
│   ├── i18n.js             # internationalization engine (register + t())
│   ├── serial.js           # Web Serial transport, framer, classifier,
│   │                       #   AT emulator (virtual mode) and live parsers
│   ├── profiles.js         # module profiles (per-model AT commands + parsers)
│   ├── data.js             # quick-command, macro and wizard definitions
│   └── app.js              # UI: connection, sidebar, console, wizard rendering,
│                           #   resizable panels, theme, language
├── lang/
│   ├── en.js  es.js  pt.js  it.js  fr.js
│   └── de.js  ru.js  zh.js  ja.js  ko.js   # one registerLang() file per language
└── docs/                   # this README in every language
```

**Load order** (classic scripts, global scope, work from `file://`):

```
i18n.js → lang/*.js → serial.js → profiles.js → data.js → app.js
```

---

## Architecture

**Internationalization (`i18n.js` + `lang/*.js`).** Every visible text is a **key**. Each language registers via `registerLang(code, name, dict)` and the UI resolves with `t('key')`. Elements with `data-i18n` are translated automatically; wizards use `t()` while rendering and re-render on language change.

**Serial transport (`serial.js`).** Wraps the Web Serial API in a transport with a *framer* (builds lines from the stream) and a **classifier** that separates final responses (`OK`/`ERROR`), data and unsolicited **URCs**. A *VirtualPort* exposes the same interface but plugs in the **AT emulator** instead of the physical port.

**AT emulator (virtual mode).** Keeps state (SIM, network, data, certificates, GPIO, GNSS, jamming, SMTP, phonebook, calls…) and answers each command like real firmware, including prompts (`>`), byte-length acknowledgement (certificates, email) and timed URC emission (NMEA, jamming, call result).

**Wizard system (`data.js` + `app.js`).** Each quick-command group can declare `wiz:'id'`. Opening it mounts the center panel and runs its `render(host)` function (or a generic form). Key mechanisms:

- `UI.sendCollect(cmd, {timeout})` → promise that gathers lines until `OK`/`ERROR`.
- `UI.tap` → line observer (for live URCs, e.g. NMEA, `+SJDR:`, `RING`).
- `wizCleanup` → teardown of the active wizard (stops timers/taps) on close or language change.

---

## Extending the console

**Add a quick command.** In `js/data.js`, inside the matching `QUICK` group, add an entry `['i18nKey', "AT+COMMAND"]` (with a trailing `1` if it needs parameters). Add the text key to all 10 `lang/` files.

**Add a language.** Create `lang/xx.js` calling `registerLang('xx', 'Name', { ...all keys... })`. It must cover the same key set as `en.js`.

**Add a wizard.** In `data.js`: set `wiz:'myId'` on the group and register `{ id:'myId', title:'...', render: (host) => renderMyId(host) }`. In `app.js`: write `renderMyId(host)` using `UI.sendCollect`, `t()` and (if needed) `UI.tap`/`wizCleanup`. For virtual mode, add the command handlers to the emulator in `serial.js`.

**Add a module profile.** Different modules (SIM7600, SIM7080, SIM7022, A76xx…) speak slightly different AT dialects: some commands match, others differ in name and in the order/number of returned fields. The menus are shared; only the **command strings and parsers** change per module. These live in `js/profiles.js`. Each terminal/session carries its own profile, chosen with the **Module** selector in the bar, so you can run a SIM7600 on one pane and a SIM7080 on another simultaneously.

To register a new module, call `Profiles.register({...})` with a `caps` list (used to show/hide features, e.g. a module without `gnss` shows a "not available" notice) and a `gnss` driver (command strings + a `parseInfo(line)` that returns the normalized `{ mode, sats, lat, lon, alt, speed, hdop, utc }`). A full template is included at the bottom of `profiles.js`. Example of the divergence the profile system absorbs:

| Module | Power | Info | Field layout |
| --- | --- | --- | --- |
| A76xx | `AT+CGNSSPWR` | `AT+CGNSSINFO` | mode, SVs, lat, N/S, lon, E/W, … |
| SIM7600 | `AT+CGPS` | `AT+CGPSINFO` | lat, N/S, lon, E/W, date, utc, … |
| SIM7080/7070 | `AT+CGNSPWR` | `AT+CGNSINF` | run, fix, utc, lat, lon, alt, … |

The wizard code never changes — it calls the active profile's driver. For virtual testing, the emulator answers all command variants, so each module can be exercised without hardware.

> Recommended when modifying: validate syntax (concatenate all JS and `node --check`), check i18n key consistency across the 10 languages, verify the CSS braces are balanced, and run the library tests.

---

## Companion library: `simcom-at-parser`

The repo also includes **`simcom-at-parser`** (v0.1.0), a **Node.js** library (ESM, async) that parses AT responses from SIMCom A76xx/A7672SA modules: transport, *framer*, classifier, *modem*, parsers and service layers (TCP, HTTP(S), MQTT(S), FTP(S), TLS, GNSS, SMS, FOTA…), with an emulator for tests.

```bash
npm test          # ~80 tests
npm run example   # basic example
```

- **Node** ≥ 18.
- The web console's AT emulator shares the same spirit as the library's.

---

## Real-hardware notes

Some behaviors depend on the module and the SIM/network; keep them in mind when moving from virtual mode to hardware:

- **GNSS**: `GSV` frames may come out of a separate NMEA port from the AT port, depending on firmware.
- **LBS / NETOPEN**: require a registered SIM, a valid PDP/APN context and an available network.
- **ADC** (`CADC?`): the raw value is not volts; you must scale it.
- **Baud / CMUX / CFUN-reset**: change or drop the serial session; you'll have to reconnect.
- **TLS** (`CCERTDOWN`): the declared length must match the sent PEM bytes **exactly**.
- **Jamming**: `mnl` (min RxLev) applies to GSM only; for periodic URC reports set `period > 0` and `detecstat = 1`.
- **Email**: requires an active data session (APN/PDP); for SMTPS, load the correct CA certificate and configure the SSL context (in the **TLS/Cert** menu). Many providers (Gmail) require an **app password**.
- **Voice calls**: require voice support/codec enabled; several A76xx variants are *data-only* and reject `ATD;`. Caller ID only appears if the network delivers it and `CLIP=1` is active.

---

## Browser support

| Browser | Web Serial | Status |
|---------|:----------:|--------|
| Chrome (desktop)  | ✅ | Supported |
| Edge (desktop)    | ✅ | Supported |
| Opera (desktop)   | ✅ | Supported |
| Firefox           | ❌ | No Web Serial |
| Safari            | ❌ | No Web Serial |
| Mobile browsers   | ❌ | No Web Serial |

---

## Known limitations

- The in-chat preview doesn't load external resources: use the local `index.html`.
- Web Serial needs a secure context (`https://`, `localhost` or `file://`).
- This is a **diagnostic/development** tool; several commands change module state (network, certificates, NVRAM, baud). Use it carefully on production hardware.

---

## License

Define the project license here (e.g. MIT) and add the corresponding `LICENSE` file.

---

*Made to work with SIMCom A76xx / A7672SA modules. "AT", command names and brands mentioned belong to their respective owners; this project is not affiliated with SIMCom.*

---

[⬆ Back to root README](../README.md)
