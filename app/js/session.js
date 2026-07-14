/* session.js — App state, Session class, UI facade and console render (ANSI)
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* App: UI, connection, sidebar, macros, wizards, theme and init */

/* === App-wide state, grouped in an explicit namespace ===================
 * They used to be loose `let` globals scattered through the file (easy to clobber
 * or delete unnoticed). Here they live together and discoverable. PER-terminal
 * state does NOT go here: that lives in each Session (see the Session class).
 * ========================================================================== */
const App = {
  defaultModule: 'A76XX',    // default profile for new terminals
  setpopMode: 'new',         // settings popover: 'new' = create terminal · 'edit' = reconfigure the focused one
  sid: 0,                    // session ID counter (++App.sid)
  kbdCapture: null,          // session with live keyboard capture (or null)
  sidebarProfileId: null,    // module profile shown in the sidebar
  wiz: {                     // stack of open wizards
    open: [],                //   [{ id, el, cleanup, details }]
    cleanup: null,           //   teardown each render sets; buildWizardCard captures it per card
  },
  macro: {                   // macro editor
    delay: 400,              //   default pause between commands (ms, used by runMacro)
    delayVal: 400,           //   numeric value shown, in the chosen unit
    unit: 'ms',
    loaded: {},              //   { folder(module): [{name, text}] } loaded from disk
    draft: { name: '', text: '# Marco example (use # for comment, and @100 for 100 ms delay):\nAT\n@100\nAT+GMR' },
    vars: {},                //   last values entered for ${var} placeholders (prefill next run)
    running: false,          //   a macro is executing (enables the ■ Stop button)
    abort: false,            //   set by ■ Stop: the macro breaks before the next line
  },
};

/* === Multi-port: each open terminal is a Session with its transport, framer and state === */
// Per-terminal settings (each Session carries its own copy). The ⚙ popover edits the focused session.
const defaultSettings = {
  baud: '115200', data: '8', stop: '1', parity: 'none', enc: 'utf-8', eol: '\\r\\n',
  ts: true, echo: false, scroll: true, ansi: false, np: false, hex: false, autoReconnect: false, eolShow: false, dir: true, esc: false, badges: true, lat: true,
};
const decLabel = (enc) => (enc === 'utf-8' ? 'utf-8' : 'latin1');
const serialOpts = (s) => ({ baudRate: Number(s.baud), dataBits: Number(s.data), stopBits: Number(s.stop), parity: s.parity });
const settingsTarget = () => (App.setpopMode === 'edit' && UI.focused ? UI.focused.settings : defaultSettings);
// Command driver (tcp/http/mqtt) of the focused profile; falls back to A76XX if the module doesn't define it.
function pdrv(fam) { const p = UI.focused ? UI.focused.profile : Profiles.get(App.defaultModule); return (p && p[fam]) || Profiles.get('A76XX')[fam]; }

