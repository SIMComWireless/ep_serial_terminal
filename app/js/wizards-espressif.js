/* wizards-espressif.js — Espressif ESP wizard renderers: full Wi-Fi (CWMODE / CWJAP / CWLAP
   scan / SoftAP) and BLE (role, name, scan+connect, GATT client with read/write/notify,
   advertising). The dispatchers (renderWifi / renderBle in wizards-radio.js) route here when
   the focused profile family is ESP.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* ---- Espressif Wi-Fi (ESP8266 / ESP32-C6): CWMODE mode, CWJAP connection and CWLAP scan ---- */
const CWLAP_ENC = ['OPEN', 'WEP', 'WPA', 'WPA2', 'WPA/WPA2', 'WPA2-ENT', 'WPA3', 'WPA2/WPA3', 'WAPI', 'OWE'];
// +CWLAP:(<enc>,"<ssid>",<rssi>,"<mac>",<ch>,...)
function parseCwlap(lines) {
  const out = [];
  for (const l of lines) {
    const m = l.match(/\+CWLAP:\((\d+),"([^"]*)",(-?\d+),"([^"]*)",(\d+)/i);
    if (m) out.push({ enc: Number(m[1]), ssid: m[2], rssi: Number(m[3]), mac: m[4], ch: Number(m[5]) });
  }
  return out;
}
function renderWifiEsp(host) {
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const status = document.createElement('div'); status.className = 'fs-status';
  // modo Wi-Fi (CWMODE)
  const modeSeg = makeSeg([['1', 'Station'], ['2', 'SoftAP'], ['3', 'STA+AP']], (v) => { if (UI.connected) UI.sendCollect('AT+CWMODE=' + v); });
  const modeRow = document.createElement('div'); modeRow.className = 'hw-ctlrow';
  const modeLbl = document.createElement('span'); modeLbl.className = 'hw-ctllab'; modeLbl.textContent = t('net_mode');
  modeRow.append(modeLbl, modeSeg.el, mkBtn(t('hw_read'), () => readMode()));
  // connection to an AP (CWJAP / CWQAP)
  const ssid = document.createElement('input'); ssid.className = 'sms-to'; ssid.style.flex = '1 1 110px'; ssid.placeholder = 'SSID';
  const pass = document.createElement('input'); pass.className = 'sms-to'; pass.type = 'password'; pass.style.flex = '1 1 90px'; pass.placeholder = t('wz_pass');
  const joinRow = document.createElement('div'); joinRow.className = 'fs-bar';
  joinRow.append(ssid, pass,
    mkBtn(t('wz_connect'), async () => {
      if (!UI.connected) { status.textContent = t('log_notconn'); return; }
      const n = ssid.value.trim(); if (!n) return;
      status.textContent = '…';
      const r = await UI.sendCollect(`AT+CWJAP="${n}","${pass.value}"`, { timeout: 20000 });
      status.textContent = r.ok ? '' : t('fs_opfail');
    }),
    mkBtn(t('disconnect'), () => { if (UI.connected) UI.send('AT+CWQAP'); }),
  );
  // scan (CWLAP) — clicking a network loads it into the SSID field
  const scanBtn = mkBtn(t('wifi_scan'), scan);
  const scanRow = document.createElement('div'); scanRow.className = 'fs-bar'; scanRow.append(scanBtn);
  const list = document.createElement('div'); list.className = 'wifi-list';

  // --- SoftAP: create your own access point (CWSAP) ---
  const apSsid = document.createElement('input'); apSsid.className = 'sms-to'; apSsid.style.flex = '1 1 110px'; apSsid.placeholder = 'SSID'; apSsid.value = 'ESP-AP';
  const apPass = document.createElement('input'); apPass.className = 'sms-to'; apPass.type = 'password'; apPass.style.flex = '1 1 90px'; apPass.placeholder = t('wz_pass');
  const apCh = document.createElement('input'); apCh.type = 'number'; apCh.className = 'mac-delay'; apCh.value = '6'; apCh.min = '1'; apCh.max = '13'; apCh.title = 'channel';
  const apEnc = document.createElement('select'); apEnc.className = 'hw-sel';
  [['0', 'Open'], ['2', 'WPA-PSK'], ['3', 'WPA2-PSK'], ['4', 'WPA/WPA2-PSK']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; apEnc.appendChild(o); });
  apEnc.value = '3';
  const apRow1 = document.createElement('div'); apRow1.className = 'fs-bar'; apRow1.append(apSsid, apPass);
  const apRow2 = document.createElement('div'); apRow2.className = 'fs-bar';
  apRow2.append(apCh, apEnc,
    mkBtn(t('wifi_ap_start'), async () => {
      if (!UI.connected) { status.textContent = t('log_notconn'); return; }
      const n = apSsid.value.trim(); if (!n) return;
      const enc = apEnc.value, pw = enc === '0' ? '' : apPass.value;
      const mode = keepSta.checked ? 3 : 2;   // STA+AP keeps the station connection; pure SoftAP drops it
      status.textContent = '…';
      await runMacro(`AT+CWMODE=${mode}\n@200\nAT+CWSAP="${n}","${pw}",${apCh.value},${enc}`, 200);
      status.textContent = ''; modeSeg.set(String(mode));
    }),
    mkBtn(t('wifi_ap_read'), () => readAp()),
    mkBtn(t('wifi_ap_stations'), () => { if (UI.connected) UI.sendCollect('AT+CWLIF', { timeout: 6000 }); }),
  );
  const keepSta = document.createElement('input'); keepSta.type = 'checkbox'; keepSta.checked = true;
  const keepLbl = document.createElement('label'); keepLbl.className = 'gn-auto'; keepLbl.append(keepSta, document.createTextNode(' ' + t('wifi_ap_keepsta')));
  const apInfo = document.createElement('pre'); apInfo.className = 'fs-out'; apInfo.hidden = true;

  host.append(sec(t('net_mode')), modeRow, sec('Wi-Fi'), joinRow, scanRow, list,
    sec('SoftAP'), apRow1, apRow2, keepLbl, apInfo, status);

  async function readMode() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect('AT+CWMODE?');
    const m = (r.lines.find((l) => /\+CWMODE:/i.test(l)) || '').match(/\+CWMODE:\s*(\d)/i);
    if (m) modeSeg.set(m[1]);
  }
  async function readAp() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect('AT+CWSAP?');
    const m = (r.lines.find((l) => /\+CWSAP:/i.test(l)) || '').match(/\+CWSAP:"([^"]*)","([^"]*)",(\d+),(\d+)/i);
    if (m) { apSsid.value = m[1]; apPass.value = m[2]; apCh.value = m[3]; apEnc.value = m[4]; apInfo.hidden = true; }
    else { apInfo.hidden = false; apInfo.textContent = (r.lines.find((l) => /\+CWSAP/i.test(l)) || t('fs_opfail')); }
  }
  async function scan() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    scanBtn.disabled = true; status.textContent = t('wifi_scanning'); list.innerHTML = '';
    try {
      const r = await UI.sendCollect('AT+CWLAP', { timeout: 15000 });
      const aps = parseCwlap(r.lines).sort((a, b) => b.rssi - a.rssi);
      if (!aps.length) { const e = document.createElement('div'); e.className = 'gn-empty'; e.textContent = t('wifi_empty'); list.appendChild(e); status.textContent = ''; return; }
      aps.forEach((ap) => {
        const row = document.createElement('div'); row.className = 'wifi-item'; row.style.cursor = 'pointer';
        const info = document.createElement('div'); info.className = 'wifi-info';
        const nm = document.createElement('span'); nm.className = 'wifi-mac'; nm.textContent = ap.ssid || '(hidden)';
        const meta = document.createElement('span'); meta.className = 'wifi-meta'; meta.textContent = `${CWLAP_ENC[ap.enc] || ap.enc} · ch ${ap.ch} · ${ap.mac}`;
        info.append(nm, meta);
        const track = document.createElement('div'); track.className = 'wifi-track';
        const fill = document.createElement('div'); fill.className = 'wifi-fill';
        fill.style.width = Math.max(5, Math.min(100, (ap.rssi + 90) / 60 * 100)).toFixed(0) + '%';
        fill.style.background = wifiSigColor(ap.rssi);
        track.appendChild(fill);
        const dbm = document.createElement('span'); dbm.className = 'wifi-dbm'; dbm.textContent = ap.rssi + ' dBm';
        row.append(info, track, dbm);
        row.addEventListener('click', () => { ssid.value = ap.ssid; });
        list.appendChild(row);
      });
      status.textContent = `${aps.length}`;
    } finally { scanBtn.disabled = false; }
  }
  readMode();
}

