/* wizards-simcom.js — wizard renderers that use SIMCom-proprietary AT commands with no 3GPP
   equivalent and no driver indirection: LBS (AT+CLBS), the Wi-Fi AP scan (AT+CWSTASCAN, the
   modem scanning nearby APs for positioning — not a Wi-Fi station) and BLE on the A76xx -FASE
   variants (BLEPOWER / BLECREG / BLESCAN / BLECCON…).
   The generic dispatchers renderWifi() / renderBle() (core/wizards-radio.js) route here when
   the focused profile is not an ESP.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* ---- File System: AT+FSCD / FSLS / FSMEM / FSOPEN… (A76XX-SIM7600) and AT+CFS* (SIM70x0),
   plus the EFS transfers AT+CFTRANRX / CFTRANTX. All SIMCom-proprietary. ---- */
function parseFscd(lines) {
  for (const l of lines) { const m = l.match(/\+FSCD:\s*(.+)/i); if (m) return m[1].trim(); }
  return '';
}
function parseFsls(lines) {
  const dirs = [], files = []; let mode = null;
  for (const l of lines) {
    if (/\+FSLS:\s*SUBDIR/i.test(l)) { mode = 'd'; continue; }
    if (/\+FSLS:\s*FILES/i.test(l)) { mode = 'f'; continue; }
    if (/^\+FSLS:/i.test(l)) continue;
    const n = l.trim(); if (!n || /^(OK|ERROR)$/.test(n)) continue;
    if (mode === 'd') dirs.push(n); else files.push(n);  // no headers → treat as files
  }
  return { dirs, files };
}
// AT+FSMEM → { total, used } in bytes. Tolerates both firmware formats:
//   +FSMEM: C:(total, used)   (A76xx / SIM7600)   ·   +FSMEM: C: used/total
function parseFsmem(lines) {
  for (const l of lines) {
    let m = l.match(/\+FSMEM:[^(]*\((\d+)\s*,\s*(\d+)\)/i);
    if (m) return { total: +m[1], used: +m[2] };
    m = l.match(/\+FSMEM:\D*(\d+)\s*\/\s*(\d+)/i);
    if (m) return { total: +m[2], used: +m[1] };
  }
  return null;
}
// CFS panel (SIM7080/7070): CFS has no directory listing; it works by index + file name.
function renderCfsPanel(host, fsd) {
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const note = document.createElement('div'); note.className = 'fs-status'; note.style.color = 'var(--ink-dim)'; note.textContent = t('fs_cfs_note');
  const row = document.createElement('div'); row.className = 'fs-bar';
  const dir = document.createElement('select');
  fsd.dirs.forEach(([v, label]) => { const o = document.createElement('option'); o.value = v; o.textContent = `${v} · ${label}`; dir.appendChild(o); });
  const name = document.createElement('input'); name.className = 'sms-to'; name.style.flex = '1'; name.placeholder = t('fs_filename');
  row.append(dir, name);
  const acts = document.createElement('div'); acts.className = 'fs-bar';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const run = (mk) => { const n = name.value.trim(); if (!n) return; runMacro(mk(dir.value, n)); };
  acts.append(mkBtn(t('fs_size'), () => run(fsd.size)), mkBtn(t('fs_read'), () => run(fsd.read)), mkBtn(t('fs_delete'), () => run(fsd.del)));
  host.append(sec('CFS'), note, row, acts);
}
function renderFsBrowser(host) {
  host.innerHTML = '';
  const fsd = UI.profile.fs;
  if (!profHasCap(UI.profile, 'fs') || !fsd) {   // module without an AT file system
    const n = document.createElement('div'); n.className = 'fs-status'; n.style.color = 'var(--ink-dim)';
    n.textContent = t('gn_unsupported').replace('{mod}', UI.profile.name);
    host.appendChild(n); return;
  }
  if (fsd.model === 'cfs') return renderCfsPanel(host, fsd);   // SIM7080/7070: CFS panel (no tree)
  const mkBtn = (txt, title, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; if (title) b.title = title; b.addEventListener('click', fn); return b; };
  const bar = document.createElement('div'); bar.className = 'fs-bar';
  bar.append(
    mkBtn('C:', 'C:', () => fsNav('AT+FSCD=C:')),
    mkBtn('D:', 'D:', () => fsNav('AT+FSCD=D:')),
    mkBtn('⬆', t('fs_up'), () => fsNav('AT+FSCD=..')),
    mkBtn('📁＋', t('fs_newdir'), () => fsMkdir()),
    mkBtn('⟳', t('fs_refresh'), () => fsRefresh()),
  );
  const pathEl = document.createElement('div'); pathEl.className = 'fs-path'; pathEl.textContent = '—';
  // storage bar (AT+FSMEM): used / free / total
  const mem = document.createElement('div'); mem.className = 'fs-mem'; mem.hidden = true;
  const memfill = document.createElement('i');
  const membar = document.createElement('div'); membar.className = 'fs-membar'; membar.appendChild(memfill);
  const memtxt = document.createElement('span'); memtxt.className = 'fs-memtxt';
  mem.append(membar, memtxt);
  const list = document.createElement('div'); list.className = 'fs-list';
  const status = document.createElement('div'); status.className = 'fs-status';
  // upload bar: choose a file (text or binary), remote name and upload to the current folder
  const up = document.createElement('div'); up.className = 'fs-bar fs-up';
  const file = document.createElement('input'); file.type = 'file'; file.className = 'ftp-file'; file.style.flex = '1 1 120px';
  const rname = document.createElement('input'); rname.className = 'sms-to'; rname.style.flex = '1 1 90px'; rname.placeholder = t('fs_remotename');
  file.addEventListener('change', () => { if (file.files[0] && !rname.value) rname.value = file.files[0].name; });
  const upBtn = mkBtn('⬆ ' + t('fs_upload'), t('fs_upload'), () => fsUpload());
  up.append(file, rname, upBtn);
  // --- file: open / read / write / close on the fd returned by FSOPEN ---
  const fops = document.createElement('div'); fops.className = 'fs-fops';
  const fhead = document.createElement('div'); fhead.className = 'gn-sechead'; fhead.textContent = t('fs_fileops');
  const fname = document.createElement('input'); fname.className = 'sms-to'; fname.style.flex = '1 1 120px'; fname.placeholder = t('fs_filename');
  const fdEl = document.createElement('span'); fdEl.className = 'fs-fd'; fdEl.textContent = 'fd —';
  const frow = document.createElement('div'); frow.className = 'fs-bar'; frow.append(fname, fdEl);
  const rlen = document.createElement('input'); rlen.type = 'number'; rlen.className = 'mac-delay'; rlen.value = '256'; rlen.min = '1'; rlen.title = 'bytes';
  const wmode = document.createElement('select');
  [['0', t('fs_wmode_over')], ['1', t('fs_wmode_app')]].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; wmode.appendChild(o); });
  const wta = document.createElement('textarea'); wta.className = 'macro-ta fs-wta'; wta.spellcheck = false;
  const fout = document.createElement('pre'); fout.className = 'fs-out'; fout.hidden = true;
  const brow = document.createElement('div'); brow.className = 'fs-bar';
  brow.append(mkBtn(t('fs_fopen'), 'AT+FSOPEN', () => fOpen()), mkBtn(t('fs_read'), 'AT+FSREAD', () => fRead()), rlen, mkBtn(t('fs_fclose'), 'AT+FSCLOSE', () => fClose()));
  const wrow = document.createElement('div'); wrow.className = 'fs-bar';
  wrow.append(wmode, mkBtn(t('fs_fwrite'), 'AT+FSWRITE', () => fWrite()));
  fops.append(fhead, frow, brow, fout, wta, wrow);
  host.append(bar, pathEl, mem, list, up, fops, status);
  let curFd = null;
  const setFd = (v) => { curFd = v; fdEl.textContent = 'fd ' + (v == null ? '—' : v); };

  function curDir() { const d = pathEl.textContent; return d && d !== '—' ? (d.endsWith('/') ? d : d + '/') : 'C:/'; }
  async function fsUpload() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const f = file.files && file.files[0]; if (!f) { status.textContent = t('fs_pickfile'); return; }
    const name = rname.value.trim() || f.name;
    const bytes = new Uint8Array(await f.arrayBuffer());
    status.textContent = t('fs_uploading');
    const r = await UI.sendFile(`AT+CFTRANRX="${curDir()}${name}",${bytes.length}`, bytes, { timeout: 30000 });
    status.textContent = r.ok ? t('fs_uploaded').replace('{b}', bytes.length) : t('fs_ulfail');
    file.value = ''; rname.value = '';
    fsRefresh();
  }
  async function fsDownload(name) {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    status.textContent = t('fs_downloading');
    const r = await UI.recvFile(`AT+CFTRANTX="${curDir()}${name}"`, { timeout: 30000 });
    if (r.ok && r.bytes) { downloadBytes(r.bytes, name); status.textContent = t('fs_downloaded').replace('{b}', r.bytes.length); }
    else status.textContent = t('fs_dlfail');
  }

  async function fsRefresh() {
    if (!UI.connected) { status.textContent = t('log_notconn'); list.innerHTML = ''; pathEl.textContent = '—'; return; }
    status.textContent = '…'; list.innerHTML = '';
    const cd = await UI.sendCollect('AT+FSCD?');
    pathEl.textContent = parseFscd(cd.lines) || '—';
    const ls = await UI.sendCollect('AT+FSLS');
    const { dirs, files } = parseFsls(ls.lines);
    renderList(dirs, files);
    status.textContent = `${dirs.length} ${t('fs_dirs')} · ${files.length} ${t('fs_files')}`;
    drawMem(parseFsmem((await UI.sendCollect('AT+FSMEM')).lines));
  }
  function drawMem(info) {
    if (!info || !info.total) { mem.hidden = true; return; }
    mem.hidden = false;
    const used = Math.min(info.used, info.total), free = info.total - used;
    memfill.style.width = Math.round(used / info.total * 100) + '%';
    memtxt.textContent = t('fs_mem_line').replace('{used}', fmtBytes(used)).replace('{free}', fmtBytes(free)).replace('{total}', fmtBytes(info.total));
  }
  async function fsNav(cmd) { if (!UI.connected) { status.textContent = t('log_notconn'); return; } await UI.sendCollect(cmd); fsRefresh(); }
  async function fsDelete(name) { if (!window.confirm(name + ' ?')) return; await UI.sendCollect('AT+FSDEL="' + name + '"'); fsRefresh(); }
  async function fsMkdir() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const name = (window.prompt(t('fs_newdir_name')) || '').trim();
    if (!name) return;
    await UI.sendCollect('AT+FSMKDIR=' + name);
    fsRefresh();
  }
  async function fsRmdir(name) {
    if (!window.confirm(name + ' ?')) return;
    await UI.sendCollect('AT+FSRMDIR="' + name + '"');
    fsRefresh();
  }
  // --- file operations (they use the current folder as base) ---
  async function fOpen() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const n = fname.value.trim(); if (!n) return;
    const r = await UI.sendCollect('AT+FSOPEN=' + curDir() + n);
    const m = (r.lines.find((l) => /\+FSOPEN:/i.test(l)) || '').match(/\+FSOPEN:\s*(\d+)/i);
    if (r.ok && m) { setFd(m[1]); status.textContent = t('fs_opened').replace('{n}', m[1]); }
    else status.textContent = t('fs_opfail');
  }
  async function fRead() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    if (curFd == null) { status.textContent = t('fs_nofd'); return; }
    const r = await UI.sendCollect(`AT+FSREAD=${curFd},${Math.max(1, Number(rlen.value) || 256)}`);
    fout.hidden = false;
    fout.textContent = r.lines.filter((l) => !/^\+FSREAD/i.test(l)).join('\n') || '(0 B)';
    status.textContent = r.ok ? '' : t('fs_opfail');
  }
  async function fWrite() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    if (curFd == null) { status.textContent = t('fs_nofd'); return; }
    const bytes = encodeOut(wta.value, 'utf-8');
    const r = await UI.sendFile(`AT+FSWRITE=${curFd},${wmode.value},${bytes.length},10`, bytes, { timeout: 15000 });
    status.textContent = r.ok ? t('fs_written').replace('{b}', bytes.length) : t('fs_opfail');
  }
  async function fClose() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    if (curFd == null) { status.textContent = t('fs_nofd'); return; }
    const r = await UI.sendCollect('AT+FSCLOSE=' + curFd);
    if (r.ok) { setFd(null); status.textContent = ''; fsRefresh(); }   // the created file shows up in the listing
    else status.textContent = t('fs_opfail');
  }

  function renderList(dirs, files) {
    list.innerHTML = '';
    if (!dirs.length && !files.length) { const e = document.createElement('div'); e.className = 'fs-empty'; e.textContent = t('fs_empty'); list.appendChild(e); return; }
    dirs.forEach((d) => {
      const row = document.createElement('div'); row.className = 'fs-item fs-dir'; row.title = t('fs_open');
      const ic = document.createElement('span'); ic.className = 'fs-ic'; ic.textContent = '📁';
      const nm = document.createElement('span'); nm.className = 'fs-nm'; nm.textContent = d;
      const del = document.createElement('button'); del.className = 'fs-del'; del.textContent = '🗑'; del.title = t('fs_deldir');
      del.addEventListener('click', (e) => { e.stopPropagation(); fsRmdir(d); });
      row.append(ic, nm, del);
      row.addEventListener('click', () => fsNav('AT+FSCD=' + d));
      list.appendChild(row);
    });
    files.forEach((f) => {
      const row = document.createElement('div'); row.className = 'fs-item fs-file'; row.title = t('fs_fileops');
      const ic = document.createElement('span'); ic.className = 'fs-ic'; ic.textContent = '📄';
      const nm = document.createElement('span'); nm.className = 'fs-nm'; nm.textContent = f;
      const dl = document.createElement('button'); dl.className = 'fs-dl'; dl.textContent = '⬇'; dl.title = t('fs_download');
      dl.addEventListener('click', (e) => { e.stopPropagation(); fsDownload(f); });
      const del = document.createElement('button'); del.className = 'fs-del'; del.textContent = '🗑'; del.title = t('fs_del');
      del.addEventListener('click', (e) => { e.stopPropagation(); fsDelete(f); });
      row.append(ic, nm, dl, del);
      row.addEventListener('click', () => { fname.value = f; });   // click on the file → loads it into the open/read/write panel
      list.appendChild(row);
    });
  }
  fsRefresh();
}