// Instrument strip: reflects the focused session
function drawSignal(s) {
  const bars = $('g-bars').children, n = s ? s.bars : 0;
  for (let i = 0; i < 5; i++) bars[i].classList.toggle('lit', i < n);
  const dbm = $('g-dbm'); if (dbm) dbm.textContent = s ? `${s.dbm} dBm` : '—';   // g-dbm is no longer in the unified header
}
// Optional cell state: true/'ok' green · 'warn' amber · 'err' red · undefined/false → default color.
const SET_STATES = { ok: 'var(--ok)', warn: 'var(--amber)', err: 'var(--err)' };
function drawSet(id, txt, state) {
  const el = $(id); if (!el) return; el.textContent = txt;
  el.classList.toggle('dim', !txt || txt === '—');
  const st = state === true ? 'ok' : state;
  el.style.color = SET_STATES[st] || '';          // no state clears the color (no stale one lingers when focus changes)
  const cell = el.closest('.sim-cell');           // the SIM icon follows its cell's state (sim-ok/warn/err classes)
  if (cell) {
    cell.classList.remove('sim-ok', 'sim-warn', 'sim-err');
    if (SET_STATES[st]) cell.classList.add('sim-' + st);
  }
}
// Registration: 3 LEDs (CREG / CGREG / CEREG). 1 (home) green · 5 (roaming) blue · 3 red · 2 yellow · 0/4/— off.
function ledClass(stat) {
  if (stat === 1) return 'led ok';
  if (stat === 5) return 'led roam';
  if (stat === 3) return 'led err';
  if (stat === 2) return 'led warn';
  return 'led';
}
function regTip(stat) {
  const k = { 0: 'reg0', 1: 'reg1', 2: 'reg2', 3: 'reg3', 4: 'reg4', 5: 'reg5' }[stat];
  return k ? t(k) : '—';
}
function drawReg(reg) {
  reg = reg || {};
  [['led-creg', 'creg', 'CREG'], ['led-cgreg', 'cgreg', 'CGREG'], ['led-cereg', 'cereg', 'CEREG']].forEach(([id, key, name]) => {
    const el = $(id); if (!el) return;
    el.className = ledClass(reg[key]);
    // tooltip on the text+LED (the .ledwrap container)
    const wrap = el.parentElement || el;
    wrap.title = reg[key] == null ? name : name + ' — ' + regTip(reg[key]);
  });
}
// Instruments + dashboard visible only when the focus is a terminal with a real module (not None).
// The ESP family shows its own cells (Wi-Fi mode/SSID/channel/MAC) and the Espressif logo.
function updateInstVisibility() {
  const f = UI.focused, show = !!(f && f.profile && !f.profile.raw);
  const esp = !!(f && f.profile && f.profile.family === 'ESP');
  const hi = $('hdr-inst'), dh = $('dash');
  if (hi) { hi.style.display = show ? '' : 'none'; hi.classList.toggle('esp', esp); }
  if (dh) dh.style.display = show ? '' : 'none';
  syncBrand();
}
// Logos per brand/state. In the standalone, build-standalone.cjs replaces these paths with data URIs.
const LOGOS = {
  serial: 'app/img/serial_term.svg',              // startup / None module (raw)
  simcom: 'app/img/simcom-logo.svg',              // familias SIMCom  (simcom_logo.png, simcom-logo.svg)
  espLight: 'app/img/espressif-logo-black.svg',    // Espressif · light theme
  espDark: 'app/img/espressif-logo-wite.svg',    // Espressif · dark theme
};
// Header logo per focused module and theme: serial (startup/None), Espressif (per theme) or SIMCom.
function syncBrand() {
  const img = document.querySelector('.brand img.logo'); if (!img) return;
  const prof = UI.focused && UI.focused.profile;
  const dark = (document.documentElement.getAttribute('data-theme') || 'dark') !== 'light';
  let src, alt;
  if (!prof || prof.raw) { src = LOGOS.serial; alt = 'Serial Terminal'; }
  else if (prof.family === 'ESP') { src = dark ? LOGOS.espDark : LOGOS.espLight; alt = 'Espressif'; }
  else { src = LOGOS.simcom; alt = 'SIMCom'; }
  if (img.getAttribute('src') !== src) { img.src = src; img.alt = alt; }
}
// Queries the focused module to populate the dashboard (passive parsing of the responses).
function refreshDashboard() {
  const f = UI.focused;
  if (!f || !f.connected || f.profile.raw) return;
  f.clearInst();   // stale data out: whatever the module doesn't re-answer (ERROR / NO SERVICE) stays "—"
  if (f.profile.family === 'ESP') {
    runMacro('AT+CWMODE?\nAT+CWJAP?\nAT+CIPSTA?\nAT+CIPSTAMAC?' + (profHasCap(f.profile, 'ble') ? '\nAT+CWSTATE?' : ''), 180);   // CWSTATE only on AT v3 (C6)
  } else {
    runMacro('AT+CPIN?\nAT+COPS?\nAT+CREG?\nAT+CGREG?\nAT+CEREG?\nAT+CSQ\nAT+CESQ\nAT+CPSI?\nAT+CGDCONT?\nAT+CGPADDR', 180);
  }
}
// Since the Web Serial API does NOT expose the driver name or COM port (only VID:PID),
// we map known VID:PIDs to a readable name. The exact name (e.g. the one
// Device Manager shows) is set by renaming the terminal by hand.
const USB_VENDORS = {
  0x10c4: 'Silicon Labs', 0x1e0e: 'SimCom', 0x05c6: 'Qualcomm', 0x2c7c: 'Quectel',
  0x1bc7: 'Telit', 0x0403: 'FTDI', 0x067b: 'Prolific', 0x1a86: 'QinHeng',
  0x2341: 'Arduino', 0x16d0: 'Fibocom', 0x1782: 'Spreadtrum', 0x19d2: 'ZTE',
};
const USB_PRODUCTS = {
  '10c4:ea60': 'CP2102', '10c4:ea70': 'CP2105', '10c4:ea71': 'CP2108',
  '1a86:7523': 'CH340', '1a86:5523': 'CH341', '067b:2303': 'PL2303',
  '05c6:9206': 'HS-USB 9206', '05c6:9215': 'HS-USB 9215', '05c6:90db': 'HS-USB',
  '1e0e:9206': 'HS-USB 9206', '1e0e:9001': 'HS-USB', '2c7c:0125': 'EC25',
};
const hex4 = (n) => Number(n || 0).toString(16).padStart(4, '0');
function portLabel(info) {
  if (!info) return '—';
  if (info.virtual) return t('vmodem');
  if (info.usbVendorId == null) return t('serial_port');
  const key = hex4(info.usbVendorId) + ':' + hex4(info.usbProductId);
  const vend = USB_VENDORS[info.usbVendorId], prod = USB_PRODUCTS[key];
  if (vend && prod) return `${vend} ${prod}`;
  if (vend) return `${vend} (${key})`;
  return `USB ${key}`;
}

