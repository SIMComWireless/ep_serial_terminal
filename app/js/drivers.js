// @ts-check
/* drivers.js — contracts (JSDoc), GNSS parsers and per-family drivers (GNSS/TCP/HTTP/MQTT/DATA/FS)
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* ============================================================================
 * CONTRACTS (JSDoc) for profiles and drivers.
 * They document the shape each driver must fulfill so a new module
 * "plugs" into the wizards. They are comments only: they provide autocompletion and checking
 * in the editor (VS Code) without a build or TypeScript. This file and profiles.js are
 * validan estrictos (`// @ts-check` + jsconfig.json); chequeo manual:
 *   npx -y -p typescript tsc -p jsconfig.json
 * ========================================================================== */

/**
 * Wizard form values: field-id → value (string).
 * E.g. v['wz-host'], v['wz-port'], v['wz-mode'] ('TCP'|'UDP'), v['wz-ssl'] (bool-ish).
 * @typedef {Object<string, string>} FormValues
 */
/**
 * AT command macro returned by a driver. Commands separated by '\n';
 * `@NNN` = wait NNN ms; with the module's '> ' prompt active, the line goes raw (no EOL).
 * @typedef {string} Macro
 */
/**
 * @typedef {{ ok: boolean, lines: string[] }} SendResult
 * @typedef {(cmd: string) => Promise<SendResult>} SendFn
 */
/**
 * Parsed GNSS position/state (shape shared by all modules).
 * @typedef {Object} GnssFix
 * @property {string} mode              Fix type ('2'|'3'…)
 * @property {number} sats              Satellites in use
 * @property {number} [svSum]           Sum of satellites in view per constellation
 * @property {number|null} lat
 * @property {number|null} lon
 * @property {string} [date]            Date (ddmmyy or YYYYMMDD depending on module)
 * @property {string} utc               Hora UTC (hhmmss)
 * @property {number|null} [alt]
 * @property {number|null} [speed]
 * @property {number|null} [course]
 * @property {number|null} [pdop]
 * @property {number|null} [hdop]
 * @property {number|null} [vdop]
 */
/**
 * GNSS driver of a family. If `supported` is false, the rest is optional.
 * @typedef {Object} GnssDriver
 * @property {boolean} supported
 * @property {boolean} [satStream]                        Is there an NMEA sky-view?
 * @property {string} [queryPower]
 * @property {(line: string) => (number|null)} [parsePower]
 * @property {(on: boolean) => Macro} [power]
 * @property {string} [info]
 * @property {RegExp} [infoRe]
 * @property {(line: string) => (GnssFix|null)} [parseInfo]
 * @property {string} [cold]
 * @property {string} [warm]
 * @property {string} [hot]
 * @property {string|null} [satStart]
 * @property {string|null} [satStop]
 */
/**
 * @typedef {Object} TcpDriver
 * @property {(v: FormValues) => Macro} open
 * @property {(v: FormValues) => Macro} send
 * @property {(v: FormValues) => Macro} read
 * @property {(v: FormValues) => Macro} close
 */
/**
 * @typedef {Object} HttpDriver
 * @property {(v: FormValues) => Macro} get
 * @property {(v: FormValues) => Macro} post
 */
/**
 * @typedef {Object} MqttDriver
 * @property {(v: FormValues) => Macro} connect
 * @property {(v: FormValues) => Macro} subscribe
 * @property {(v: FormValues) => Macro} publish
 * @property {() => Macro} disconnect
 */
/**
 * Data/PDP driver (status panel): commands + refresh that queries the module.
 * @typedef {Object} DataDriver
 * @property {string} openCmd
 * @property {string} closeCmd
 * @property {(send: SendFn) => Promise<{ open: (boolean|null), ip: (string|null) }>} refresh
 */
/**
 * File System driver. 'fscd' = tree navigation (FSCD/FSLS).
 * 'cfs' = by directory index + name (SIM7080/7070).
 * @typedef {Object} FsDriver
 * @property {'fscd'|'cfs'} model
 * @property {Array<[string, string]>} [dirs]                 (cfs) [index, path]
 * @property {(dir: string, name: string) => Macro} [size]    (cfs)
 * @property {(dir: string, name: string) => Macro} [read]    (cfs)
 * @property {(dir: string, name: string) => Macro} [del]     (cfs)
 */
