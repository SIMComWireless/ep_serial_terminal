/* serial.js — pure transport: line classification, Framer, WebSerialTransport and VirtualPort
   (generic helpers in util.js · telemetry in live.js · virtual modem and GNSS route in emulator.js)
   (part of the AT console · classic script, shared global scope — concatenated in order) */
/* ============================================================
   1) URCs and classifier — ported from the (browser) library
   ============================================================ */
const URC_PREFIXES = [
  'RING','NO CARRIER','BUSY','NO ANSWER','+CRING','+CLIP','+CMTI','+CMT','+CDS','+CBM',
  '+CREG','+CGREG','+CEREG','+CGEV','+CTZV','+PSUTTZ','+CIPRXGET','+IPCLOSE','+RECEIVE',
  '+CARECV','+CASTATE','+CPIN','RDY','PB DONE','SMS DONE','+CMQTTRXSTART','+CMQTTRXTOPIC',
  '+CMQTTRXPAYLOAD','+CMQTTRXEND','+CMQTTCONNLOST','+CCH_PEER_CLOSED','+CCHEVENT',
  '+CGNSSPWR','+CPING','+CDNSGIP','+CNTP','+SIMCARD','+LWURC','+COAPOPEN','+COAPRECV',
  '+APP PDP','+CAOPEN','+CAACK','+SHREQ','+SMSUB','+SMPUB','+CSONMI','+CHTTPNMIH','+CHTTPNMIC','+CMQPUB',
  '+CIPOPEN','+CCHOPEN','+HTTPACTION','+CMQTTCONNECT','+CMQTTSUB','+CMQTTPUB','+NETCLOSE',
  '+BLESCANRST','+BLECCON','+BLECDISC','+BLESCON','+BLEDISC','+BLECONN','+BLEGATTCNTFY',
  // Espressif ESP (firmware AT)
  'WIFI CONNECTED','WIFI GOT IP','WIFI DISCONNECT','+IPD','+STA_CONNECTED','+DIST_STA_IP',
  '+MQTTSUBRECV','+MQTTCONNECTED','+MQTTDISCONNECTED','+BLESCAN'
];

const RE = {
  ok:    /^OK$/,
  error: /^ERROR$/,
  cme:   /^\+CME ERROR:/,
  cms:   /^\+CMS ERROR:/,
};

function classify(line, echoOf) {
  if (line.length === 0) return 'empty';
  if (RE.ok.test(line)) return 'ok';
  if (RE.error.test(line) || RE.cme.test(line) || RE.cms.test(line)) return 'err';
  if (echoOf && line === echoOf) return 'echo';
  for (const p of URC_PREFIXES) {
    // <prefix>:… / <prefix> … / <prefix>,… (ESP +IPD,<link>,<len>:data and similar comma-formatted URCs)
    if (line === p || line.startsWith(p + ':') || line.startsWith(p + ' ') || line.startsWith(p + ',')) return 'urc';
  }
  return 'body';
}

/* ---- Translation of AT error codes to human text (annotation in the terminal) ----
   +CME ERROR (3GPP TS 27.007 §9.2 + GPRS causes annex A) · +CMS ERROR (TS 27.005 §3.2.5,
   RP causes from TS 24.011 and TP causes from TS 23.040). In English on purpose: it's the spec text. */
