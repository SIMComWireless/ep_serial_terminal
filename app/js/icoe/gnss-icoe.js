// @ts-check
/* gnss-icoe.js — ICOE GNSS chips (CC1167Q): its proprietary NMEA command set.
   Used by: SIMCom SIM65M-C and SIM32EA-C.

   ICOE does NOT follow the usual "$P + vendor mnemonic" convention: its sentences are named
   after what they do ($CFGNAV, $CFGMSG, $CFGSYS, $RESET, $CPDTINFO…), which is why core/nmea.js
   matches proprietary handlers on the whole tag instead of on a leading P.
   The checksum is optional on input — we always send it anyway (nmeaFrame adds it).

   Source: SIMCom "SIM65M-C Series_NMEA Message_User Guide" V1.00 (2024-04-24), §2.4.
   Only documented values are used here; anything the guide leaves open (a full-cold clrMask,
   an ACK sentence) is deliberately absent rather than guessed.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* $CFGMSG,<class>,<id>,<rate> — class 0 is the NMEA output group. Rate is one sentence every
   N fixes (0 = off), relative to the navigation rate set with CFGNAV.
   GBS is left out on purpose: the guide prints ID 8 for both GNS and GBS. */
/** @type {Array<[string, string]>} */
const ICOE_SENTENCES = [
  ['0', 'GGA'], ['1', 'GLL'], ['2', 'GSA'], ['3', 'GSV'],
  ['4', 'RMC'], ['5', 'VTG'], ['6', 'ZDA'], ['7', 'GST'], ['8', 'GNS'],
];

/* $CFGSYS,<sysMask> — one bit per constellation/frequency. The CC1167Q in the SIM65M-C is
   documented as GPS L1CA + BDS B1I + GALILEO E1 + QZSS + SBAS. */
const ICOE_SYS_BIT = { gps: 0, glo: 8, bds: 4, gal: 12, qzss: 16, sbas: 17 };
/** @type {Array<[string, string]>} */
const ICOE_SYS_LIST = [['gps', 'GPS L1C/A'], ['bds', 'BeiDou B1I'], ['gal', 'Galileo E1'], ['qzss', 'QZSS'], ['sbas', 'SBAS']];

/* $RESET,<type>,<clrMask> — type 0 = software reset · 1 = chip reset · 3 = stop.
   The guide lists the three usual clrMask values: H00 hot, H01 warm, H85 cold. */
const ICOE_RESET = { hot: 'H00', warm: 'H01', cold: 'H85' };