/**
 * Quick command item: [label, command, editable?]. The __VARS__ are edited if the flag is 1.
 * @typedef {[string, string, (0|1)?]} QuickItem
 * Quick-command overrides per sidebar group: key = wizard id (tcpudp, http, wifi, ble, ping…).
 * @typedef {Object<string, QuickItem[]>} QuickTable
 */
/**
 * @typedef {Object} Identity
 * @property {string} manufacturer
 * @property {string} model
 * @property {string} revision
 * @property {string} imei
 * @property {string} band
 * @property {string[]} ati
 */
/**
 * Driver bundle of a family (what several profiles share).
 * @typedef {Object} ProfileStack
 * @property {GnssDriver} [gnss]
 * @property {TcpDriver} [tcp]
 * @property {HttpDriver} [http]
 * @property {MqttDriver} [mqtt]
 * @property {DataDriver} [data]
 * @property {FsDriver} [fs]
 * @property {QuickTable} [quick]
 */
/**
 * Module profile. Drivers are OPTIONAL: when missing, the wizard uses the
 * default A76XX driver (see data.js / pdrv()).
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} name
 * @property {string} family
 * @property {string} [chip]
 * @property {boolean} [raw]           None = raw serial, no AT list
 * @property {boolean} [smsPdu]        SMS in PDU mode (CMGF=0) — module without text mode (e.g. SIM7022)
 * @property {string[]} caps           Capabilities ('gnss','tcpip','mqtt','voice',…)
 * @property {string} [bands]
 * @property {Identity} identity
 * @property {GnssDriver} [gnss]
 * @property {TcpDriver} [tcp]
 * @property {HttpDriver} [http]
 * @property {MqttDriver} [mqtt]
 * @property {DataDriver} [data]
 * @property {FsDriver} [fs]
 * @property {QuickTable} [quick]
 */