const CME_ERRORS = {
  0: 'Phone failure', 1: 'No connection to phone', 2: 'Phone-adaptor link reserved',
  3: 'Operation not allowed', 4: 'Operation not supported',
  5: 'PH-SIM PIN required', 6: 'PH-FSIM PIN required', 7: 'PH-FSIM PUK required',
  10: 'SIM not inserted', 11: 'SIM PIN required', 12: 'SIM PUK required',
  13: 'SIM failure', 14: 'SIM busy', 15: 'SIM wrong', 16: 'Incorrect password',
  17: 'SIM PIN2 required', 18: 'SIM PUK2 required',
  20: 'Memory full', 21: 'Invalid index', 22: 'Not found', 23: 'Memory failure',
  24: 'Text string too long', 25: 'Invalid characters in text string',
  26: 'Dial string too long', 27: 'Invalid characters in dial string',
  30: 'No network service', 31: 'Network timeout', 32: 'Network not allowed - emergency calls only',
  40: 'Network personalization PIN required', 41: 'Network personalization PUK required',
  42: 'Network subset personalization PIN required', 43: 'Network subset personalization PUK required',
  44: 'Service provider personalization PIN required', 45: 'Service provider personalization PUK required',
  46: 'Corporate personalization PIN required', 47: 'Corporate personalization PUK required',
  50: 'Incorrect parameters', 100: 'Unknown error',
  103: 'Illegal MS', 106: 'Illegal ME', 107: 'GPRS services not allowed',
  111: 'PLMN not allowed', 112: 'Location area not allowed', 113: 'Roaming not allowed in this location area',
  132: 'Service option not supported', 133: 'Requested service option not subscribed',
  134: 'Service option temporarily out of order', 148: 'Unspecified GPRS error',
  149: 'PDP authentication failure', 150: 'Invalid mobile class',
};
const CMS_ERRORS = {
  1: 'Unassigned (unallocated) number', 8: 'Operator determined barring', 10: 'Call barred',
  21: 'Short message transfer rejected', 27: 'Destination out of service', 28: 'Unidentified subscriber',
  29: 'Facility rejected', 30: 'Unknown subscriber', 38: 'Network out of order',
  41: 'Temporary failure', 42: 'Congestion', 47: 'Resources unavailable, unspecified',
  50: 'Requested facility not subscribed', 69: 'Requested facility not implemented',
  81: 'Invalid short message transfer reference value', 95: 'Invalid message, unspecified',
  96: 'Invalid mandatory information', 97: 'Message type non-existent or not implemented',
  98: 'Message not compatible with short message protocol state', 99: 'Information element non-existent or not implemented',
  111: 'Protocol error, unspecified', 127: 'Interworking, unspecified',
  128: 'Telematic interworking not supported', 129: 'Short message Type 0 not supported',
  130: 'Cannot replace short message', 143: 'Unspecified TP-PID error',
  144: 'Data coding scheme (alphabet) not supported', 145: 'Message class not supported',
  159: 'Unspecified TP-DCS error', 160: 'Command cannot be actioned', 161: 'Command unsupported',
  175: 'Unspecified TP-Command error', 176: 'TPDU not supported',
  192: 'SC busy', 193: 'No SC subscription', 194: 'SC system failure', 195: 'Invalid SME address',
  196: 'Destination SME barred', 197: 'SM rejected-duplicate SM',
  198: 'TP-VPF not supported', 199: 'TP-VP not supported',
  208: 'SIM SMS storage full', 209: 'No SMS storage capability in SIM', 210: 'Error in MS',
  211: 'Memory capacity exceeded', 212: 'SIM Application Toolkit busy', 213: 'SIM data download error',
  300: 'ME failure', 301: 'SMS service of ME reserved', 302: 'Operation not allowed',
  303: 'Operation not supported', 304: 'Invalid PDU mode parameter', 305: 'Invalid text mode parameter',
  310: 'SIM not inserted', 311: 'SIM PIN required', 312: 'PH-SIM PIN required',
  313: 'SIM failure', 314: 'SIM busy', 315: 'SIM wrong',
  316: 'SIM PUK required', 317: 'SIM PIN2 required', 318: 'SIM PUK2 required',
  320: 'Memory failure', 321: 'Invalid memory index', 322: 'Memory full',
  330: 'SMSC address unknown', 331: 'No network service', 332: 'Network timeout',
  340: 'No +CNMA acknowledgement expected', 500: 'Unknown error',
};
// "+CME ERROR: 30" → "No network service" · null if the code is unknown or already came as text (CMEE=2).
function atErrorText(line) {
  const m = line.match(/^\+(CME|CMS) ERROR:\s*(\d+)\s*$/i);
  if (!m) return null;
  const txt = (m[1].toUpperCase() === 'CME' ? CME_ERRORS : CMS_ERRORS)[Number(m[2])];
  return txt || null;
}