/* ---- LBS: base-station location (AT+CLBS) ---- */
function parseLbs(line) {
  const m = line.match(/\+CLBS:\s*(.*)$/i); if (!m) return null;
  const f = m[1].split(',').map((x) => x.trim());
  const ret = parseInt(f[0], 10);
  if (isNaN(ret)) return null;
  if (ret !== 0) return { ret };
  return { ret: 0, lat: parseFloat(f[1]), lon: parseFloat(f[2]), acc: parseFloat(f[3]), date: f[4] || '', time: f[5] || '' };
}
function renderLbs(host) {
  host.innerHTML = '';
  const note = document.createElement('div'); note.className = 'gn-empty'; note.style.textAlign = 'left'; note.style.padding = '0'; note.textContent = t('lbs_note');
  const bar = document.createElement('div'); bar.className = 'fs-bar';
  const cidWrap = document.createElement('label'); cidWrap.className = 'gn-auto'; cidWrap.style.gap = '6px';
  const cid = document.createElement('input'); cid.type = 'number'; cid.value = '1'; cid.min = '1'; cid.max = '15'; cid.className = 'lbs-cid';
  cidWrap.append(document.createTextNode(t('lbs_cid')), cid);
  const getBtn = document.createElement('button'); getBtn.className = 'fs-btn'; getBtn.textContent = t('lbs_get');
  bar.append(cidWrap, getBtn);
  const grid = document.createElement('div'); grid.className = 'gn-grid';
  const cells = {};
  [['lat', 'Lat'], ['lon', 'Lon'], ['acc', t('lbs_acc')], ['dt', 'UTC']].forEach(([id, label]) => {
    const c = document.createElement('div'); c.className = 'gn-cell';
    const lab = document.createElement('span'); lab.className = 'gn-lab'; lab.textContent = label;
    const val = document.createElement('b'); val.className = 'gn-val'; val.textContent = '—'; cells[id] = val;
    c.append(lab, val); grid.appendChild(c);
  });
  const mapWrap = document.createElement('div'); mapWrap.className = 'gn-map';
  const ph = document.createElement('div'); ph.className = 'gn-mapph'; ph.textContent = t('lbs_wait');
  const frame = document.createElement('iframe'); frame.className = 'gn-frame'; frame.loading = 'lazy'; frame.style.display = 'none'; frame.referrerPolicy = 'no-referrer';
  mapWrap.append(ph, frame);
  const status = document.createElement('div'); status.className = 'fs-status';
  host.append(note, bar, grid, mapWrap, status);

  getBtn.addEventListener('click', async () => {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    status.textContent = t('lbs_locating'); getBtn.disabled = true;
    try {
      const r = await UI.sendCollect(`AT+CLBS=4,${cid.value || 1}`, { timeout: 12000 });
      const g = parseLbs(r.lines.find((l) => /\+CLBS:/i.test(l)) || '');
      if (!g || g.ret !== 0 || isNaN(g.lat)) {
        Object.values(cells).forEach((v) => { v.textContent = '—'; });
        ph.style.display = ''; frame.style.display = 'none';
        status.textContent = g && g.ret ? `${t('lbs_err')} (ret ${g.ret})` : t('lbs_err');
        return;
      }
      cells.lat.textContent = g.lat.toFixed(6);
      cells.lon.textContent = g.lon.toFixed(6);
      cells.acc.textContent = isNaN(g.acc) ? '—' : '± ' + g.acc + ' m';
      cells.dt.textContent = (g.date && g.time) ? `${g.date} ${g.time}` : '—';
      frame.src = osmEmbed(g.lat, g.lon);
      ph.style.display = 'none'; frame.style.display = '';
      status.textContent = '';
    } finally { getBtn.disabled = false; }
  });
}


