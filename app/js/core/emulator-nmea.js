/* emulator-nmea.js — virtual GNSS RECEIVER, vendor-agnostic: everything a standalone module
   emits on its own, which is standard NMEA 0183 (GGA, RMC, GSA, GSV, VTG, ZDA).
   The proprietary sentences of each chip ($PAIR…, …) are NOT here: they are added by the chip
   vendor with registerEmuHandler(), the same way the AT sets do — see airoha/emulator-airoha.js.
   The receiver is started/stopped by an identity hook: a profile whose identity says
   `kind: 'gnss'` streams as soon as the virtual terminal opens.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

// Simulated constellation: [talker, prn, elevation, azimuth, snr]. Fixed sky so the
// sky view and the signal bars look stable while the position moves.
const NMEA_SIM_SATS = [
  ['GP', 3, 71, 120, 44], ['GP', 6, 55, 210, 41], ['GP', 11, 42, 305, 38], ['GP', 17, 33, 65, 35],
  ['GP', 19, 25, 155, 31], ['GP', 22, 61, 20, 43], ['GP', 28, 14, 250, 24],
  ['GL', 65, 48, 95, 39], ['GL', 72, 36, 185, 33], ['GL', 81, 22, 290, 27],
  ['GA', 5, 58, 140, 42], ['GA', 12, 30, 320, 32],
  ['GB', 7, 40, 75, 36], ['GB', 14, 19, 230, 26],
];

class NmeaEmuMixin {
  /* ---- lifecycle: driven by the identity hook, not by a command ---- */
  gnssStart() {
    if (this._gnssTimer) return;
    const s = this.state;
    s.gnssOn = true;
    this._gnssTimer = setInterval(() => this.gnssTick(), s.gnssInterval || 1000);
  }
  gnssStop() {
    if (this._gnssTimer) { clearInterval(this._gnssTimer); this._gnssTimer = null; }
    this.state.gnssOn = false;
  }
  // Rate change: the chip sets the fix interval, the transmitter just re-arms its timer.
  gnssSetInterval(ms) {
    this.state.gnssInterval = Math.max(50, ms | 0);
    if (this._gnssTimer) { clearInterval(this._gnssTimer); this._gnssTimer = null; this.gnssStart(); }
  }

  /* ---- Simu Ctrl: driving the simulated receiver from the UI ----
     Same ctl* contract the cellular and Wi-Fi emulators use (see app.js buildEmuPop). */
  ctlGnssPower(on) { if (on) this.gnssStart(); else this.gnssStop(); }
  ctlGnssFix(on) { this.state.gnssFix = !!on; }
  ctlGnssPos(lat, lon) {
    const s = this.state;
    if (Number.isFinite(lat)) s.gnssLat = Math.max(-90, Math.min(90, lat));
    if (Number.isFinite(lon)) s.gnssLon = Math.max(-180, Math.min(180, lon));
  }
  ctlGnssAlt(m) { this.state.gnssAlt = m; }
  ctlGnssSpeed(kn) { this.state.gnssSpeed = Math.max(0, kn); }
  ctlGnssQuality(db) { this.state.gnssSnrAdj = db; }        // C/N0 offset applied to every satellite
  ctlGnssCons(talker, on) { this.state.gnssCons[talker] = !!on; }

  /* ---- one epoch: advance the simulated position and emit the enabled sentences ---- */
  /* The sky as the receiver currently sees it: a constellation switched off in the Simu Ctrl
     disappears, and the signal-quality knob shifts every C/N0 up or down. */
  gnssSky() {
    const s = this.state;
    const adj = s.gnssSnrAdj || 0;
    return NMEA_SIM_SATS
      .filter((sv) => s.gnssCons[sv[0]] !== false)
      .map((sv) => [sv[0], sv[1], sv[2], sv[3], Math.max(0, Math.min(99, sv[4] + adj))]);
  }

  gnssTick() {
    const s = this.state;
    if (!s.gnssOn) return;
    const sky = this.gnssSky();
    const used = sky.filter((sv) => sv[4] >= 30);             // only a decent C/N0 enters the solution
    // Below four usable satellites there is no fix — same as a real receiver, so lowering the
    // quality knob far enough makes the module lose the position.
    const fix = s.gnssFix !== false && used.length >= 4;
    // Movement follows the configured speed: at 0 kn the receiver stays put.
    if (s.gnssSpeed > 0.05) s.gnssPhase = (s.gnssPhase + 0.025 * s.gnssSpeed) % (Math.PI * 2);
    const course = (s.gnssPhase * 180 / Math.PI) % 360;
    // Measurement noise grows as the signal degrades: this is what the deviation plot shows.
    const noise = 0.6 + Math.max(0, -(s.gnssSnrAdj || 0)) * 0.5;   // metres
    const jit = (m) => (Math.random() - 0.5) * 2 * m;
    const lat = s.gnssLat + 0.0009 * Math.sin(s.gnssPhase) + jit(noise) / 111320;
    const lon = s.gnssLon + 0.0012 * Math.cos(s.gnssPhase) + jit(noise) / (111320 * Math.cos(s.gnssLat * Math.PI / 180));
    const hdop = (0.8 + noise * 0.25).toFixed(1);
    const pdop = (1.6 + noise * 0.4).toFixed(1);
    const vdop = (1.4 + noise * 0.3).toFixed(1);
    const out = [];
    const emit = (id, build) => { if ((s.gnssRates[id] || 0) > 0 && (s.gnssEpoch % s.gnssRates[id]) === 0) out.push(build()); };
    const d = new Date();
    const hhmmss = String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + String(d.getUTCSeconds()).padStart(2, '0') + '.000';
    const ddmmyy = String(d.getUTCDate()).padStart(2, '0') + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCFullYear() % 100).padStart(2, '0');

    emit('GGA', () => nmeaFrame(`GNGGA,${hhmmss},${degToNmea(lat, 'lat')},${degToNmea(lon, 'lon')},${fix ? 1 : 0},${fix ? used.length : 0},${fix ? hdop : ''},${fix ? s.gnssAlt.toFixed(1) : ''},M,16.2,M,,`));
    emit('RMC', () => nmeaFrame(`GNRMC,${hhmmss},${fix ? 'A' : 'V'},${degToNmea(lat, 'lat')},${degToNmea(lon, 'lon')},${fix ? s.gnssSpeed.toFixed(2) : ''},${fix ? course.toFixed(1) : ''},${ddmmyy},,,${fix ? 'A' : 'N'}`));
    // GSA always carries 12 PRN slots, padded with empty fields: the DOPs are read by position.
    emit('GSA', () => {
      const prn = (fix ? used : []).slice(0, 12).map((sv) => String(sv[1]).padStart(2, '0'));
      while (prn.length < 12) prn.push('');
      return nmeaFrame(`GNGSA,A,${fix ? 3 : 1},${prn.join(',')},${pdop},${hdop},${vdop}`);
    });
    emit('VTG', () => nmeaFrame(`GNVTG,${fix ? course.toFixed(1) : ''},T,,M,${fix ? s.gnssSpeed.toFixed(2) : ''},N,${fix ? (s.gnssSpeed * 1.852).toFixed(2) : ''},K,${fix ? 'A' : 'N'}`));
    emit('ZDA', () => nmeaFrame(`GNZDA,${hhmmss},${String(d.getUTCDate()).padStart(2, '0')},${String(d.getUTCMonth() + 1).padStart(2, '0')},${d.getUTCFullYear()},00,00`));
    if ((s.gnssRates.GSV || 0) > 0 && (s.gnssEpoch % s.gnssRates.GSV) === 0) out.push(...this.gnssGsv(sky));

    s.gnssEpoch++;
    if (out.length) this.output(out.join('\r\n') + '\r\n');
  }

  /* GSV goes in bursts of up to 4 satellites per sentence, one burst per constellation. */
  gnssGsv(sky) {
    const lines = [];
    const byTalker = {};
    (sky || this.gnssSky()).forEach((sv) => { (byTalker[sv[0]] = byTalker[sv[0]] || []).push(sv); });
    Object.keys(byTalker).forEach((talker) => {
      const list = byTalker[talker];
      const total = Math.ceil(list.length / 4);
      for (let i = 0; i < total; i++) {
        const chunk = list.slice(i * 4, i * 4 + 4);
        const body = chunk.map((sv) => `${String(sv[1]).padStart(2, '0')},${sv[2]},${String(sv[3]).padStart(3, '0')},${sv[4]}`).join(',');
        lines.push(nmeaFrame(`${talker}GSV,${total},${i + 1},${list.length},${body},1`));
      }
    });
    return lines;
  }
}