/* ============================================================
   2) Framer — bytes → lines (Uint8Array, no Buffer)
   ============================================================ */
class Framer {
  constructor(onLine, onPrompt) {
    this.buf = new Uint8Array(0);
    this.dec = new TextDecoder();
    this.onLine = onLine;
    this.onPrompt = onPrompt;
    this.raw = false;   // raw mode (shell/None): no AT "> " prompt detection
    this.rawCapture = null;   // capture of N raw bytes (binary download): { need, chunks, onDone }
  }
  // Enables capturing the next `len` bytes as-is (no line framing). When complete it calls onDone(Uint8Array).
  captureRaw(len, onDone) {
    if (len > 0) this.rawCapture = { need: len, chunks: [], onDone };
    else { try { onDone(new Uint8Array(0)); } catch (_) {} }
  }
  feed(chunk) {
    const m = new Uint8Array(this.buf.length + chunk.length);
    m.set(this.buf); m.set(chunk, this.buf.length);
    this.buf = m;
    this._process();
  }
  _process() {
    if (this.rawCapture) {                 // consume raw bytes for an ongoing download
      const rc = this.rawCapture;
      if (this.buf.length) {
        const take = Math.min(rc.need, this.buf.length);
        rc.chunks.push(this.buf.slice(0, take));
        this.buf = this.buf.slice(take);
        rc.need -= take;
      }
      if (rc.need > 0) return;             // bytes missing: wait for more
      this.rawCapture = null;
      let tot = 0; rc.chunks.forEach((c) => (tot += c.length));
      const all = new Uint8Array(tot); let off = 0;
      rc.chunks.forEach((c) => { all.set(c, off); off += c.length; });
      try { rc.onDone(all); } catch (_) {}
      // keep framing whatever is left (e.g. "\r\nOK\r\n")
    }
    let t;
    while ((t = this._term()) !== null) {
      const line = this.dec.decode(this.buf.slice(0, t.end));
      this.buf = this.buf.slice(t.consume);
      this.onLine(line, t.term);          // term = '\r' | '\n' | '\r\n' (terminador real)
      if (this.rawCapture) return this._process();   // onLine asked to capture raw bytes → switch modes
    }
    if (this.raw) {   // shell: show whatever remains (prompt without newline, e.g. "C:\>") without waiting for CRLF
      if (this.buf.length) { this.onLine(this.dec.decode(this.buf), ''); this.buf = new Uint8Array(0); }
      return;
    }
    // "> " prompt without CRLF (AT mode only)
    if (this.buf.length >= 2 && this.buf[this.buf.length - 2] === 0x3e && this.buf[this.buf.length - 1] === 0x20) {
      this.buf = new Uint8Array(0);
      this.onPrompt();
    }
  }
  // Finds the first line ending and reports its type (handles CR, LF and CRLF).
  _term() {
    for (let i = 0; i < this.buf.length; i++) {
      const b = this.buf[i];
      if (b === 10) {                                   // LF (preceded or not by CR)
        if (i > 0 && this.buf[i - 1] === 13) return { end: i - 1, consume: i + 1, term: '\r\n' };
        return { end: i, consume: i + 1, term: '\n' };
      }
      if (b === 13) {                                   // CR
        if (i + 1 < this.buf.length) {
          if (this.buf[i + 1] === 10) continue;         // it's CRLF → the LF resolves it
          return { end: i, consume: i + 1, term: '\r' }; // lone CR
        }
        return null;                                    // CR at the end: wait (an LF might follow)
      }
    }
    return null;
  }
  setEnc(label) { try { this.dec = new TextDecoder(label); } catch (_) { this.dec = new TextDecoder(); } }
}

