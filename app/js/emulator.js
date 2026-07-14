/* emulator.js — ATEmulator: virtual modem (answers AT commands, simulated filesystem/FTP)
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* ============================================================
   3b) Virtual modem — inline AT emulator (mirror of src/at-emulator.js)
       Lets you use the console without a physical port (COM/tty).
   ============================================================ */
const _CZ = '\x1a', _ESC = '\x1b';
// Default identity (A7672SA-FASE). Each profile can pass its own when opening the simulator.
const DEFAULT_IDENTITY = {
  manufacturer: 'SIMCOM INCORPORATED', model: 'A7672SA-FASE', revision: 'A011B02A7672M7_V1.0',
  imei: '860123040567890', band: 'EUTRAN-BAND4', ati: ['SIMCOM_A7672SA-FASE', 'A7672SA-FASE-V1.0'],
};
// Simulated GNSS route: Andrés Baranda & Rodolfo López → Av. Lamadrid → crosses the tracks
// → Lebensohn → Universidad Nacional de Quilmes (Quilmes/Bernal, Argentina). Covered in 10 min.
const GNSS_ROUTE = [
  [-34.7236465, -58.2704874],  // Andrés Baranda & Rodolfo López (start)
  [-34.7167413, -58.2753844],  // Av. Lamadrid & Andrés Baranda (turn)
  [-34.7091880, -58.2722900],  // Lebensohn (crosses the tracks and turns)
  [-34.7065325, -58.2783994],  // Universidad Nacional de Quilmes (end)
];
const GNSS_ROUTE_SECS = 600;   // total route duration (10 min)
const _geoDist = (a, b) => { const R = 6371000, k = Math.PI / 180; const dLat = (b[0] - a[0]) * k, dLon = (b[1] - a[1]) * k, lm = (a[0] + b[0]) / 2 * k; const x = dLon * Math.cos(lm), y = dLat; return Math.sqrt(x * x + y * y) * R; };
const _geoBrg = (a, b) => { const k = Math.PI / 180, d = 180 / Math.PI, dLon = (b[1] - a[1]) * k; const y = Math.sin(dLon) * Math.cos(b[0] * k); const x = Math.cos(a[0] * k) * Math.sin(b[0] * k) - Math.sin(a[0] * k) * Math.cos(b[0] * k) * Math.cos(dLon); return (Math.atan2(y, x) * d + 360) % 360; };
const GNSS_SEGS = (() => { const segs = []; let total = 0; for (let i = 0; i < GNSS_ROUTE.length - 1; i++) { const len = _geoDist(GNSS_ROUTE[i], GNSS_ROUTE[i + 1]); segs.push({ a: GNSS_ROUTE[i], b: GNSS_ROUTE[i + 1], len, brg: _geoBrg(GNSS_ROUTE[i], GNSS_ROUTE[i + 1]), acc: total }); total += len; } return { segs, total }; })();
// Current position along the route based on time elapsed since the fix (constant speed; stays at the destination once done).
function gnssRoutePos(t0) {
  const { segs, total } = GNSS_SEGS;
  const elapsed = t0 ? (Date.now() - t0) / 1000 : 0;
  const frac = Math.max(0, Math.min(1, elapsed / GNSS_ROUTE_SECS));
  const target = total * frac;
  let seg = segs[segs.length - 1], tt = 1;
  for (const sg of segs) { if (target <= sg.acc + sg.len || sg === segs[segs.length - 1]) { seg = sg; tt = sg.len ? (target - sg.acc) / sg.len : 0; break; } }
  tt = Math.max(0, Math.min(1, tt));
  const lat = seg.a[0] + (seg.b[0] - seg.a[0]) * tt, lon = seg.a[1] + (seg.b[1] - seg.a[1]) * tt;
  const ms = total / GNSS_ROUTE_SECS;
  return { lat, lon, course: seg.brg, kmh: frac >= 1 ? 0 : ms * 3.6, kn: frac >= 1 ? 0 : ms * 1.94384, done: frac >= 1 };
}
// Decimal degrees → NMEA ddmm.mmmmmm (for +CGPSINFO).
const _toNmea = (deg, isLat) => { const a = Math.abs(deg), d = Math.floor(a), m = (a - d) * 60; return (d * 100 + m).toFixed(6).padStart(isLat ? 9 : 10, '0'); };