class Session {
  constructor(virtual) {
    this.id = ++App.sid;
    this.virtual = virtual;
    this.transport = null;
    this.connected = false;
    this.echoOf = null;
    this.history = []; this.histIdx = -1; this.lines = []; this._openTx = null;  // _openTx: TX line with no terminator (No end) that gets appended to
    this.histExportFrom = 0;  // Clear doesn't wipe the history (↑/↓ still works): marks where "Export Input Only" exports from
    this.searchQ = null;      // active search on this terminal's log (matches are marked as each row is built)
    this.logFilters = { tx: true, rx: true, urc: true, err: true };   // filters by type (false = that type is hidden)
    this.sigHist = [];        // signal history [{t, rssi, rsrp, sinr, rsrq}] fed by live.js (Signal monitor wizard)
    this._txAt = null;        // Date.now() of the last TX (send/sendRaw) → per-command latency
    this._lat = null;         // computed latency waiting to be attached to the next ok/err log line
    this.collectors = [];   // response capture for live parsing (FSLS, GNSS, etc.)
    this.tap = null;        // line observer (e.g. NMEA streaming); returns true to consume
    this.atPrompt = false;  // true when the module showed the "> " prompt and awaits data (used by macros)
    this.info = null;
    this.lastRegStat = null;
    this.inst = { signal: null, vals: {}, port: '—', reg: { creg: null, cgreg: null, cereg: null } };  // instrument snapshot
    this.customName = null;   // user-set name (rename), takes priority over inst.port
    this.profile = Profiles.get(App.defaultModule);   // module profile (commands + parsers)
    this.settings = { ...defaultSettings };        // this terminal's own settings
    this.userClosed = false;  // true if the user disconnected on purpose (no auto-reconnect)
    this.reconnTimer = null;
    this.reconnecting = false;   // true while the auto-reconnect loop is active ("Stop retrying" button)
    this.framer = new Framer((l, term) => this.onLine(l, term), () => this.onPrompt());
    this.framer.setEnc(decLabel(this.settings.enc));
    this.framer.raw = !!this.profile.raw;
    this.paneEl = this.logEl = this.titleEl = this.dotEl = null;
  }
  get isFocused() { return UI.focused === this; }
  get label() { return this.customName || this.inst.port; }
  onData(bytes) { this.framer.feed(bytes); }