/* ============================================================
   3) Transporte Web Serial
   ============================================================ */
class WebSerialTransport {
  constructor(onData, onClose) { this.onData = onData; this.onClose = onClose; }
  async connect(opts) {
    this.port = await navigator.serial.requestPort();
    return this._open(opts);
  }
  async _open(opts) {
    this.opts = opts;
    this.closing = false;
    await this.port.open({ baudRate: opts.baudRate, dataBits: opts.dataBits, stopBits: opts.stopBits, parity: opts.parity, flowControl: 'none' });
    const info = this.port.getInfo ? this.port.getInfo() : {};
    this.info = info;   // remembered to re-acquire the same device (VID:PID) after an unplug
    this.writer = this.port.writable.getWriter();
    this._read();
    return info;
  }
  // Reopens the already-authorized port without asking the user again.
  async reconnect(opts) {
    if (!this.port) throw new Error('no port');
    opts = opts || this.opts || { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' };
    try { return await this._open(opts); }
    catch (e) {
      // On unplug, the SerialPort object dies forever; on replug the browser
      // hands out ANOTHER object with the same permission. Re-acquire it by VID:PID with getPorts()
      // (no dialog). With two identical adapters connected it takes the first match.
      const info = this.info || {};
      const ports = (typeof navigator !== 'undefined' && navigator.serial) ? await navigator.serial.getPorts() : [];
      const match = info.usbVendorId != null && ports.find((p) => {
        const i = p.getInfo ? p.getInfo() : {};
        return i.usbVendorId === info.usbVendorId && i.usbProductId === info.usbProductId;
      });
      if (!match) throw e;
      this.port = match;
      return this._open(opts);
    }
  }
  async _read() {
    this.reader = this.port.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.onData(value);
      }
    } catch (_) { /* puerto perdido */ }
    finally { try { this.reader.releaseLock(); } catch (_) {} }
    if (!this.closing) {           // the loop ended without disconnect() → board reset / unplugged
      try { this.writer?.releaseLock(); } catch (_) {}   // WITHOUT this, close() rejects (writable locked) and the port goes zombie: no reconnect until F5
      try { await this.port?.close(); } catch (_) {}
      this.writer = this.reader = null;
      this.onClose();
    }
  }
  async write(str) {
    if (!this.writer) return;
    await this.writer.write(new TextEncoder().encode(str));
  }
  async writeBytes(u8) {
    if (!this.writer) return;
    await this.writer.write(u8);
  }
  async disconnect() {
    this.closing = true;
    try { await this.reader?.cancel(); } catch (_) {}
    try { this.writer?.releaseLock(); } catch (_) {}
    try { await this.port?.close(); } catch (_) {}
    this.writer = this.reader = null;   // keeps this.port to allow reconnecting
    this.onClose();
  }
}

class VirtualPort {
  constructor(onData, onClose, identity) {
    this.onData = onData; this.onClose = onClose; this.enc = new TextEncoder();
    this.raw = false;   // "None" mode: pure loopback (echo), no AT emulator
    this.emu = new ATEmulator({ echo: false, identity,
      output: (str) => { if (this.open) this.onData(this.enc.encode(str)); },
      outputRaw: (u8) => { if (this.open) this.onData(u8); } });   // raw bytes (binary download) without going through UTF-8
  }
  async connect() { this.open = true; return { virtual: true }; }
  async reconnect() { this.open = true; return { virtual: true }; }   // keeps the emulator state
  async write(str) { if (!this.open) return; if (this.raw) this.onData(this.enc.encode(str)); else this.emu.feed(str); }
  async writeBytes(u8) { if (!this.open) return; if (this.raw) { this.onData(u8); return; } let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); this.emu.feed(s); }
  async disconnect() { this.open = false; this.onClose(); }
  injectSms(from, text) { this.emu.injectSms(from, text); }
  setIdentity(identity) { this.emu.setIdentity(identity); }   // when the terminal's module changes (edit) the emulator adopts the new identity/family
}

