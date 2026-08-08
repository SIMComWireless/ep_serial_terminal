/* emulator-icoe.js — virtual receiver: the proprietary command set of the ICOE CC1167Q.
   The standard NMEA transmitter (GGA/RMC/GSA/GSV/VTG/ZDA) lives in core/emulator-nmea.js;
   here only what is ICOE's own: $CFGNAV, $CFGMSG, $CFGSYS, $CFGPRT, $CFGNMEA, $CFGTP,
   $CFGWMODE, $RESET and the two version queries.
   Unlike Airoha there is no generic ack: a query is answered with the same sentence carrying
   the current values, and a configuration is simply applied.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

// $CFGMSG message ID → NMEA sentence (class 0), per the SIM65M-C user guide.
const ICOE_ID_TO_SENTENCE = { 0: 'GGA', 1: 'GLL', 2: 'GSA', 3: 'GSV', 4: 'RMC', 5: 'VTG', 6: 'ZDA', 7: 'GST', 8: 'GNS' };
// Bit of each constellation inside the $CFGSYS mask, and which talker it drives in the sim.
const ICOE_EMU_SYS = [['gps', 0, 'GP'], ['bds', 4, 'GB'], ['glo', 8, 'GL'], ['gal', 12, 'GA'], ['qzss', 16, null], ['sbas', 17, null]];

ATEmulator.prototype._handleIcoe = function (line) {
  const p = nmeaSplit(line);
  if (!p) return EMU_PASS;
  const s = this.state;
  const f = (i) => p.fields[i];
  const say = (sentence) => this.output(nmeaFrame(sentence) + '\r\n');
  // The guide accepts H-prefixed hex or plain decimal for the mask-like fields.
  const numArg = (v) => (/^h/i.test(v || '') ? parseInt(String(v).slice(1), 16) : parseInt(v, 10));

  switch (p.tag) {
    case 'CPDTINFO':
      return say(`CPDTINFO,${this.identity.model || 'SIM65M-C'},B01V01${this.identity.model || 'SIM65M-C'}_11`);
    case 'PDTINFO':
      return say('PDTINFO,CC1167Q,G1B1,V1.0,R4.0.0Build5428,,000101114303845');

    case 'RESET': {                                   // type 0 sw · 1 chip · 3 stop
      const type = parseInt(f(1), 10);
      if (type === 3) return this.gnssStop();         // stop: it goes quiet until the next reset
      const clr = numArg(f(2)) || 0;
      // bit0 clears ephemeris (warm), bit2 clears position/time as well (cold)
      const settle = (clr & 0x04) ? 5000 : ((clr & 0x01) ? 2500 : 0);
      if (settle) { s.gnssFix = false; this._later(settle, () => { s.gnssFix = true; }); }
      s.gnssEpoch = 0;
      return this.gnssStart();
    }

    case 'CFGNAV': {                                  // query without args, configure with them
      if (p.fields.length < 2) return say(`CFGNAV,${s.gnssInterval},${s.gnssInterval}`);
      const rate = parseInt(f(2) || f(1), 10);
      if (![100, 200, 250, 500, 1000].includes(rate)) return;   // out of range: the sentence is invalid
      this.gnssSetInterval(rate);
      return;
    }

    case 'CFGMSG': {                                  // class, id, rate
      const name = ICOE_ID_TO_SENTENCE[parseInt(f(2), 10)];
      const rate = parseInt(f(3), 10);
      if (parseInt(f(1), 10) !== 0 || !name || isNaN(rate)) return;
      s.gnssRates[name] = rate;
      return;
    }

    case 'CFGSYS': {                                  // one bit per constellation
      if (p.fields.length < 2) {
        let mask = 0;
        ICOE_EMU_SYS.forEach(([, bit, talker]) => { if (!talker || s.gnssCons[talker] !== false) mask |= (1 << bit); });
        return say(`CFGSYS,${mask}`);
      }
      const mask = numArg(f(1)) || 0;
      ICOE_EMU_SYS.forEach(([, bit, talker]) => { if (talker) s.gnssCons[talker] = !!((mask >> bit) & 1); });
      return;
    }

    case 'CFGPRT':                                    // port/baud: nothing to simulate, just accept it
      if (p.fields.length < 2) return say('CFGPRT,1,0,115200,1,3');
      s.gnssBaud = parseInt(f(3), 10) || s.gnssBaud;
      return;
    case 'CFGNMEA':
      if (p.fields.length < 2) return say(`CFGNMEA,${s.gnssNmeaVer || 'H51'}`);
      s.gnssNmeaVer = f(1);
      return;
    case 'CFGTP':
      if (p.fields.length < 2) return say('CFGTP,1000000,100000,1,0,0,0');
      return;
    case 'CFGWMODE':
      if (p.fields.length < 2) return say(`CFGWMODE,${s.gnssWmode != null ? s.gnssWmode : 4}`);
      s.gnssWmode = f(1);
      return;

    default: return EMU_PASS;
  }
};

registerEmuState(() => ({ gnssBaud: 115200, gnssNmeaVer: 'H51', gnssWmode: 4 }));

// Only for a virtual GNSS receiver whose chip is the ICOE one.
registerEmuHandler((emu, cmd) => (
  emu.isGnss && /CC\d{4}/.test((emu.identity || {}).chipId || '') ? emu._handleIcoe(cmd) : EMU_PASS
));