  log(cls, msg, withArrow, term, merge) {
    if (!this.logEl) return;
    // "No end": if the last TX had no terminator, append on the SAME line
    if (merge && cls === 'tx' && this._openTx) {
      const o = this._openTx;
      o.rec.text += msg; o.rec.term = term || '';
      const m = o.row.querySelector('.msg');
      if (m) { logRaw.set(m, { text: o.rec.text, term: o.rec.term }); renderMsg(m, o.rec.text, this.settings.ansi, this.settings.np, this.settings.eolShow, o.rec.term); }
      if (term) this._openTx = null;   // closed by sending a terminator
      if (this.settings.scroll) this.logEl.scrollTop = this.logEl.scrollHeight;
      return;
    }
    const rec = { cls, text: msg, arrow: !!withArrow, term: term || '', ts: new Date().toLocaleTimeString('es', { hour12: false }) };
    if (this._lat != null && (cls === 'ok' || cls === 'err')) { rec.ms = this._lat; this._lat = null; }   // consumed by the line it belongs to
    this.lines.push(rec);
    const row = this._buildRow(rec);
    this.logEl.appendChild(row);
    this._openTx = (merge && cls === 'tx' && !term) ? { rec, row } : null;   // stays open only if TX without terminator
    if (this.settings.scroll) this.logEl.scrollTop = this.logEl.scrollHeight;
  }
  // Builds a row honoring the current settings (ts, dir, ansi, np, eolShow) → allows a full re-render.
  _buildRow(rec) {
    const s = this.settings;
    const row = document.createElement('div'); row.className = 'ln ' + rec.cls;
    if (rec.ms != null) {   // per-command latency chip, next to the badge (the badge is the row's ::before)
      const lat = document.createElement('span'); lat.className = 'lat'; lat.textContent = rec.ms + ' ms';
      row.appendChild(lat);
    }
    if (s.ts) { const ts = document.createElement('span'); ts.className = 'ts'; ts.textContent = rec.ts; row.appendChild(ts); }
    if (s.dir && rec.cls !== 'sys') {   // direction marker: › sent · ‹ received
      const a = document.createElement('span'); a.className = 'dir-arrow ' + (rec.arrow ? 'tx' : 'rx');
      a.textContent = rec.arrow ? '›' : '‹'; row.appendChild(a);
    }
    const m = document.createElement('span'); m.className = 'msg';
    logRaw.set(m, { text: rec.text, term: rec.term });
    renderMsg(m, rec.text, s.ansi, s.np, s.eolShow, rec.term);
    if (rec.cls === 'err') {   // numeric +CME/+CMS ERROR → annotate the spec's human text next to it
      const note = atErrorText(rec.text);
      if (note) { const n = document.createElement('span'); n.className = 'err-note'; n.textContent = ' — ' + note; m.appendChild(n); }   // leading space: in the txt export (textContent) it separates from the code
    }
    if (this.searchQ && markSearch(m, this.searchQ)) row.classList.add('q-hit');   // active search → highlight matches (also on new lines)
    row.appendChild(m);
    return row;
  }

  onLine(line, term) {
    if (this.profile && this.profile.raw) {   // raw mode (shell/None): show as-is, no AT logic
      if (line === '' && !(this.settings.np && this.settings.eolShow)) return;
      this.log('rx', line, false, term); return;
    }
    const kind = classify(line, this.echoOf);
    if (kind === 'ok' || kind === 'err') this.atPrompt = false;   // the command finished: no prompt pending anymore
    if (this.tap) { try { if (this.tap(line)) return; } catch (_) {} }
    if (this.collectors.length && kind !== 'empty' && kind !== 'echo') {
      const done = /^OK$/.test(line) ? 'ok' : (kind === 'err' ? 'err' : null);
      for (const c of this.collectors.slice()) c.feed(line, done);
    }
    if (kind === 'echo' && !this.settings.echo) return;
    if (kind === 'empty') {
      // empty line: if line endings are shown, still record it to see the terminator
      if (this.settings.np && this.settings.eolShow) this.log('sys', '', false, term);
      return;
    }
    // per-command latency: the closing OK/ERROR carries the ms since the last TX
    if ((kind === 'ok' || kind === 'err') && this._txAt) { this._lat = Date.now() - this._txAt; this._txAt = null; }
    this.log(kind === 'echo' ? 'sys' : kind, line, false, term);
    for (const p of Object.keys(Live)) {   // one telemetry parser per prefix (see live.js)
      if (line.startsWith(p + ':') || line.startsWith(p + ' ') || line === p) {
        try { Live[p](line, this, p); } catch (_) {}
        break;
      }
    }
  }
  onPrompt() {
    this.atPrompt = true;               // the module awaits data: the next macro line goes AS-IS (no line ending)
    this.log('prompt', '>', false);     // shown as "‹ >" with the "PROMPT >" badge
  }