/* ---- shared GNSS parsers (IIFE: private helpers, only the parsers are exposed) ---- */
const GnssParse = (() => {
// Converts NMEA ddmm.mmmm + hemisphere to decimal degrees (signed).
function nmeaToDec(val, hemi) {
  let n = parseFloat(val); if (isNaN(n)) return null;
  const isLat = hemi === 'N' || hemi === 'S';
  if ((isLat && Math.abs(n) > 90) || (!isLat && Math.abs(n) > 180)) {
    const d = Math.floor(Math.abs(n) / 100); n = d + (Math.abs(n) - d * 100) / 60;
  } else n = Math.abs(n);
  if (hemi === 'S' || hemi === 'W') n = -n;
  return n;
}
const _g = (f, i) => { const n = parseFloat(f[i]); return isNaN(n) ? null : n; };

// A76XX: +CGNSSINFO: <mode>,<GPS>,<GLO>,<BDS>,<lat>,<N/S>,<lon>,<E/W>,<date>,<utc>,<alt>,<spd>,<course>,<PDOP>,<HDOP>,<VDOP>
// (robust to 16/18 fields: locates lat/lon via the N/S and E/W indicators)
function parseCGNSSINFO(line) {
  const m = line.match(/\+CGNSSINFO:\s*(.*)$/i); if (!m) return null;
  const f = m[1].split(',');
  if (f.every((x) => x.trim() === '')) return null;
  let ns = -1, ew = -1;
  for (let i = 0; i < f.length; i++) { const v = f[i].trim().toUpperCase(); if (v === 'N' || v === 'S') ns = i; else if (v === 'E' || v === 'W') ew = i; }
  if (ns < 1 || ew < 1) return null;
  const lat = nmeaToDec(f[ns - 1], f[ns].trim().toUpperCase());
  const lon = nmeaToDec(f[ew - 1], f[ew].trim().toUpperCase());
  let svSum = 0; for (let i = 1; i < ns - 1; i++) { const n = parseInt(f[i], 10); if (!isNaN(n)) svSum += n; }
  const after = ew + 1;
  const num = (i) => _g(f, after + i);
  const nosv = parseInt(f[f.length - 1], 10);
  return {
    mode: f[0].trim(),
    sats: (!isNaN(nosv) && f.length > after + 8) ? nosv : svSum,
    svSum, lat, lon,
    date: (f[after] || '').trim(), utc: (f[after + 1] || '').trim(),
    alt: num(2), speed: num(3), course: num(4), pdop: num(5), hdop: num(6), vdop: num(7),
  };
}

// SIM7080/SIM7070: +CGNSINF: <run>,<fix>,<utc>,<lat>,<lon>,<alt>,<spd>,<course>,<fixmode>,,<HDOP>,<PDOP>,<VDOP>,,<GPSview>,<used>,<GLOview>,,<C/N0>,<HPA>,<VPA>
// lat/lon already come as signed decimal degrees.
function parseCGNSINF(line) {
  const m = line.match(/\+CGNSINF:\s*(.*)$/i); if (!m) return null;
  const f = m[1].split(',');
  if (f[1] !== '1') return null;             // campo 1 = fix status (0/1)
  const lat = _g(f, 3), lon = _g(f, 4);
  if (lat == null || lon == null) return null;
  const utcRaw = (f[2] || '').trim();        // YYYYMMDDhhmmss.sss
  return {
    mode: '3', sats: parseInt(f[15], 10) || 0, svSum: parseInt(f[14], 10) || 0,
    lat, lon, alt: _g(f, 5), speed: _g(f, 6), course: _g(f, 7),
    hdop: _g(f, 10), pdop: _g(f, 11), vdop: _g(f, 12),
    date: utcRaw.slice(0, 8), utc: utcRaw.slice(8).replace(/\..*/, ''),
  };
}

// SIM7600/A7600: +CGPSINFO: <lat>,<N/S>,<lon>,<E/W>,<date ddmmyy>,<utc hhmmss.s>,<alt>,<spd knots>,<course>
// lat/lon in NMEA ddmm.mmmmmm with hemisphere.
function parseCGPSINFO(line) {
  const m = line.match(/\+CGPSINFO:\s*(.*)$/i); if (!m) return null;
  const f = m[1].split(',');
  if (f.length < 4 || (f[0].trim() === '' && f[2].trim() === '')) return null;
  const lat = nmeaToDec(f[0], (f[1] || '').trim().toUpperCase());
  const lon = nmeaToDec(f[2], (f[3] || '').trim().toUpperCase());
  if (lat == null || lon == null) return null;
  return {
    mode: '3', sats: 0, svSum: 0, lat, lon,
    date: (f[4] || '').trim(), utc: (f[5] || '').trim().replace(/\..*/, ''),
    alt: _g(f, 6), speed: _g(f, 7), course: _g(f, 8), hdop: null, pdop: null, vdop: null,
  };
}
return { parseCGNSSINFO, parseCGNSINF, parseCGPSINFO };
})();

