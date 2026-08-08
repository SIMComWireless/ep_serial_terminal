/* at-parser-simcom.js — SIMCom-specific AT parsing: the URC prefixes its firmwares emit on top
   of the 3GPP set (A76XX, SIM7600/A7600, SIM70x0, SIM7022). They are appended to the shared
   prefix list of at-parser.js, so classify() tags those lines as 'urc'.
   Grouped by area to make it obvious which family/stack each one belongs to.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

registerUrcPrefixes([
  // boot / SIM / time
  'RDY', 'PB DONE', 'SMS DONE', '+SIMCARD', '+PSUTTZ', '+CNTP',
  // TCP/IP stack A76XX / SIM7600 (NETOPEN / CIP*) and SSL (CCH*)
  '+CIPRXGET', '+IPCLOSE', '+RECEIVE', '+CIPOPEN', '+NETCLOSE',
  '+CCHOPEN', '+CCH_PEER_CLOSED', '+CCHEVENT',
  // TCP/IP stack SIM70x0 (CNACT / CA*) and SIM7022 (CSOC)
  '+APP PDP', '+CAOPEN', '+CAACK', '+CARECV', '+CASTATE', '+CSONMI',
  // HTTP: A76XX (HTTPACTION) · SIM70x0 (SHREQ) · SIM7022 (CHTTPNMI*)
  '+HTTPACTION', '+SHREQ', '+CHTTPNMIH', '+CHTTPNMIC',
  // MQTT: A76XX (CMQTT*) · SIM70x0 (SM*) · SIM7022 (CMQ*)
  '+CMQTTRXSTART', '+CMQTTRXTOPIC', '+CMQTTRXPAYLOAD', '+CMQTTRXEND', '+CMQTTCONNLOST',
  '+CMQTTCONNECT', '+CMQTTSUB', '+CMQTTPUB', '+SMSUB', '+SMPUB', '+CMQPUB',
  // GNSS · ping · DNS
  '+CGNSSPWR', '+CPING', '+CDNSGIP',
  // LwM2M and CoAP (A76XX)
  '+LWURC', '+COAPOPEN', '+COAPRECV',
  // BLE of the A76XX -FASE variants
  '+BLESCANRST', '+BLECCON', '+BLECDISC', '+BLESCON', '+BLEDISC',
]);
