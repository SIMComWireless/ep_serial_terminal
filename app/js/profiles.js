// @ts-check
/* ============================================================
   Module profiles (driver pattern)
   ------------------------------------------------------------
   Each module (A76XX, SIM7600, SIM7080, ...) defines:
     - caps:  capacidades soportadas (gnss, tcpip, mqtt, voice, ...)
     - gnss:  driver with the AT commands and the PARSER of its response
              (field format/order differs a lot between modules)
   The MENUS (wizards) are reused; the implementation changes with the
   focused session's profile. To add a new module it's enough to call
   Profiles.register({...}) — see the example at the end of the file.
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

/* ---- quick-command overrides per divergent family (data/PDP, TCP/IP, HTTP, MQTT) ----
   Same format as data.js: [label, command, edit-flag?]. Labels are literals
   (technical, in English) because they are family-specific; the remaining groups (CSQ, CREG,
   COPS, CGDCONT, SMS…) are 3GPP and are shared from data.js with no override.
   Familias (clave = grp.wiz): data | tcpudp | http | mqtt */
/** @type {QuickTable} */
const QUICK_SIM70X0 = {   // SIM7070 / SIM7080 / SIM7090 (Cat-M/NB/GPRS): stack CNACT + CA* + SH* + SM*
  tcpudp: [
    ['Set PDP config (APN)', 'AT+CNCFG=0,1,"__APN__"', 1],
    ['Activate PDP (app)', 'AT+CNACT=0,1'],
    ['PDP status / IP', 'AT+CNACT?'],
    ['Deactivate PDP', 'AT+CNACT=0,0'],
    ['Open TCP', 'AT+CAOPEN=0,0,"TCP","__HOST__",__PORT__', 1],
    ['Open UDP', 'AT+CAOPEN=0,0,"UDP","__HOST__",__PORT__', 1],
    ['Send data (len)', 'AT+CASEND=0,__LEN__', 1],
    ['Receive data', 'AT+CARECV=0,1024'],
    ['Connection state', 'AT+CASTATE?'],
    ['Bytes acked', 'AT+CAACK=0'],
    ['Close', 'AT+CACLOSE=0'],
    ['SSL: bind context', 'AT+CASSLCFG=0,"SSL",1'],
  ],
  http: [
    ['Set URL', 'AT+SHCONF="URL","__URL__"', 1],
    ['Set body len', 'AT+SHCONF="BODYLEN",1024'],
    ['Set header len', 'AT+SHCONF="HEADERLEN",350'],
    ['Connect', 'AT+SHCONN'],
    ['Connected?', 'AT+SHSTATE?'],
    ['GET request', 'AT+SHREQ="__PATH__",1', 1],
    ['POST request', 'AT+SHREQ="__PATH__",3', 1],
    ['Read response', 'AT+SHREAD=0,__LEN__', 1],
    ['Disconnect', 'AT+SHDISC'],
  ],
  mqtt: [
    ['Broker URL', 'AT+SMCONF="URL","__HOST__","1883"', 1],
    ['Client ID', 'AT+SMCONF="CLIENTID","__CLIENTID__"', 1],
    ['Keepalive', 'AT+SMCONF="KEEPTIME",60'],
    ['Connect', 'AT+SMCONN'],
    ['Publish', 'AT+SMPUB="__TOPIC__",__LEN__,1,0', 1],
    ['Subscribe', 'AT+SMSUB="__TOPIC__",1', 1],
    ['Unsubscribe', 'AT+SMUNSUB="__TOPIC__"', 1],
    ['State', 'AT+SMSTATE?'],
    ['Disconnect', 'AT+SMDISC'],
  ],
};
/** @type {QuickTable} */
const QUICK_SIM7022 = {   // SIM7022 (NB-IoT, familia SIM7020): stack CSOC + CHTTP* + CMQ*
  tcpudp: [
    ['Attach PS', 'AT+CGATT=1'],
    ['Activate context', 'AT+CGACT=1,1'],
    ['Read dyn. params', 'AT+CGCONTRDP'],
    ['Create TCP socket', 'AT+CSOC=1,1,1'],
    ['Create UDP socket', 'AT+CSOC=1,2,1'],
    ['Connect', 'AT+CSOCON=0,__PORT__,"__HOST__"', 1],
    ['Send (hex)', 'AT+CSOSEND=0,__LEN__,"__HEXDATA__"', 1],
    ['Receive', 'AT+CSORCV=0,__LEN__', 1],
    ['Status', 'AT+CSOSTATUS=0'],
    ['Close', 'AT+CSOCL=0'],
  ],
  http: [
    ['Create client', 'AT+CHTTPCREATE="http://__HOST__/"', 1],
    ['Connect', 'AT+CHTTPCON=0'],
    ['GET', 'AT+CHTTPSEND=0,0,"__PATH__"', 1],
    ['POST', 'AT+CHTTPSEND=0,1,"__PATH__",,"__CTYPE__","__BODY__"', 1],
    ['Disconnect', 'AT+CHTTPDISCON=0'],
    ['Destroy', 'AT+CHTTPDESTROY=0'],
  ],
  mqtt: [
    ['New (broker)', 'AT+CMQNEW="__HOST__","1883",12000,1024', 1],
    ['Connect', 'AT+CMQCON=0,3,"__CLIENTID__",600,0,0', 1],
    ['Publish (hex)', 'AT+CMQPUB=0,"__TOPIC__",1,0,0,__LEN__,"__HEXMSG__"', 1],
    ['Subscribe', 'AT+CMQSUB=0,"__TOPIC__",1', 1],
    ['Unsubscribe', 'AT+CMQUNSUB=0,"__TOPIC__"', 1],
    ['Disconnect', 'AT+CMQDISCON=0'],
  ],
};