class ATEmulator {
  constructor(opts = {}) {
    this.output = opts.output ?? (() => {});
    this.outputRaw = opts.outputRaw ?? ((u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); this.output(s); });   // raw bytes for downloads
    this.identity = opts.identity || DEFAULT_IDENTITY;
    this.isEsp = /espressif/i.test(this.identity.manufacturer || '');   // ESP family → uses the Espressif BLE/Wi-Fi block, not the SIMCom one
    this.buf = ''; this.expecting = null;
    this.state = {
      echo: opts.echo ?? false, simReady: true, reg: { creg: 1, cgreg: 1, cereg: 1 }, rssi: 24, rsrp: -95, sinr: 14, rsrq: -12,
      operator: 'Movistar AR', mccmnc: '722-310', apn: 'internet.movil', pdpType: 'IP',
      auth: { type: 0, user: '' },
      // band preference (CNBP): <GSM/WCDMA pos>,<LTE pos>,<TDS pos> — LTE with B1/3/5/7/8/20/28/38/40/41/66
      cnbp: { pos: '0xFFFFFFFF7FFFFFFF', lte: '0x' + [1, 3, 5, 7, 8, 20, 28, 38, 40, 41, 66].reduce((a, b) => a | (1n << BigInt(b - 1)), 0n).toString(16).toUpperCase(), tds: '0x0' },
      netOpen: false, caOpen: false, caSent: 0, shConn: false, smConn: false, csoOpen: false, chttpOn: false, cmqOn: false, gnss: 'off', tst: false, wifiSig: 1, gpio: {}, sjdr: 0, jamCur: 0, sjdcfg: { period: 0, mnl: 17, minch: 5, detecstat: 1, sinr: 0, rsrp: -110, rsrq: -10 }, smtp: { server: '', port: 465, type: 2, authFlag: 0, user: '', pwd: '' },
      pbStorage: 'SM', clip: 0, call: null,
      ble: { power: 0, host: 'SIMCOM BLE', addr: 'df:45:e6:29:65:c0', scanning: false, server: false, adv: false, conn: null },
      phonebook: [
        { index: 1, number: '+5491140000001', type: 145, text: 'Soporte' },
        { index: 2, number: '1140000002', type: 129, text: 'Taller' },
        { index: 3, number: '+5491155553333', type: 145, text: 'Guardia' },
      ],
      mr: 40,
      sms: [
        { stat: 'REC READ', from: '+5491120000001', ts: '25/10/21,09:15:00-12', text: 'Bienvenido a la red' },
        { stat: 'REC UNREAD', from: '+5491155553333', ts: '26/06/19,14:02:11-12', text: 'Tu codigo es 4821' },
      ],
      certs: ['gts_roots.pem'],
      fscd: 'C:/',
      fs: {
        'C:/': { dirs: [], files: ['cfg.json', 'log.txt'] },
        'D:/': { dirs: ['fota', 'certs'], files: ['readme.txt'] },
        'D:/fota/': { dirs: [], files: ['delta.bin'] },
        'D:/certs/': { dirs: [], files: ['gts_r4.pem', 'isrg_x1.pem'] },
      },
      fsdata: {},     // real data of uploaded/downloadable files, by path (Uint8Array)
      // virtual FTP server: directory tree (paths with trailing /) + files by full path
      ftpcwd: '/',
      ftpdirs: { '/': ['pub'], '/pub/': [] },
      ftpfiles: { '/readme.txt': new TextEncoder().encode('Servidor FTP virtual - archivo de ejemplo.\r\n') },
    };
  }
  // Changing a virtual terminal's module (edit) reuses the emulator: it adopts the new identity and recomputes the family.
  setIdentity(identity) { this.identity = identity || DEFAULT_IDENTITY; this.isEsp = /espressif/i.test(this.identity.manufacturer || ''); }
  feed(chunk) {
    this.buf += chunk;
    for (;;) {
      if (this.expecting) {
        const exp = this.expecting;
        if (exp.len != null) {            // length-based download (cert, mail subject/body, file to EFS)
          if (this.buf.length < exp.len) return;
          const payload = this.buf.slice(0, exp.len);
          this.buf = this.buf.slice(exp.len); this.expecting = null;
          if (exp.kind === 'cert' && exp.name && !this.state.certs.includes(exp.name)) this.state.certs.push(exp.name);
          if (exp.kind === 'fsrx' && exp.path) this._storeFile(exp.path, payload);   // host → EFS (CFTRANRX)
          if (exp.kind === 'fswrite' && exp.path) {   // FSWRITE on an open fd (0 overwrites · 1 appends)
            const prev = exp.append ? this._u8ToBin(this._readFile(exp.path) || new Uint8Array(0)) : '';
            this._storeFile(exp.path, prev + payload);
          }
          this._send(['OK']); continue;
        }
        const zi = this.buf.indexOf(_CZ), ei = this.buf.indexOf(_ESC);
        if (ei !== -1 && (zi === -1 || ei < zi)) { this.buf = this.buf.slice(ei + 1); this.expecting = null; this._send(['OK']); continue; }
        if (zi === -1 && !/\r\n?$/.test(this.buf)) return;
        this.buf = zi !== -1 ? this.buf.slice(zi + 1) : '';
        const kind = this.expecting.kind; this.expecting = null;
        this._send(kind === 'cmgs' ? [`+CMGS: ${this.state.mr++}`, 'OK'] : ['OK']);
        continue;
      }
      const i = this.buf.search(/[\r\n]/); if (i === -1) return;
      const line = this.buf.slice(0, i);
      const adv = (this.buf[i] === '\r' && this.buf[i + 1] === '\n') ? i + 2 : i + 1;   // consume \r\n as a unit (don't leave a residual \n)
      this.buf = this.buf.slice(adv);
      if (line.trim()) this._handle(line.trim());
    }
  }
  injectSms(from = '+5491100000000', text = 'Mensaje de prueba') {
    const index = this.state.sms.length + 1;
    this.state.sms.push({ stat: 'REC UNREAD', from, ts: this._cclk(), text });
    this.output(`\r\n+CMTI: "SM",${index}\r\n`);
  }
  /* ---- simulator control panel API (Simu Ctrl): changes state and emits the matching URCs ---- */
  ctlSignal(patch) { Object.assign(this.state, patch); }   // {rssi (0-31 CSQ), rsrp, sinr, rsrq}
  ctlReg(which, stat) {   // which: 'creg'|'cgreg'|'cereg' · stat: 0 no service · 1 registered · 2 searching · 3 denied · 5 roaming
    this.state.reg[which] = stat;
    this.output(`\r\n+${which.toUpperCase()}: ${stat}\r\n`);
  }
  ctlSim(present) {
    const s = this.state;
    if (!!s.simReady === !!present) return;
    s.simReady = !!present;
    const st = present ? 1 : 0;
    s.reg = { creg: st, cgreg: st, cereg: st };
    if (present) this.output('\r\n+CPIN: READY\r\n\r\nSMS DONE\r\n');
    else this.output('\r\n+SIMCARD: NOT AVAILABLE\r\n\r\n+CPIN: NOT READY\r\n');
    this.output(`\r\n+CREG: ${st}\r\n\r\n+CGREG: ${st}\r\n\r\n+CEREG: ${st}\r\n`);
  }
  get ringing() { return !!this._ringTimer; }
  ctlRing(on, num = '+5491140001234') {   // sustained incoming call: RING every 3 s until turned off (+CLIP if AT+CLIP=1)
    if (this._ringTimer) { clearInterval(this._ringTimer); this._ringTimer = null; }
    if (!on) return;
    const ring = () => this.output('\r\nRING\r\n' + (this.state.clip ? `\r\n+CLIP: "${num}",145,,,,0\r\n` : ''));
    ring();
    this._ringTimer = setInterval(ring, 3000);
  }
  ctlWifi(on) {   // ESP: associate/disassociate the station to a simulated AP
    const s = this.state;
    if (on) { s.espWifi = s.espWifi || { ssid: 'FibraHogar', ch: 6, rssi: -55 }; this.output('\r\nWIFI CONNECTED\r\n\r\nWIFI GOT IP\r\n'); }
    else { s.espWifi = null; s.espConn = false; this.output('\r\nWIFI DISCONNECT\r\n'); }
  }
  ctlWifiRssi(dbm) { if (this.state.espWifi) this.state.espWifi.rssi = dbm; }
  _send(l) { this.output('\r\n' + l.join('\r\n') + '\r\n'); }
  _normPath(p) { return String(p || '').replace(/\\/g, '/').replace(/^c:/i, 'C:').replace(/^d:/i, 'D:'); }
  _u8ToBin(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; }
  _storeFile(path, binStr) {   // stores bytes (binStr = string of bytes 0-255) in EFS and lists them in the tree
    const u8 = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) u8[i] = binStr.charCodeAt(i) & 0xff;
    const p = this._normPath(path); this.state.fsdata[p] = u8;
    const sl = p.lastIndexOf('/'), dir = p.slice(0, sl + 1), name = p.slice(sl + 1);
    const node = this.state.fs[dir]; if (node && name && !node.files.includes(name)) node.files.push(name);
  }
  _readFile(path) {   // returns the file's Uint8Array (uploaded or demo), or null if it doesn't exist
    const p = this._normPath(path);
    if (this.state.fsdata[p]) return this.state.fsdata[p];
    const name = p.slice(p.lastIndexOf('/') + 1);
    const demo = {
      'log.txt': '[00:00:01] boot ok\r\n[00:00:02] net attach\r\n[00:00:05] registered\r\n',
      'cfg.json': '{"apn":"internet.movil","mode":"auto","gnss":true}\r\n',
      'readme.txt': 'SIMCom demo filesystem\r\nArchivos de ejemplo.\r\n',
    };
    if (demo[name] != null) return new TextEncoder().encode(demo[name]);
    return null;
  }
  _later(ms, fn) { setTimeout(fn, ms); }
  // Schedules fix acquisition and starts the route stopwatch (once).
  _gnssFix(delay) { this._later(delay, () => { if (this.state.gnss !== 'off') { this.state.gnss = 'fix'; if (!this._gnssT0) this._gnssT0 = Date.now(); } }); }
  _gnssOff() { this.state.gnss = 'off'; this._gnssT0 = null; }
  _nmea(body) { let c = 0; for (let i = 0; i < body.length; i++) c ^= body.charCodeAt(i); return `$${body}*${c.toString(16).toUpperCase().padStart(2, '0')}`; }
  _startGsv() {
    if (this._gsvTimer) return;
    // set of simulated satellites (GPS/GLONASS/BeiDou/Galileo) with prn,el,az,snr
    const bursts = [
      'GPGSV,2,1,07,02,41,331,41,05,42,243,42,13,45,060,45,15,42,162,42',
      'GPGSV,2,2,07,18,38,127,38,20,34,318,34,24,20,183,20',
      'GLGSV,1,1,04,65,29,294,29,66,32,162,32,67,21,260,21,68,16,065,16',
      'GBGSV,2,1,08,06,36,090,36,08,31,042,31,13,29,310,29,16,26,177,26',
      'GBGSV,2,2,08,27,39,193,39,30,30,188,30,41,29,236,29,60,25,193,25',
      'GAGSV,1,1,03,05,33,278,33,07,32,164,32,30,22,047,22',
    ];
    const emit = () => { if (!this.state.tst || this.state.gnss === 'off') return; this.output('\r\n' + bursts.map((b) => this._nmea(b)).join('\r\n') + '\r\n'); };
    emit(); this._gsvTimer = setInterval(emit, 1200);
  }
  _stopGsv() { if (this._gsvTimer) { clearInterval(this._gsvTimer); this._gsvTimer = null; } }
  _startJam() {
    this._stopJam();
    const s = this.state;
    const p = s.sjdcfg.period;
    if (!(p > 0)) return;            // period=0 → no state change is emitted
    // Re-evaluates the jamming state (25% jammed) and reports according to detecstat:
    //  - detecstat=1: +SJDR only when the state CHANGES (jammed <-> not jammed)
    //  - detecstat=0: periodic +SJDR every `period` s, changed or not
    const tick = () => {
      if (!s.sjdr) return;
      const next = Math.random() < 0.25 ? 1 : 0;
      const changed = next !== s.jamCur;
      s.jamCur = next;
      if (s.sjdcfg.detecstat ? changed : true) this.output(`\r\n+SJDR: ${next}\r\n`);
    };
    this._later(1500, tick);
    this._jamTimer = setInterval(tick, p * 1000);
  }
  _stopJam() { if (this._jamTimer) { clearInterval(this._jamTimer); this._jamTimer = null; } }
  _handle(cmd) {
    if (this.state.echo) this.output(cmd + '\r');
    const ok = () => this._send(['OK']), err = () => this._send(['ERROR']), reply = (l) => this._send([...l, 'OK']);
    const s = this.state;
    if (/^AT$/i.test(cmd)) return ok();
    if (/^ATE0$/i.test(cmd)) { s.echo = false; return ok(); }
    if (/^ATE1?$/i.test(cmd)) { s.echo = true; return ok(); }
    const id = this.identity;
    if (/^ATI$/i.test(cmd)) return reply(id.ati.slice());
    if (/^AT\+SIMCOMATI/i.test(cmd)) return reply(['Manufacturer: ' + id.manufacturer, 'Model: ' + id.model, 'Revision: ' + id.revision, id.ati[1], 'QCN: ', 'IMEI: ' + id.imei, 'MEID: ', '+GCAP: +CGSM', 'DeviceInfo: 173,170']);
    if (/^AT\+CMEE=/i.test(cmd)) return ok();
    if (/^AT\+CGMI/i.test(cmd)) return reply([id.manufacturer]);
    if (/^AT\+CGMM/i.test(cmd)) return reply([id.model]);
    if (/^AT\+CGMR/i.test(cmd)) return reply(['+CGMR: ' + id.revision]);
    if (/^AT\+CGSN/i.test(cmd)) return reply([id.imei]);
    if (/^AT\+CPIN\?/i.test(cmd)) return s.simReady ? reply(['+CPIN: READY']) : this._send(['+CME ERROR: 10']);   // 10 = SIM not inserted
    if (/^AT\+CPIN=/i.test(cmd)) return s.simReady ? ok() : this._send(['+CME ERROR: 10']);
    if (/^AT\+CICCID/i.test(cmd)) return reply(['+ICCID: 8954072100123456789F']);
    if (/^AT\+CIMI/i.test(cmd)) return reply(['722310123456789']);
    if (/^AT\+CSPN\?/i.test(cmd)) return reply(['+CSPN: "Movistar",1']);
    if (/^AT\+CLCK="SC",2/i.test(cmd)) return reply([`+CLCK: ${s.simlock ?? 0}`]);
    if (/^AT\+CLCK="SC",([01])/i.test(cmd)) { s.simlock = Number(cmd.match(/,([01])/)[1]); return ok(); }
    if (/^AT\+CPWD=/i.test(cmd)) return ok();
    if (/^AT\+SPIC/i.test(cmd)) return reply(['+SPIC: 3,3,10,10']);
    const camped = [1, 5].includes(s.reg.creg) || [1, 5].includes(s.reg.cereg);   // camped on a cell (home or roaming)
    if (/^AT\+CSQ/i.test(cmd)) return reply([`+CSQ: ${camped ? s.rssi : 99},99`]);
    if (/^AT\+CESQ/i.test(cmd)) return reply([`+CESQ: 99,99,255,255,${Math.round((s.rsrq + 20) * 2)},${141 + s.rsrp}`]);
    if (/^AT\+CPSI\?/i.test(cmd)) {
      if (!camped) return reply(['+CPSI: NO SERVICE,Online']);
      return reply([`+CPSI: LTE,Online,${s.mccmnc},0x1FE,309262,68,${this.identity.band},1733,2,0,${s.rsrq},${s.rsrp},${-113 + 2 * s.rssi},${s.sinr}`]);
    }
    if (/^AT\+COPS\?/i.test(cmd)) return reply([`+COPS: 0,0,"${s.operator}",7`]);
    if (/^AT\+(CREG|CGREG|CEREG)\?/i.test(cmd)) { const w = cmd.match(/C[EG]?REG/i)[0].toUpperCase(); return reply([`+${w}: 2,${s.reg[w.toLowerCase()]},"1A2B","00C3D4E5",7`]); }
    if (/^AT\+CGATT\?/i.test(cmd)) return reply(['+CGATT: 1']);
    if (/^AT\+CGDCONT\?/i.test(cmd)) return reply([`+CGDCONT: 1,"${s.pdpType}","${s.apn}","0.0.0.0"`]);
    if (/^AT\+CGDCONT=/i.test(cmd)) { const m = cmd.match(/"(IP|IPV6|IPV4V6|PPP)","([^"]*)"/i); if (m) { s.pdpType = m[1].toUpperCase(); s.apn = m[2]; } return ok(); }
    if (/^AT\+CGAUTH\?/i.test(cmd)) return reply([`+CGAUTH: 1,${s.auth.type}${s.auth.user ? `,"${s.auth.user}"` : ''}`]);
    if (/^AT\+CGAUTH=/i.test(cmd)) {
      const m = cmd.split('=')[1].match(/^\s*1\s*,\s*(\d)(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?/);
      if (!m) return err();
      s.auth = { type: +m[1], user: m[2] || '' };
      return ok();
    }
    if (/^AT\+CNBP\?/i.test(cmd)) return reply([`+CNBP: ${s.cnbp.pos},${s.cnbp.lte},${s.cnbp.tds}`]);
    if (/^AT\+CNBP=/i.test(cmd)) {
      const parts = cmd.split('=')[1].split(',').map((x) => x.trim());
      if (parts.some((p) => p && !/^0x[0-9a-fA-F]+$/i.test(p))) return err();
      if (parts[0]) s.cnbp.pos = parts[0];
      if (parts[1]) s.cnbp.lte = parts[1];
      if (parts[2]) s.cnbp.tds = parts[2];
      return ok();
    }
    if (/^AT\+CNSMOD\?/i.test(cmd)) return reply(['+CNSMOD: 0,8']);
    if (/^AT\+CNMP=\?/i.test(cmd)) return reply(['+CNMP: (2,13,14,38)']);
    if (/^AT\+CNMP\?/i.test(cmd)) return reply([`+CNMP: ${s.cnmp ?? 2}`]);
    if (/^AT\+CNMP=/i.test(cmd)) { s.cnmp = Number(cmd.split('=')[1]); return ok(); }
    if (/^AT\+CDNSGIP="?([^"]+)"?/i.test(cmd)) { const h = cmd.match(/CDNSGIP="?([^",]+)/i)[1]; ok(); return this._later(600, () => this.output(`\r\n+CDNSGIP: 1,"${h}","142.250.79.110"\r\n`)); }
    if (/^AT\+CGPADDR/i.test(cmd)) return reply(['+CGPADDR: 1,"10.64.12.193"']);
    if (/^AT\+NETOPEN\?/i.test(cmd)) return reply([`+NETOPEN: ${s.netOpen ? 1 : 0}`]);
    if (/^AT\+NETOPEN/i.test(cmd)) { if (s.netOpen) return this._send(['+IP ERROR: Network is already opened', 'ERROR']); s.netOpen = true; ok(); return this._later(600, () => this.output('\r\n+NETOPEN: 0\r\n')); }
    if (/^AT\+NETCLOSE/i.test(cmd)) { s.netOpen = false; ok(); return this._later(300, () => this.output('\r\n+NETCLOSE: 0\r\n')); }
    if (/^AT\+IPADDR/i.test(cmd)) return reply(s.netOpen ? ['+IPADDR: 10.64.12.193'] : ['+IP ERROR: Network not opened']);
    if (/^AT\+SERVERSTART=/i.test(cmd)) { if (!s.netOpen) return err(); s.server = Number(cmd.split('=')[1].split(',')[0]) || 0; return ok(); }
    if (/^AT\+SERVERSTOP/i.test(cmd)) { if (s.server == null) return err(); s.server = null; return ok(); }
    if (/^AT\+CGNSSPWR\?/i.test(cmd)) return reply([`+CGNSSPWR: ${s.gnss === 'off' ? 0 : 1}`]);
    if (/^AT\+CGNSSPWR=1/i.test(cmd)) { s.gnss = 'ready'; ok(); this._later(900, () => this.output('\r\n+CGNSSPWR: READY!\r\n')); this._gnssFix(4000); return; }
    if (/^AT\+CGNSSPWR=0/i.test(cmd)) { this._gnssOff(); s.tst = false; this._stopGsv(); return ok(); }
    if (/^AT\+CGNSSINFO/i.test(cmd)) { if (s.gnss !== 'fix') return reply(['+CGNSSINFO: ,,,,,,,,,,,,,,,']); const p = gnssRoutePos(this._gnssT0); return reply([`+CGNSSINFO: 3,09,05,03,02,${Math.abs(p.lat).toFixed(7)},S,${Math.abs(p.lon).toFixed(7)},W,${this._d()},${this._u()},18.5,${p.kn.toFixed(1)},${p.course.toFixed(1)},1.2,0.8,0.9,11`]); }
    if (/^AT\+CGNSSTST=1/i.test(cmd)) { s.tst = true; ok(); return this._startGsv(); }
    if (/^AT\+CGNSSTST=0/i.test(cmd)) { s.tst = false; this._stopGsv(); return ok(); }
    if (/^AT\+CGNSSTST\?/i.test(cmd)) return reply([`+CGNSSTST: ${s.tst ? 1 : 0}`]);
    if (/^AT\+CGNSSPORTSWITCH/i.test(cmd)) return ok();
    if (/^AT\+CGPS(COLD|WARM|HOT)/i.test(cmd)) { s.gnss = 'ready'; ok(); this._gnssFix(/COLD/i.test(cmd) ? 6000 : /WARM/i.test(cmd) ? 3000 : 1000); return; }
    // --- GNSS variants of other families (to try profiles in virtual mode) ---
    // SIM7080/7070: CGNSPWR / CGNSINF
    if (/^AT\+CGNSPWR\?/i.test(cmd)) return reply([`+CGNSPWR: ${s.gnss === 'off' ? 0 : 1}`]);
    if (/^AT\+CGNSPWR=1/i.test(cmd)) { s.gnss = 'ready'; ok(); this._gnssFix(3000); return; }
    if (/^AT\+CGNSPWR=0/i.test(cmd)) { this._gnssOff(); return ok(); }
    if (/^AT\+CGNSINF/i.test(cmd)) { if (s.gnss !== 'fix') return reply(['+CGNSINF: 1,0,,,,,,,,,,,,,,,,,,,']); const p = gnssRoutePos(this._gnssT0); return reply([`+CGNSINF: 1,1,${this._ts7080()},${p.lat.toFixed(6)},${p.lon.toFixed(6)},18.5,${p.kmh.toFixed(2)},${p.course.toFixed(1)},1,,0.8,1.2,0.9,,11,9,7,,38,,`]); }
    if (/^AT\+CGNS(COLD|WARM|HOT)/i.test(cmd)) { s.gnss = 'ready'; ok(); this._gnssFix(/COLD/i.test(cmd) ? 6000 : /WARM/i.test(cmd) ? 3000 : 1000); return; }
    // SIM7600/A7600: CGPS / CGPSINFO
    if (/^AT\+CGPS\?/i.test(cmd)) return reply([`+CGPS: ${s.gnss === 'off' ? 0 : 1},1`]);
    if (/^AT\+CGPS=1/i.test(cmd)) { s.gnss = 'ready'; ok(); this._gnssFix(3000); return; }
    if (/^AT\+CGPS=0/i.test(cmd)) { this._gnssOff(); return ok(); }
    if (/^AT\+CGPSINFO/i.test(cmd)) { if (s.gnss !== 'fix') return reply(['+CGPSINFO: ,,,,,,,,']); const p = gnssRoutePos(this._gnssT0); return reply([`+CGPSINFO: ${_toNmea(p.lat, true)},S,${_toNmea(p.lon, false)},W,${this._d()},${this._u()},128.4,${p.kn.toFixed(1)},${p.course.toFixed(1)}`]); }
    // --- BLE (A76XX -FASE, e.g. A7672SA-FASE) — ESP families use the Espressif BLE block (below) ---
    if (!this.isEsp) {
      if (/^AT\+BLE\w+=\?/i.test(cmd) || /^AT\+BT\w+=\?/i.test(cmd)) return ok();
      if (/^AT\+BLEPOWER\?/i.test(cmd)) return reply([`+BLEPOWER: ${s.ble.power}`]);
      if (/^AT\+BLEPOWER=([01])/i.test(cmd)) { s.ble.power = Number(cmd.match(/=([01])/)[1]); if (!s.ble.power) { s.ble.scanning = false; s.ble.server = false; s.ble.adv = false; s.ble.conn = null; } return ok(); }
      if (!s.ble.power && /^AT\+BLE/i.test(cmd)) return err();   // BLE must be powered on first
      if (/^AT\+BLESTATUS\?/i.test(cmd)) return s.ble.conn ? reply([`+BLESTATUS: 0,2,ABCDEF50,${s.ble.conn}`]) : ok();
      if (/^AT\+BLEHOST\?/i.test(cmd)) return reply([`+BLEHOST: ${s.ble.host},"${s.ble.addr}"`]);
      if (/^AT\+BLEHOST=/i.test(cmd)) { const m = cmd.match(/=\s*"?([^"]+?)"?\s*$/); if (m) s.ble.host = m[1]; return ok(); }
      if (/^AT\+BLEADDR\?/i.test(cmd)) return reply([`+BLEADDR: "${s.ble.addr}"`]);
      if (/^AT\+BLEADDR=/i.test(cmd)) { const m = cmd.match(/=\s*"?([0-9a-fA-F:]+)/); if (m) s.ble.addr = m[1].toLowerCase(); return reply([`+BLEADDR: "${s.ble.addr}"`]); }
      if (/^AT\+BLECREG\b/i.test(cmd)) return reply(['+BLECREG: 0,ABCDEF50']);
      if (/^AT\+BLECDREG=/i.test(cmd)) return reply(['+BLECDREG: 0,ABCDEF50']);
      if (/^AT\+BLESREG\b/i.test(cmd)) return reply(['+BLESREG: 0,ABCDEF00']);
      if (/^AT\+BLESDREG=/i.test(cmd)) return reply(['+BLESDREG: 0,ABCDEF00']);
      if (/^AT\+BLESCAN=\d+,1/i.test(cmd)) { s.ble.scanning = true; ok(); return this._bleScan(); }
      if (/^AT\+BLESCAN=\d+,0/i.test(cmd)) { s.ble.scanning = false; return ok(); }
      if (/^AT\+BLESSSTART=/i.test(cmd)) { s.ble.server = true; return reply(['+BLESSSTART: 0,ABCDEF00,0']); }
      if (/^AT\+BLESSSTOP=/i.test(cmd)) { s.ble.server = false; s.ble.adv = false; return reply(['+BLESSSTOP: 0,ABCDEF00,0']); }
      if (/^AT\+BLESLSTART=/i.test(cmd)) { if (!s.ble.server) return err(); s.ble.adv = true; return reply(['+BLESLSTART: 0,ABCDEF00']); }
      if (/^AT\+BLESLSTOP=/i.test(cmd)) { s.ble.adv = false; return reply(['+BLESLSTOP: 0,ABCDEF00']); }
      if (/^AT\+BLECCON=(\d+)/i.test(cmd)) { const si = cmd.match(/=(\d+)/)[1]; const addr = (this._bleDevs && this._bleDevs[si]) || '2b:3c:42:10:23:58'; s.ble.conn = addr; ok(); return this._later(700, () => this.output(`\r\n+BLECCON: 0,"${addr}"\r\n`)); }
      if (/^AT\+BLECDISC=/i.test(cmd)) { const a = s.ble.conn || '2b:3c:42:10:23:58'; s.ble.conn = null; ok(); return this._later(300, () => this.output(`\r\n+BLECDISC: 0,"${a}"\r\n`)); }
      if (/^AT\+BLEDISCONN/i.test(cmd)) { s.ble.conn = null; return ok(); }
      if (/^AT\+BLE/i.test(cmd)) return ok();   // remaining BLE commands → generic OK
    }
    if (/^AT\+CMGF=/i.test(cmd)) { s.cmgf = Number(cmd.split('=')[1]) || 0; return ok(); }   // 0 = PDU · 1 = text
    if (/^AT\+CSCS=/i.test(cmd) || /^AT\+CNMI=/i.test(cmd)) return ok();
    if (/^AT\+CMGS=/i.test(cmd)) { this.expecting = { kind: 'cmgs' }; return this.output('\r\n> '); }
    if (/^AT\+CMGL/i.test(cmd)) {
      const l = []; const STAT = { 'REC UNREAD': 0, 'REC READ': 1, 'STO UNSENT': 2, 'STO SENT': 3 };
      if (s.cmgf === 0) s.sms.forEach((m, i) => { const pdu = buildDeliverPdu(m.from, m.text, m.ts); l.push(`+CMGL: ${i + 1},${STAT[m.stat] ?? 1},,${(pdu.length - 2) / 2}`, pdu); });   // PDU: len excludes the SMSC octet
      else s.sms.forEach((m, i) => l.push(`+CMGL: ${i + 1},"${m.stat}","${m.from}",,"${m.ts}"`, m.text));
      return reply(l);
    }
    if (/^AT\+CMGR=/i.test(cmd)) { const m = s.sms[Number(cmd.split('=')[1]) - 1]; return m ? reply([`+CMGR: "${m.stat}","${m.from}","","${m.ts}"`, m.text]) : err(); }
    if (/^AT\+CMGD=/i.test(cmd)) { const p = cmd.split('=')[1].split(','); const idx = Number(p[0]), flag = Number(p[1] || 0); if (flag >= 1) s.sms = []; else if (s.sms[idx - 1]) s.sms.splice(idx - 1, 1); return ok(); }
    if (/^AT\+CLBS=/i.test(cmd)) {
      const type = Number((cmd.split('=')[1] || '').split(',')[0]);
      if (type === 3) return reply(['+CLBS: 0,7']);                       // access times
      if (type === 2) return reply(['+CLBS: 0,0042006500720063']);       // detail addr (UCS2, demo)
      const dt = new Date(); const p2 = (n) => String(n).padStart(2, '0');
      const date = `${dt.getUTCFullYear()}/${p2(dt.getUTCMonth() + 1)}/${p2(dt.getUTCDate())}`;
      const time = `${p2(dt.getUTCHours())}:${p2(dt.getUTCMinutes())}:${p2(dt.getUTCSeconds())}`;
      const base = '+CLBS: 0,-34.7041,-58.2812,550';
      return this._later(700, () => this._send([type === 4 ? `${base},${date},${time}` : base, 'OK']));
    }
    if (/^AT\+CWSTASCAN(EX)?=\?/i.test(cmd)) return reply([/EX/i.test(cmd) ? '+CWSTASCANEX: (0-1),(1-3),(4-10),(0-255),(0-1)' : '+CWSTASCAN: (0-1)']);
    if (/^AT\+CWSTASCAN(EX)?\?/i.test(cmd)) return reply([/EX/i.test(cmd) ? `+CWSTASCANEX: ${s.wifiSig},1,10,30,0` : `+CWSTASCAN: ${s.wifiSig}`]);
    if (/^AT\+CWSTASCAN(EX)?=/i.test(cmd)) { const n = parseInt(cmd.split('=')[1], 10); if (!isNaN(n)) s.wifiSig = n ? 1 : 0; return ok(); }
    if (/^AT\+CWSTASCAN(EX)?$/i.test(cmd)) {
      const tag = /EX/i.test(cmd) ? '+CWSTASCANEX:' : '+CWSTASCAN:';
      const aps = [['50:FA:84:AF:C8:B9', 11, -61], ['A4:2B:B0:12:9D:3E', 6, -58], ['86:40:BB:00:2E:AD', 11, -65],
        ['F8:8C:21:7C:14:02', 36, -70], ['1C:15:1F:55:56:7A', 1, -76], ['3C:84:6A:55:1B:88', 3, -82], ['E0:CC:7A:33:90:1D', 44, -79]];
      const lines = [tag, ''];
      aps.forEach(([mac, ch, sig]) => lines.push(s.wifiSig ? `${mac},${ch},${sig}` : `${mac},${ch}`));
      return this._later(1500, () => this._send([...lines, 'OK']));
    }
    if (/^AT\+CCERTLIST/i.test(cmd)) return reply(s.certs.map((c) => `+CCERTLIST: "${c}"`));
    if (/^AT\+CCERTDOWN=/i.test(cmd)) { const m = cmd.match(/CCERTDOWN="([^"]*)",(\d+)/i); this.expecting = { kind: 'cert', name: m ? m[1] : null, len: m ? Number(m[2]) : 0 }; return this.output('\r\n> '); }
    if (/^AT\+CCERTDELE=/i.test(cmd)) { const m = cmd.match(/"([^"]*)"/); if (m) s.certs = s.certs.filter((c) => c !== m[1]); return ok(); }
    if (/^AT\+CSSLCFG\?/i.test(cmd)) return reply(['+CSSLCFG: "sslversion",0,4', '+CSSLCFG: "authmode",0,0', '+CSSLCFG: "cacert",0,""', '+CSSLCFG: "ignorelocaltime",0,1']);
    if (/^AT\+CSSLCFG=/i.test(cmd)) return ok();
    if (/^AT\+IPR\?/i.test(cmd)) return reply([`+IPR: ${s.ipr ?? 115200}`]);
    if (/^AT\+IPR=/i.test(cmd)) { s.ipr = Number(cmd.split('=')[1].split(',')[0]); return ok(); }
    if (/^AT\+ICF\?/i.test(cmd)) return reply([`+ICF: ${s.icf || '2,2'}`]);
    if (/^AT\+ICF=/i.test(cmd)) { s.icf = cmd.split('=')[1]; return ok(); }
    if (/^AT\+IFC\?/i.test(cmd)) return reply([`+IFC: ${s.ifc || '2,2'}`]);
    if (/^AT\+IFC=/i.test(cmd)) { s.ifc = cmd.split('=')[1]; return ok(); }
    if (/^AT\+CSCLK\?/i.test(cmd)) return reply([`+CSCLK: ${s.csclk ?? 0}`]);
    if (/^AT\+CSCLK=/i.test(cmd)) { s.csclk = Number(cmd.split('=')[1]); return ok(); }
    if (/^AT\+SJDR=\?/i.test(cmd)) return reply(['+SJDR: (0,1)']);
    if (/^AT\+SJDR\?/i.test(cmd)) return reply([`+SJDR: ${s.sjdr ?? 0}`]);
    if (/^AT\+SJDR=([01])/i.test(cmd)) { s.sjdr = Number(cmd.match(/=([01])/)[1]); if (s.sjdr) this._startJam(); else this._stopJam(); return ok(); }
    if (/^AT\+SJDCFG=\?/i.test(cmd)) return reply(['+SJDCFG: "period",(0-120)', '+SJDCFG: "mnl",(0-31)', '+SJDCFG: "minch",(0-254)', '+SJDCFG: "detecstat",(0-1)', '+SJDCFG: "sinr",(-50~30)', '+SJDCFG: "rsrp",(-140~-44)', '+SJDCFG: "rsrq",(-19~-1)']);
    if (/^AT\+SJDCFG\?/i.test(cmd)) { const c = s.sjdcfg; return reply([`+SJDCFG: "period",${c.period}`, `+SJDCFG: "mnl",${c.mnl}`, `+SJDCFG: "minch",${c.minch}`, `+SJDCFG: "detecstat",${c.detecstat}`, `+SJDCFG: "sinr",${c.sinr}`, `+SJDCFG: "rsrp",${c.rsrp}`, `+SJDCFG: "rsrq",${c.rsrq}`]); }
    if (/^AT\+SJDCFG=/i.test(cmd)) { const m = cmd.match(/SJDCFG="(\w+)",(-?\d+)/i); if (m && (m[1] in s.sjdcfg)) { s.sjdcfg[m[1]] = Number(m[2]); if (s.sjdr) this._startJam(); } return ok(); }
    // ===== Espressif ESP (firmware AT): Wi-Fi / TCP / MQTT / BLE / HTTP =====
    if (/^AT\+GMR/i.test(cmd)) return reply(['AT version:3.4.0.0', 'SDK version:v5.1.2', `Bin version:${this.identity.model || 'ESP'}`]);
    if (/^AT\+CWMODE\?/i.test(cmd)) return reply([`+CWMODE:${s.cwmode || 1}`]);
    if (/^AT\+CWMODE=/i.test(cmd)) { s.cwmode = Number(cmd.split('=')[1]) || 1; return ok(); }
    if (/^AT\+CWLAP/i.test(cmd)) return reply([
      '+CWLAP:(3,"FibraHogar",-52,"a4:91:b1:11:22:33",6)',
      '+CWLAP:(4,"Oficina",-63,"c8:3a:35:44:55:66",11)',
      '+CWLAP:(0,"OpenWifi",-78,"00:11:22:aa:bb:cc",1)',
    ]);
    if (/^AT\+CWJAP=/i.test(cmd)) {   // the OK arrives AFTER associating (like the real firmware)
      const m = cmd.match(/CWJAP="([^"]*)"/i);
      s.espWifi = { ssid: m ? m[1] : 'AP', ch: 6, rssi: -55 };
      this._later(250, () => this.output('\r\nWIFI CONNECTED\r\n'));
      this._later(550, () => this.output('\r\nWIFI GOT IP\r\n'));
      return this._later(700, () => this._send(['OK']));
    }
    if (/^AT\+CWJAP\?/i.test(cmd)) return s.espWifi ? reply([`+CWJAP:"${s.espWifi.ssid}","a4:91:b1:11:22:33",${s.espWifi.ch},${s.espWifi.rssi}`]) : reply(['No AP']);
    if (/^AT\+CWQAP/i.test(cmd)) { s.espWifi = null; ok(); return this._later(200, () => this.output('\r\nWIFI DISCONNECT\r\n')); }
    if (/^AT\+CWSTATE\?/i.test(cmd)) return reply([`+CWSTATE:${s.espWifi ? 2 : 4},"${s.espWifi ? s.espWifi.ssid : ''}"`]);
    if (/^AT\+CWSAP\?/i.test(cmd)) { const a = s.espAp || { ssid: 'ESP-AP', pass: '', ch: 6, enc: 3 }; return reply([`+CWSAP:"${a.ssid}","${a.pass}",${a.ch},${a.enc},4,0`]); }
    if (/^AT\+CWSAP=/i.test(cmd)) { const m = cmd.match(/CWSAP="([^"]*)","([^"]*)",(\d+),(\d+)/i); if (m) s.espAp = { ssid: m[1], pass: m[2], ch: Number(m[3]), enc: Number(m[4]) }; return ok(); }
    if (/^AT\+CWLIF/i.test(cmd)) return reply(s.espAp ? ['+CWLIF:192.168.4.2,aa:bb:cc:dd:ee:ff', '+CWLIF:192.168.4.3,11:22:33:44:55:66'] : []);
    if (/^AT\+CWDHCP/i.test(cmd)) return ok();
    if (/^AT\+CIPSTA\?/i.test(cmd)) return reply(s.espWifi
      ? ['+CIPSTA:ip:"192.168.1.37"', '+CIPSTA:gateway:"192.168.1.1"', '+CIPSTA:netmask:"255.255.255.0"']
      : ['+CIPSTA:ip:"0.0.0.0"', '+CIPSTA:gateway:"0.0.0.0"', '+CIPSTA:netmask:"0.0.0.0"']);
    if (/^AT\+CIPSTAMAC\?/i.test(cmd)) return reply(['+CIPSTAMAC:"7c:df:a1:12:34:56"']);
    if (/^AT\+CIFSR/i.test(cmd)) return reply(['+CIFSR:STAIP,"192.168.1.37"', '+CIFSR:STAMAC,"7c:df:a1:12:34:56"']);
    if (/^AT\+PING=/i.test(cmd)) return s.espWifi ? reply([`+PING:${18 + ((s.pingSeq = (s.pingSeq || 0) + 1) % 7)}`]) : reply(['+PING:TIMEOUT']);
    if (/^AT\+CIPMUX\?/i.test(cmd)) return reply([`+CIPMUX:${s.espMux || 0}`]);
    if (/^AT\+CIPMUX=([01])/i.test(cmd)) { s.espMux = Number(cmd.match(/=([01])/)[1]); return ok(); }
    if (/^AT\+CIPSERVER=1/i.test(cmd)) {   // TCP server (needs CIPMUX=1): simulate an incoming client shortly after
      if (!s.espMux) return err();
      s.espSrv = true; ok();
      this._later(200, () => { if (s.espSrv) this.output('\r\n0,CONNECT\r\n'); });
      this._later(350, () => { if (s.espSrv) this.output('\r\n+IPD,0,5:hello\r\n'); });   // link 0 pushes 5 bytes
      return;
    }
    if (/^AT\+CIPSERVER=0/i.test(cmd)) { s.espSrv = false; ok(); return this._later(120, () => this.output('\r\n0,CLOSED\r\n')); }
    if (/^AT\+CIPSTART=/i.test(cmd)) { if (!s.espWifi) return err(); s.espConn = true; return reply(['CONNECT']); }
    if (/^AT\+CIPSEND=\d+$/i.test(cmd)) { if (!s.espConn) return err(); this.expecting = { kind: 'len', len: Number(cmd.split('=')[1]) || 0 }; return this.output('\r\n> '); }
    if (/^AT\+CIPCLOSE$/i.test(cmd)) { if (!s.espConn) return err(); s.espConn = false; ok(); return this._later(120, () => this.output('\r\nCLOSED\r\n')); }
    if (/^AT\+CIPSTATUS/i.test(cmd)) return reply([`STATUS:${s.espConn ? 3 : (s.espWifi ? 2 : 5)}`]);
    if (/^AT\+MQTTUSERCFG=/i.test(cmd)) return ok();
    if (/^AT\+MQTTCONN=/i.test(cmd)) { s.espMqtt = true; ok(); return this._later(300, () => this.output('\r\n+MQTTCONNECTED:0,1,"broker","1883","",1\r\n')); }
    if (/^AT\+MQTTSUB=/i.test(cmd) || /^AT\+MQTTPUB=/i.test(cmd)) return s.espMqtt ? ok() : err();
    if (/^AT\+MQTTCLEAN=/i.test(cmd)) { s.espMqtt = false; return ok(); }
    if (/^AT\+HTTPCLIENT=/i.test(cmd)) return s.espWifi ? reply(['+HTTPCLIENT:12,{"ok":true}']) : err();
    if (/^AT\+BLEINIT\?/i.test(cmd)) return reply([`+BLEINIT:${s.espBle || 0}`]);
    if (/^AT\+BLEINIT=/i.test(cmd)) { s.espBle = Number(cmd.split('=')[1]) || 0; if (!s.espBle) { s.espBleConns = {}; s.espBleAdv = false; } return ok(); }
    if (/^AT\+BLEADDR\?/i.test(cmd)) return reply(['+BLEADDR:"7c:df:a1:12:34:58"']);
    if (/^AT\+BLENAME\?/i.test(cmd)) return reply([`+BLENAME:"${s.espBleName || this.identity.model || 'BLE_AT'}"`]);
    if (/^AT\+BLENAME=/i.test(cmd)) { if (!s.espBle) return err(); const m = cmd.match(/=\s*"?([^"]*)"?/); s.espBleName = m ? m[1] : ''; return ok(); }
    if (/^AT\+BLESCAN=1,(\d+)/i.test(cmd)) {   // results as +BLESCAN URCs during the window
      if (!s.espBle) return err();
      ok();
      const devs = [['5c:02:14:aa:10:01', -48], ['e8:07:bf:23:45:67', -71], ['c0:49:ef:99:88:77', -83]];
      devs.forEach(([a, r], i) => this._later(250 * (i + 1), () => this.output(`\r\n+BLESCAN:"${a}",${r},"0201060909455350","",0\r\n`)));
      return;
    }
    if (/^AT\+BLESCAN=0$/i.test(cmd)) return ok();
    if (/^AT\+BLECONN\?/i.test(cmd)) { const c = s.espBleConns || {}; return reply(Object.keys(c).map((i) => `+BLECONN:${i},"${c[i]}"`)); }
    if (/^AT\+BLECONN=/i.test(cmd)) {   // AT+BLECONN=<idx>,"<addr>",<type>,<timeout>
      if (!s.espBle) return err();
      const m = cmd.match(/=\s*(\d+)\s*,\s*"([0-9a-fA-F:]+)"/);
      if (!m) return err();
      (s.espBleConns || (s.espBleConns = {}))[m[1]] = m[2].toLowerCase();
      ok();
      return this._later(400, () => this.output(`\r\n+BLECONN:${m[1]},"${m[2].toLowerCase()}"\r\n`));
    }
    if (/^AT\+BLEDISCONN=/i.test(cmd)) { const i = cmd.match(/=(\d+)/)[1]; const c = s.espBleConns || {}; const a = c[i]; delete c[i]; ok(); return a ? this._later(200, () => this.output(`\r\n+BLEDISCONN:${i},"${a}"\r\n`)) : undefined; }
    if (/^AT\+BLEGATTCPRIMSRV=/i.test(cmd)) {   // primary GATT services of the remote server
      const i = (cmd.match(/=(\d+)/) || [, '0'])[1];
      return reply([`+BLEGATTCPRIMSRV:${i},1,"1800",1`, `+BLEGATTCPRIMSRV:${i},2,"1801",1`, `+BLEGATTCPRIMSRV:${i},3,"180a",1`]);
    }
    if (/^AT\+BLEGATTCCHAR=/i.test(cmd)) {   // characteristics of a service: props 0x02 read · 0x08 write · 0x10 notify
      const m = cmd.match(/=(\d+),(\d+)/); const ci = m ? m[1] : '0', si = m ? m[2] : '1';
      if (si === '3') return reply([`+BLEGATTCCHAR:"char",${ci},${si},1,"2a29",2`, `+BLEGATTCCHAR:"char",${ci},${si},2,"2a24",2`]);   // Device Info: read-only
      return reply([`+BLEGATTCCHAR:"char",${ci},${si},1,"2a00",10`, `+BLEGATTCCHAR:"char",${ci},${si},2,"2a05",16`]);   // 10=R+W, 16=notify
    }
    if (/^AT\+BLEGATTCRD=/i.test(cmd)) { const m = cmd.match(/=(\d+),(\d+),(\d+)/); const c = m ? m[1] : '0'; return reply([`+BLEGATTCRD:${c},5,"48656c6c6f"`]); }   // "Hello"
    if (/^AT\+BLEGATTCWR=/i.test(cmd)) { const n = Number((cmd.split(',').pop()) || 0); if (n > 0) { this.expecting = { kind: 'len', len: n * 2 }; return this.output('\r\n> '); } return ok(); }   // hex payload: 2 chars per byte
    if (/^AT\+BLEGATTCSUBSCRIBE=/i.test(cmd)) {   // notifications: emit a couple of +BLEGATTCNTFY URCs
      const m = cmd.match(/=(\d+),(\d+),(\d+)/); if (!m) return err();
      const [, ci, si, ch] = m; ok();
      this._later(500, () => this.output(`\r\n+BLEGATTCNTFY:${ci},${si},${ch},2,"1a2b"\r\n`));
      this._later(1100, () => this.output(`\r\n+BLEGATTCNTFY:${ci},${si},${ch},2,"3c4d"\r\n`));
      return;
    }
    if (/^AT\+BLEGATTCUNSUBSCRIBE=/i.test(cmd)) return ok();
    if (/^AT\+BLEADVSTART/i.test(cmd)) { if (!s.espBle) return err(); s.espBleAdv = true; return ok(); }
    if (/^AT\+BLEADVSTOP/i.test(cmd)) { if (!s.espBle) return err(); s.espBleAdv = false; return ok(); }
    if (/^AT\+BLE/i.test(cmd)) return s.espBle ? ok() : err();   // remaining ESP BLE commands (ADVDATAEX, etc.) → OK if BLE initialized

    // ===== LwM2M (AT+LW*) and CoAP (AT+COAP*) — ch. 29/30 of the A76XX manual =====
    if (/^AT\+LWSTART/i.test(cmd) || /^AT\+LWSTOP/i.test(cmd)) return ok();
    if (/^AT\+LWCNF=/i.test(cmd)) {
      const m = cmd.match(/LWCNF=(\d)\s*,\s*"(\w+)"\s*,\s*(.+)$/i);
      if (!m) return err();
      (s.lwcnf = s.lwcnf || {})[m[2].toLowerCase()] = m[3].trim().replace(/^"|"$/g, '');
      return ok();
    }
    if (/^AT\+LWOPEN/i.test(cmd)) {   // registration: OK + registration-complete URC (async)
      const id = Number((cmd.split('=')[1] || '0').replace(/\D/g, '')) || 0;
      s.lwopen = true; ok();
      return this._later(800, () => { if (s.lwopen) this.output(`\r\n+LWURC: "registration completed",${id}\r\n`); });
    }
    if (/^AT\+LWCLOSE=/i.test(cmd)) { if (!s.lwopen) return err(); s.lwopen = false; return ok(); }
    if (/^AT\+LWADDOBJ=/i.test(cmd) || /^AT\+LWDELOBJ=/i.test(cmd) || /^AT\+LWSET=/i.test(cmd)) return ok();
    if (/^AT\+LWGET=/i.test(cmd)) {
      const m = cmd.match(/LWGET=(\d),"([^"]*)"/i);
      if (!m) return err();
      const v = m[2] === '/3/0/0' ? 'SIMCOM_Ltd' : '25.5';   // /3/0/0 = Manufacturer (objeto Device)
      return reply([`+LWGET: ${m[1]},"${m[2]}",S,${v.length},"${v}"`]);
    }
    if (/^AT\+LWSEND=/i.test(cmd)) {
      const m = cmd.match(/LWSEND=(\d),(\d)/i);
      if (!m) return err();
      ok();
      if (m[2] === '6' || m[2] === '7') this._later(400, () => this.output(`\r\n+LWURC: "${m[2] === '6' ? 'notify' : 'send'}",${m[1]},0\r\n`));
      return;
    }
    if (/^AT\+COAPSTART/i.test(cmd) || /^AT\+COAPSTOP/i.test(cmd) || /^AT\+COAPHEAD=/i.test(cmd) || /^AT\+COAPOPTION=/i.test(cmd)) return ok();
    if (/^AT\+COAPOPEN=/i.test(cmd)) { s.coapOpen = true; ok(); return this._later(400, () => this.output('\r\n+COAPOPEN: 0\r\n')); }
    if (/^AT\+COAPCLOSE=/i.test(cmd)) { if (!s.coapOpen) return err(); s.coapOpen = false; return ok(); }
    if (/^AT\+COAPSEND=/i.test(cmd)) {   // echoes the payload back (+COAPRECV, manual format)
      const m = cmd.match(/COAPSEND=(\d),"(\w+)","(\w+)",(\d+),"([^"]*)"/i);
      if (!m || !s.coapOpen) return err();
      ok();
      return this._later(500, () => this.output(`\r\n+COAPRECV: response,from session ${m[1]},2.05,35691,${m[5].length},"${m[5]}"\r\n`));
    }
    // FTP(S)
    if (/^AT\+CFTPSSTART/i.test(cmd) || /^AT\+CFTPSLOGIN=/i.test(cmd) || /^AT\+CFTPSTYPE=/i.test(cmd) || /^AT\+CFTPSLOGOUT/i.test(cmd) || /^AT\+CFTPSSTOP/i.test(cmd)) return ok();
    if (/^AT\+CFTPSPUTFILE=/i.test(cmd)) {   // EFS → FTP server (uploads what was put in EFS with CFTRANRX)
      const name = (cmd.match(/CFTPSPUTFILE="([^"]*)"/i) || [])[1] || 'file';
      const data = this.state.fsdata[this._normPath('C:/' + name)] || this.state.fsdata[this._normPath(name)];
      if (data) this.state.ftpfiles[s.ftpcwd + name] = data;
      return ok();
    }
    if (/^AT\+CFTPSGETFILE=/i.test(cmd)) {   // FTP server → EFS (leaves the file in C:/ to download to the PC with CFTRANTX)
      const name = (cmd.match(/CFTPSGETFILE="([^"]*)"/i) || [])[1] || 'file';
      const data = s.ftpfiles[s.ftpcwd + name] || new TextEncoder().encode('Contenido FTP de ' + name + '\r\n');
      this._storeFile('C:/' + name, this._u8ToBin(data));
      return ok();
    }
    if (/^AT\+CFTPSPWD/i.test(cmd)) return reply([`+CFTPSPWD: "${s.ftpcwd === '/' ? '/' : s.ftpcwd.replace(/\/$/, '')}"`]);
    if (/^AT\+CFTPSCWD=/i.test(cmd)) {
      const p = (cmd.match(/CFTPSCWD="([^"]*)"/i) || [])[1] || '';
      let cur = s.ftpcwd;
      if (p === '..') { const parts = cur.replace(/\/$/, '').split('/'); parts.pop(); cur = parts.join('/') + '/'; }
      else if (p.startsWith('/')) cur = p === '/' ? '/' : p.replace(/\/$/, '') + '/';
      else cur = cur + p.replace(/\/$/, '') + '/';
      if (cur === '') cur = '/';
      if (!s.ftpdirs[cur]) return err();
      s.ftpcwd = cur; return ok();
    }
    if (/^AT\+CFTPSMKD=/i.test(cmd)) {
      const d = ((cmd.match(/CFTPSMKD="([^"]*)"/i) || [])[1] || '').replace(/\/$/, '');
      const node = s.ftpdirs[s.ftpcwd];
      if (!d || d.includes('/') || !node || node.includes(d)) return err();
      node.push(d); s.ftpdirs[s.ftpcwd + d + '/'] = [];
      return ok();
    }
    if (/^AT\+CFTPSRMD=/i.test(cmd)) {   // like a real server: empty folders only
      const d = ((cmd.match(/CFTPSRMD="([^"]*)"/i) || [])[1] || '').replace(/\/$/, '');
      const node = s.ftpdirs[s.ftpcwd], p = s.ftpcwd + d + '/';
      if (!node || !node.includes(d)) return err();
      if ((s.ftpdirs[p] || []).length || Object.keys(s.ftpfiles).some((k) => k.startsWith(p))) return err();
      s.ftpdirs[s.ftpcwd] = node.filter((x) => x !== d);
      delete s.ftpdirs[p];
      return ok();
    }
    if (/^AT\+CFTPSDELE=/i.test(cmd)) {
      const f = (cmd.match(/CFTPSDELE="([^"]*)"/i) || [])[1] || '';
      if (!s.ftpfiles[s.ftpcwd + f]) return err();
      delete s.ftpfiles[s.ftpcwd + f];
      return ok();
    }
    if (/^AT\+CFTPSLIST/i.test(cmd)) {   // unix LIST-format listing of the requested directory (or the current one)
      const arg = (cmd.match(/CFTPSLIST="([^"]*)"/i) || [])[1];
      let dir = s.ftpcwd;
      if (arg) {
        dir = arg === '/' ? '/' : (arg.startsWith('/') ? arg : s.ftpcwd + arg).replace(/\/$/, '') + '/';
        if (!s.ftpdirs[dir]) return err();
      }
      const out = (s.ftpdirs[dir] || []).map((d) => `drwxr-xr-x  2 user group 4096 Jun 01 12:00 ${d}`);
      for (const p in s.ftpfiles) if (p.startsWith(dir) && !p.slice(dir.length).includes('/')) out.push(`-rw-r--r--  1 user group ${s.ftpfiles[p].length} Jun 01 12:00 ${p.slice(dir.length)}`);
      return reply(out);
    }
    if (/^AT\+CFTRANRX=/i.test(cmd)) {   // host → EFS: stores the bytes at the given path
      const m = cmd.match(/CFTRANRX="([^"]*)",(\d+)/i);
      this.expecting = { kind: 'fsrx', len: m ? parseInt(m[2], 10) : 0, path: m ? m[1] : null };
      return this.output('\r\n> ');
    }
    if (/^AT\+CFTRANTX=/i.test(cmd)) {   // EFS → host: cabecera + bytes crudos + OK
      const bytes = this._readFile((cmd.match(/CFTRANTX="([^"]*)"/i) || [])[1] || '');
      if (!bytes) return err();
      this.output(`\r\n+CFTRANTX: DATA,${bytes.length}\r\n`);
      this.outputRaw(bytes);
      this.output('\r\nOK\r\n');
      return;
    }
    if (/^AT\+CSMTPSSRV\?/i.test(cmd)) return reply([`+CSMTPSSRV: "${s.smtp.server}",${s.smtp.port},${s.smtp.type}`]);
    if (/^AT\+CSMTPSSRV=/i.test(cmd)) { const m = cmd.match(/CSMTPSSRV="([^"]*)"(?:,(\d+))?(?:,(\d+))?/i); if (m) { s.smtp.server = m[1]; if (m[2]) s.smtp.port = Number(m[2]); if (m[3]) s.smtp.type = Number(m[3]); } return ok(); }
    if (/^AT\+CSMTPSAUTH\?/i.test(cmd)) return reply([`+CSMTPSAUTH: ${s.smtp.authFlag},"${s.smtp.user}","${s.smtp.pwd}"`]);
    if (/^AT\+CSMTPSAUTH=/i.test(cmd)) { const m = cmd.match(/CSMTPSAUTH=(\d)(?:,"([^"]*)","([^"]*)")?/i); if (m) { s.smtp.authFlag = Number(m[1]); s.smtp.user = m[2] || ''; s.smtp.pwd = m[3] || ''; } return ok(); }
    if (/^AT\+CSMTPSFROM=/i.test(cmd)) return ok();
    if (/^AT\+CSMTPSRCPT=/i.test(cmd)) return ok();
    if (/^AT\+CSMTPSSUB=/i.test(cmd)) { const n = parseInt((cmd.split('=')[1] || '').split(',')[0], 10) || 0; this.expecting = { kind: 'len', len: n }; return this.output('\r\n> '); }
    if (/^AT\+CSMTPSBODY=/i.test(cmd)) { const n = parseInt(cmd.split('=')[1], 10) || 0; this.expecting = { kind: 'len', len: n }; return this.output('\r\n> '); }
    if (/^AT\+CSMTPSCLEAN/i.test(cmd)) return ok();
    if (/^AT\+CSMTPSSTOP/i.test(cmd)) return ok();
    if (/^AT\+CSMTPSSEND/i.test(cmd)) { ok(); return this._later(1100, () => this.output('\r\n+CSMTPSSEND: 0\r\n')); }
    // ---- Agenda (phonebook) ----
    if (/^AT\+CPBS=\?/i.test(cmd)) return reply(['+CPBS: ("SM","ME","DC","RC","MC","FD")']);
    if (/^AT\+CPBS\?/i.test(cmd)) return reply([`+CPBS: "${s.pbStorage}",${s.phonebook.length},250`]);
    if (/^AT\+CPBS=/i.test(cmd)) { const m = cmd.match(/CPBS="?(\w+)"?/i); if (m) s.pbStorage = m[1].toUpperCase(); return ok(); }
    if (/^AT\+CPBR=\?/i.test(cmd)) return reply(['+CPBR: (1-250),40,14']);
    if (/^AT\+CPBR=/i.test(cmd)) { const m = cmd.match(/CPBR=(\d+)(?:,(\d+))?/i); const a = m ? Number(m[1]) : 1; const b = (m && m[2]) ? Number(m[2]) : a; return reply(s.phonebook.filter((e) => e.index >= a && e.index <= b).map((e) => `+CPBR: ${e.index},"${e.number}",${e.type},"${e.text}"`)); }
    if (/^AT\+CPBF=/i.test(cmd)) { const m = cmd.match(/CPBF="?([^"]*)"?/i); const q = (m ? m[1] : '').toLowerCase(); return reply(s.phonebook.filter((e) => e.text.toLowerCase().includes(q)).map((e) => `+CPBF: ${e.index},"${e.number}",${e.type},"${e.text}"`)); }
    if (/^AT\+CPBW=/i.test(cmd)) { const m = cmd.match(/CPBW=(\d*)(?:,"([^"]*)"(?:,(\d+))?(?:,"([^"]*)")?)?/i); if (m) { const idx = m[1] ? Number(m[1]) : (s.phonebook.reduce((mx, e) => Math.max(mx, e.index), 0) + 1); if (!m[2]) { s.phonebook = s.phonebook.filter((e) => e.index !== idx); } else { const ent = { index: idx, number: m[2], type: m[3] ? Number(m[3]) : (m[2].startsWith('+') ? 145 : 129), text: m[4] || '' }; const ex = s.phonebook.find((e) => e.index === idx); if (ex) Object.assign(ex, ent); else { s.phonebook.push(ent); s.phonebook.sort((a, b) => a.index - b.index); } } } return ok(); }
    if (/^AT\+CNUM/i.test(cmd)) return reply(['+CNUM: "Me","+5491155551234",145']);
    // ---- Voice calls ----
    if (/^ATD[\d+*#]+;/i.test(cmd)) { const n = cmd.match(/ATD([\d+*#]+);/i)[1]; s.call = { dir: 0, stat: 2, number: n }; ok(); return this._later(1500, () => { if (s.call) s.call.stat = 0; }); }
    if (/^ATA/i.test(cmd)) { if (s.call) s.call.stat = 0; return ok(); }
    if (/^(ATH|AT\+CHUP)/i.test(cmd)) { const had = !!s.call; s.call = null; if (had) this._later(20, () => this.output('\r\nVOICE CALL: END\r\n')); return ok(); }
    if (/^AT\+CLCC/i.test(cmd)) { if (s.call) { const c = s.call; const ty = c.number.startsWith('+') ? 145 : 129; return reply([`+CLCC: 1,${c.dir},${c.stat},0,0,"${c.number}",${ty}`]); } return ok(); }
    if (/^AT\+CLIP=\?/i.test(cmd)) return reply(['+CLIP: (0,1)']);
    if (/^AT\+CLIP\?/i.test(cmd)) return reply([`+CLIP: ${s.clip},1`]);
    if (/^AT\+CLIP=/i.test(cmd)) { s.clip = Number(cmd.split('=')[1]); return ok(); }
    if (/^AT\+VTS=/i.test(cmd)) return ok();
    if (/^AT\+CCLK\?/i.test(cmd)) return reply([`+CCLK: "${s.cclk || this._cclk()}"`]);
    if (/^AT\+CCLK=/i.test(cmd)) { const m = cmd.match(/"([^"]*)"/); if (m) s.cclk = m[1]; return ok(); }
    if (/^AT\+CTZU\?/i.test(cmd)) return reply([`+CTZU: ${s.ctzu ?? 0}`]);
    if (/^AT\+CTZU=([01])/i.test(cmd)) { s.ctzu = Number(cmd.match(/=([01])/)[1]); return ok(); }
    if (/^AT\+CNTP$/i.test(cmd)) { ok(); return this._later(700, () => this.output('\r\n+CNTP: 1\r\n')); }
    if (/^AT\+CPING=/i.test(cmd)) {   // honors the requested count and size; ends with the type-3 summary
      const h = (cmd.match(/"([^"]*)"/) || [])[1] || '8.8.8.8';
      const args = cmd.split(','), n = Math.max(1, Number(args[2]) || 4), sz = Number(args[3]) || 64;
      ok();
      for (let i = 0; i < n; i++) this._later(250 * (i + 1), () => this.output(`\r\n+CPING: 1,"${h}",${sz},${20 + i},118\r\n`));
      return this._later(250 * n + 500, () => this.output(`\r\n+CPING: 3,${n},${n},0,20,${19 + n},${20 + Math.floor(n / 2)}\r\n`));
    }
    if (/^AT\+SNPING4=/i.test(cmd)) {   // SIM7080/7070: inline responses before the OK
      const h = (cmd.match(/"([^"]*)"/) || [])[1] || '8.8.8.8';
      const n = Math.max(1, Number(cmd.split(',')[1]) || 4), out = [];
      for (let i = 1; i <= n; i++) out.push(`+SNPING4: ${i},${h},${20 + i}`);
      return reply(out);
    }
    if (/^AT\+CDNSGIP=/i.test(cmd)) { const h = (cmd.match(/"([^"]*)"/) || [])[1] || 'host'; ok(); return this._later(500, () => this.output(`\r\n+CDNSGIP: 1,"${h}","93.184.216.34"\r\n`)); }
    if (/^AT\+CBC/i.test(cmd)) return reply(['+CBC: 4.051V']);
    if (/^AT\+CPMUTEMP/i.test(cmd)) return reply(['+CPMUTEMP: 38']);
    if (/^AT\+CFUN=1,1/i.test(cmd)) { ok(); return this._later(800, () => this.output('\r\nRDY\r\n\r\n+CPIN: READY\r\n')); }
    if (/^AT\+CFUN\?/i.test(cmd)) return reply([`+CFUN: ${s.cfun ?? 1}`]);
    if (/^AT\+CFUN=(\d+)$/i.test(cmd)) { s.cfun = Number(cmd.match(/=(\d+)/)[1]); return ok(); }
    if (/^AT\+CADC\?/i.test(cmd)) return reply([`+CADC: ${538 + Math.floor(Math.random() * 16)}`]);
    if (/^AT\+CADC=\?/i.test(cmd)) return reply(['+CADC: (0-2)']);
    if (/^AT\+CGGETV=\?/i.test(cmd)) return reply(['+CGGETV: (1,2,3,6,12,14,16,18,22,41,43,63,77)']);
    if (/^AT\+CGGETV=(\d+)/i.test(cmd)) { const g = cmd.match(/=(\d+)/)[1]; return reply([`+CGGETV: ${g},${s.gpio[g] || 0}`]); }
    if (/^AT\+CGSETV=(\d+),([01])/i.test(cmd)) { const m = cmd.match(/=(\d+),([01])/); s.gpio[m[1]] = Number(m[2]); return ok(); }
    if (/^AT\+CGDRT=/i.test(cmd)) return ok();
    if (/^AT\+CVALARM\?/i.test(cmd)) return reply([`+CVALARM: ${s.valarm || '1,3450,4200'}`]);
    if (/^AT\+CVALARM=/i.test(cmd)) { s.valarm = cmd.split('=')[1]; return ok(); }
    if (/^AT\+CMQTT(START|STOP)/i.test(cmd)) return ok();
    if (/^AT\+CIPOPEN\?/i.test(cmd)) return ok();
    if (/^AT\+FSCD\?/i.test(cmd)) return reply([`+FSCD: ${s.fscd}`]);
    if (/^AT\+FSCD=/i.test(cmd)) {
      let p = cmd.split('=')[1].trim().replace(/"/g, ''), cur = s.fscd;
      if (/^[CD]:\/?$/i.test(p)) cur = p.slice(0, 2).toUpperCase() + '/';
      else if (p === '..') { const parts = cur.replace(/\/$/, '').split('/'); if (parts.length > 1) parts.pop(); cur = parts.join('/') + '/'; }
      else { const np = cur + p.replace(/\/$/, '') + '/'; if (s.fs[np]) cur = np; else return err(); }
      if (!s.fs[cur]) return err();
      s.fscd = cur; return reply([`+FSCD: ${cur}`]);
    }
    if (/^AT\+FSLS\?/i.test(cmd)) { const n = s.fs[s.fscd] || { dirs: [], files: [] }; return reply([`+FSLS: SUBDIRECTORIES:${n.dirs.length},FILES:${n.files.length}`]); }
    if (/^AT\+FSLS/i.test(cmd)) {
      const type = (cmd.match(/=(\d)/) || [])[1], node = s.fs[s.fscd] || { dirs: [], files: [] }, out = [];
      if (type !== '2') { out.push('+FSLS: SUBDIRECTORIES:'); node.dirs.forEach((d) => out.push(d)); out.push(''); }
      if (type !== '1') { out.push('+FSLS: FILES:'); node.files.forEach((f) => out.push(f)); out.push(''); }
      return reply(out);
    }
    if (/^AT\+FSDEL=/i.test(cmd)) { const f = cmd.split('=')[1].trim().replace(/"/g, ''); const node = s.fs[s.fscd]; if (node) node.files = node.files.filter((x) => x !== f); return ok(); }
    if (/^AT\+FSMKDIR=/i.test(cmd)) {
      const d = cmd.split('=')[1].trim().replace(/"/g, '').replace(/\/$/, '');
      const node = s.fs[s.fscd];
      if (!d || d.includes('/') || !node || node.dirs.includes(d)) return err();
      node.dirs.push(d); s.fs[s.fscd + d + '/'] = { dirs: [], files: [] };
      return ok();
    }
    if (/^AT\+FSRMDIR=/i.test(cmd)) {
      const d = cmd.split('=')[1].trim().replace(/"/g, '').replace(/\/$/, '');
      const node = s.fs[s.fscd], p = s.fscd + d + '/', sub = s.fs[p];
      if (!node || !node.dirs.includes(d)) return err();
      if (sub && (sub.dirs.length || sub.files.length)) return err();   // like the firmware: empty folders only
      node.dirs = node.dirs.filter((x) => x !== d);
      delete s.fs[p];
      return ok();
    }
    if (/^AT\+FSOPEN=/i.test(cmd)) {   // AT+FSOPEN=<path>[,<mode>] → +FSOPEN: <fd> (creates the file if it doesn't exist)
      const p0 = cmd.split('=')[1].split(',')[0].trim().replace(/"/g, '');
      const p = p0.includes(':') ? this._normPath(p0) : s.fscd + p0;
      s.fsfd = s.fsfd || {}; s.fsnext = s.fsnext || 1;
      if (!this._readFile(p)) this._storeFile(p, '');
      const fd = s.fsnext++;
      s.fsfd[fd] = { path: p, pos: 0 };
      return reply([`+FSOPEN: ${fd}`]);
    }
    if (/^AT\+FSREAD=/i.test(cmd)) {   // AT+FSREAD=<fd>,<len> → +FSREAD: <n> + data (advances the position)
      const [fds, lens] = cmd.split('=')[1].split(',');
      const h = (s.fsfd || {})[Number(fds)];
      if (!h) return err();
      const data = this._readFile(h.path) || new Uint8Array(0);
      const n = Math.max(0, Math.min(Number(lens) || 0, data.length - h.pos));
      const chunk = data.slice(h.pos, h.pos + n); h.pos += n;
      return reply([`+FSREAD: ${chunk.length}`, this._u8ToBin(chunk)]);
    }
    if (/^AT\+FSWRITE=/i.test(cmd)) {   // AT+FSWRITE=<fd>,<modo 0 sobrescribe/1 agrega>,<len>,<timeout> → "> " + datos
      const [fds, mode, lens] = cmd.split('=')[1].split(',');
      const h = (s.fsfd || {})[Number(fds)], n = Number(lens) || 0;
      if (!h || !n) return err();
      this.expecting = { kind: 'fswrite', len: n, path: h.path, append: mode === '1' };
      return this.output('\r\n> ');
    }
    if (/^AT\+FSCLOSE=/i.test(cmd)) {
      const fd = Number(cmd.split('=')[1]);
      if (!(s.fsfd || {})[fd]) return err();
      delete s.fsfd[fd];
      return ok();
    }
    if (/^AT\+FSMEM/i.test(cmd)) {   // real A76XX/SIM7600 format: C:(total, used) — used grows with what's written
      let used = 2201600;
      for (const k in s.fsdata) used += s.fsdata[k].length;
      return reply([`+FSMEM: C:(33554432, ${Math.min(used, 33554432)})`]);
    }

    /* ===== SIM7080/7070: CFS (index-based file system) ===== */
    if (/^AT\+CFSINIT/i.test(cmd)) return ok();
    if (/^AT\+CFSTERM/i.test(cmd)) return ok();
    if (/^AT\+CFSGFIS=/i.test(cmd)) return reply(['+CFSGFIS: 256']);
    if (/^AT\+CFSRFILE=/i.test(cmd)) { const body = '{"cfg":true,"v":3}'; return reply([`+CFSRFILE: ${body.length}`, body]); }
    if (/^AT\+CFSDFILE=/i.test(cmd)) return ok();
    if (/^AT\+CFSWFILE=/i.test(cmd)) { const n = Number((cmd.split(',')[3] || '0')); this.expecting = { kind: 'len', len: n }; return this.output('\r\nDOWNLOAD\r\n'); }

    /* ===== A76XX / SIM7600: NETOPEN/CIP* · CCH* (SSL) · HTTP* · CMQTT* (loose + prompts) ===== */
    if (/^AT\+NETCLOSE/i.test(cmd)) { s.netOpen = false; ok(); return this._later(300, () => this.output('\r\n+NETCLOSE: 0\r\n')); }
    if (/^AT\+CIPOPEN=\d+,"(TCP|UDP)"/i.test(cmd)) { const m = cmd.match(/CIPOPEN=(\d+)/i); s.caOpen = true; ok(); return this._later(500, () => this.output(`\r\n+CIPOPEN: ${m[1]},0\r\n`)); }
    if (/^AT\+CIPSEND=\d+,\d+/i.test(cmd)) { const n = Number(cmd.split(',')[1]); s.caSent += n; this.expecting = { kind: 'len', len: n }; return this.output('\r\n> '); }
    if (/^AT\+CIPCLOSE=/i.test(cmd)) { s.caOpen = false; const m = cmd.match(/=(\d+)/); ok(); return this._later(200, () => this.output(`\r\n+CIPCLOSE: ${m ? m[1] : 0},0\r\n`)); }
    if (/^AT\+CIPRXGET=2/i.test(cmd)) { const p = 'HELLO'; return reply([`+CIPRXGET: 2,0,${p.length},0`, p]); }
    if (/^AT\+CIPRXGET=/i.test(cmd)) return ok();
    if (/^AT\+CCHSTART/i.test(cmd)) return ok();
    if (/^AT\+CCHSTOP/i.test(cmd)) return ok();
    if (/^AT\+CCHOPEN=/i.test(cmd)) { const m = cmd.match(/CCHOPEN=(\d+)/i); s.caOpen = true; ok(); return this._later(600, () => this.output(`\r\n+CCHOPEN: ${m[1]},0\r\n`)); }
    if (/^AT\+CCHSEND=\d+,\d+/i.test(cmd)) { const n = Number(cmd.split(',')[1]); this.expecting = { kind: 'len', len: n }; return this.output('\r\n> '); }
    if (/^AT\+CCHRECV=/i.test(cmd)) { const p = 'HELLO'; return reply([`+CCHRECV: 0,${p.length}`, p]); }
    if (/^AT\+CCHCLOSE=/i.test(cmd)) { s.caOpen = false; return ok(); }
    if (/^AT\+HTTPINIT/i.test(cmd)) return ok();
    if (/^AT\+HTTPTERM/i.test(cmd)) return ok();
    if (/^AT\+HTTPHEAD/i.test(cmd)) return reply(['+HTTPHEAD: 62', 'HTTP/1.1 200 OK', 'Content-Type: application/json', 'Content-Length: 19']);
    if (/^AT\+HTTPDATA=/i.test(cmd)) { const n = Number((cmd.split('=')[1] || '').split(',')[0]); this.expecting = { kind: 'len', len: n }; return this.output('\r\nDOWNLOAD\r\n'); }
    if (/^AT\+HTTPACTION=/i.test(cmd)) { const mth = (cmd.split('=')[1] || '0').trim(); ok(); return this._later(1200, () => this.output(`\r\n+HTTPACTION: ${mth},200,256\r\n`)); }
    if (/^AT\+HTTPREAD=/i.test(cmd)) { const body = '{"ok":true,"id":42}'; return reply([`+HTTPREAD: ${body.length}`, body, '+HTTPREAD: 0']); }
    if (/^AT\+HTTPPARA=/i.test(cmd)) return ok();
    if (/^AT\+(CMQTTTOPIC|CMQTTPAYLOAD|CMQTTSUBTOPIC|CMQTTUNSUBTOPIC|CMQTTWILLTOPIC|CMQTTWILLMSG)=\d+,\d+/i.test(cmd)) { const n = Number(cmd.split(',')[1]); this.expecting = { kind: 'len', len: n }; return this.output('\r\n> '); }
    if (/^AT\+CMQTTCONNECT=/i.test(cmd)) { s.smConn = true; ok(); return this._later(800, () => this.output('\r\n+CMQTTCONNECT: 0,0\r\n')); }
    if (/^AT\+CMQTTSUB=/i.test(cmd)) { ok(); return this._later(700, () => this.output('\r\n+CMQTTSUB: 0,0\r\n')); }
    if (/^AT\+CMQTTPUB=/i.test(cmd)) { ok(); return this._later(700, () => this.output('\r\n+CMQTTPUB: 0,0\r\n')); }
    if (/^AT\+SHBOD=/i.test(cmd)) { const n = Number((cmd.split('=')[1] || '').split(',')[0]); this.expecting = { kind: 'len', len: n }; return this.output('\r\n> '); }

    /* ===== SIM7080 / SIM7070: CNACT (app PDP) · CA* (sockets) · SH* (HTTP) · SM* (MQTT) ===== */
    if (/^AT\+CNCFG=/i.test(cmd)) { const m = cmd.match(/"([^"]*)"\s*$/); if (m) s.apn = m[1]; return ok(); }
    if (/^AT\+CNACT\?/i.test(cmd)) return reply([`+CNACT: 0,${s.netOpen ? 1 : 0},"${s.netOpen ? '10.81.34.120' : '0.0.0.0'}"`]);
    if (/^AT\+CNACT=\d+,1/i.test(cmd)) { s.netOpen = true; ok(); return this._later(700, () => this.output('\r\n+APP PDP: 0,ACTIVE\r\n')); }
    if (/^AT\+CNACT=\d+,0/i.test(cmd)) { s.netOpen = false; ok(); return this._later(300, () => this.output('\r\n+APP PDP: 0,DEACTIVE\r\n')); }
    if (/^AT\+CASTATE\?/i.test(cmd)) return reply([`+CASTATE: 0,${s.caOpen ? 1 : 0}`]);
    if (/^AT\+CAOPEN=/i.test(cmd)) { if (!s.netOpen) return reply(['+CAOPEN: 0,4', 'OK']); s.caOpen = true; ok(); return this._later(500, () => this.output('\r\n+CAOPEN: 0,0\r\n')); }
    if (/^AT\+CACLOSE=/i.test(cmd)) { s.caOpen = false; return ok(); }
    if (/^AT\+CAACK=/i.test(cmd)) return reply([`+CAACK: ${s.caSent},${s.caSent},0`]);
    if (/^AT\+CASEND=/i.test(cmd)) { const n = Number((cmd.split('=')[1] || '').split(',')[1] || 0); s.caSent += n; this.expecting = { kind: 'len', len: n }; return this.output('\r\n> '); }
    if (/^AT\+CARECV=/i.test(cmd)) { const p = 'HTTP/1.1 200 OK'; return reply([`+CARECV: ${p.length},${p}`]); }
    if (/^AT\+CASSLCFG=/i.test(cmd)) return ok();
    if (/^AT\+SHCONF=/i.test(cmd)) return ok();
    if (/^AT\+SHSTATE\?/i.test(cmd)) return reply([`+SHSTATE: ${s.shConn ? 1 : 0}`]);
    if (/^AT\+SHCONN/i.test(cmd)) { s.shConn = true; return this._later(600, () => this._send(['OK'])); }
    if (/^AT\+SHDISC/i.test(cmd)) { s.shConn = false; return ok(); }
    if (/^AT\+SHREQ=/i.test(cmd)) { const ty = (cmd.match(/,(\d+)\s*$/) || [])[1] || '1'; const meth = ({ '1': 'GET', '2': 'PUT', '3': 'POST', '4': 'PATCH', '5': 'HEAD', '6': 'DELETE' })[ty] || 'GET'; ok(); return this._later(800, () => this.output(`\r\n+SHREQ: "${meth}",200,256\r\n`)); }
    if (/^AT\+SHREAD=/i.test(cmd)) { const n = Number((cmd.split('=')[1] || '').split(',')[1] || 64); const body = '{"ok":true,"id":42}'.slice(0, n); return reply([`+SHREAD: ${body.length}`, body]); }
    if (/^AT\+SHBOD=/i.test(cmd) || /^AT\+SHHEAD=/i.test(cmd) || /^AT\+SHPARA=/i.test(cmd) || /^AT\+SHCHEAD/i.test(cmd) || /^AT\+SHCPARA/i.test(cmd) || /^AT\+SHSSL=/i.test(cmd)) return ok();
    if (/^AT\+SMCONF=/i.test(cmd)) return ok();
    if (/^AT\+SMSTATE\?/i.test(cmd)) return reply([`+SMSTATE: ${s.smConn ? 1 : 0}`]);
    if (/^AT\+SMCONN/i.test(cmd)) { s.smConn = true; return this._later(700, () => this._send(['OK'])); }
    if (/^AT\+SMDISC/i.test(cmd)) { s.smConn = false; return ok(); }
    if (/^AT\+SMPUB=/i.test(cmd)) { const n = Number((cmd.split('=')[1] || '').split(',')[1] || 0); this.expecting = { kind: 'len', len: n }; return this.output('\r\n> '); }
    if (/^AT\+SMSUB=/i.test(cmd)) { const m = cmd.match(/"([^"]*)"/); const topic = m ? m[1] : 'topic'; ok(); return this._later(900, () => this.output(`\r\n+SMSUB: "${topic}","hello from broker"\r\n`)); }
    if (/^AT\+SMUNSUB=/i.test(cmd)) return ok();

    /* ===== SIM7022 (NB-IoT, SIM7020 family): CSOC · CHTTP* · CMQ* ===== */
    if (/^AT\+CGACT\?/i.test(cmd)) return reply([`+CGACT: 1,${s.netOpen ? 1 : 0}`]);
    if (/^AT\+CGACT=1/i.test(cmd)) { s.netOpen = true; return ok(); }
    if (/^AT\+CGACT=0/i.test(cmd)) { s.netOpen = false; return ok(); }
    if (/^AT\+CGCONTRDP/i.test(cmd)) return reply(['+CGCONTRDP: 1,5,"internet.nb","10.81.34.120 255.255.255.0"']);
    if (/^AT\+CSOC=/i.test(cmd)) return reply(['+CSOC: 0']);
    if (/^AT\+CSOCON=/i.test(cmd)) { s.csoOpen = true; return ok(); }
    if (/^AT\+CSOSTATUS=/i.test(cmd)) return reply([`+CSOSTATUS: 0,${s.csoOpen ? 1 : 0}`]);
    if (/^AT\+CSOSEND=/i.test(cmd)) { ok(); return this._later(600, () => this.output('\r\n+CSONMI: 0,12,48656C6C6F2066726F6D\r\n')); }
    if (/^AT\+CSORCV=/i.test(cmd)) return reply(['+CSORCV: 0,5,48656C6C6F']);
    if (/^AT\+CSOCL=/i.test(cmd)) { s.csoOpen = false; return ok(); }
    if (/^AT\+CHTTPCREATE/i.test(cmd)) return reply(['+CHTTPCREATE: 0']);
    if (/^AT\+CHTTPCON=/i.test(cmd)) { s.chttpOn = true; return ok(); }
    if (/^AT\+CHTTPSEND=/i.test(cmd)) { ok(); return this._later(800, () => this.output('\r\n+CHTTPNMIH: 0,200,17\r\n+CHTTPNMIC: 0,0,17,17,7B226F6B223A747275657D\r\n')); }
    if (/^AT\+CHTTPDISCON=/i.test(cmd)) { s.chttpOn = false; return ok(); }
    if (/^AT\+CHTTPDESTROY=/i.test(cmd)) return ok();
    if (/^AT\+CMQNEW=/i.test(cmd)) return reply(['+CMQNEW: 0']);
    if (/^AT\+CMQCON=/i.test(cmd)) { s.cmqOn = true; return ok(); }
    if (/^AT\+CMQPUB=/i.test(cmd)) return ok();
    if (/^AT\+CMQSUB=/i.test(cmd)) { const m = cmd.match(/"([^"]*)"/); const topic = m ? m[1] : 'topic'; ok(); return this._later(900, () => this.output(`\r\n+CMQPUB: 0,"${topic}",1,0,0,9,48656C6C6F\r\n`)); }
    if (/^AT\+CMQUNSUB=/i.test(cmd)) return ok();
    if (/^AT\+CMQDISCON=/i.test(cmd)) { s.cmqOn = false; return ok(); }

    if (/^AT\+\w+=/i.test(cmd)) return ok();
    return err();
  }
  _cclk() { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${p(d.getFullYear() % 100)}/${p(d.getMonth() + 1)}/${p(d.getDate())},${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}-12`; }
  _d() { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}${p(d.getMonth() + 1)}${p(d.getFullYear() % 100)}`; }
  _u() { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.0`; }
  _ts7080() { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.000`; }
  _bleScan() {
    this._bleDevs = { 0: '1f:50:24:38:96:20', 1: '7e:c3:ed:71:e5:55', 2: '2b:3c:42:10:23:58' };
    const devs = [
      [0, '1f:50:24:38:96:20', 197, '02011A020A080BFF4C0010063A'],
      [1, '7e:c3:ed:71:e5:55', 180, '0201060303AAFE0CFF4C001005'],
      [2, '2b:3c:42:10:23:58', 165, '02010612094D79204265616B6F6E'],
    ];
    let i = 0;
    const tick = () => {
      if (!this.state.ble.scanning) return;
      const d = devs[i % devs.length];
      const rssi = Math.max(150, Math.min(210, d[2] + Math.floor((Math.random() - 0.5) * 8)));
      this.output(`\r\n+BLESCANRST: 0,${d[0]},"${d[1]}",${rssi},"${d[3]}"\r\n`);
      i++; this._later(900, tick);
    };
    this._later(500, tick);
  }
}