/* ---- GNSS drivers per family ---- */
// A76XX: power CGNSSPWR, info CGNSSINFO, start CGPSCOLD/WARM/HOT, satellites via NMEA (CGNSSTST)
/** @type {GnssDriver} */
const GNSS_A76XX = {
  supported: true, satStream: true,
  queryPower: 'AT+CGNSSPWR?',
  parsePower: (line) => { const m = line.match(/\+CGNSSPWR:\s*([01])/i); return m ? Number(m[1]) : null; },
  power: (on) => `AT+CGNSSPWR=${on ? 1 : 0}`,
  info: 'AT+CGNSSINFO', infoRe: /\+CGNSSINFO:/i, parseInfo: GnssParse.parseCGNSSINFO,
  cold: 'AT+CGPSCOLD', warm: 'AT+CGPSWARM', hot: 'AT+CGPSHOT',
  satStart: 'AT+CGNSSTST=1', satStop: 'AT+CGNSSTST=0',
};
// SIM7080/7070: power CGNSPWR, info CGNSINF (no convenient NMEA streaming → no sky view)
/** @type {GnssDriver} */
const GNSS_SIM70X0 = {
  supported: true, satStream: false,
  queryPower: 'AT+CGNSPWR?',
  parsePower: (line) => { const m = line.match(/\+CGNSPWR:\s*([01])/i); return m ? Number(m[1]) : null; },
  power: (on) => `AT+CGNSPWR=${on ? 1 : 0}`,
  info: 'AT+CGNSINF', infoRe: /\+CGNSINF:/i, parseInfo: GnssParse.parseCGNSINF,
  cold: 'AT+CGNSCOLD', warm: 'AT+CGNSWARM', hot: 'AT+CGNSHOT',
  satStart: null, satStop: null,
};
// SIM7600/A7600: power CGPS, info CGPSINFO
/** @type {GnssDriver} */
const GNSS_SIM7600 = {
  supported: true, satStream: false,
  queryPower: 'AT+CGPS?',
  parsePower: (line) => { const m = line.match(/\+CGPS:\s*([01])/i); return m ? Number(m[1]) : null; },
  power: (on) => `AT+CGPS=${on ? 1 : 0}`,
  info: 'AT+CGPSINFO', infoRe: /\+CGPSINFO:/i, parseInfo: GnssParse.parseCGPSINFO,
  cold: 'AT+CGPSCOLD', warm: 'AT+CGPSWARM', hot: 'AT+CGPSHOT',
  satStart: null, satStop: null,
};
/** @type {GnssDriver} */
const GNSS_NONE = { supported: false };

/* ---- command drivers per family (TCP/UDP · HTTP · MQTT) ----
   Each method receives the wizard form values (v) and returns a MACRO
   (commands separated by \n; @NNN = wait ms; with the '> ' prompt active the line goes raw).
   The form FIELDS are shared across modules: only the AT sequence changes.   */
