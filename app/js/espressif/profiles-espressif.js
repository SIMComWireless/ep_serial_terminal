// @ts-check
/* profiles-espressif.js — Espressif ESP module profiles (factory AT firmware): wizard drivers
   (TCP/HTTP/MQTT/DATA), quick-command tables and registrations for ESP8266, ESP32-C3 and
   ESP32-C6. Wi-Fi everywhere; BLE / native MQTT / HTTPCLIENT only on the ESP32-C3/C6 (AT v3).
   The registry (Profiles) lives in profiles.js; the ESP wizard renderers in
   wizards-espressif.js and the virtual-modem commands in emulator-espressif.js.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

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
/* Espressif ping: AT+PING="host" answers a single +PING per command, so the wizard
   repeats the command once per probe (perProbe). */
/** @type {PingDriver} */
const PING_ESP = {
  perProbe: true,
  start: (o) => `AT+PING="${o.host}"`,
  parse(line, o) {
    const m = line.match(/^\+PING:(\d+)/i);
    if (m) return { text: `${o.host}  rtt ${m[1]} ms` };
    if (/^\+PING:TIMEOUT/i.test(line)) return { text: 'timeout' };
    return null;
  },
};
/* ---- command lists the generic UI asks the profile for (see the Profile contract) ---- */
const DASH_ESP = ['AT+CWMODE?', 'AT+CWJAP?', 'AT+CIPSTA?', 'AT+CIPSTAMAC?'];
const DASH_ESP_V3 = [...DASH_ESP, 'AT+CWSTATE?'];   // CWSTATE only on AT v3 (C3 / C6)
const SIGPOLL_ESP = ['AT+CWJAP?'];                  // the RSSI of the associated AP
/* Incoming server: CIPSERVER, TCP only and it requires multi-connection mode (CIPMUX=1). */
/** @type {ServerDriver} */
const SRV_ESP = {
  modes: ['tcp'],
  start: (mode, port) => `AT+CIPMUX=1\n@300\nAT+CIPSERVER=1,${port}`,
  stop: () => 'AT+CIPSERVER=0',
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
  id: 'ESP8266', name: 'Espressif ESP8266 (Wi-Fi AT)', family: 'ESP', vendor: 'Espressif', category: 'Wi-Fi', chip: 'ESP8266EX',
  caps: ['wifi', 'tcpip'],
  identity: { manufacturer: 'Espressif', model: 'ESP8266', revision: 'AT 2.2.1', imei: '', band: 'Wi-Fi 2.4 GHz b/g/n', ati: ['ESP8266 AT firmware'] },
  gnss: GNSS_NONE, tcp: TCP_ESP, data: DATA_ESP, ping: PING_ESP, tcpServer: SRV_ESP, quick: QUICK_ESP_BASE, dashboard: DASH_ESP, signalPoll: SIGPOLL_ESP,
});
Profiles.register({
  id: 'ESP32-C3', name: 'Espressif ESP32-C3 (Wi-Fi 4 + BLE AT)', family: 'ESP', vendor: 'Espressif', category: 'Wi-Fi + BLE', chip: 'ESP32-C3',
  caps: ['wifi', 'ble', 'tcpip', 'http', 'mqtt'],
  identity: { manufacturer: 'Espressif', model: 'ESP32-C3', revision: 'AT 3.2.0', imei: '', band: 'Wi-Fi 4 2.4 GHz + BLE 5', ati: ['ESP32-C3 AT firmware'] },
  gnss: GNSS_NONE, tcp: TCP_ESP, http: HTTP_ESP, mqtt: MQTT_ESP, data: DATA_ESP, ping: PING_ESP, tcpServer: SRV_ESP, quick: QUICK_ESP32C6, dashboard: DASH_ESP_V3, signalPoll: SIGPOLL_ESP,
});
Profiles.register({
  id: 'ESP32-C6', name: 'Espressif ESP32-C6 (Wi-Fi 6 + BLE AT)', family: 'ESP', vendor: 'Espressif', category: 'Wi-Fi + BLE', chip: 'ESP32-C6',
  caps: ['wifi', 'ble', 'tcpip', 'http', 'mqtt'],
  identity: { manufacturer: 'Espressif', model: 'ESP32-C6', revision: 'AT 3.4.0', imei: '', band: 'Wi-Fi 6 2.4 GHz + BLE 5', ati: ['ESP32-C6 AT firmware'] },
  gnss: GNSS_NONE, tcp: TCP_ESP, http: HTTP_ESP, mqtt: MQTT_ESP, data: DATA_ESP, ping: PING_ESP, tcpServer: SRV_ESP, quick: QUICK_ESP32C6, dashboard: DASH_ESP_V3, signalPoll: SIGPOLL_ESP,
});