// Factory identity (for ATI/CGMM/CGMR/CGSN/SIMCOMATI of the SIMulator).
const mkId = (model, revision, band, ati) => ({ manufacturer: 'SIMCOM INCORPORATED', model, revision, imei: '860123040567890', band, ati: ati || ['SIMCOM_' + model, model + '-V1.0'] });

// Driver bundles per family (what several profiles share). Extracting
// this avoids repeating the same driver line in every Profiles.register().
/** @type {ProfileStack} */
const STACK_A76XX   = { gnss: GNSS_A76XX,   tcp: TCP_A76XX,   http: HTTP_A76XX,   mqtt: MQTT_A76XX,   data: DATA_A76XX,   fs: FS_FSCD };
/** @type {ProfileStack} */
const STACK_SIM70X0 = { gnss: GNSS_SIM70X0, tcp: TCP_SIM70X0, http: HTTP_SIM70X0, mqtt: MQTT_SIM70X0, data: DATA_SIM70X0, fs: FS_CFS, quick: QUICK_SIM70X0 };

// Familia SIM7600 / A7600 = Qualcomm MDM9x07 (MDM9607 Cat-4 / MDM9207 Cat-1). A nivel AT comparte
// the A76XX network stack (NETOPEN/CIP*/HTTP*/CMQTT*), but its GNSS is CGPS* (not CGNSS*).
/** @type {ProfileStack} */
const MDM9X07 = { ...STACK_A76XX, gnss: GNSS_SIM7600 };
const MDM_CAPS = ['cellular', 'gnss', 'tcpip', 'http', 'mqtt', 'ftp', 'ssl', 'voice', 'lbs', 'sms', 'fs'];
function regMdm9x07(id, name, model, band, bands, chip) {
  Profiles.register(Object.assign({
    id, name, family: 'mdm9x07', chip: chip || 'MDM9607', bands, caps: MDM_CAPS,
    identity: mkId(model, 'LE20B04SIM7600M22', band, [model, 'LE20B04SIM7600M22']),
  }, MDM9X07));
}

