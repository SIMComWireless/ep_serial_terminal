/* live-espressif.js — Espressif ESP "live" telemetry parsers for the instrument strip:
   Wi-Fi mode / associated AP / connection state / IP / MAC and the WIFI * URCs. They are
   merged into the shared `Live` prefix map (live.js); Session.onLine dispatches by prefix,
   so joining the map at load time is all it takes.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

Object.assign(Live, {
  '+CWMODE': (line, ui) => {
    const m = line.match(/\+CWMODE:\s*(\d)/i);
    if (m) ui.set('g-wmode', { 1: 'Station', 2: 'SoftAP', 3: 'STA+AP' }[m[1]] || m[1]);
  },
  '+CWJAP': (line, ui) => {   // +CWJAP:"ssid","bssid",<ch>,<rssi>
    const m = line.match(/\+CWJAP:\s*"([^"]*)","[^"]*",(\d+),(-?\d+)/i);
    if (!m) return;
    ui.set('g-ssid', m[1]); ui.set('g-chan', m[2]);
    const dbm = Number(m[3]);
    ui.set('g-rssi', dbm + ' dBm');
    ui.signal({ dbm, bars: Math.max(1, Math.min(5, Math.round((dbm + 90) / 60 * 5))) });
    sigPush(ui, { rssi: dbm });   // on ESP the monitor charts the RSSI of the associated AP
  },
  '+CWSTATE': (line, ui) => {   // +CWSTATE:<state>,"ssid" (AT v3)
    const m = line.match(/\+CWSTATE:\s*(\d)(?:,"([^"]*)")?/i);
    if (!m) return;
    const st = { 0: 'idle', 1: 'no IP', 2: 'connected', 3: 'connecting', 4: 'disconnected' }[m[1]] || m[1];
    ui.set('g-wstate', st, m[1] === '2' ? 'ok' : (m[1] === '4' ? 'err' : 'warn'));
    if (m[2]) ui.set('g-ssid', m[2]);
  },
  '+CIPSTA': (line, ui) => {   // +CIPSTA:ip:"..." / gateway:"..."
    let m = line.match(/\+CIPSTA:ip:"([^"]*)"/i);
    if (m) { if (m[1] !== '0.0.0.0') ui.set('g-ip', m[1]); return; }
    m = line.match(/\+CIPSTA:gateway:"([^"]*)"/i);
    if (m && m[1] !== '0.0.0.0') ui.set('g-gw', m[1]);
  },
  '+CIPSTAMAC': (line, ui) => { const m = line.match(/\+CIPSTAMAC:"([^"]*)"/i); if (m) ui.set('g-mac', m[1]); },
  'WIFI CONNECTED': (line, ui) => ui.set('g-wstate', 'connected', 'ok'),
  'WIFI GOT IP': (line, ui) => ui.set('g-wstate', 'got IP', 'ok'),
  'WIFI DISCONNECT': (line, ui) => {   // on disassociation, stale Wi-Fi telemetry out
    ui.set('g-wstate', 'disconnected', 'err');
    ui.set('g-ssid', '—'); ui.set('g-chan', '—'); ui.set('g-ip', '—'); ui.set('g-gw', '—');
    ui.signal(null);
  },
});
