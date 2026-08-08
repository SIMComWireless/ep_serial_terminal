/* emulator-core.js — virtual modem CORE, vendor-agnostic: byte framing (feed), the generic
   AT commands every module answers (AT, ATE0/ATE1, ATI) and the registries that let each
   vendor plug in its own command set and its own default state.
     registerEmuHandler(fn)  fn(emu, cmd, {ok, err, reply}) → EMU_PASS if it does not handle it
     registerEmuState(fn)    fn(opts) → extra fields merged into emu.state
   Vendor sets: simcom/emulator-simcom.js · espressif/emulator-espressif.js
   (part of the AT console · classic script, shared global scope — concatenated in order) */

const _CZ = '\x1a', _ESC = '\x1b';
// Default identity (A7672SA-FASE). Each profile can pass its own when opening the simulator.
const DEFAULT_IDENTITY = {
  manufacturer: 'SIMCOM INCORPORATED', model: 'A7672SA-FASE', revision: 'A011B02A7672M7_V1.0',
  imei: '860123040567890', band: 'EUTRAN-BAND4', ati: ['SIMCOM_A7672SA-FASE', 'A7672SA-FASE-V1.0'],
};

// Returned by a vendor handler that does not recognize the command (keep walking the chain).
const EMU_PASS = Symbol('emu-pass');

class ATEmulator {
  constructor(opts = {}) {
    this.output = opts.output ?? (() => {});
    this.outputRaw = opts.outputRaw ?? ((u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); this.output(s); });   // raw bytes for downloads
    this.identity = opts.identity || DEFAULT_IDENTITY;
    this.isEsp = /espressif/i.test(this.identity.manufacturer || '');   // ESP family → uses the Espressif BLE/Wi-Fi block, not the SIMCom one
    this.buf = ''; this.expecting = null;
    // Base state is generic; each vendor adds its own via registerEmuState() (see *-simcom.js).
    this.state = { echo: opts.echo ?? false };
    for (const ext of ATEmulator.stateExtenders) Object.assign(this.state, ext(opts));
    this._onIdentity();
  }
  // Runs after every identity change so a vendor set can react (e.g. a GNSS receiver starts
  // or stops streaming NMEA when the terminal switches module).
  _onIdentity() { for (const h of ATEmulator.identityHooks) h(this); }
  // Changing a virtual terminal's module (edit) reuses the emulator: it adopts the new identity and recomputes the family.
  setIdentity(identity) { this.identity = identity || DEFAULT_IDENTITY; this.isEsp = /espressif/i.test(this.identity.manufacturer || ''); this._onIdentity(); }
  feed(chunk) {
    this.buf += chunk;
    for (;;) {
      if (this.expecting) {
        const exp = this.expecting;
        // Prompted data. Two shapes, both vendor-agnostic here: a fixed length (exp.len) or a
        // free-length payload closed with Ctrl+Z. The vendor decides what happens on completion
        // through the optional exp.onDone(payload | byteCount) → lines to answer (default OK).
        if (exp.len != null) {            // length-based download (cert, mail subject/body, file to EFS)
          if (this.buf.length < exp.len) return;
          const payload = this.buf.slice(0, exp.len);
          this.buf = this.buf.slice(exp.len); this.expecting = null;
          this._send((typeof exp.onDone === 'function' && exp.onDone(payload)) || ['OK']);
          continue;
        }
        const zi = this.buf.indexOf(_CZ), ei = this.buf.indexOf(_ESC);
        if (ei !== -1 && (zi === -1 || ei < zi)) { this.buf = this.buf.slice(ei + 1); this.expecting = null; this._send(['OK']); continue; }   // ESC aborts
        if (zi === -1 && !/\r\n?$/.test(this.buf)) return;
        const sent = zi !== -1 ? zi : this.buf.replace(/\r\n?$/, '').length;   // payload bytes before the Ctrl+Z
        this.buf = zi !== -1 ? this.buf.slice(zi + 1) : '';
        this.expecting = null;
        this._send((typeof exp.onDone === 'function' && exp.onDone(sent)) || ['OK']);
        continue;
      }
      const i = this.buf.search(/[\r\n]/); if (i === -1) return;
      const line = this.buf.slice(0, i);
      const adv = (this.buf[i] === '\r' && this.buf[i + 1] === '\n') ? i + 2 : i + 1;   // consume \r\n as a unit (don't leave a residual \n)
      this.buf = this.buf.slice(adv);
      if (line.trim()) this._handle(line.trim());
    }
  }
  _send(l) { this.output('\r\n' + l.join('\r\n') + '\r\n'); }
  _later(ms, fn) { setTimeout(fn, ms); }
  // Generic AT first, then the vendor handler chain, then the catch-all.
  _handle(cmd) {
    if (this.state.echo) this.output(cmd + '\r');
    const ok = () => this._send(['OK']), err = () => this._send(['ERROR']), reply = (l) => this._send([...l, 'OK']);
    const s = this.state;
    if (/^AT$/i.test(cmd)) return ok();
    if (/^ATE0$/i.test(cmd)) { s.echo = false; return ok(); }
    if (/^ATE1?$/i.test(cmd)) { s.echo = true; return ok(); }
    const id = this.identity;
    if (/^ATI$/i.test(cmd)) return reply(id.ati.slice());
    for (const h of ATEmulator.handlers) {
      const r = h(this, cmd, { ok, err, reply });
      if (r !== EMU_PASS) return r;
    }
    if (/^AT\+\w+=/i.test(cmd)) return ok();
    // A device with no AT interpreter (a GNSS receiver) ignores what it does not understand
    // instead of answering ERROR — see core/emulator-nmea.js.
    if (this.silentUnknown) return undefined;
    return err();
  }
}

/* ---- vendor registries (populated at load time by the *-simcom.js / *-espressif.js files) ---- */
ATEmulator.handlers = [];
ATEmulator.stateExtenders = [];
ATEmulator.identityHooks = [];
function registerEmuHandler(fn) { ATEmulator.handlers.push(fn); }
function registerEmuState(fn) { ATEmulator.stateExtenders.push(fn); }
function registerEmuIdentity(fn) { ATEmulator.identityHooks.push(fn); }