/* ---- Wi-Fi scan: APs cercanos (AT+CWSTASCAN) ---- */
function parseWifiScan(lines) {
  const aps = [];
  for (const l of lines) {
    const m = l.match(/^([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}),(\d+)(?:,(-?\d+))?/);
    if (m) aps.push({ bssid: m[1].toUpperCase(), ch: parseInt(m[2], 10), sig: m[3] != null ? parseInt(m[3], 10) : null });
  }
  return aps;
}

// SIMCom Wi-Fi scan (the dispatcher already cleared the host and ruled out ESP).
function renderWifiSimcom(host) {
  const note = document.createElement('div'); note.className = 'gn-empty'; note.style.textAlign = 'left'; note.style.padding = '0'; note.textContent = t('wifi_note');
  const bar = document.createElement('div'); bar.className = 'fs-bar';
  const sigTog = document.createElement('label'); sigTog.className = 'gn-auto';
  const sigChk = document.createElement('input'); sigChk.type = 'checkbox'; sigChk.checked = true;
  sigTog.append(sigChk, document.createTextNode(' ' + t('wifi_sig')));
  const scanBtn = document.createElement('button'); scanBtn.className = 'fs-btn'; scanBtn.textContent = t('wifi_scan');
  bar.append(scanBtn, sigTog);
  const list = document.createElement('div'); list.className = 'wifi-list';
  const status = document.createElement('div'); status.className = 'fs-status';
  host.append(note, bar, list, status);

  scanBtn.addEventListener('click', async () => {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    scanBtn.disabled = true; status.textContent = t('wifi_scanning'); list.innerHTML = '';
    try {
      await UI.sendCollect(`AT+CWSTASCAN=${sigChk.checked ? 1 : 0}`);
      const r = await UI.sendCollect('AT+CWSTASCAN', { timeout: 15000 });
      const aps = parseWifiScan(r.lines).sort((a, b) => (b.sig ?? -999) - (a.sig ?? -999));
      if (!aps.length) { const e = document.createElement('div'); e.className = 'gn-empty'; e.textContent = t('wifi_empty'); list.appendChild(e); status.textContent = ''; return; }
      aps.forEach((ap) => {
        const row = document.createElement('div'); row.className = 'wifi-item';
        const info = document.createElement('div'); info.className = 'wifi-info';
        const mac = document.createElement('span'); mac.className = 'wifi-mac'; mac.textContent = ap.bssid;
        const meta = document.createElement('span'); meta.className = 'wifi-meta'; meta.textContent = `ch ${ap.ch} · ${ap.ch <= 14 ? '2.4G' : '5G'}`;
        info.append(mac, meta);
        const track = document.createElement('div'); track.className = 'wifi-track';
        if (ap.sig != null) {
          const fill = document.createElement('div'); fill.className = 'wifi-fill';
          fill.style.width = Math.max(5, Math.min(100, (ap.sig + 90) / 60 * 100)).toFixed(0) + '%';
          fill.style.background = wifiSigColor(ap.sig);
          track.appendChild(fill);
        }
        const dbm = document.createElement('span'); dbm.className = 'wifi-dbm'; dbm.textContent = ap.sig != null ? ap.sig + ' dBm' : '—';
        row.append(info, track, dbm); list.appendChild(row);
      });
      status.textContent = `${aps.length}`;
    } finally { scanBtn.disabled = false; }
  });
}


/* ---- BLE (Bluetooth Low Energy) — A76xx -FASE (e.g. A7672SA-FASE) ---- */
// +BLESCANRST: <ci>,<si>,"<addr>",<rssi>,"<adv>"   (rssi comes as an unsigned byte)
function parseBleScan(line) {
  const m = line.match(/\+BLESCANRST:\s*(.*)$/i); if (!m) return null;
  const mm = m[1].match(/^\s*(\d+)\s*,\s*(\d+)\s*,\s*"?([0-9a-fA-F:]+)"?\s*,\s*(-?\d+)\s*,\s*"?([0-9a-fA-F]*)"?/);
  if (!mm) return null;
  let rssi = Number(mm[4]); if (rssi > 127) rssi -= 256;
  return { ci: Number(mm[1]), si: Number(mm[2]), addr: mm[3].toLowerCase(), rssi, adv: mm[5] || '' };
}