  collect(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const lines = [];
      const c = { feed: (line, done) => {
        if (done === 'ok') return fin(true);
        if (done === 'err') return fin(false);
        lines.push(line);
      } };
      const fin = (ok) => { clearTimeout(tm); this.collectors = this.collectors.filter((x) => x !== c); resolve({ ok, lines }); };
      const tm = setTimeout(() => fin(false), opts.timeout || 4000);
      this.collectors.push(c);
    });
  }
  async sendCollect(cmd, opts) { const p = this.collect(opts); await this.send(cmd); return p; }
  // Waits for a received line matching `re` (used by the ?URC macro directive).
  // Resolves true on match, false on timeout. Piggybacks on the collectors feed.
  waitLine(re, timeoutMs) {
    return new Promise((resolve) => {
      const fin = (ok) => { clearTimeout(tm); this.collectors = this.collectors.filter((x) => x !== c); resolve(ok); };
      const c = { feed: (line) => { if (re.test(line)) fin(true); } };
      const tm = setTimeout(() => fin(false), timeoutMs || 10000);
      this.collectors.push(c);
    });
  }
  // Prompted command ("> "): sends the command, waits for the prompt, sends the raw bytes and waits for OK (CFTRANRX, etc.).
  async sendFile(cmd, bytes, opts) {
    opts = opts || {};
    if (!this.connected) { this.log('sys', t('log_notconn')); return { ok: false, lines: [] }; }
    const p = this.collect({ timeout: opts.timeout || 20000 });
    await this.send(cmd);
    await new Promise((r) => setTimeout(r, opts.promptDelay || 600));   // give the "> " prompt time to arrive
    this.log('sys', t('ftp_sentbytes').replace('{b}', bytes.length));
    await this.transport.writeBytes(bytes);
    return p;
  }
  // Download (module → host): sends the command, detects the length in the header (+CFTRANTX/+CFTRANRX) and captures those raw bytes.
  async recvFile(cmd, opts) {
    opts = opts || {};
    if (!this.connected) { this.log('sys', t('log_notconn')); return { ok: false, bytes: null }; }
    return new Promise((resolve) => {
      let data = null, done = false;
      const finish = (ok) => { if (done) return; done = true; clearTimeout(tm); this.collectors = this.collectors.filter((x) => x !== c); resolve({ ok: ok && !!data, bytes: data }); };
      const tm = setTimeout(() => finish(!!data), opts.timeout || 20000);
      const c = { feed: (line, dn) => {
        if (!data) {
          const m = line.match(/\+CFTRANTX:\s*(?:DATA,|"[^"]*",)?(\d+)/i) || line.match(/\+CFTRANRX:\s*(\d+)/i);
          if (m) {
            const len = parseInt(m[1], 10);
            if (len > 0) { this.framer.captureRaw(len, (b) => { data = b; this.log('sys', t('fs_recvbytes').replace('{b}', len)); }); return; }
          }
        }
        if (dn === 'ok') return finish(true);
        if (dn === 'err') return finish(false);
      } };
      this.collectors.push(c);
      this.send(cmd);
    });
  }

  async send(text) {
    if (!this.connected) { this.log('sys', t('log_notconn')); return; }
    this.atPrompt = false;
    this._txAt = Date.now();   // latency: measured up to the closing OK/ERROR
    const eol = this.settings.eol.replace('\\r', '\r').replace('\\n', '\n');
    this.echoOf = text;
    this.log('tx', text, true, eol, true);   // merge: appends if the previous TX line had no terminator
    if (text && this.history[this.history.length - 1] !== text) this.history.push(text);
    this.histIdx = this.history.length;
    await this.transport.writeBytes(encodeOut(text + eol, this.settings.enc));
  }
  // Raw bytes without line ending (data after a prompt: CIPSEND, CMQTT*, CMGS).
  async sendRaw(text) {
    if (!this.connected) { this.log('sys', t('log_notconn')); return; }
    this.atPrompt = false;
    this._txAt = Date.now();   // prompt data / Ctrl-Z also restart the clock (measures the module, not the typing)
    this.echoOf = null;
    const shown = text.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\x1a/g, '^Z').replace(/\x1b/g, '^[');
    this.log('tx', shown, true);
    await this.transport.write(text);
  }
  // Key by key (terminal with keyboard focus): writes the byte instantly. isEnter=eol, isBack=delete.
  async typeKey(raw, isEnter, isBack) {
    if (!this.connected) { this.log('sys', t('log_notconn')); return; }
    const enc = this.settings.enc;
    this.echoOf = null;
    if (isBack) {
      await this.transport.writeBytes(encodeOut('\b', enc));   // backspace (0x08)
      if (this._openTx && this._openTx.rec.text) {             // deletes the last char of the open TX line
        const o = this._openTx; o.rec.text = o.rec.text.slice(0, -1);
        const nr = this._buildRow(o.rec); o.row.replaceWith(nr); o.row = nr;
      }
      return;
    }
    if (isEnter) {
      const eol = this.settings.eol.replace('\\r', '\r').replace('\\n', '\n');
      await this.transport.writeBytes(encodeOut(eol, enc));
      this.log('tx', '', true, eol || '\r', true);   // closes the open TX line
      return;
    }
    await this.transport.writeBytes(encodeOut(raw, enc));
    this.log('tx', raw, true, '', true);   // merges the char into the open TX line
  }
  // Send from the Send box: Hex takes priority; otherwise escapes mode (\r \n \t…) or plain text.
  sendInput(text) { return this.settings.hex ? this.sendHex(text) : this.settings.esc ? this.sendEsc(text) : this.send(text); }

  // Interprets escape sequences, sends the real bytes and DISPLAYS them honoring line breaks.
  async sendEsc(text) {
    if (!this.connected) { this.log('sys', t('log_notconn')); return; }
    this.atPrompt = false;
    const eol = this.settings.eol.replace('\\r', '\r').replace('\\n', '\n');
    const payload = unescapeInput(text);
    this.echoOf = null;
    await this.transport.writeBytes(encodeOut(payload + eol, this.settings.enc));
    const segs = termSegments(payload + eol);          // echo with terminal semantics (\b deletes, \v breaks)
    for (const seg of segs) this.log('tx', seg.text, true, seg.term, true);
    if (text && this.history[this.history.length - 1] !== text) this.history.push(text);   // the history stores what was typed
    this.histIdx = this.history.length;
  }
  async sendHex(text) {
    if (!this.connected) { this.log('sys', t('log_notconn')); return; }
    this.atPrompt = false;
    const u = parseHex(text);
    this.echoOf = null;
    // Shows the REAL bytes in canonical hex + a clear count. It used to say "1A  · 1 B",
    // which read as if two bytes "1A" and "1B" had been sent (the "1 B" was "1 byte").
    const hex = [...u].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    this.log('tx', (hex || '—') + '  (' + u.length + (u.length === 1 ? ' byte' : ' bytes') + ')', true);
    if (text && this.history[this.history.length - 1] !== text) this.history.push(text);
    this.histIdx = this.history.length;
    await this.transport.writeBytes(u);
  }

  signal(s) { this.inst.signal = s; if (this.isFocused) drawSignal(s); }
  set(id, txt, good) { this.inst.vals[id] = [txt, good]; if (this.isFocused) drawSet(id, txt, good); }
  setReg(which, stat) { this.inst.reg[which] = stat; if (this.isFocused) drawReg(this.inst.reg); }
  refreshStrip() {
    drawSignal(this.inst.signal);
    drawReg(this.inst.reg);
    for (const id of DASH_IDS) { const v = this.inst.vals[id] || ['—']; drawSet(id, v[0], v[1]); }
  }
  // Clears the accumulated telemetry: everything back to "—" until the module re-answers.
  clearInst() {
    this.inst.signal = null;
    this.inst.vals = {};
    this.inst.reg = { creg: null, cgreg: null, cereg: null };
    if (this.isFocused) this.refreshStrip();
  }
}
const DASH_IDS = ['g-oper', 'g-sim', 'g-csq', 'g-mode', 'g-band', 'g-rsrp', 'g-rssi', 'g-rssnr', 'g-apn', 'g-iptype', 'g-ip',
  'g-wmode', 'g-wstate', 'g-ssid', 'g-chan', 'g-gw', 'g-mac'];   // celdas ESP (Espressif)

