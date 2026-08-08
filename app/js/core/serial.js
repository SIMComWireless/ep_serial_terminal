/* serial.js — pure TRANSPORT: turns bytes into lines (Framer) and drives the ports
   (WebSerialTransport for real hardware, VirtualPort for the built-in emulator).
   It knows nothing about AT semantics: line classification, URC prefixes and the CME/CMS
   tables live in core/at-parser.js; the virtual modem lives in core/emulator-core.js.
   (generic helpers in util.js · telemetry in live.js)
   (part of the AT console · classic script, shared global scope — concatenated in order) */

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