// BLE of the A76xx -FASE variants (the dispatcher already checked the cap and ruled out ESP).
function renderBleSimcom(host) {
  const prof = UI.profile;
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const grp = (labelText, ...controls) => { const gg = document.createElement('div'); gg.className = 'gn-grp'; const l = document.createElement('span'); l.className = 'gn-grplbl'; l.textContent = labelText; gg.append(l, ...controls); return gg; };
  const status = document.createElement('div'); status.className = 'fs-status';
  const say = (txt) => { status.textContent = txt; };

  // --- toolbar: POWER / STATUS / ADDR ---
  const bar = document.createElement('div'); bar.className = 'fs-bar gn-toolbar';
  const powerSeg = makeSeg([['1', t('gn_on')], ['0', t('gn_off')]], (v) => {
    if (!UI.connected) { say(t('log_notconn')); return; }
    UI.sendCollect(`AT+BLEPOWER=${v}`, { timeout: 12000 }).then((r) => say(r.ok ? 'BLEPOWER=' + v + ' OK' : 'ERROR'));
  });
  const statusBtn = mkBtn(t('ble_status'), async () => {
    if (!UI.connected) return say(t('log_notconn'));
    const r = await UI.sendCollect('AT+BLESTATUS?', { timeout: 9000 });
    say(r.lines.find((l) => /\+BLESTATUS:/i.test(l)) || t('ble_noconn'));
  });
  const addrVal = document.createElement('b'); addrVal.className = 'gn-val'; addrVal.style.marginLeft = '6px'; addrVal.textContent = '—';
  const addrBtn = mkBtn(t('ble_read'), async () => {
    if (!UI.connected) return say(t('log_notconn'));
    const r = await UI.sendCollect('AT+BLEADDR?');
    const m = (r.lines.find((l) => /\+BLEADDR:/i.test(l)) || '').match(/\+BLEADDR:\s*"?([0-9a-fA-F:]+)/i);
    if (m) addrVal.textContent = m[1].toLowerCase();
  });
  bar.append(grp(t('gn_power'), powerSeg.el), grp(t('ble_status'), statusBtn), grp('ADDR', addrBtn, addrVal));

  // --- host name ---
  const hostBar = document.createElement('div'); hostBar.className = 'fs-bar';
  const hostIn = document.createElement('input'); hostIn.type = 'text'; hostIn.className = 'sms-to'; hostIn.placeholder = 'SIMCOM BLE'; hostIn.maxLength = 18; hostIn.style.flex = '1'; hostIn.style.minWidth = '0'; hostIn.style.maxWidth = '180px';
  const hostSet = mkBtn(t('ble_set'), () => { if (UI.connected && hostIn.value.trim()) UI.sendCollect(`AT+BLEHOST="${hostIn.value.trim()}"`).then((r) => say(r.ok ? 'BLEHOST OK' : 'ERROR')); });
  hostBar.append(grp(t('ble_name'), hostIn, hostSet));
  host.append(bar, hostBar);

  // --- CENTRAL: scan + live list (URC +BLESCANRST) ---
  const scanHead = document.createElement('div'); scanHead.className = 'gn-sechead';
  const scanLbl = document.createElement('span'); scanLbl.textContent = t('ble_central');
  const scanSeg = makeSeg([['1', t('ble_scan_on')], ['0', t('ble_scan_off')]], (v) => scanToggle(v === '1'));
  scanHead.append(scanLbl, scanSeg.el);
  const list = document.createElement('div'); list.className = 'wifi-list';
  host.append(scanHead, list);

  let clientIdx = 0, devices = {};
  function upsert(d) {
    let e = devices[d.addr];
    if (!e) {
      const row = document.createElement('div'); row.className = 'wifi-item';
      const info = document.createElement('div'); info.className = 'wifi-info';
      const mac = document.createElement('span'); mac.className = 'wifi-mac'; mac.textContent = d.addr;
      const meta = document.createElement('span'); meta.className = 'wifi-meta';
      info.append(mac, meta);
      const track = document.createElement('div'); track.className = 'wifi-track';
      const fill = document.createElement('div'); fill.className = 'wifi-fill'; track.appendChild(fill);
      const dbm = document.createElement('span'); dbm.className = 'wifi-dbm';
      const conn = mkBtn(t('ble_connect'), () => { if (UI.connected) UI.sendCollect(`AT+BLECCON=${d.si}`, { timeout: 9000 }).then((r) => say(r.ok ? t('ble_connecting') + ' ' + d.addr : 'ERROR')); });
      conn.style.marginLeft = '8px';
      row.append(info, track, dbm, conn); list.appendChild(row);
      e = devices[d.addr] = { row, meta, fill, dbm };
    }
    e.meta.textContent = d.adv ? d.adv.slice(0, 24) + (d.adv.length > 24 ? '…' : '') : '';
    e.fill.style.width = Math.max(5, Math.min(100, (d.rssi + 100) / 70 * 100)).toFixed(0) + '%';
    e.fill.style.background = d.rssi >= -60 ? '#16a085' : d.rssi >= -80 ? 'var(--amber)' : '#e2231a';
    e.dbm.textContent = d.rssi + ' dBm';
  }
  async function scanToggle(on) {
    if (on) {
      if (!UI.connected) { scanSeg.set('0'); return say(t('log_notconn')); }
      list.innerHTML = ''; devices = {};
      const r = await UI.sendCollect('AT+BLECREG', { timeout: 9000 });
      const m = (r.lines.find((l) => /\+BLECREG:/i.test(l)) || '').match(/\+BLECREG:\s*(\d+)/i);
      clientIdx = m ? Number(m[1]) : 0;
      UI.tap = (line) => { const d = parseBleScan(line); if (d) { upsert(d); return true; } return false; };
      UI.sendCollect(`AT+BLESCAN=${clientIdx},1`);
      say(t('ble_scanning'));
    } else {
      UI.tap = null;
      if (UI.connected) UI.sendCollect(`AT+BLESCAN=${clientIdx},0`);
      say('');
    }
  }

  // --- PERIPHERAL: server + advertising ---
  const perHead = document.createElement('div'); perHead.className = 'gn-sechead';
  const perLbl = document.createElement('span'); perLbl.textContent = t('ble_peripheral'); perHead.append(perLbl);
  const perBar = document.createElement('div'); perBar.className = 'fs-bar'; perBar.style.flexWrap = 'wrap';
  let serverIdx = 0;
  const regBtn = mkBtn(t('ble_reg_server'), async () => {
    if (!UI.connected) return say(t('log_notconn'));
    const r = await UI.sendCollect('AT+BLESREG', { timeout: 9000 });
    const m = (r.lines.find((l) => /\+BLESREG:/i.test(l)) || '').match(/\+BLESREG:\s*(\d+)/i);
    serverIdx = m ? Number(m[1]) : 0; say('server_index = ' + serverIdx);
  });
  const srvSeg = makeSeg([['1', t('ble_srv_on')], ['0', t('ble_srv_off')]], (v) => {
    if (UI.connected) UI.sendCollect(v === '1' ? `AT+BLESSSTART=${serverIdx},0` : `AT+BLESSSTOP=${serverIdx}`).then((r) => say(r.ok ? 'server ' + (v === '1' ? '▶' : '⏹') : 'ERROR'));
  });
  const advSeg = makeSeg([['1', t('ble_adv_on')], ['0', t('ble_adv_off')]], (v) => {
    if (UI.connected) UI.sendCollect(v === '1' ? `AT+BLESLSTART=${serverIdx}` : `AT+BLESLSTOP=${serverIdx}`).then((r) => say(r.ok ? 'adv ' + (v === '1' ? '▶' : '⏹') : 'ERROR'));
  });
  perBar.append(regBtn, grp(t('ble_server'), srvSeg.el), grp(t('ble_advertise'), advSeg.el));
  host.append(perHead, perBar, status);

  App.wiz.cleanup = () => { if (UI.tap) { UI.tap = null; if (UI.connected) UI.sendCollect(`AT+BLESCAN=${clientIdx},0`); } };

  (async () => {
    if (!UI.connected) return;
    const p = await UI.sendCollect('AT+BLEPOWER?');
    const pm = (p.lines.find((l) => /\+BLEPOWER:/i.test(l)) || '').match(/\+BLEPOWER:\s*([01])/i);
    if (pm) powerSeg.set(pm[1]);
    const h = await UI.sendCollect('AT+BLEHOST?');
    const hm = (h.lines.find((l) => /\+BLEHOST:/i.test(l)) || '').match(/\+BLEHOST:\s*([^,]+)/i);
    if (hm) hostIn.value = hm[1].trim().replace(/"/g, '');
  })();
}



/* ---- Hardware: VBAT/temp/ADC gauges, GPIO, voltage alarm ---- */
function parseCbc(line) { const m = line.match(/\+CBC:\s*([\d.]+)/i); return m ? parseFloat(m[1]) : null; }
function batterySVG(v) {
  const min = 3.0, max = 4.2, pct = v == null ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min)));
  const col = v == null ? 'var(--line)' : (v >= 3.7 ? '#16a085' : v >= 3.5 ? 'var(--amber)' : '#e2231a');
  const bx = 5, by = 8, bw = 78, bh = 30, fw = (bw - 8) * pct;
  return `<svg viewBox="0 0 96 46" class="hw-svg">
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="5" fill="none" stroke="var(--ink-faint)" stroke-width="2"/>
    <rect x="${bx + bw}" y="${by + bh / 2 - 7}" width="6" height="14" rx="2" fill="var(--ink-faint)"/>
    <rect x="${bx + 4}" y="${by + 4}" width="${fw.toFixed(1)}" height="${bh - 8}" rx="3" fill="${col}"/>
  </svg>`;
}
function thermoSVG(c) {
  const min = -20, max = 85, pct = c == null ? 0 : Math.max(0, Math.min(1, (c - min) / (max - min)));
  const col = c == null ? 'var(--line)' : (c < 10 ? '#4a90d9' : c < 45 ? '#16a085' : c < 65 ? 'var(--amber)' : '#e2231a');
  const x = 30, w = 12, top = 12, bot = 84, h = bot - top, fh = h * pct, fy = bot - fh;
  return `<svg viewBox="0 0 60 116" class="hw-svg">
    <rect x="${x - w / 2}" y="${top}" width="${w}" height="${h}" rx="${w / 2}" fill="var(--surface)" stroke="var(--ink-faint)" stroke-width="2"/>
    <rect x="${x - (w - 6) / 2}" y="${fy.toFixed(1)}" width="${w - 6}" height="${(fh + 14).toFixed(1)}" rx="${(w - 6) / 2}" fill="${col}"/>
    <circle cx="${x}" cy="96" r="13" fill="${col}" stroke="var(--ink-faint)" stroke-width="2"/>
  </svg>`;
}
function gaugeSVG(value, max) {
  const cx = 60, cy = 56, r = 44, frac = max > 0 ? Math.max(0, Math.min(1, (value == null ? 0 : value) / max)) : 0;
  const pt = (fr, rr) => { const th = Math.PI * (1 - fr); return [cx + rr * Math.cos(th), cy - rr * Math.sin(th)]; };
  const [sx, sy] = pt(0, r), [ex, ey] = pt(1, r), [vx, vy] = pt(frac, r), [nx, ny] = pt(frac, r - 7);
  const val = frac > 0.001 ? `<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 0 1 ${vx.toFixed(1)} ${vy.toFixed(1)}" fill="none" stroke="#4a90d9" stroke-width="8" stroke-linecap="round"/>` : '';
  return `<svg viewBox="0 0 120 70" class="hw-svg">
    <path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="var(--line)" stroke-width="8" stroke-linecap="round"/>
    ${val}
    <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="var(--ink)"/>
  </svg>`;
}