/** @type {GnssChipDriver} */
const CHIP_CC1167Q = {
  id: 'CC1167Q', name: 'ICOE CC1167Q', vendor: 'ICOE', proto: 'CFG', commands: true,
  doc: 'SIMCom SIM65M-C Series NMEA Message User Guide V1.00 §2.4',
  sentences: ICOE_SENTENCES,
  sysList: ICOE_SYS_LIST,
  // CFGNAV takes the measurement/navigation period in ms; the guide lists these five values.
  rates: [['1000', '1 Hz'], ['500', '2 Hz'], ['250', '4 Hz'], ['200', '5 Hz'], ['100', '10 Hz']],
  bauds: [9600, 115200, 230400, 460800, 921600],

  // There is no engine on/off: stopping is a reset of type 3, resuming is a hot software reset.
  power: (on) => (on ? `RESET,0,${ICOE_RESET.hot}` : 'RESET,3,H00'),
  hot: `RESET,0,${ICOE_RESET.hot}`,
  warm: `RESET,0,${ICOE_RESET.warm}`,
  cold: `RESET,0,${ICOE_RESET.cold}`,
  // No full-cold combination is documented, so none is offered.

  fixRate: (ms) => `CFGNAV,${ms},${ms}`,                       // measRate, navRate
  sentenceRate: (id, rate) => `CFGMSG,0,${id},${rate}`,
  constellations(sys) {
    let mask = 0;
    for (const [k, bit] of Object.entries(ICOE_SYS_BIT)) if (sys[k]) mask |= (1 << bit);
    return `CFGSYS,${mask}`;
  },
  baud: (b) => `CFGPRT,1,0,${b},1,3`,                          // UART1, addr 0, in UNICORE, out UNICORE+NMEA
  version: 'CPDTINFO',                                         // module name + firmware
  // The guide documents no save-to-NVRAM sentence, so the wizard shows no Save button.

  quick: [
    ['Module version', '$CPDTINFO'],
    ['Chip / platform version', '$PDTINFO'],
    ['Hot start', '$RESET,0,H00'],
    ['Warm start', '$RESET,0,H01'],
    ['Cold start', '$RESET,0,H85'],
    ['Stop receiver', '$RESET,3,H00'],
    ['Chip reset', '$RESET,1,H00'],
    ['Query nav rate', '$CFGNAV'],
    ['Nav rate 1 Hz', '$CFGNAV,1000,1000'],
    ['Nav rate 5 Hz', '$CFGNAV,200,200'],
    ['GSV on', '$CFGMSG,0,3,1'],
    ['GSV off', '$CFGMSG,0,3,0'],
    ['GST on', '$CFGMSG,0,7,1'],
    ['Configure message', '$CFGMSG,0,__ID__,__RATE__', 1],
    ['Constellations (SIM65M-C)', '$CFGSYS,200721'],
    ['GPS only', '$CFGSYS,1'],
    ['NMEA 4.1', '$CFGNMEA,H51'],
    ['NMEA 4.1X', '$CFGNMEA,H52'],
    ['Port 115200', '$CFGPRT,1,0,115200,1,3'],
    ['Query timing pulse', '$CFGTP'],
    ['Timing pulse 1 pps', '$CFGTP,1000000,100000,1,0,0,0'],
    ['Work mode: automatic', '$CFGWMODE,4'],
    ['Work mode: static', '$CFGWMODE,2'],
  ],
};

/* What the receiver sends back. There is no generic ACK sentence in the guide: a query is
   answered with the same sentence carrying the values, so each one is parsed on its own. */
registerNmeaProprietary('CPDTINFO', (p) => ({ cmd: 'CPDTINFO', module: p.fields[1] || null, firmware: p.fields[2] || null }));
registerNmeaProprietary('PDTINFO', (p) => ({
  cmd: 'PDTINFO', platform: p.fields[1] || null, config: p.fields[2] || null,
  hwVer: p.fields[3] || null, fwVer: p.fields[4] || null, pn: p.fields[5] || null, sn: p.fields[6] || null,
}));
registerNmeaProprietary('CFGNAV', (p) => ({ cmd: 'CFGNAV', measRate: parseInt(p.fields[1], 10) || null, navRate: parseInt(p.fields[2], 10) || null }));
registerNmeaProprietary('CFGMSG', (p) => ({ cmd: 'CFGMSG', msgClass: p.fields[1], msgId: p.fields[2], rate: p.fields[3] }));
registerNmeaProprietary('CFGSYS', (p) => {
  const mask = parseInt(p.fields[1], 10);
  const on = Object.entries(ICOE_SYS_BIT).filter(([, bit]) => (mask >> bit) & 1).map(([k]) => k);
  return { cmd: 'CFGSYS', mask, systems: on };
});
registerNmeaProprietary('CFGPRT', (p) => ({ cmd: 'CFGPRT', port: p.fields[1], baud: parseInt(p.fields[3], 10) || null }));
registerNmeaProprietary('CFGNMEA', (p) => ({ cmd: 'CFGNMEA', version: p.fields[1] }));
registerNmeaProprietary('CFGTP', (p) => ({ cmd: 'CFGTP', interval: parseInt(p.fields[1], 10) || null, length: parseInt(p.fields[2], 10) || null, flag: p.fields[3] }));
registerNmeaProprietary('CFGWMODE', (p) => ({ cmd: 'CFGWMODE', mode: p.fields[1] }));
registerNmeaProprietary('RESET', (p) => ({ cmd: 'RESET', type: p.fields[1], clrMask: p.fields[2] }));