/* === UI facade: delegates to the focused session (commands go to the focused terminal) === */
/* ============================================================================
 * UI facade: delegates to the FOCUSED terminal (UI.focused). When nothing is focused,
 * each member returns a safe default.
 *
 * The repetitive delegation is GENERATED from tables (below) instead of writing
 * ~25 nearly identical getters/setters/methods by hand — that fragile verbosity was
 * the source of the deleted-`sendInput` bug (a method vanished without a sound).
 * Now adding/removing a delegation is one line in the table, and the contract
 * (names + defaults) lives in a single place.
 * ========================================================================== */
const UI = {
  sessions: [],
  focused: null,
  // Facade-OWN logic (not delegation):
  fillCmd(txt) { $('cmd').value = txt; $('cmd').focus(); const i = txt.indexOf('__'); if (i >= 0) $('cmd').setSelectionRange(i, txt.length); },
};

// Delegated properties.  def: value without focus (if it's a function, it's evaluated per
// access).  ro: read-only (no setter).  map: transforms the read value.
const _uiProps = {
  connected:   { def: false, ro: true, map: (v) => !!v },
  tap:         { def: null },
  collectors:  { def: () => [] },
  echoOf:      { def: null },
  history:     { def: () => [], ro: true },
  histIdx:     { def: -1 },
  lastRegStat: { def: null },
  profile:     { def: () => Profiles.get(App.defaultModule), ro: true },
};
for (const [name, { def, ro, map }] of Object.entries(_uiProps)) {
  const dflt = () => (typeof def === 'function' ? def() : def);
  const desc = { configurable: true, enumerable: true,
    get() { return this.focused ? (map ? map(this.focused[name]) : this.focused[name]) : dflt(); } };
  if (!ro) desc.set = function (v) { if (this.focused) this.focused[name] = v; };
  Object.defineProperty(UI, name, desc);
}