// "Serial / UART" section of the Hardware wizard (formerly its own wizard; unified here).
function renderUartSection(host) {
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const field = (cap, ...els) => { const r = document.createElement('div'); r.className = 'hw-ctlrow'; const l = document.createElement('span'); l.className = 'hw-ctllab'; l.textContent = cap; r.append(l, ...els); return r; };
  const sel = (opts, def) => { const s = document.createElement('select'); s.className = 'hw-sel'; opts.forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; s.appendChild(o); }); if (def != null) s.value = String(def); return s; };
  const status = document.createElement('div'); status.className = 'fs-status';
  // baud (careful: it changes the serial link)
  const baud = sel([['0', 'Auto'], ['9600', '9600'], ['19200', '19200'], ['38400', '38400'], ['57600', '57600'], ['115200', '115200'], ['230400', '230400'], ['460800', '460800'], ['921600', '921600']], '115200');
  baud.addEventListener('change', () => { if (confirm(t('uart_warn'))) UI.sendCollect(`AT+IPR=${baud.value}`); });
  // framing (ICF) — 8N1 = 2,2
  const icf = sel([['2,2', '8N1'], ['1,1', '8E1'], ['1,0', '8O1'], ['4,2', '7N1'], ['3,1', '7E1'], ['3,0', '7O1']], '2,2');
  icf.addEventListener('change', () => UI.sendCollect(`AT+ICF=${icf.value}`));
  // flow control (IFC)
  const flowSeg = makeSeg([['2,2', t('uart_hw')], ['0,0', t('uart_none')]], (v) => UI.sendCollect(`AT+IFC=${v}`));
  // sleep (CSCLK)
  const slp = sel([['0', t('uart_off')], ['1', 'DTR'], ['2', t('net_auto')]], '0');
  slp.addEventListener('change', () => UI.sendCollect(`AT+CSCLK=${slp.value}`));
  // "Main UART" divider: wraps Baud rate, Framing and CMUX in a legend box
  const box = document.createElement('fieldset'); box.className = 'hw-group';
  const cap = document.createElement('legend'); cap.textContent = 'Main UART'; box.appendChild(cap);
  box.append(
    sec(t('uart_baud')), field(t('uart_baud'), baud, mkBtn(t('hw_read'), () => readAll())),
    sec(t('uart_framing')), field(t('uart_framing'), icf), field(t('uart_flow'), flowSeg.el), field(t('uart_sleep'), slp),
    sec('CMUX'), (() => { const r = document.createElement('div'); r.className = 'fs-bar'; r.append(mkBtn(t('uart_mux'), () => { if (confirm(t('uart_warn'))) UI.send('AT+CMUX=0'); })); return r; })(),
    status,
  );
  host.appendChild(box);
  async function readAll() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const get = async (cmd, re) => { const r = await UI.sendCollect(cmd); const m = (r.lines.find((l) => re.test(l)) || '').match(re); return m ? m[1] : null; };
    const b = await get('AT+IPR?', /\+IPR:\s*(\d+)/i); if (b != null && [...baud.options].some((o) => o.value === b)) baud.value = b;
    const f = await get('AT+ICF?', /\+ICF:\s*(\d+,\d+)/i); if (f && [...icf.options].some((o) => o.value === f)) icf.value = f;
    const fc = await get('AT+IFC?', /\+IFC:\s*(\d+,\d+)/i); if (fc) flowSeg.set(fc);
    const sk = await get('AT+CSCLK?', /\+CSCLK:\s*(\d+)/i); if (sk != null) slp.value = sk;
    status.textContent = '';
  }
  readAll();
}