Profiles.register({
  id: 'none', name: 'None - raw serial', family: 'none', chip: 'raw', raw: true, caps: [],
  identity: mkId('Generic', 'RAW', 'EUTRAN-BAND1'),
});
Profiles.register({
  id: 'A76XX', name: 'SIMCom A76XX (LTE Cat-1 bis + 2G + GNSS)', family: 'A76XX', chip: 'ASR1603',
  caps: ['cellular', 'gnss', 'tcpip', 'http', 'mqtt', 'ftp', 'ssl', 'voice', 'wifi', 'lbs', 'sms', 'fs', 'mail', 'lwm2m', 'coap'],
  identity: mkId('A7672E', 'A011B02A7672M7_V1.0', 'EUTRAN-BAND3'),
  ...STACK_A76XX,
});
Profiles.register({
  id: 'A7672SA-FASE', name: 'SIMCom A7672SA-FASE (A76XX + BLE, LATAM Bands)', family: 'A76XX', chip: 'ASR1603',
  caps: ['cellular', 'gnss', 'ble', 'tcpip', 'http', 'mqtt', 'ftp', 'ssl', 'voice', 'lbs', 'sms', 'fs', 'mail', 'lwm2m', 'coap'],
  identity: mkId('A7672SA-FASE', 'A011B02A7672M7_V1.0', 'EUTRAN-BAND4', ['SIMCOM_A7672SA-FASE', 'A7672SA-FASE-V1.0']),
  ...STACK_A76XX,   // familia A76XX + BLE
});
/* ---- familia SIM7600 / A7600 (Qualcomm MDM9x07) — variantes regionales (mismo set AT, distintas bandas) ---- */
regMdm9x07('SIM7600', 'SIMCom SIM7600 / A7600', 'SIM7600G-H', 'EUTRAN-BAND7', 'multibanda (global)');
regMdm9x07('SIM7600E', 'SIMCom SIM7600E (EMEA)', 'SIM7600E-H', 'EUTRAN-BAND3', 'LTE B1/3/5/7/8/20/38/40/41 · WCDMA B1/8');
regMdm9x07('SIM7600G', 'SIMCom SIM7600G (Global)', 'SIM7600G-H', 'EUTRAN-BAND7', 'LTE B1/2/3/4/5/7/8/12/13/18/19/20/25/26/28/38/39/40/41/66');
regMdm9x07('SIM7600A', 'SIMCom SIM7600A (NA)', 'SIM7600A-H', 'EUTRAN-BAND2', 'LTE B2/4/12 · WCDMA B2/5');
regMdm9x07('SIM7600SA', 'SIMCom SIM7600SA (LATAM)', 'SIM7600SA', 'EUTRAN-BAND4', 'LTE B2/4/12 · WCDMA B2/5');
regMdm9x07('SIM7600CE', 'SIMCom SIM7600CE (China)', 'SIM7600CE-H', 'EUTRAN-BAND1', 'LTE B1/3/8/38/39/40/41 · TD-SCDMA');
regMdm9x07('A7600', 'SIMCom A7600C1', 'A7600C1', 'EUTRAN-BAND1', 'LTE B1/3/5/8 · WCDMA B1/8 (China)');

Profiles.register({
  id: 'SIM7070G', name: 'SIMCom SIM7070 (Cat-M/NB/GPRS)', family: 'SIM70x0', chip: 'MDM9205',
  caps: ['cellular', 'gnss', 'tcpip', 'http', 'mqtt', 'ssl', 'lbs', 'sms', 'fs'],
  identity: mkId('SIM7070G', '1951B11SIM7070', 'EUTRAN-BAND8'),
  ...STACK_SIM70X0,
});
Profiles.register({
  id: 'SIM7080G', name: 'SIMCom SIM7080 (Cat-M/NB)', family: 'SIM70x0', chip: 'MDM9205',
  caps: ['cellular', 'gnss', 'tcpip', 'http', 'mqtt', 'ssl', 'lbs', 'sms', 'fs'],
  identity: mkId('SIM7080G', '1951B11SIM7080', 'EUTRAN-BAND8'),
  ...STACK_SIM70X0,
});
Profiles.register({
  id: 'SIM7090G', name: 'SIMCom SIM7090 (Cat-M/NB)', family: 'SIM70x0', chip: 'MDM9205',
  caps: ['cellular', 'gnss', 'tcpip', 'http', 'mqtt', 'ssl', 'lbs', 'sms', 'fs'],
  identity: mkId('SIM7090G', '1951B11SIM7090', 'EUTRAN-BAND8'),
  ...STACK_SIM70X0,
});
Profiles.register({
  id: 'SIM7022', name: 'SIMCom SIM7022 (NB-IoT)', family: 'SIM7022', chip: 'NB-IoT',
  caps: ['cellular', 'tcpip', 'http', 'mqtt', 'ssl', 'sms'],   // no GNSS or voice
  identity: mkId('SIM7022', 'SIM7022_V1.0', 'NBIOT-BAND8'),
  smsPdu: true,   // NB-IoT firmware usually ships without SMS text mode → the wizard uses PDU (CMGF=0)
  gnss: GNSS_NONE, quick: QUICK_SIM7022, tcp: TCP_SIM7022, http: HTTP_SIM7022, mqtt: MQTT_SIM7022, data: DATA_SIM7022,
});

