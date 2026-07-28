// @ts-check
/* ============================================================
   Module profiles (driver pattern) — REGISTRY
   ------------------------------------------------------------
   Each module (A76XX, SIM7600, ESP32-C6, ...) defines:
     - caps:  supported capabilities (gnss, tcpip, mqtt, voice, ...)
     - gnss:  driver with the AT commands and the PARSER of its response
              (field format/order differs a lot between modules)
   The MENUS (wizards) are reused; the implementation changes with the
   focused session's profile.

   This file holds only the registry and shared helpers. The actual
   module registrations live per vendor:
     - profiles-simcom.js     SIMCom families (A76XX, SIM7600/MDM9x07, SIM70x0, SIM7022)
     - profiles-espressif.js  Espressif ESP (8266, C3, C6)
   To add a new module it's enough to call Profiles.register({...}) from
   one of those files — see the example at the end of this one.
   ============================================================ */

/* ---- profile registry ---- */
const Profiles = (() => { const reg = new Map(); let order = [];
  return {
    /** @param {Profile} p @returns {Profile} */
    register(p) { if (!reg.has(p.id)) order.push(p.id); reg.set(p.id, p); return p; },
    /** @param {string} id @returns {Profile} */
    get(id) { return reg.get(id) || reg.get('A76XX'); },
    /** @returns {Profile[]} */
    list() { return order.map((id) => reg.get(id)); },
    has(id) { return reg.has(id); },
  };
})();
function profHasCap(p, c) { return !!(p && p.caps && p.caps.indexOf(c) >= 0); }

// Factory identity (for ATI/CGMM/CGMR/CGSN/SIMCOMATI of the SIMulator). SIMCom-branded
// default; Espressif profiles build their identity literal by hand.
const mkId = (model, revision, band, ati) => ({ manufacturer: 'SIMCOM INCORPORATED', model, revision, imei: '860123040567890', band, ati: ati || ['SIMCOM_' + model, model + '-V1.0'] });

// "None": raw serial console, no AT command list and no module assumptions.
Profiles.register({
  id: 'none', name: 'None - raw serial', family: 'none', chip: 'raw', raw: true, caps: [],
  identity: mkId('Generic', 'RAW', 'EUTRAN-BAND1'),
});

/* ------------------------------------------------------------
   EXAMPLE — how to add a new module (extensible):

   Profiles.register({
     id: 'my_module', name: 'My Module X', family: 'xyz',
     caps: ['gnss','tcpip','sms'],
     gnss: {
       supported: true, satStream: false,
       queryPower: 'AT+MIGPS?',
       parsePower: (line) => { const m = line.match(/\+MIGPS:\s*([01])/i); return m ? Number(m[1]) : null; },
       power: (on) => `AT+MIGPS=${on ? 1 : 0}`,
       info: 'AT+MIGPSINFO', infoRe: /\+MIGPSINFO:/i,
       parseInfo: (line) => ({ mode:'3', sats:0, lat:0, lon:0, alt:null, speed:null, hdop:null, utc:'' }),
       cold: 'AT+MIGPSCOLD', warm: 'AT+MIGPSWARM', hot: 'AT+MIGPSHOT',
       satStart: null, satStop: null,
     },
     // OPTIONAL — quick-command overrides for a divergent family. Without this, the
     // module uses the default A76XX commands (data.js). Key = grp.wiz; each item
     // is [label, command, edit-flag?] just like data.js (the __VARS__ get edited):
     quick: {
       tcpudp: [['Activate PDP', 'AT+MIACT=1'], ['Open TCP', 'AT+MIOPEN="__HOST__",__PORT__', 1], ['Send', 'AT+MISEND=__LEN__', 1]],
       http:   [['GET', 'AT+MIHTTP="__URL__"', 1]],
       mqtt:   [['Connect', 'AT+MIMQTT="__HOST__"', 1]],
     },
     // OPTIONAL — wizard (form) drivers. Each method receives the form values
     // (v) and returns a macro (\n commands; @NNN waits ms; >data after prompt).
     // Without this, the wizard uses the default A76XX driver.
     tcp:  { open:(v)=>`AT+MIOPEN="${v['wz-host']}",${v['wz-port']}`, send:(v)=>`AT+MISEND=${byteLen(v['wz-data']||'')}\n@300\n>${v['wz-data']||''}`, read:()=>`AT+MIRECV`, close:()=>`AT+MICLOSE` },
     http: { get:(v)=>`AT+MIHTTP="${v['wz-url']}"`, post:(v)=>`AT+MIHTTP="${v['wz-url']}","${v['wz-hpost']||''}"` },
     mqtt: { connect:(v)=>`AT+MIMQTT="${v['wz-broker']}"`, subscribe:(v)=>`AT+MISUB="${v['wz-mtopic']}"`, publish:(v)=>`AT+MIPUB="${v['wz-mtopic']}","${v['wz-mpayload']||''}"`, disconnect:()=>`AT+MIMQTTDISC` },
   });
   ------------------------------------------------------------ */
