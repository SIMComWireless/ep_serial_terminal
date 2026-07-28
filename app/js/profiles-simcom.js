// @ts-check
/* profiles-simcom.js — SIMCom module profiles: quick-command overrides, driver stacks and
   registrations for the A76XX, SIM7600/A7600 (MDM9x07), SIM70x0 and SIM7022 families.
   The family drivers themselves (GNSS/TCP/HTTP/MQTT/DATA/FS) live in drivers.js; the
   registry (Profiles) lives in profiles.js.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* ---- quick-command overrides per divergent family (data/PDP, TCP/IP, HTTP, MQTT) ----
   Same format as data.js: [label, command, edit-flag?]. Labels are literals
   (technical, in English) because they are family-specific; the remaining groups (CSQ, CREG,
   COPS, CGDCONT, SMS…) are 3GPP and are shared from data.js with no override.
   Families (key = grp.wiz): data | tcpudp | http | mqtt */
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
const QUICK_SIM7022 = {   // SIM7022 (NB-IoT, SIM7020 family): stack CSOC + CHTTP* + CMQ*
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

// Driver bundles per family (what several profiles share). Extracting
// this avoids repeating the same driver line in every Profiles.register().
/** @type {ProfileStack} */
const STACK_A76XX   = { gnss: GNSS_A76XX,   tcp: TCP_A76XX,   http: HTTP_A76XX,   mqtt: MQTT_A76XX,   data: DATA_A76XX,   fs: FS_FSCD };
/** @type {ProfileStack} */
const STACK_SIM70X0 = { gnss: GNSS_SIM70X0, tcp: TCP_SIM70X0, http: HTTP_SIM70X0, mqtt: MQTT_SIM70X0, data: DATA_SIM70X0, fs: FS_CFS, quick: QUICK_SIM70X0 };

// SIM7600 / A7600 family = Qualcomm MDM9x07 (MDM9607 Cat-4 / MDM9207 Cat-1). At the AT level it shares
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
  id: 'A76XX', name: 'SIMCom A76XX (LTE Cat-1 bis + 2G + GNSS)', family: 'A76XX', chip: 'ASR1603',
  caps: ['cellular', 'gnss', 'tcpip', 'http', 'mqtt', 'ftp', 'ssl', 'voice', 'wifi', 'lbs', 'sms', 'fs', 'mail', 'lwm2m', 'coap'],
  identity: mkId('A7672E', 'A011B02A7672M7_V1.0', 'EUTRAN-BAND3'),
  ...STACK_A76XX,
});
Profiles.register({
  id: 'A7672SA-FASE', name: 'SIMCom A7672SA-FASE (A76XX + BLE, LATAM Bands)', family: 'A76XX', chip: 'ASR1603',
  caps: ['cellular', 'gnss', 'ble', 'tcpip', 'http', 'mqtt', 'ftp', 'ssl', 'voice', 'lbs', 'sms', 'fs', 'mail', 'lwm2m', 'coap'],
  identity: mkId('A7672SA-FASE', 'A011B02A7672M7_V1.0', 'EUTRAN-BAND4', ['SIMCOM_A7672SA-FASE', 'A7672SA-FASE-V1.0']),
  ...STACK_A76XX,   // A76XX family + BLE
});
/* ---- SIM7600 / A7600 family (Qualcomm MDM9x07) — regional variants (same AT set, different bands) ---- */
regMdm9x07('SIM7600', 'SIMCom SIM7600 / A7600', 'SIM7600G-H', 'EUTRAN-BAND7', 'multiband (global)');
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