// Delegated methods.  to: real name in Session if it differs.  def: return without
// focus (function = evaluated per call); without def → undefined (no-op).
const _uiMethods = {
  log:         {},
  send:        { def: () => Promise.resolve() },
  sendRaw:     { def: () => Promise.resolve() },
  sendCollect: { def: () => Promise.resolve({ ok: false, lines: [] }) },
  sendFile:    { def: () => Promise.resolve({ ok: false, lines: [] }) },
  recvFile:    { def: () => Promise.resolve({ ok: false, bytes: null }) },
  collect:     { def: () => Promise.resolve({ ok: false, lines: [] }) },
  waitLine:    { def: () => Promise.resolve(false) },
  sendInput:   {},
  onLine:      {},
  onPrompt:    {},
  signal:      {},
  set:         {},
  regStat:     { to: 'setReg' },
};
for (const [name, { to = name, def }] of Object.entries(_uiMethods)) {
  UI[name] = function (...a) {
    if (this.focused) return this.focused[to](...a);
    return typeof def === 'function' ? def() : undefined;
  };
}

/* ---- console render: ANSI and non-printables (per-terminal flags) ---- */
const logRaw = new WeakMap();   // span.msg -> raw text (for re-render on toggle)
// renderMsg encapsulated (IIFE): the ANSI palette and the escape parser are module-private;
// only renderMsg is exposed, which is all Session._buildRow / log consume.
const renderMsg = (() => {
const ANSI_FG = { 30: '#3a3a3a', 31: '#e2231a', 32: '#3bbf6e', 33: '#d9a23b', 34: '#4a90d9', 35: '#b265d9', 36: '#36b9c5', 37: '#cfcfcf', 90: '#777', 91: '#ff6b6b', 92: '#5ee08a', 93: '#f0c674', 94: '#6aa6e8', 95: '#cf87e8', 96: '#5fd3df', 97: '#ffffff' };
const ANSI_BG = { 40: '#000', 41: '#5a1411', 42: '#13361f', 43: '#3a2e10', 44: '#10243a', 45: '#2e1440', 46: '#103438', 47: '#444', 100: '#555', 101: '#7a1c18', 102: '#1d472a', 103: '#4d3d15', 104: '#163050', 105: '#3e1c55', 106: '#16484d', 107: '#666' };

function renderAnsi(host, text, np) {
  let st = {};
  const flush = (str) => {
    if (!str) return;
    const sp = document.createElement('span');
    let fg = st.color, bg = st.bg;
    if (st.inverse) { const tmp = fg; fg = bg; bg = tmp; }
    const css = [];
    if (fg) css.push('color:' + fg);
    if (bg) css.push('background:' + bg);
    if (st.bold) css.push('font-weight:700');
    if (st.dim) css.push('opacity:.6');
    if (st.underline) css.push('text-decoration:underline');
    if (st.italic) css.push('font-style:italic');
    if (css.length) sp.style.cssText = css.join(';');
    sp.textContent = np ? showNP(str) : str;
    host.appendChild(sp);
  };
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0, mm;
  while ((mm = re.exec(text))) {
    flush(text.slice(last, mm.index));
    last = re.lastIndex;
    const codes = mm[1] === '' ? [0] : mm[1].split(';').map(Number);
    for (const c of codes) {
      if (c === 0) st = {};
      else if (c === 1) st.bold = true;
      else if (c === 2) st.dim = true;
      else if (c === 3) st.italic = true;
      else if (c === 4) st.underline = true;
      else if (c === 7) st.inverse = true;
      else if (c === 22) { st.bold = false; st.dim = false; }
      else if (c === 23) st.italic = false;
      else if (c === 24) st.underline = false;
      else if (c === 27) st.inverse = false;
      else if (c === 39) st.color = null;
      else if (c === 49) st.bg = null;
      else if (ANSI_FG[c]) st.color = ANSI_FG[c];
      else if (ANSI_BG[c]) st.bg = ANSI_BG[c];
    }
  }
  flush(text.slice(last));
}

// Normalizes literal ESC notations (\e[ \x1b[ \u001b[ \033[) to a real ESC, so ANSI colors work
// even if the text doesn't carry the 0x1B byte (e.g. typed without escapes mode). Render-only.
const ansiNormalize = (text) => text.replace(/\\(?:e|x1[bB]|u001[bB]|033)\[/g, '\x1b[');
return function renderMsg(span, text, ansi, np, eolShow, term) {
  span.textContent = '';
  const src = ansi ? ansiNormalize(text) : text;
  if (ansi && /\x1b\[/.test(src)) renderAnsi(span, src, np);
  else span.appendChild(document.createTextNode(np ? showNP(text) : text));
  if (np && eolShow && term) {
    const e = document.createElement('span'); e.className = 'eolmark'; e.textContent = showNP(term);
    span.appendChild(e);
  }
};
})();

// Highlights the matches of q (case-insensitive) wrapping them in <mark> inside the .msg span.
// Walks the text nodes so ANSI spans and the error annotation aren't broken. Returns true on match.
function markSearch(host, q) {
  const ql = q.toLowerCase();
  let hit = false;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const tn of nodes) {
    const text = tn.nodeValue, tl = text.toLowerCase();
    let i = tl.indexOf(ql); if (i === -1) continue;
    hit = true;
    const frag = document.createDocumentFragment(); let last = 0;
    while (i !== -1) {
      if (i > last) frag.appendChild(document.createTextNode(text.slice(last, i)));
      const mk = document.createElement('mark'); mk.textContent = text.slice(i, i + q.length);
      frag.appendChild(mk);
      last = i + q.length; i = tl.indexOf(ql, last);
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    tn.parentNode.replaceChild(frag, tn);
  }
  return hit;
}

// Re-renders ONE terminal's log with its ANSI/non-printables/line-ending flags.
function rerenderLog(sess) {
  if (!sess || !sess.logEl) return;
  sess._openTx = null;   // rows get rebuilt; the open reference becomes stale
  sess.logEl.innerHTML = '';
  for (const rec of sess.lines) sess.logEl.appendChild(sess._buildRow(rec));
  if (sess.settings.scroll) sess.logEl.scrollTop = sess.logEl.scrollHeight;
}