function renderHw(host) {
  host.innerHTML = '';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  // --- Monitor (VBAT, thermometer, ADC gauge) ---
  const bar = document.createElement('div'); bar.className = 'fs-bar';
  const auto = document.createElement('label'); auto.className = 'gn-auto';
  const autoChk = document.createElement('input'); autoChk.type = 'checkbox';
  auto.append(autoChk, document.createTextNode(' ' + t('gn_auto')));
  bar.append(mkBtn(t('hw_read'), () => readMon()), auto);
  const mon = document.createElement('div'); mon.className = 'hw-monitor';
  const widget = (cap) => {
    const w = document.createElement('div'); w.className = 'hw-widget';
    const vis = document.createElement('div'); vis.className = 'hw-vis';
    const val = document.createElement('b'); val.className = 'hw-wval'; val.textContent = '—';
    const lab = document.createElement('span'); lab.className = 'hw-wlab'; lab.textContent = cap;
    w.append(vis, val, lab); mon.appendChild(w); return { vis, val };
  };
  const wBatt = widget('VBAT'), wTemp = widget(t('hw_temp')), wAdc = widget(t('hw_adc'));
  // --- GPIO ---
  const gpioRow = document.createElement('div'); gpioRow.className = 'fs-bar hw-gpiorow';
  const sel = document.createElement('select'); sel.className = 'hw-sel';
  [1, 2, 3, 6, 12, 14, 16, 18, 22, 41, 43, 63, 77].forEach((g) => { const o = document.createElement('option'); o.value = g; o.textContent = 'GPIO ' + g; sel.appendChild(o); });
  sel.addEventListener('change', () => readGpio());
  const dirSeg = makeSeg([['0', t('hw_in')], ['1', t('hw_out')]], (v) => UI.sendCollect(`AT+CGDRT=${sel.value},${v}`));
  const valSeg = makeSeg([['0', t('hw_low')], ['1', t('hw_high')]], (v) => UI.sendCollect(`AT+CGSETV=${sel.value},${v}`).then(readGpio));
  const ctlRow = (cap, seg) => { const r = document.createElement('div'); r.className = 'hw-ctlrow'; const l = document.createElement('span'); l.className = 'hw-ctllab'; l.textContent = cap; r.append(l, seg.el); return r; };
  gpioRow.append(sel, mkBtn(t('hw_read'), () => readGpio()), ctlRow(t('hw_dir'), dirSeg), ctlRow(t('hw_value'), valSeg));
  // --- Voltage alarm (double knob) ---
  const range = makeDualRange({ min: 3000, max: 4500, low: 3450, high: 4200, step: 10, gap: 50,
    onChange: (lo, hi) => UI.sendCollect(`AT+CVALARM=1,${lo},${hi}`) });
  const alBtns = document.createElement('div'); alBtns.className = 'fs-bar';
  alBtns.append(
    mkBtn(t('hw_enable'), () => { const { low, high } = range.get(); UI.sendCollect(`AT+CVALARM=1,${low},${high}`); }),
    mkBtn(t('hw_disable'), () => UI.sendCollect('AT+CVALARM=0,3000,4500')),
  );
  const valarmRow = document.createElement('div'); valarmRow.className = 'hw-valarmrow';
  valarmRow.append(range.el, alBtns);
  const status = document.createElement('div'); status.className = 'fs-status';
  host.append(sec(t('hw_mon')), bar, mon, sec('GPIO'), gpioRow, sec(t('hw_valarm')), valarmRow, status);
  renderUartSection(host);   // Serial / UART unified into the Hardware wizard

  let timer = null;
  function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }
  App.wiz.cleanup = stopAuto;
  autoChk.addEventListener('change', () => { stopAuto(); if (autoChk.checked) { readMon(); timer = setInterval(readMon, 3000); } });

  async function readMon() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const cbc = await UI.sendCollect('AT+CBC');
    const v = parseCbc(cbc.lines.find((l) => /\+CBC:/i.test(l)) || '');
    wBatt.vis.innerHTML = batterySVG(v); wBatt.val.textContent = v != null ? v.toFixed(3) + ' V' : '—';
    const tp = await UI.sendCollect('AT+CPMUTEMP');
    const tm = (tp.lines.find((l) => /\+CPMUTEMP:/i.test(l)) || '').match(/:\s*(-?\d+)/);
    const tc = tm ? parseInt(tm[1], 10) : null;
    wTemp.vis.innerHTML = thermoSVG(tc); wTemp.val.textContent = tc != null ? tc + ' °C' : '—';
    const ad = await UI.sendCollect('AT+CADC?');
    const am = (ad.lines.find((l) => /\+CADC:/i.test(l)) || '').match(/:\s*(\d+)/);
    const av = am ? parseInt(am[1], 10) : null;
    wAdc.vis.innerHTML = gaugeSVG(av, 2800); wAdc.val.textContent = av != null ? String(av) : '—';
  }
  async function readGpio() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect(`AT+CGGETV=${sel.value}`);
    const m = (r.lines.find((l) => /\+CGGETV:/i.test(l)) || '').match(/\+CGGETV:\s*\d+,([01])/i);
    if (m) valSeg.set(m[1]);
  }
  wBatt.vis.innerHTML = batterySVG(null); wTemp.vis.innerHTML = thermoSVG(null); wAdc.vis.innerHTML = gaugeSVG(null, 2800);
  readMon();
}

/* ---- Basics / Network unified: identity, echo/CMEE, network mode (CNMP), PS attach and
       power (CFUN). Only controls the header does NOT cover: live telemetry (SIM,
       registration, signal, operator, mode/band, APN/IP) already lives in the top bar. ---- */
