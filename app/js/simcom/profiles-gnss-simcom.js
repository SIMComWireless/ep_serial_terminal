// @ts-check
/* profiles-gnss-simcom.js — SIMCom STANDALONE GNSS modules (not cellular).
   These are receivers, not AT modems: they stream NMEA 0183 on their own as soon as they are
   powered, and are configured with the proprietary sentences of their chip — so the profile
   points at a GnssChipDriver (airoha/gnss-airoha.js · icoe/gnss-icoe.js) instead of carrying
   AT commands, and the parsing is the standard one in core/nmea.js.

   Chip per module (the AT set is irrelevant here; what changes is the chip protocol):
     Airoha AG3352Q → SIM32EA · SIM32ELA · SIM65M
     ICOE   CC1167Q → SIM32EA-C · SIM65M-C
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* A standalone receiver has no AT layer: `stream` tells the GNSS wizard to listen instead of
   polling, and power/cold/warm/hot are NMEA sentences built by the chip driver.
   Sentences go out framed (nmeaFrame adds the *CS) so the user sees exactly what was sent. */
function gnssStreamDriver(chip) {
  const sent = (s) => (s ? nmeaFrame(s) : '');
  /** @type {GnssDriver} */
  const d = {
    supported: true, stream: true, satStream: true, chip,
    power: (on) => (chip.power ? sent(chip.power(on)) : ''),
    cold: sent(chip.cold), warm: sent(chip.warm), hot: sent(chip.hot),
    satStart: null, satStop: null,
    // The position does not come from a query: NmeaState builds it from the stream. These
    // stay defined so "route from log" and the shared wizard code keep working.
    info: '', infoRe: /\$G[NPLABQI][A-Z]{3},/,
    parseInfo: (line) => {
      if (!isNmea(line)) return null;
      const st = new NmeaState();
      st.feed(line);
      return st.fix.lat != null ? st.fix : null;
    },
  };
  return d;
}

const GNSS_AG3352Q = gnssStreamDriver(CHIP_AG3352Q);
const GNSS_CC1167Q = gnssStreamDriver(CHIP_CC1167Q);

/* Quick sentences every receiver understands (standard NMEA has no commands, so what is
   offered is the chip's own set plus, for an unmapped chip, nothing at all). */
const quickGnss = (chip) => ({ gnsschip: chip.quick || [] });

/* Identity of a GNSS module: there is no ATI/CGMM here, it is what the app shows in the header
   and what the emulator reads to know it must behave as a receiver (`kind`) and which chip
   command set to answer (`chipId`). */
const mkGnssId = (model, chip) => ({
  manufacturer: 'SIMCOM INCORPORATED', model, revision: model + '_V1.00', imei: '',
  band: 'GPS · GLONASS · Galileo · BDS · QZSS', ati: [model, chip.name],
  kind: 'gnss', chipId: chip.id,
});

const GNSS_CAPS = ['gnss', 'nmea'];
function regGnss(id, name, chip, gnss, note) {
  Profiles.register({
    id, name, family: 'GNSS', vendor: 'SIMCom', category: 'GNSS',
    chip: chip.name, bands: note, caps: GNSS_CAPS,
    identity: mkGnssId(id, chip),
    gnss, quick: quickGnss(chip),
    // No cellular dashboard and no signal poll: the header has nothing to query on a receiver.
    dashboard: [], signalPoll: [],
  });
}

/* ---- Airoha AG3352Q ---- */
regGnss('SIM65M', 'SIMCom SIM65M (GNSS, Airoha)', CHIP_AG3352Q, GNSS_AG3352Q, '47 channels · 1-10 Hz · LCC 18-pin');
regGnss('SIM32EA', 'SIMCom SIM32EA (GNSS, Airoha)', CHIP_AG3352Q, GNSS_AG3352Q, 'external antenna');
regGnss('SIM32ELA', 'SIMCom SIM32ELA (GNSS + antenna, Airoha)', CHIP_AG3352Q, GNSS_AG3352Q, 'embedded patch antenna');

/* ---- ICOE CC1167Q (proprietary command set pending — see icoe/gnss-icoe.js) ---- */
regGnss('SIM65M-C', 'SIMCom SIM65M-C (GNSS, ICOE)', CHIP_CC1167Q, GNSS_CC1167Q, '64 channels');
regGnss('SIM32EA-C', 'SIMCom SIM32EA-C (GNSS, ICOE)', CHIP_CC1167Q, GNSS_CC1167Q, 'external antenna');