/* ---- Espressif ESP (factory AT firmware): Wi-Fi (+ BLE / MQTT / HTTP on ESP32-C6) ---- */
/** @type {TcpDriver} */
const TCP_ESP = {   // single connection (CIPMUX=0); incoming data arrives on its own as +IPD
  open(v) { const mode = v['wz-mode'] === 'UDP' ? 'UDP' : 'TCP'; return `AT+CIPMUX=0\n@200\nAT+CIPSTART="${mode}","${v['wz-host'] || ''}",${v['wz-port'] || '80'}`; },
  send(v) { const data = v['wz-data'] || ''; return `AT+CIPSEND=${byteLen(data)}\n@300\n${data}`; },
  read() { return 'AT+CIPSTATUS'; },   // there is no read command: the ESP pushes data as +IPD
  close() { return 'AT+CIPCLOSE'; },
};
/** @type {HttpDriver} */
const HTTP_ESP = {   // ESP32-C6 (AT v3): HTTPCLIENT (opt 2=GET 3=POST · content-type 0=form 1=json · transport 1=TCP 2=SSL)
  get(v) { const ssl = /^https/i.test(v['wz-url'] || '') ? 2 : 1; return `AT+HTTPCLIENT=2,0,"${v['wz-url'] || ''}",,,${ssl}`; },
  post(v) { const ssl = /^https/i.test(v['wz-url'] || '') ? 2 : 1; const ct = /json/i.test(v['wz-ctype'] || '') ? 1 : 0; return `AT+HTTPCLIENT=3,${ct},"${v['wz-url'] || ''}",,,${ssl},"${v['wz-hpost'] || ''}"`; },
};
/** @type {MqttDriver} */
const MQTT_ESP = {   // ESP32-C6 (AT v3): native MQTT via commands
  connect(v) { const cid = v['wz-cid'] || 'esp-demo'; return `AT+MQTTUSERCFG=0,1,"${cid}","${v['wz-muser'] || ''}","${v['wz-mpass'] || ''}",0,0,""\n@300\nAT+MQTTCONN=0,"${v['wz-broker'] || ''}",${v['wz-mport'] || '1883'},1`; },
  subscribe(v) { return `AT+MQTTSUB=0,"${v['wz-mtopic'] || ''}",${v['wz-mqos'] || '1'}`; },
  publish(v) { return `AT+MQTTPUB=0,"${v['wz-mtopic'] || ''}","${v['wz-mpayload'] || ''}",${v['wz-mqos'] || '1'},0`; },
  disconnect() { return 'AT+MQTTCLEAN=0'; },
};
/** @type {DataDriver} */
const DATA_ESP = {   // a "data session" on ESP = being associated to an AP with an assigned IP
  openCmd: 'AT+CWMODE=1', closeCmd: 'AT+CWQAP',
  async refresh(send) {
    const r = await send('AT+CIPSTA?');
    const m = (r.lines.find((l) => /\+CIPSTA:ip:/i.test(l)) || '').match(/\+CIPSTA:ip:"([^"]*)"/i);
    const ip = m && m[1] !== '0.0.0.0' ? m[1] : null;
    return { open: !!ip, ip };
  },
};
/** @type {QuickTable} */
const QUICK_ESP_BASE = {
  wifi: [
    ['Version', 'AT+GMR'],
    ['Wi-Fi mode?', 'AT+CWMODE?'],
    ['Station mode', 'AT+CWMODE=1'],
    ['Scan APs', 'AT+CWLAP'],
    ['Join AP', 'AT+CWJAP="__SSID__","__PASS__"', 1],
    ['Current AP?', 'AT+CWJAP?'],
    ['IP / gateway', 'AT+CIPSTA?'],
    ['MAC', 'AT+CIPSTAMAC?'],
    ['Disconnect AP', 'AT+CWQAP'],
    ['SoftAP config', 'AT+CWSAP="__SSID__","__PASS__",5,3', 1],
  ],
  tcpudp: [
    ['Status', 'AT+CIPSTATUS'],
    ['Open TCP', 'AT+CIPSTART="TCP","__HOST__",__PORT__', 1],
    ['Open UDP', 'AT+CIPSTART="UDP","__HOST__",__PORT__', 1],
    ['Send (len)', 'AT+CIPSEND=__LEN__', 1],
    ['Close', 'AT+CIPCLOSE'],
    ['Local IP', 'AT+CIFSR'],
    ['Multi-conn', 'AT+CIPMUX=1'],
    ['Server ON', 'AT+CIPSERVER=1,__PORT__', 1],
    ['Server OFF', 'AT+CIPSERVER=0'],
  ],
  ping: [
    ['Ping host', 'AT+PING="__HOST__"', 1],
    ['Ping 8.8.8.8', 'AT+PING="8.8.8.8"'],
  ],
};
/** @type {QuickTable} */
const QUICK_ESP32C6 = { ...QUICK_ESP_BASE,
  ble: [
    ['BLE init (client)', 'AT+BLEINIT=1'],
    ['BLE address?', 'AT+BLEADDR?'],
    ['Scan 3 s', 'AT+BLESCAN=1,3'],
    ['Stop scan', 'AT+BLESCAN=0'],
    ['Adv start', 'AT+BLEADVSTART'],
    ['Adv stop', 'AT+BLEADVSTOP'],
    ['BLE off', 'AT+BLEINIT=0'],
  ],
  mqtt: [
    ['User config', 'AT+MQTTUSERCFG=0,1,"__CLIENTID__","","",0,0,""', 1],
    ['Connect', 'AT+MQTTCONN=0,"__HOST__",1883,1', 1],
    ['Publish', 'AT+MQTTPUB=0,"__TOPIC__","__MSG__",1,0', 1],
    ['Subscribe', 'AT+MQTTSUB=0,"__TOPIC__",1', 1],
    ['Disconnect', 'AT+MQTTCLEAN=0'],
  ],
  http: [
    ['GET', 'AT+HTTPCLIENT=2,0,"__URL__",,,1', 1],
    ['POST (json)', 'AT+HTTPCLIENT=3,1,"__URL__",,,1,"__BODY__"', 1],
  ],
};
Profiles.register({
  id: 'ESP8266', name: 'Espressif ESP8266 (Wi-Fi AT)', family: 'ESP', chip: 'ESP8266EX',
  caps: ['wifi', 'tcpip'],
  identity: { manufacturer: 'Espressif', model: 'ESP8266', revision: 'AT 2.2.1', imei: '', band: 'Wi-Fi 2.4 GHz b/g/n', ati: ['ESP8266 AT firmware'] },
  gnss: GNSS_NONE, tcp: TCP_ESP, data: DATA_ESP, quick: QUICK_ESP_BASE,
});
Profiles.register({
  id: 'ESP32-C3', name: 'Espressif ESP32-C3 (Wi-Fi 4 + BLE AT)', family: 'ESP', chip: 'ESP32-C3',
  caps: ['wifi', 'ble', 'tcpip', 'http', 'mqtt'],
  identity: { manufacturer: 'Espressif', model: 'ESP32-C3', revision: 'AT 3.2.0', imei: '', band: 'Wi-Fi 4 2.4 GHz + BLE 5', ati: ['ESP32-C3 AT firmware'] },
  gnss: GNSS_NONE, tcp: TCP_ESP, http: HTTP_ESP, mqtt: MQTT_ESP, data: DATA_ESP, quick: QUICK_ESP32C6,
});
Profiles.register({
  id: 'ESP32-C6', name: 'Espressif ESP32-C6 (Wi-Fi 6 + BLE AT)', family: 'ESP', chip: 'ESP32-C6',
  caps: ['wifi', 'ble', 'tcpip', 'http', 'mqtt'],
  identity: { manufacturer: 'Espressif', model: 'ESP32-C6', revision: 'AT 3.4.0', imei: '', band: 'Wi-Fi 6 2.4 GHz + BLE 5', ati: ['ESP32-C6 AT firmware'] },
  gnss: GNSS_NONE, tcp: TCP_ESP, http: HTTP_ESP, mqtt: MQTT_ESP, data: DATA_ESP, quick: QUICK_ESP32C6,
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