function renderBasics(host) {
  host.innerHTML = '';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  // --- info (module identity) ---
  const bar = document.createElement('div'); bar.className = 'fs-bar';
  bar.append(mkBtn('AT', () => UI.sendCollect('AT')), mkBtn(t('bas_info'), () => readInfo()));
  const grid = document.createElement('div'); grid.className = 'gn-grid';
  const cells = {};
  [['model', t('bas_model')], ['rev', t('bas_rev')], ['imei', 'IMEI']].forEach(([id, label]) => {
    const c = document.createElement('div'); c.className = 'gn-cell';
    const l = document.createElement('span'); l.className = 'gn-lab'; l.textContent = label;
    const v = document.createElement('b'); v.className = 'gn-val'; v.textContent = '—'; cells[id] = v;
    c.append(l, v); grid.appendChild(c);
  });
  // --- options ---
  const opts = document.createElement('div'); opts.className = 'fs-bar';
  const echo = document.createElement('label'); echo.className = 'gn-auto';
  const echoChk = document.createElement('input'); echoChk.type = 'checkbox';
  echoChk.addEventListener('change', () => UI.sendCollect(echoChk.checked ? 'ATE1' : 'ATE0'));
  echo.append(echoChk, document.createTextNode(' ' + t('bas_echo')));
  const cmeeWrap = document.createElement('label'); cmeeWrap.className = 'gn-auto'; cmeeWrap.style.gap = '6px';
  const cmee = document.createElement('select'); cmee.className = 'hw-sel';
  [['0', '0'], ['1', '1'], ['2', '2']].forEach(([v, lab]) => { const o = document.createElement('option'); o.value = v; o.textContent = lab; cmee.appendChild(o); });
  cmee.value = '2';
  cmee.addEventListener('change', () => UI.sendCollect(`AT+CMEE=${cmee.value}`));
  cmeeWrap.append(document.createTextNode(t('bas_cmee')), cmee);
  opts.append(echo, cmeeWrap);
  // --- network: mode (CNMP) + PS attach (the only network bits the header doesn't show) ---
  const CNMP_LABELS = { 2: t('net_auto'), 13: 'GSM', 14: 'WCDMA', 38: 'LTE', 19: 'GSM+WCDMA', 48: t('net_nolte'), 51: 'GSM+LTE', 54: 'WCDMA+LTE', 59: 'GSM+WCDMA+LTE', 9: 'CDMA', 10: 'EVDO', 22: 'CDMA+EVDO' };
  const modeRow = document.createElement('div'); modeRow.className = 'hw-ctlrow';
  const modeLbl = document.createElement('span'); modeLbl.className = 'hw-ctllab'; modeLbl.textContent = t('net_mode');
  const mode = document.createElement('select'); mode.className = 'hw-sel';
  function buildModes(values) {
    const cur = mode.value; mode.innerHTML = '';
    values.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = CNMP_LABELS[v] || ('mode ' + v); mode.appendChild(o); });
    if (values.map(String).includes(cur)) mode.value = cur;
  }
  function ensureOption(v) { if (![...mode.options].some((o) => o.value === String(v))) { const o = document.createElement('option'); o.value = v; o.textContent = CNMP_LABELS[v] || ('mode ' + v); mode.appendChild(o); } }
  buildModes([2, 13, 14, 38]);
  mode.addEventListener('change', () => UI.sendCollect(`AT+CNMP=${mode.value}`));
  modeRow.append(modeLbl, mode, mkBtn(t('hw_read'), () => readMode()), mkBtn(t('net_modes'), () => queryModes()));
  const psRow = document.createElement('div'); psRow.className = 'hw-ctlrow';
  const psLbl = document.createElement('span'); psLbl.className = 'hw-ctllab'; psLbl.textContent = t('net_ps');
  const psVal = document.createElement('b'); psVal.className = 'gn-val'; psVal.textContent = '—';
  psRow.append(psLbl, psVal, mkBtn(t('hw_read'), () => readPs()));
  // --- APN / Auth (contexto PDP cid 1) ---
  const apnInp = document.createElement('input'); apnInp.className = 'sms-to'; apnInp.style.flex = '1 1 120px'; apnInp.placeholder = 'internet';
  const ipType = document.createElement('select'); ipType.className = 'hw-sel';
  ['IP', 'IPV4V6', 'IPV6'].forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; ipType.appendChild(o); });
  const apnRow = document.createElement('div'); apnRow.className = 'fs-bar';
  apnRow.append(apnInp, ipType, mkBtn(t('net_apply'), () => applyApn()));
  const authSel = document.createElement('select'); authSel.className = 'hw-sel';
  [['0', t('uart_none')], ['1', 'PAP'], ['2', 'CHAP'], ['3', 'PAP+CHAP']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; authSel.appendChild(o); });
  const authUser = document.createElement('input'); authUser.className = 'sms-to'; authUser.style.flex = '1 1 90px'; authUser.placeholder = t('wz_user');
  const authPass = document.createElement('input'); authPass.className = 'sms-to'; authPass.type = 'password'; authPass.style.flex = '1 1 90px'; authPass.placeholder = t('wz_pass');
  const authRow = document.createElement('div'); authRow.className = 'fs-bar';
  authRow.append(authSel, authUser, authPass, mkBtn(t('net_apply'), () => applyAuth()));
  // --- enabled LTE bands (CNBP: read / set via chips) ---
  const LTE_BANDS = [1, 2, 3, 4, 5, 7, 8, 12, 13, 18, 19, 20, 25, 26, 28, 38, 39, 40, 41, 66];
  const bandGrid = document.createElement('div'); bandGrid.className = 'band-grid';
  const bandNote = document.createElement('span'); bandNote.className = 'fs-memtxt';
  const bandRow = document.createElement('div'); bandRow.className = 'fs-bar';
  bandRow.append(mkBtn(t('hw_read'), () => readBands()), mkBtn(t('net_apply'), () => applyBands()), bandNote);
  let cnbpParts = null;   // raw parts of +CNBP (non-LTE masks are preserved when applying)
  // --- power (CFUN) ---
  const pwr = document.createElement('div'); pwr.className = 'fs-bar';
  pwr.append(
    mkBtn(t('hw_full'), () => UI.sendCollect('AT+CFUN=1')),
    mkBtn(t('hw_min'), () => UI.sendCollect('AT+CFUN=0')),
    mkBtn(t('hw_rfoff'), () => UI.sendCollect('AT+CFUN=4')),
    mkBtn(t('hw_reset'), () => { if (confirm(t('hw_resetq'))) UI.send('AT+CFUN=1,1'); }),
  );
  const status = document.createElement('div'); status.className = 'fs-status';
  host.append(sec(t('bas_info')), bar, grid, sec(t('bas_opts')), opts, sec(t('net_mode')), modeRow, psRow,
    sec('APN · ' + t('net_auth')), apnRow, authRow, sec(t('net_bands')), bandRow, bandGrid,
    sec(t('hw_power')), pwr, status);

  async function readApn() {
    if (!UI.connected) return;
    const r = await UI.sendCollect('AT+CGDCONT?');
    const m = (r.lines.find((l) => /\+CGDCONT:\s*1,/i.test(l)) || '').match(/\+CGDCONT:\s*1,"([^"]*)","([^"]*)"/i);
    if (m) { if ([...ipType.options].some((o) => o.value === m[1].toUpperCase())) ipType.value = m[1].toUpperCase(); apnInp.value = m[2]; }
    const a = await UI.sendCollect('AT+CGAUTH?');
    const am = (a.lines.find((l) => /\+CGAUTH:\s*1/i.test(l)) || '').match(/\+CGAUTH:\s*1,(\d)(?:,"([^"]*)")?/i);
    if (am) { authSel.value = am[1]; if (am[2]) authUser.value = am[2]; }
  }
  async function applyApn() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const apn = apnInp.value.trim(); if (!apn) return;
    const r = await UI.sendCollect(`AT+CGDCONT=1,"${ipType.value}","${apn}"`);
    status.textContent = r.ok ? '' : t('fs_opfail');
  }
  async function applyAuth() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const ty = authSel.value;
    const cmd = ty === '0' ? 'AT+CGAUTH=1,0' : `AT+CGAUTH=1,${ty},"${authUser.value.trim()}","${authPass.value}"`;
    const r = await UI.sendCollect(cmd);
    status.textContent = r.ok ? '' : t('fs_opfail');
  }
  // CNBP: <pos>,<LTE pos>,<TDS pos> (hex masks; band N = bit N-1 of the LTE mask)
  const lteIdx = () => (cnbpParts && cnbpParts.length > 1 ? 1 : 0);
  function drawBands(lte) {
    bandGrid.innerHTML = '';
    for (const b of LTE_BANDS) {
      const chip = document.createElement('button'); chip.className = 'band-chip'; chip.textContent = 'B' + b; chip.dataset.band = b;
      if ((lte >> BigInt(b - 1)) & 1n) chip.classList.add('on');
      chip.addEventListener('click', () => chip.classList.toggle('on'));
      bandGrid.appendChild(chip);
    }
    let extra = 0;   // bits set outside the chip list (preserved when applying)
    for (let i = 0n; i < 128n; i++) if (((lte >> i) & 1n) && !LTE_BANDS.includes(Number(i) + 1)) extra++;
    bandNote.textContent = extra ? `+${extra}` : '';
  }
  async function readBands() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect('AT+CNBP?');
    const m = (r.lines.find((l) => /\+CNBP:/i.test(l)) || '').match(/\+CNBP:\s*(.+)$/i);
    if (!m) { status.textContent = t('fs_opfail'); return; }
    cnbpParts = m[1].split(',').map((x) => x.trim());
    try { drawBands(BigInt(cnbpParts[lteIdx()])); } catch (_) { cnbpParts = null; status.textContent = t('fs_opfail'); }
  }
  async function applyBands() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    if (!cnbpParts) { await readBands(); if (!cnbpParts) return; }
    let known = 0n, checked = 0n;
    for (const chip of bandGrid.querySelectorAll('.band-chip')) {
      const bit = 1n << BigInt(Number(chip.dataset.band) - 1);
      known |= bit;
      if (chip.classList.contains('on')) checked |= bit;
    }
    const cur = BigInt(cnbpParts[lteIdx()]);
    const next = (cur & ~known) | checked;          // preserves the bands outside the chips
    const parts = cnbpParts.slice();
    parts[lteIdx()] = '0x' + next.toString(16).toUpperCase();
    const r = await UI.sendCollect('AT+CNBP=' + parts.join(','));
    status.textContent = r.ok ? '' : t('fs_opfail');
    readBands();
  }

  async function readInfo() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const ati = await UI.sendCollect('AT+SIMCOMATI', { timeout: 6000 });
    const get = (re) => { for (const l of ati.lines) { const m = l.match(re); if (m) return m[1].trim(); } return null; };
    cells.model.textContent = get(/Model:\s*(.+)/i) || '—';
    cells.rev.textContent = get(/Revision:\s*(.+)/i) || '—';
    cells.imei.textContent = get(/IMEI:\s*(\d+)/i) || '—';
    status.textContent = '';
  }
  async function readPs() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect('AT+CGATT?');
    const m = (r.lines.find((l) => /\+CGATT:/i.test(l)) || '').match(/\+CGATT:\s*([01])/i);
    psVal.textContent = m ? (m[1] === '1' ? t('net_r1') : t('net_r0')) : '—';
  }
  async function readMode() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect('AT+CNMP?');
    const m = (r.lines.find((l) => /\+CNMP:/i.test(l)) || '').match(/\+CNMP:\s*(\d+)/i);
    if (m) { ensureOption(m[1]); mode.value = m[1]; }
  }
  async function queryModes() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect('AT+CNMP=?');
    const inner = ((r.lines.find((l) => /\+CNMP:/i.test(l)) || '').match(/\(([^)]*)\)/) || [])[1];
    if (inner) { buildModes(inner.split(',').map((x) => parseInt(x, 10)).filter((n) => !isNaN(n))); readMode(); }
  }
  readInfo(); readPs(); readMode(); readApn(); readBands();
}

