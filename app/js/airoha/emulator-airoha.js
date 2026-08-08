/* emulator-airoha.js — virtual receiver: the $PAIR command set of the Airoha chips.
   The standard NMEA transmitter (GGA/RMC/GSA/GSV/VTG/ZDA) lives in core/emulator-nmea.js;
   here only what is Airoha's own: interpreting each $PAIR sentence, applying it to the
   simulated receiver and answering $PAIR001,<cmd>,<result>.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

// PAIR type index → NMEA sentence, the mapping $PAIR062 uses.
const PAIR_TYPE_TO_SENTENCE = { 0: 'GGA', 1: 'GLL', 2: 'GSA', 3: 'GSV', 4: 'RMC', 5: 'VTG', 6: 'ZDA' };

ATEmulator.prototype._handleAiroha = function (line) {
  const p = nmeaSplit(line);
  if (!p || !p.proprietary || !/^PAIR\d+/.test(p.tag)) return EMU_PASS;
  const s = this.state;
  const id = p.tag.slice(4);                 // '002', '050'…
  const arg = (i) => p.fields[i];
  const ack = (result) => this.output(nmeaFrame(`PAIR001,${id},${result}`) + '\r\n');
  const say = (sentence) => this.output(nmeaFrame(sentence) + '\r\n');

  switch (id) {
    case '002': s.gnssOn = true; this.gnssStart(); return ack(0);           // engine on
    case '003': this.gnssStop(); return ack(0);                             // engine off
    case '004': case '005':                                                 // full cold / cold start
      s.gnssFix = false; s.gnssEpoch = 0;
      this._later(4000, () => { s.gnssFix = true; });                       // it takes a while to fix again
      this.gnssStart(); return ack(0);
    case '006': s.gnssFix = false; this._later(2000, () => { s.gnssFix = true; }); this.gnssStart(); return ack(0);   // warm
    case '007': this.gnssStart(); return ack(0);                            // hot: it keeps the fix
    case '021': ack(0); return say(`PAIR021,${(this.identity.ati || [])[1] || 'AG3352Q'}_V1.00`);
    case '050': {                                                           // set fix interval (ms)
      const ms = parseInt(arg(1), 10);
      if (isNaN(ms) || ms < 100 || ms > 10000) return ack(2);
      this.gnssSetInterval(ms); return ack(0);
    }
    case '051': ack(0); return say(`PAIR051,${s.gnssInterval}`);            // query fix interval
    case '062': {                                                           // per-sentence output rate
      const type = arg(1), rate = parseInt(arg(2), 10);
      const name = PAIR_TYPE_TO_SENTENCE[type];
      if (!name || isNaN(rate)) return ack(2);
      s.gnssRates[name] = rate; return ack(0);
    }
    case '063': {                                                           // query sentence rate
      const name = PAIR_TYPE_TO_SENTENCE[arg(1)];
      if (!name) return ack(2);
      ack(0); return say(`PAIR063,${arg(1)},${s.gnssRates[name] || 0}`);
    }
    case '066': {                                                           // constellation search mask
      const on = (i) => arg(i) === '1';
      s.gnssCons = { GP: on(1), GL: on(2), GA: on(3), GB: on(4) };
      return ack(0);
    }
    case '067': ack(0);                                                     // query search mask
      return say(`PAIR067,${s.gnssCons.GP ? 1 : 0},${s.gnssCons.GL ? 1 : 0},${s.gnssCons.GA ? 1 : 0},${s.gnssCons.GB ? 1 : 0},1,0`);
    case '513': return ack(0);                                              // save to NVRAM
    case '864': return ack(0);                                              // port baud rate
    default: return ack(1);                                                 // unsupported command
  }
};

// Only for a virtual GNSS receiver whose chip is the Airoha one: an ICOE module must not
// answer $PAIR, and a cellular module never sees these sentences.
registerEmuHandler((emu, cmd) => (
  emu.isGnss && /AG\d{4}/.test((emu.identity || {}).chipId || '') ? emu._handleAiroha(cmd) : EMU_PASS
));