// Decimal degrees → NMEA 'ddmm.mmmmm,H' (the inverse of nmeaCoord in core/nmea.js).
function degToNmea(v, kind) {
  const hemi = kind === 'lat' ? (v < 0 ? 'S' : 'N') : (v < 0 ? 'W' : 'E');
  const a = Math.abs(v), deg = Math.floor(a), min = (a - deg) * 60;
  const dd = String(deg).padStart(kind === 'lat' ? 2 : 3, '0');
  return `${dd}${min.toFixed(5).padStart(8, '0')},${hemi}`;
}

const _nmeaMix = Object.getOwnPropertyDescriptors(NmeaEmuMixin.prototype);
delete _nmeaMix.constructor;
Object.defineProperties(ATEmulator.prototype, _nmeaMix);

/* Default receiver state. Buenos Aires as the starting position, 1 Hz, every sentence on. */
registerEmuState(() => ({
  gnssOn: false, gnssFix: true, gnssEpoch: 0, gnssInterval: 1000, gnssPhase: 0,
  gnssLat: -34.60373, gnssLon: -58.38159, gnssAlt: 25.4, gnssSpeed: 0.8, gnssSnrAdj: 0,
  gnssRates: { GGA: 1, RMC: 1, GSA: 1, GSV: 1, VTG: 1, ZDA: 1 },
  gnssCons: { GP: true, GL: true, GA: true, GB: true },
}));

/* A profile whose identity declares kind:'gnss' is a receiver: it streams from the moment the
   virtual terminal opens, and stops if the terminal is switched to another module. */
registerEmuIdentity((emu) => {
  const isGnss = (emu.identity || {}).kind === 'gnss';
  emu.isGnss = isGnss;
  emu.silentUnknown = isGnss;   // a receiver ignores what it does not understand (no 'ERROR')
  if (isGnss) emu.gnssStart(); else emu.gnssStop();
});