// Extracts the local name (AD type 0x08 shortened / 0x09 complete) from the hex advertising data.
function bleAdvName(hex) {
  hex = (hex || '').replace(/[^0-9a-fA-F]/g, '');
  for (let i = 0; i + 4 <= hex.length;) {
    const len = parseInt(hex.substr(i, 2), 16); if (!len) break;
    const type = parseInt(hex.substr(i + 2, 2), 16);
    if (type === 0x09 || type === 0x08) {
      const data = hex.substr(i + 4, (len - 1) * 2); let s = '';
      for (let j = 0; j + 2 <= data.length; j += 2) { const c = parseInt(data.substr(j, 2), 16); if (c) s += String.fromCharCode(c); }
      if (s) return s;
    }
    i += 2 + len * 2;
  }
  return '';
}

/* ---- Espressif BLE (ESP32-C6): role, name, scan+connect, GATT services and advertising ---- */
function renderBleEsp(host) {
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const inp = (ph, flex) => { const i = document.createElement('input'); i.className = 'sms-to'; i.style.flex = flex || '1 1 110px'; if (ph) i.placeholder = ph; return i; };
  const status = document.createElement('div'); status.className = 'fs-status';
  const say = (x) => { status.textContent = x; };

  // --- role (BLEINIT) + address + name (BLENAME) ---
  const initSeg = makeSeg([['1', 'Client'], ['2', 'Server'], ['0', t('gn_off')]], (v) => { if (UI.connected) UI.sendCollect('AT+BLEINIT=' + v).then(() => refreshConns()); });
  const addrVal = document.createElement('span'); addrVal.className = 'fs-fd'; addrVal.textContent = 'MAC —';
  const initRow = document.createElement('div'); initRow.className = 'fs-bar';
  initRow.append(initSeg.el, mkBtn(t('hw_read'), readInit), addrVal);
  const nameInp = inp('ESP32-C6');
  const nameRow = document.createElement('div'); nameRow.className = 'fs-bar';
  nameRow.append(nameInp,
    mkBtn(t('net_apply'), () => { if (UI.connected && nameInp.value.trim()) UI.sendCollect(`AT+BLENAME="${nameInp.value.trim()}"`); }),
    mkBtn(t('hw_read'), readName));

  // --- scan & connect (BLESCAN → BLECONN) ---
  const scanBtn = mkBtn(t('wifi_scan'), scan);
  const scanRow = document.createElement('div'); scanRow.className = 'fs-bar'; scanRow.append(scanBtn);
  const list = document.createElement('div'); list.className = 'wifi-list';

  // --- conexiones activas (BLECONN? / BLEDISCONN) + servicios/características GATT ---
  const connBar = document.createElement('div'); connBar.className = 'fs-bar'; connBar.append(mkBtn(t('hw_read'), refreshConns));
  const connList = document.createElement('div'); connList.className = 'wifi-list';
  const gattBox = document.createElement('div'); gattBox.className = 'ble-gatt'; gattBox.hidden = true;   // services → characteristics tree

  // --- advertising (server): nombre + start/stop ---
  const advName = inp('ESP-BLE');
  const advRow = document.createElement('div'); advRow.className = 'fs-bar';
  advRow.append(advName, mkBtn('▶ ' + t('srv_start'), startAdv), mkBtn('■ ' + t('srv_stop'), () => { if (UI.connected) UI.send('AT+BLEADVSTOP'); }));

  host.append(
    sec('BLE'), initRow, nameRow,
    sec(t('ble_scan_connect')), scanRow, list,
    sec(t('ble_connections')), connBar, connList, gattBox,
    sec('Advertising'), advRow,
    status);

  const conns = new Map();   // conn_index → addr (conexiones activas)
  let stopScan = null, notifyTap = null;
  App.wiz.cleanup = () => { if (stopScan) stopScan(); if (notifyTap && UI.tap === notifyTap) UI.tap = null; };

  async function readInit() {
    if (!UI.connected) { say(t('log_notconn')); return; }
    const ri = await UI.sendCollect('AT+BLEINIT?');
    const mi = (ri.lines.find((l) => /\+BLEINIT:/i.test(l)) || '').match(/\+BLEINIT:\s*(\d)/i);
    if (mi) initSeg.set(mi[1]);
    const ra = await UI.sendCollect('AT+BLEADDR?');
    const ma = (ra.lines.find((l) => /\+BLEADDR:/i.test(l)) || '').match(/\+BLEADDR:\s*"?([0-9A-Fa-f:]+)/i);
    addrVal.textContent = 'MAC ' + (ma ? ma[1] : '—');
  }
  async function readName() {
    if (!UI.connected) { say(t('log_notconn')); return; }
    const r = await UI.sendCollect('AT+BLENAME?');
    const m = (r.lines.find((l) => /\+BLENAME:/i.test(l)) || '').match(/\+BLENAME:\s*"?([^"]*)"?/i);
    if (m) nameInp.value = m[1];
  }
  async function scan() {
    if (!UI.connected) { say(t('log_notconn')); return; }
    if (stopScan) stopScan();
    const found = new Map();   // addr → { rssi, name } (dedupe per device)
    const prevTap = UI.tap;
    const finish = () => { if (UI.focused) UI.tap = prevTap; stopScan = null; scanBtn.disabled = false; render(); };
    stopScan = finish;
    UI.tap = (line) => {
      const m = line.match(/\+BLESCAN:\s*"?([0-9A-Fa-f:]+)"?,(-?\d+),"?([0-9a-fA-F]*)"?/i);
      if (m) { const a = m[1].toLowerCase(); const prev = found.get(a) || {}; found.set(a, { rssi: Number(m[2]), name: bleAdvName(m[3]) || prev.name || '' }); }
      return false;
    };
    scanBtn.disabled = true; say(t('wifi_scanning')); list.innerHTML = '';
    const r = await UI.sendCollect('AT+BLESCAN=1,3', { timeout: 6000 });
    if (!r.ok) { finish(); say(t('fs_opfail')); return; }
    setTimeout(finish, 3600);
    function render() {
      list.innerHTML = '';
      if (!found.size) { const e = document.createElement('div'); e.className = 'gn-empty'; e.textContent = t('wifi_empty'); list.appendChild(e); say(''); return; }
      [...found.entries()].sort((a, b) => b[1].rssi - a[1].rssi).forEach(([addr, d]) => {
        const row = document.createElement('div'); row.className = 'wifi-item'; row.style.cursor = 'pointer'; row.title = t('wz_connect');
        const info = document.createElement('div'); info.className = 'wifi-info';
        const nm = document.createElement('span'); nm.className = 'wifi-mac'; nm.textContent = d.name || '(sin nombre)';
        const meta = document.createElement('span'); meta.className = 'wifi-meta'; meta.textContent = addr;
        info.append(nm, meta);
        const track = document.createElement('div'); track.className = 'wifi-track';
        const fill = document.createElement('div'); fill.className = 'wifi-fill';
        fill.style.width = Math.max(5, Math.min(100, (d.rssi + 100) / 60 * 100)).toFixed(0) + '%';
        fill.style.background = wifiSigColor(d.rssi);
        track.appendChild(fill);
        const dbm = document.createElement('span'); dbm.className = 'wifi-dbm'; dbm.textContent = d.rssi + ' dBm';
        row.append(info, track, dbm);
        row.addEventListener('click', () => connect(addr));
        list.appendChild(row);
      });
      say(`${found.size}`);
    }
  }
  async function connect(addr) {
    if (!UI.connected) { say(t('log_notconn')); return; }
    let idx = 0; while (conns.has(idx)) idx++;
    say(t('ble_connecting'));
    const r = await UI.sendCollect(`AT+BLECONN=${idx},"${addr}",0,10`, { timeout: 12000 });
    say(r.ok ? '' : t('fs_opfail'));
    refreshConns();
  }
  async function refreshConns() {
    if (!UI.connected) return;
    const r = await UI.sendCollect('AT+BLECONN?');
    conns.clear();
    r.lines.forEach((l) => { const m = l.match(/\+BLECONN:\s*(\d+),"?([0-9a-fA-F:]+)/i); if (m) conns.set(Number(m[1]), m[2].toLowerCase()); });
    renderConns();
  }
  function renderConns() {
    connList.innerHTML = '';
    if (!conns.size) { const e = document.createElement('div'); e.className = 'gn-empty'; e.textContent = t('ble_no_conn'); connList.appendChild(e); return; }
    [...conns.entries()].forEach(([idx, addr]) => {
      const row = document.createElement('div'); row.className = 'wifi-item';
      const nm = document.createElement('span'); nm.className = 'wifi-mac'; nm.style.flex = '1'; nm.textContent = `#${idx} · ${addr}`;
      row.append(nm, mkBtn(t('ble_services'), () => discover(idx)), mkBtn(t('disconnect'), () => disconnect(idx)));
      connList.appendChild(row);
    });
  }
  async function disconnect(idx) { if (UI.connected) { await UI.sendCollect(`AT+BLEDISCONN=${idx}`); gattBox.hidden = true; refreshConns(); } }
  // GATT client: primary services → characteristics, with per-characteristic Read / Write / Notify.
  // Property bitmask (ESP): 0x02 read · 0x08 write · 0x04 write-no-rsp · 0x10 notify · 0x20 indicate.
  async function discover(idx) {
    if (!UI.connected) { say(t('log_notconn')); return; }
    const r = await UI.sendCollect(`AT+BLEGATTCPRIMSRV=${idx}`, { timeout: 8000 });
    const srvs = r.lines.map((l) => l.match(/\+BLEGATTCPRIMSRV:\s*\d+,(\d+),"?([0-9a-fA-F]+)"?/i))
      .filter(Boolean).map((m) => ({ si: Number(m[1]), uuid: m[2] }));
    gattBox.hidden = false; gattBox.innerHTML = '';
    if (!srvs.length) { const e = document.createElement('div'); e.className = 'gn-empty'; e.textContent = t('wifi_empty'); gattBox.appendChild(e); return; }
    for (const sv of srvs) {
      const row = document.createElement('div'); row.className = 'ble-srv';
      const head = document.createElement('button'); head.className = 'ble-srvhead';
      head.textContent = `▸ srv ${sv.si} · ${sv.uuid}`;
      const chars = document.createElement('div'); chars.className = 'ble-chars'; chars.hidden = true;
      let loaded = false;
      head.addEventListener('click', async () => {
        chars.hidden = !chars.hidden;
        head.textContent = (chars.hidden ? '▸' : '▾') + ` srv ${sv.si} · ${sv.uuid}`;
        if (!chars.hidden && !loaded) { loaded = true; await loadChars(idx, sv.si, chars); }
      });
      row.append(head, chars); gattBox.appendChild(row);
    }
  }
  async function loadChars(idx, si, host) {
    host.innerHTML = '';
    const r = await UI.sendCollect(`AT+BLEGATTCCHAR=${idx},${si}`, { timeout: 8000 });
    const chars = r.lines.map((l) => l.match(/\+BLEGATTCCHAR:\s*"char",\d+,\d+,(\d+),"?([0-9a-fA-F]+)"?,(\d+)/i))
      .filter(Boolean).map((m) => ({ ci: Number(m[1]), uuid: m[2], prop: Number(m[3]) }));
    if (!chars.length) { const e = document.createElement('div'); e.className = 'gn-empty'; e.textContent = t('wifi_empty'); host.appendChild(e); return; }
    for (const ch of chars) {
      const row = document.createElement('div'); row.className = 'ble-char';
      const info = document.createElement('span'); info.className = 'ble-charinfo';
      const props = [ch.prop & 0x02 && 'R', ch.prop & 0x08 && 'W', ch.prop & 0x10 && 'N'].filter(Boolean).join('');
      info.textContent = `char ${ch.ci} · ${ch.uuid}${props ? ' [' + props + ']' : ''}`;
      const val = document.createElement('span'); val.className = 'ble-charval'; val.textContent = '';
      row.append(info, val);
      if (ch.prop & 0x02) row.appendChild(mkBtn(t('ble_read'), () => readChar(idx, si, ch.ci, val)));
      if (ch.prop & 0x08) row.appendChild(mkBtn(t('ble_write'), () => writeChar(idx, si, ch.ci)));
      if (ch.prop & 0x10) { const nb = mkBtn(t('ble_notify'), () => toggleNotify(idx, si, ch.ci, nb, val)); row.appendChild(nb); }
      host.appendChild(row);
    }
  }
  async function readChar(idx, si, ci, valEl) {
    const r = await UI.sendCollect(`AT+BLEGATTCRD=${idx},${si},${ci}`, { timeout: 6000 });
    const m = (r.lines.find((l) => /\+BLEGATTCRD:/i.test(l)) || '').match(/\+BLEGATTCRD:\s*\d+,\d+,"?([0-9a-fA-F]+)"?/i);
    valEl.textContent = m ? '= ' + m[1] : (r.ok ? '' : 'ERR');
  }
  async function writeChar(idx, si, ci) {
    const hex = prompt(t('ble_write_hex'), '48656c6c6f');   // default "Hello"
    if (hex == null) return;
    const clean = hex.replace(/[^0-9a-fA-F]/g, '');
    if (!clean) return;
    // len = bytes of the value; the module answers '> ' then we send the hex payload as-is
    runMacro(`AT+BLEGATTCWR=${idx},${si},${ci},,${Math.floor(clean.length / 2)}\n@200\n${clean}`, 150);
  }
  function toggleNotify(idx, si, ci, btn, valEl) {
    const on = !btn.classList.contains('on');
    btn.classList.toggle('on', on);
    if (on) {
      UI.sendCollect(`AT+BLEGATTCSUBSCRIBE=${idx},${si},${ci}`);
      const prev = UI.tap;
      notifyTap = (line) => {   // +BLEGATTCNTFY:<conn>,<srv>,<char>,<len>,<value>
        const m = line.match(new RegExp(`\\+BLEGATTCNTFY:\\s*${idx},${si},${ci},\\d+,"?([0-9a-fA-F]+)`, 'i'));
        if (m) { valEl.textContent = '⚡ ' + m[1]; return false; }
        return prev ? prev(line) : false;
      };
      UI.tap = notifyTap;
    } else {
      UI.sendCollect(`AT+BLEGATTCUNSUBSCRIBE=${idx},${si},${ci}`);
      if (UI.tap === notifyTap) UI.tap = null;
    }
  }
  function startAdv() {
    if (!UI.connected) { say(t('log_notconn')); return; }
    const nm = advName.value.trim();
    runMacro((nm ? `AT+BLENAME="${nm}"\n@150\nAT+BLEADVDATAEX="${nm}","",""，1\n@150\n`.replace('，', ',') : '') + 'AT+BLEADVSTART', 150);
  }
  refreshConns();
}
