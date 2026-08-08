/* Data: menu/wizard definitions — no AT commands.
   QUICK only carries the MENU METADATA of each group (i18n name, wizard id, required cap).
   The command lists are vendor-specific and come from the profile: simcom/quick-simcom.js
   and espressif/profiles-espressif.js publish them, and the sidebar/AT-commands combo read
   them with (profile.quick && profile.quick[wizId]) — see wizards-core.js and app.js.
   (part of the AT console · classic script, shared global scope — concatenated in order) */
const QUICK = [
  { nameKey:'macros', open:true, wiz:'macros', items:[] },
  { nameKey:'grp0', wiz:'basics', cap:'cellular', items:[] },   // Basics / Network unified (includes the old grp2)
  { nameKey:'grp1', wiz:'sim', cap:'cellular', items:[] },
  { nameKey:'grp24', wiz:'ping', cap:'tcpip', items:[] },   // Ping (CPING) — its own wizard, separate from TCP/UDP
  { nameKey:'grp4', wiz:'tcpudp', cap:'tcpip', items:[] },   // (absorbs IPADDR from the old Data group; the rest was duplicated)
  { nameKey:'grp5', wiz:'http', cap:'http', items:[] },
  { nameKey:'grp6', wiz:'ftp', cap:'ftp', items:[] },
  { nameKey:'grp7', wiz:'mqtt', cap:'mqtt', items:[] },
  { nameKey:'grp22', wiz:'lwm2m', cap:'lwm2m', items:[] },   // LwM2M (AT+LW*, A76xx only) — literal technical labels
  { nameKey:'grp23', wiz:'coap', cap:'coap', items:[] },   // CoAP (AT+COAP*, A76xx only)
  { nameKey:'grp8', wiz:'fs', cap:'fs', items:[] },
  { nameKey:'grp9', wiz:'gnss', cap:'gnss', items:[] },
  { nameKey:'grp10', wiz:'lbs', cap:'lbs', items:[] },
  { nameKey:'grp11', wiz:'sms', cap:'sms', items:[] },
  { nameKey:'grp12', wiz:'tls', cap:'ssl', items:[] },
  { nameKey:'grp13', wiz:'time', cap:'cellular', items:[] },
  { nameKey:'grp15', wiz:'hw', cap:'cellular', items:[] },   // Hardware unificado (incluye Serial/UART, antes grp14)
  { nameKey:'grp16', wiz:'wifi', cap:'wifi', items:[] },
  { nameKey:'grp17', wiz:'jam', cap:'cellular', items:[] },
  { nameKey:'grp18', wiz:'mail', cap:'mail', items:[] },
  { nameKey:'grp19', wiz:'pb', cap:'voice', items:[] },
  { nameKey:'grp20', wiz:'voice', cap:'voice', items:[] },
  { nameKey:'grp25', wiz:'sig', items:[] },   // Signal monitor: no loose commands (the wizard polls on its own)
  { nameKey:'grp21', wiz:'ble', cap:'ble', items:[] },
  { nameKey:'grp26', wiz:'gnsschip', cap:'nmea', items:[] },   // standalone GNSS receiver: proprietary sentences of its chip
];

/* Sidebar layout: order and grouping into categories (decoupled from QUICK, which only
   defines the commands). Each entry is a loose item { wiz } or a category { cat, items }
   whose children are indented. Item names come from their QUICK group's nameKey. */
const SIDEBAR = [
  { wiz: 'macros' },
  { cat: 'cat_cellular', items: ['sim', 'basics', 'sig', 'sms', 'voice', 'pb'] },   // Signal monitor between Network and SMS
  { cat: 'cat_protocols', items: ['ping', 'tcpudp', 'http', 'mail', 'ftp', 'mqtt', 'lwm2m', 'coap'] },
  { cat: 'cat_security', items: ['tls'] },
  { cat: 'cat_wifi', items: ['wifi'] },
  { wiz: 'ble' },
  { cat: 'cat_location', items: ['lbs', 'gnss'] },
  { wiz: 'fs' },
  { wiz: 'time' },
  { wiz: 'hw' },
  { wiz: 'jam' },
];

// Sidebar layout for Espressif modules: Macros · Signal monitor · Wi-Fi · Protocols · Bluetooth.
// (buildSidebar picks this layout when the family is ESP; the single-child Wi-Fi category is flattened.)
// Sidebar layout for standalone GNSS receivers: they have no cellular, no IP stack and no AT
// layer — only the live NMEA view and the configuration of their chip.
const SIDEBAR_GNSS = [
  { wiz: 'macros' },
  { wiz: 'gnss' },        // flat, no categories: a receiver only has these three entries
  { wiz: 'gnsschip' },
];

const SIDEBAR_ESP = [
  { wiz: 'macros' },
  { wiz: 'sig' },   // charts the RSSI of the associated AP
  { cat: 'cat_wifi', items: ['wifi'] },
  { cat: 'cat_protocols', items: ['ping', 'tcpudp', 'http', 'mail', 'ftp', 'mqtt', 'lwm2m', 'coap'] },
  { wiz: 'ble' },
];

