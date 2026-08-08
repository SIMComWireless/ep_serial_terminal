/* at-parser-espressif.js — Espressif-specific AT parsing: the URC prefixes its factory AT
   firmware emits (ESP8266 / ESP32-C3 / ESP32-C6). Appended to the shared prefix list of
   at-parser.js so classify() tags those lines as 'urc'.
   Note the comma-separated shapes (+IPD,<link>,<len>:data) — classify() accepts ':', ' ' and ','.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

registerUrcPrefixes([
  // Wi-Fi station / SoftAP
  'WIFI CONNECTED', 'WIFI GOT IP', 'WIFI DISCONNECT', '+STA_CONNECTED', '+DIST_STA_IP',
  // TCP/IP: incoming data and per-link status
  '+IPD',
  // MQTT (AT v3)
  '+MQTTSUBRECV', '+MQTTCONNECTED', '+MQTTDISCONNECTED',
  // BLE (ESP32-C3 / C6): scan results, connections and GATT notifications
  '+BLESCAN', '+BLECONN', '+BLEGATTCNTFY',
]);