const toHex = (s) => [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join('');
function parseUrl(u) {
  u = String(u || '').trim();
  const m = u.match(/^(https?):\/\/([^/]+)(\/.*)?$/i);
  if (!m) return { scheme: 'http', host: u, origin: 'http://' + u, root: 'http://' + u + '/', path: '/' };
  const scheme = m[1].toLowerCase(), host = m[2], path = m[3] || '/';
  return { scheme, host, origin: `${scheme}://${host}`, root: `${scheme}://${host}/`, path };
}

// ===== TCP / UDP =====
/** @type {TcpDriver} */
const TCP_A76XX = {
  open(v) {
    const link = v['wz-link'] || '0', host = v['wz-host'] || '', port = v['wz-port'] || '80', mode = v['wz-mode'];
    if (v['wz-ssl'] && mode === 'TCP') return `AT+CCHSTART\n@1000\nAT+CCHOPEN=${link},"${host}",${port},2`;
    // UDP: AT+NETOPEN=1 + local-port-only socket (AT+CIPOPEN=<link>,"UDP",,,<port>) — no fixed
    // peer; the destination travels in each addressed CIPSEND. Local port field wins, else port.
    if (mode === 'UDP') return `AT+NETOPEN=1\n@1500\nAT+CIPRXGET=1\nAT+CIPOPEN=${link},"UDP",,,${v['wz-lport'] || port}`;
    return `AT+NETOPEN\n@1500\nAT+CIPRXGET=1\nAT+CIPOPEN=${link},"${mode}","${host}",${port}`;
  },
  send(v) {
    const link = v['wz-link'] || '0', data = v['wz-data'] || '', len = byteLen(data);
    // UDP: addressed, variable-length send — AT+CIPSEND=<link>,,"<host>",<port> → '>' prompt,
    // then the datagram closed with Ctrl+Z (the length form doesn't carry the destination).
    if (v['wz-mode'] === 'UDP') return `AT+CIPSEND=${link},,"${v['wz-host'] || ''}",${v['wz-port'] || '80'}\n@300\n${data}\n^Z`;
    const cmd = (v['wz-ssl'] && v['wz-mode'] === 'TCP') ? `AT+CCHSEND=${link},${len}` : `AT+CIPSEND=${link},${len}`;
    return `${cmd}\n@300\n${data}`;
  },
  read(v) { const link = v['wz-link'] || '0'; return (v['wz-ssl'] && v['wz-mode'] === 'TCP') ? `AT+CCHRECV=${link}` : `AT+CIPRXGET=2,${link},1460`; },
  close(v) {
    const link = v['wz-link'] || '0';
    if (v['wz-ssl'] && v['wz-mode'] === 'TCP') return `AT+CCHCLOSE=${link}\n@500\nAT+CCHSTOP`;
    if (v['wz-mode'] === 'UDP') return 'AT+NETCLOSE=1';   // tears down the stack (and its sockets), mirroring AT+NETOPEN=1
    return `AT+CIPCLOSE=${link}\n@500\nAT+NETCLOSE`;
  },
};
/** @type {TcpDriver} */
const TCP_SIM70X0 = {   // CNACT (PDP) + CA* (sockets)
  open(v) {
    const cid = v['wz-link'] || '0', host = v['wz-host'] || '', port = v['wz-port'] || '80', mode = v['wz-mode'];
    const ssl = v['wz-ssl'] ? `\nAT+CASSLCFG=${cid},"SSL",1` : '';
    return `AT+CNACT=0,1\n@1500\nAT+CACID=${cid}${ssl}\nAT+CAOPEN=${cid},0,"${mode}","${host}",${port}`;
  },
  send(v) { const cid = v['wz-link'] || '0', data = v['wz-data'] || ''; return `AT+CASEND=${cid},${byteLen(data)}\n@300\n${data}`; },
  read(v) { const cid = v['wz-link'] || '0'; return `AT+CARECV=${cid},1460`; },
  close(v) { const cid = v['wz-link'] || '0'; return `AT+CACLOSE=${cid}`; },
};
/** @type {TcpDriver} */
const TCP_SIM7022 = {   // CSOC (SIM7020 family), data in hex
  open(v) { const host = v['wz-host'] || '', port = v['wz-port'] || '80', proto = v['wz-mode'] === 'UDP' ? 2 : 1; return `AT+CSOC=1,${proto},1\n@300\nAT+CSOCON=0,${port},"${host}"`; },
  send(v) { const data = v['wz-data'] || ''; return `AT+CSOSEND=0,${byteLen(data)},"${toHex(data)}"`; },
  read() { return `AT+CSORCV=0,1460`; },
  close() { return `AT+CSOCL=0`; },
};

// ===== HTTP =====
/** @type {HttpDriver} */
const HTTP_A76XX = {
  get(v) { let s = `AT+HTTPINIT\nAT+HTTPPARA="URL","${v['wz-url'] || ''}"`; if (v['wz-hssl']) s += `\nAT+HTTPPARA="SSLCFG",0`; return s + `\nAT+HTTPACTION=0\n@3000\nAT+HTTPHEAD\nAT+HTTPREAD=0,1024\nAT+HTTPTERM`; },
  post(v) { const body = v['wz-hpost'] || ''; let s = `AT+HTTPINIT\nAT+HTTPPARA="URL","${v['wz-url'] || ''}"\nAT+HTTPPARA="CONTENT","${v['wz-ctype']}"`; if (v['wz-hssl']) s += `\nAT+HTTPPARA="SSLCFG",0`; return s + `\nAT+HTTPDATA=${byteLen(body)},10000\n@300\n${body}\nAT+HTTPACTION=1\n@3000\nAT+HTTPHEAD\nAT+HTTPREAD=0,1024\nAT+HTTPTERM`; },
};
/** @type {HttpDriver} */
const HTTP_SIM70X0 = {   // SH stack: URL = root host, SHREQ = path
  get(v) { const u = parseUrl(v['wz-url'] || ''); return `AT+SHCONF="URL","${u.origin}"\nAT+SHCONF="BODYLEN",1024\nAT+SHCONF="HEADERLEN",350\nAT+SHCONN\n@1500\nAT+SHREQ="${u.path}",1\n@3000\nAT+SHREAD=0,1024\nAT+SHDISC`; },
  post(v) { const u = parseUrl(v['wz-url'] || ''), body = v['wz-hpost'] || ''; return `AT+SHCONF="URL","${u.origin}"\nAT+SHCONF="BODYLEN",1024\nAT+SHCONF="HEADERLEN",350\nAT+SHCONN\n@1500\nAT+SHBOD=${byteLen(body)},10000\n@300\n${body}\nAT+SHREQ="${u.path}",3\n@3000\nAT+SHREAD=0,1024\nAT+SHDISC`; },
};
/** @type {HttpDriver} */
const HTTP_SIM7022 = {   // CHTTP* (familia SIM7020)
  get(v) { const u = parseUrl(v['wz-url'] || ''); return `AT+CHTTPCREATE="${u.root}"\n@300\nAT+CHTTPCON=0\n@1000\nAT+CHTTPSEND=0,0,"${u.path}"\n@3000\nAT+CHTTPDISCON=0\nAT+CHTTPDESTROY=0`; },
  post(v) { const u = parseUrl(v['wz-url'] || ''), body = v['wz-hpost'] || ''; return `AT+CHTTPCREATE="${u.root}"\n@300\nAT+CHTTPCON=0\n@1000\nAT+CHTTPSEND=0,1,"${u.path}",,"${v['wz-ctype']}","${body}"\n@3000\nAT+CHTTPDISCON=0\nAT+CHTTPDESTROY=0`; },
};

// ===== MQTT =====
/** @type {MqttDriver} */
const MQTT_A76XX = {
  connect(v) {
    const cid = v['wz-cid'] || 'simcom-demo', broker = v['wz-broker'] || '', port = v['wz-mport'] || '1883', ssl = v['wz-mssl'] ? 1 : 0;
    let s = `AT+CMQTTSTART\n@1000\nAT+CMQTTACCQ=0,"${cid}",${ssl}`;
    if (ssl) s += `\nAT+CMQTTSSLCFG=0,0`;
    const u = v['wz-muser'], auth = u ? `,"${u}","${v['wz-mpass'] || ''}"` : '';
    return s + `\nAT+CMQTTCONNECT=0,"tcp://${broker}:${port}",60,1${auth}`;
  },
  subscribe(v) { const topic = v['wz-mtopic'] || '', qos = v['wz-mqos'] || '1'; return `AT+CMQTTSUBTOPIC=0,${byteLen(topic)},${qos}\n@300\n${topic}\nAT+CMQTTSUB=0`; },
  publish(v) { const topic = v['wz-mtopic'] || '', payload = v['wz-mpayload'] || '', qos = v['wz-mqos'] || '1'; return `AT+CMQTTTOPIC=0,${byteLen(topic)}\n@300\n${topic}\nAT+CMQTTPAYLOAD=0,${byteLen(payload)}\n@300\n${payload}\nAT+CMQTTPUB=0,${qos},60`; },
  disconnect() { return `AT+CMQTTDISC=0,60\nAT+CMQTTREL=0\nAT+CMQTTSTOP`; },
};
/** @type {MqttDriver} */
const MQTT_SIM70X0 = {   // SM* stack
  connect(v) {
    const cid = v['wz-cid'] || 'simcom-demo', broker = v['wz-broker'] || '', port = v['wz-mport'] || '1883';
    let s = `AT+SMCONF="URL","${broker}","${port}"\nAT+SMCONF="CLIENTID","${cid}"\nAT+SMCONF="KEEPTIME",60`;
    if (v['wz-muser']) s += `\nAT+SMCONF="USERNAME","${v['wz-muser']}"\nAT+SMCONF="PASSWORD","${v['wz-mpass'] || ''}"`;
    return s + `\nAT+SMCONN`;
  },
  subscribe(v) { return `AT+SMSUB="${v['wz-mtopic'] || ''}",${v['wz-mqos'] || '1'}`; },
  publish(v) { const payload = v['wz-mpayload'] || ''; return `AT+SMPUB="${v['wz-mtopic'] || ''}",${byteLen(payload)},${v['wz-mqos'] || '1'},0\n@300\n${payload}`; },
  disconnect() { return `AT+SMDISC`; },
};
/** @type {MqttDriver} */
const MQTT_SIM7022 = {   // CMQ* (SIM7020 family), hex payload
  connect(v) { const cid = v['wz-cid'] || 'simcom-demo', broker = v['wz-broker'] || '', port = v['wz-mport'] || '1883'; return `AT+CMQNEW="${broker}","${port}",12000,1024\n@500\nAT+CMQCON=0,3,"${cid}",600,0,0`; },
  subscribe(v) { return `AT+CMQSUB=0,"${v['wz-mtopic'] || ''}",${v['wz-mqos'] || '1'}`; },
  publish(v) { const payload = v['wz-mpayload'] || ''; return `AT+CMQPUB=0,"${v['wz-mtopic'] || ''}",${v['wz-mqos'] || '1'},0,0,${byteLen(payload)},"${toHex(payload)}"`; },
  disconnect() { return `AT+CMQDISCON=0`; },
};

// ===== Data / PDP (status panel) =====
/** @type {DataDriver} */
const DATA_A76XX = {
  openCmd: 'AT+NETOPEN', closeCmd: 'AT+NETCLOSE',
  async refresh(send) {
    const no = await send('AT+NETOPEN?');
    const m = (no.lines.find((l) => /\+NETOPEN:/i.test(l)) || '').match(/\+NETOPEN:\s*([01])/i);
    const open = m ? m[1] === '1' : null;
    let ip = null;
    if (open) { const r = await send('AT+IPADDR'); const im = (r.lines.find((l) => /\+IPADDR:/i.test(l)) || '').match(/\+IPADDR:\s*([\d.]+)/i); ip = im ? im[1] : null; }
    return { open, ip };
  },
};
/** @type {DataDriver} */
const DATA_SIM70X0 = {
  openCmd: 'AT+CNACT=0,1', closeCmd: 'AT+CNACT=0,0',
  async refresh(send) {
    const r = await send('AT+CNACT?');
    const m = (r.lines.find((l) => /\+CNACT:/i.test(l)) || '').match(/\+CNACT:\s*\d+,([012]),"?([^",]*)"?/i);
    if (!m) return { open: null, ip: null };
    return { open: m[1] === '1', ip: (m[2] && m[2] !== '0.0.0.0') ? m[2] : null };
  },
};
/** @type {DataDriver} */
const DATA_SIM7022 = {
  openCmd: 'AT+CGACT=1,1', closeCmd: 'AT+CGACT=0,1',
  async refresh(send) {
    const r = await send('AT+CGACT?');
    const m = (r.lines.find((l) => /\+CGACT:\s*1,/i.test(l)) || '').match(/\+CGACT:\s*1,([01])/i);
    const open = m ? m[1] === '1' : null;
    let ip = null;
    if (open) { const a = await send('AT+CGPADDR=1'); const im = (a.lines.find((l) => /\+CGPADDR:/i.test(l)) || '').match(/\+CGPADDR:\s*1,"?([\d.]+)"?/i); ip = im ? im[1] : null; }
    return { open, ip };
  },
};

// ===== File System (browser model) =====
/** @type {FsDriver} */
const FS_FSCD = { model: 'fscd' };   // A76XX/SIM7600: FSCD/FSLS navigation (directory tree)
/** @type {FsDriver} */
const FS_CFS = {                     // SIM7080/7070: CFS (no directory listing; by index + name)
  model: 'cfs',
  dirs: [['0', '/custapp/'], ['1', '/fota/'], ['2', '/datatx/'], ['3', '/customer/']],
  size: (dir, name) => `AT+CFSINIT\nAT+CFSGFIS=${dir},"${name}"\n@200\nAT+CFSTERM`,
  read: (dir, name) => `AT+CFSINIT\nAT+CFSRFILE=${dir},"${name}",0,1024,0\n@200\nAT+CFSTERM`,
  del:  (dir, name) => `AT+CFSINIT\nAT+CFSDFILE=${dir},"${name}"\n@200\nAT+CFSTERM`,
};