const MACROS = [
  { name:'Module health check', text:"# Module health check\nAT\n@100\nAT+GMR" },
  // { name:'Module health check', text:"# Module health check\nAT\n@100\nAT+GMR" }, 
  // add more macros...
];

const wt = (k) => t('wz_' + k);
const WIZARDS = [
  { id:'gnsschip', title:'Configuration', render: (host) => renderGnssChip(host) },   // proprietary sentences of the receiver chip
  { id:'ping', title:'ICMP (PING)', render: (host) => renderTcpExtras(host) },   // Red/IP + Ping configurable
  { id:'tcpudp', title:'TCP / UDP', formTitle:'Socket',
    extra:(host) => renderTcpServer(host),        // TCP/UDP server BELOW the Socket form
    fields:[
      { key:'mode', id:'wz-mode', type:'select', opts:['TCP','UDP'], val:'TCP' },
      { key:'link', id:'wz-link', type:'number', val:'0' },
      { key:'host', id:'wz-host', type:'text', ph:'example.com' },
      { key:'port', id:'wz-port', type:'number', val:'80' },
      { key:'localport', id:'wz-lport', type:'number', ph:'auto' },
      { key:'ssl', id:'wz-ssl', type:'checkbox' },
      { key:'data', id:'wz-data', type:'text', ph:'hello', full:true },
    ], actions:[
      { key:'open', go:true, build:(v) => pdrv('tcp').open(v) },
      { key:'send', build:(v) => pdrv('tcp').send(v) },
      { key:'read', build:(v) => pdrv('tcp').read(v) },
      { key:'close', build:(v) => pdrv('tcp').close(v) },
    ] },
  { id:'mqtt', title:'MQTT', fields:[
      { key:'broker', id:'wz-broker', type:'text', ph:'test.mosquitto.org' },
      { key:'port', id:'wz-mport', type:'number', val:'1883' },
      { key:'clientid', id:'wz-cid', type:'text', ph:'simcom-demo' },
      { key:'ssl', id:'wz-mssl', type:'checkbox' },
      { key:'user', id:'wz-muser', type:'text', ph:'—' },
      { key:'pass', id:'wz-mpass', type:'text', ph:'—' },
      { key:'topic', id:'wz-mtopic', type:'text', ph:'dev/test' },
      { key:'qos', id:'wz-mqos', type:'select', opts:['0','1','2'], val:'1' },
      { key:'payload', id:'wz-mpayload', type:'text', ph:'hello', full:true },
    ], actions:[
      { key:'connect', go:true, build:(v) => pdrv('mqtt').connect(v) },
      { key:'subscribe', build:(v) => pdrv('mqtt').subscribe(v) },
      { key:'publish', build:(v) => pdrv('mqtt').publish(v) },
      { key:'disconnect', build:(v) => pdrv('mqtt').disconnect(v) },
    ] },
  { id:'http', title:'HTTP', fields:[
      { key:'url', id:'wz-url', type:'text', ph:'http://example.com', full:true },
      { key:'method', id:'wz-method', type:'select', opts:['GET','POST'], val:'GET' },
      { key:'ctype', id:'wz-ctype', type:'select', opts:['application/json','text/plain','application/x-www-form-urlencoded'], val:'application/json' },
      { key:'ssl', id:'wz-hssl', type:'checkbox' },
      { key:'postdata', id:'wz-hpost', type:'text', ph:'{"k":1}', full:true },
    ], actions:[
      { key:'get', go:true, build:(v) => pdrv('http').get(v) },
      { key:'post', build:(v) => pdrv('http').post(v) },
    ] },
  { id:'lwm2m', title:'LwM2M', cap:'lwm2m', render: (host) => renderLwm2m(host) },
  { id:'coap', title:'CoAP', cap:'coap', render: (host) => renderCoap(host) },
  { id:'ftp', title:'FTP', cap:'ftp', render: (host) => renderFtp(host) },
  { id:'macros', title:'Macros', render: (host) => renderMacros(host) },
  { id:'fs', title:'File System', render: (host) => renderFsBrowser(host) },
  { id:'gnss', title:'GNSS', render: (host) => renderGnss(host) },
  { id:'lbs', title:'LBS', render: (host) => renderLbs(host) },
  { id:'sms', title:'SMS', render: (host) => renderSms(host) },
  { id:'wifi', title:'Wi-Fi scan', render: (host) => renderWifi(host) },
  { id:'ble', title:'Bluetooth', render: (host) => renderBle(host) },
  { id:'sig', title:'Signal monitor', render: (host) => renderSigMon(host) },
  { id:'hw', title:'Hardware', render: (host) => renderHw(host) },
  { id:'basics', title:'Network', render: (host) => renderBasics(host) },
  { id:'sim', title:'SIM card', render: (host) => renderSim(host) },
  { id:'time', title:'Date and time', render: (host) => renderTime(host) },
  { id:'tls', title:'SSL', render: (host) => renderTls(host) },
  { id:'jam', title:'Jamming detection', render: (host) => renderJam(host) },
  { id:'mail', title:'SMTP (E-MAIL)', render: (host) => renderMail(host) },
  { id:'pb', title:'Phonebook', render: (host) => renderPhonebook(host) },
  { id:'voice', title:'Voice calls', render: (host) => renderVoice(host) },
];