/* ---- SIM: info, PIN, lock ---- */
function renderSim(host) {
  host.innerHTML = '';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const inp = (ph, w) => { const i = document.createElement('input'); i.className = 'sms-to'; i.placeholder = ph; i.style.flex = 'none'; if (w) i.style.width = w; return i; };
  const bar = document.createElement('div'); bar.className = 'fs-bar';
  bar.append(mkBtn(t('sim_info'), () => readInfo()));
  const grid = document.createElement('div'); grid.className = 'gn-grid';
  const cells = {};
  [['pin', 'PIN'], ['attempts', t('sim_attempts')], ['iccid', 'ICCID'], ['imsi', 'IMSI'], ['spn', t('sim_provider')]].forEach(([id, label]) => {
    const c = document.createElement('div'); c.className = 'gn-cell';
    const l = document.createElement('span'); l.className = 'gn-lab'; l.textContent = label;
    const v = document.createElement('b'); v.className = 'gn-val'; v.textContent = '—'; cells[id] = v;
    c.append(l, v); grid.appendChild(c);
  });
  // PIN unlock + lock
  const pinRow = document.createElement('div'); pinRow.className = 'fs-bar';
  const pin = inp('PIN', '90px'); pin.type = 'tel';
  const lockSeg = makeSeg([['1', t('hw_enable')], ['0', t('hw_disable')]], (v) => { if (!pin.value) { status.textContent = t('sim_needpin'); return; } UI.sendCollect(`AT+CLCK="SC",${v},"${pin.value}"`); });
  pinRow.append(pin, mkBtn(t('sim_unlock'), () => { if (pin.value) UI.sendCollect(`AT+CPIN="${pin.value}"`).then(readInfo); }));
  const lockRow = document.createElement('div'); lockRow.className = 'hw-ctlrow';
  const lockLbl = document.createElement('span'); lockLbl.className = 'hw-ctllab'; lockLbl.textContent = t('sim_lock');
  lockRow.append(lockLbl, lockSeg.el);
  // change PIN
  const chRow = document.createElement('div'); chRow.className = 'fs-bar';
  const oldP = inp(t('sim_oldpin'), '90px'); oldP.type = 'tel';
  const newP = inp(t('sim_newpin'), '90px'); newP.type = 'tel';
  chRow.append(oldP, newP, mkBtn(t('sim_change'), () => { if (oldP.value && newP.value) UI.sendCollect(`AT+CPWD="SC","${oldP.value}","${newP.value}"`); }));
  const status = document.createElement('div'); status.className = 'fs-status';
  host.append(sec(t('sim_info')), bar, grid, sec('PIN'), pinRow, lockRow, sec(t('sim_change')), chRow, status);

  async function readInfo() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const find = (lines, re) => { for (const l of lines) { const m = l.match(re); if (m) return m[1].trim(); } return null; };
    const pinR = await UI.sendCollect('AT+CPIN?'); cells.pin.textContent = find(pinR.lines, /\+CPIN:\s*(.+)/i) || '—';
    const ic = await UI.sendCollect('AT+CICCID'); cells.iccid.textContent = find(ic.lines, /\+I?CCID:\s*(\S+)/i) || '—';
    const im = await UI.sendCollect('AT+CIMI'); cells.imsi.textContent = find(im.lines, /^(\d{6,})$/) || '—';
    const sp = await UI.sendCollect('AT+CSPN?'); cells.spn.textContent = find(sp.lines, /\+CSPN:\s*"([^"]*)"/i) || '—';
    const spic = await UI.sendCollect('AT+SPIC'); cells.attempts.textContent = find(spic.lines, /\+SPIC:\s*(\d+)/i) || '—';
    const lck = await UI.sendCollect('AT+CLCK="SC",2'); const lk = find(lck.lines, /\+CLCK:\s*([01])/i); if (lk != null) lockSeg.set(lk);
    status.textContent = '';
  }
  readInfo();
}
