// @ts-check
/* gnss-airoha.js — Airoha GNSS chips: the $PAIR proprietary protocol.
   PAIR is Airoha's own NMEA-aligned command set: every command is a standard NMEA sentence
   ($PAIR<id>[,<args>]*CS) and the chip answers with $PAIR001,<cmd>,<result>*CS.
   This is a CHIP vendor, not a module maker: the same AG3352Q sits inside modules from several
   brands, so the driver lives here and each module profile just points at it
   (see simcom/profiles-gnss-simcom.js).
   Used by: SIMCom SIM32EA, SIM32ELA and SIM65M (AG3352Q).
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* $PAIR001,<CmdID>,<Result> — the ack every command gets back. */
const PAIR_RESULT = { 0: 'OK', 1: 'unsupported command', 2: 'action failed', 3: 'busy' };

/* NMEA outputs whose rate PAIR062 can set, by their PAIR type index. */
/** @type {Array<[string, string]>} */
const PAIR_SENTENCES = [
  ['0', 'GGA'], ['1', 'GLL'], ['2', 'GSA'], ['3', 'GSV'],
  ['4', 'RMC'], ['5', 'VTG'], ['6', 'ZDA'], ['7', 'GRS'], ['8', 'GST'],
];

/** @type {GnssChipDriver} */
const CHIP_AG3352Q = {
  id: 'AG3352Q', name: 'Airoha AG3352Q', vendor: 'Airoha', proto: 'PAIR', commands: true,
  doc: 'Airoha PAIR command set (SIMCom SIM32/SIM65M Series NMEA Message User Guide)',
  sentences: PAIR_SENTENCES,
  rates: [['1000', '1 Hz'], ['500', '2 Hz'], ['200', '5 Hz'], ['100', '10 Hz']],
  sysList: [['gps', 'GPS'], ['glo', 'GLONASS'], ['gal', 'Galileo'], ['bds', 'BeiDou'], ['qzss', 'QZSS']],
  bauds: [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600],

  power: (on) => (on ? 'PAIR002' : 'PAIR003'),   // start / stop the navigation engine
  coldFull: 'PAIR004',                           // full cold start: clears everything (ephemeris, almanac, position, time)
  cold: 'PAIR005',
  warm: 'PAIR006',
  hot: 'PAIR007',
  fixRate: (ms) => `PAIR050,${ms}`,              // fix interval in ms (100 = 10 Hz)
  sentenceRate: (id, rate) => `PAIR062,${id},${rate}`,   // rate 0 = disable, N = one sentence every N fixes
  constellations: (s) => `PAIR066,${s.gps ? 1 : 0},${s.glo ? 1 : 0},${s.gal ? 1 : 0},${s.bds ? 1 : 0},${s.qzss ? 1 : 0},0`,
  baud: (b) => `PAIR864,0,0,${b}`,               // port type 0 (UART), port 0
  version: 'PAIR021',
  save: 'PAIR513',                               // persist the current configuration to NVRAM

  ackRe: /^\$PAIR001,/,
  parseAck(line) {
    const p = nmeaSplit(line);
    if (!p || p.tag !== 'PAIR001') return null;
    const code = parseInt(p.fields[2], 10);
    return { cmd: 'PAIR' + (p.fields[1] || '?'), ok: code === 0, text: PAIR_RESULT[code] || ('result ' + p.fields[2]) };
  },

  quick: [
    ['Engine ON', '$PAIR002'],
    ['Engine OFF', '$PAIR003'],
    ['Full cold start', '$PAIR004'],
    ['Cold start', '$PAIR005'],
    ['Warm start', '$PAIR006'],
    ['Hot start', '$PAIR007'],
    ['Fix rate 1 Hz', '$PAIR050,1000'],
    ['Fix rate 10 Hz', '$PAIR050,100'],
    ['Query fix rate', '$PAIR051'],
    ['GSV every fix', '$PAIR062,3,1'],
    ['GSV off', '$PAIR062,3,0'],
    ['Query sentence rate', '$PAIR063,__TYPE__', 1],
    ['All constellations', '$PAIR066,1,1,1,1,1,0'],
    ['GPS only', '$PAIR066,1,0,0,0,0,0'],
    ['Query constellations', '$PAIR067'],
    ['Firmware version', '$PAIR021'],
    ['Set baud 115200', '$PAIR864,0,0,115200'],
    ['Save to NVRAM', '$PAIR513'],
  ],
};

/* The $PAIR sentences the receiver sends on its own are parsed by core/nmea.js through this
   registration, so parseNmea() returns them already interpreted. */
registerNmeaProprietary('PAIR', (p) => {
  if (p.tag === 'PAIR001') {
    const code = parseInt(p.fields[2], 10);
    return { ack: true, cmd: 'PAIR' + (p.fields[1] || '?'), result: code, text: PAIR_RESULT[code] || null };
  }
  return { cmd: p.tag, args: p.fields.slice(1) };
});
