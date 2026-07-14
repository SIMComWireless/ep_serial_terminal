/* wizards-radio.js — wizards: File System, GNSS, LBS, SMS, Wi-Fi, BLE, Hardware
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* ---- module file browser (parses AT+FSCD/AT+FSLS live) ---- */
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

/* ---- GNSS: state, satellites and map (OpenStreetMap). Parsing of +CGNSSINFO/
   +CGNSINF/+CGPSINFO lives in profiles.js (each module brings its parser). ---- */
// Route from the log: tries every received line against the GNSS parsers of ALL profiles
// (so a log saved from another module can be traced too, e.g. opened with "Open log…").
// Returns [[lat, lon], …] deduplicating identical consecutive positions.
function gnssRouteFromLog(lines) {
  const parsers = [...new Set(Profiles.list().map((p) => p.gnss && p.gnss.parseInfo).filter(Boolean))];
  const pts = [];
  for (const rec of (lines || [])) {
    if (rec.cls === 'tx' || rec.cls === 'sys') continue;   // only what the module answered
    for (const parse of parsers) {
      let fix = null; try { fix = parse(rec.text); } catch (_) {}
      if (fix && fix.lat != null && fix.lon != null) {
        const last = pts[pts.length - 1];
        if (!last || last[0] !== fix.lat || last[1] !== fix.lon) pts.push([fix.lat, fix.lon]);
        break;
      }
    }
  }
  return pts;
}
function osmEmbed(lat, lon) {
  const d = 0.006;
  const bbox = [lon - d, lat - d, lon + d, lat + d].map((x) => x.toFixed(6)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lon.toFixed(6)}`;
}
const GNSS_COL = { GPS: '#4a90d9', GLO: '#3a4fb0', GAL: '#16a085', BDS: '#e2231a', QZSS: '#e67e22', SBAS: '#1abc9c', NAVIC: '#8e44ad' };
const GSV_TALKER = { GP: 'GPS', GL: 'GLO', GA: 'GAL', GB: 'BDS', BD: 'BDS', GQ: 'QZSS', GI: 'NAVIC', GN: 'GPS' };
function parseGsv(line, sats) {
  const body = line.replace(/^\$/, '').split('*')[0];
  const f = body.split(',');
  const tag = (f[0] || '').toUpperCase();
  if (!/GSV$/.test(tag)) return false;
  const cons = GSV_TALKER[tag.slice(0, 2)]; if (!cons) return true;
  if (parseInt(f[2], 10) === 1) Object.keys(sats).forEach((k) => { if (sats[k].cons === cons) delete sats[k]; });
  for (let i = 4; i < f.length; i += 4) {
    const prn = (f[i] || '').trim(); if (!prn) continue;
    const el = parseInt(f[i + 1], 10), az = parseInt(f[i + 2], 10), snr = parseInt(f[i + 3], 10);
    sats[cons + '-' + prn] = { cons, prn, el: isNaN(el) ? null : el, az: isNaN(az) ? null : az, snr: isNaN(snr) ? 0 : snr };
  }
  return true;
}
function gnssLegend(sats) {
  const counts = {}; Object.values(sats).forEach((sv) => { counts[sv.cons] = (counts[sv.cons] || 0) + 1; });
  let s = '<div class="gn-leg">';
  ['GPS', 'GLO', 'GAL', 'BDS', 'QZSS', 'SBAS', 'NAVIC'].forEach((c) => { if (counts[c]) s += `<span class="gn-lg"><i style="background:${GNSS_COL[c]}"></i>${c}:${counts[c]}</span>`; });
  return s + '</div>';
}
function skyViewSVG(sats) {
  const W = 260, cx = W / 2, cy = W / 2, R = W / 2 - 18, ring = (el) => (90 - el) / 90 * R;
  let s = `<svg viewBox="0 0 ${W} ${W}" class="gn-sky" xmlns="http://www.w3.org/2000/svg">`;
  [0, 30, 60].forEach((el) => { s += `<circle cx="${cx}" cy="${cy}" r="${ring(el).toFixed(1)}" fill="none" stroke="var(--line)"/>`; });
  s += `<line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}" stroke="var(--line)"/><line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="var(--line)"/>`;
  [['N', cx, cy - R - 5, 'middle'], ['S', cx, cy + R + 13, 'middle'], ['E', cx + R + 9, cy + 4, 'middle'], ['W', cx - R - 9, cy + 4, 'middle']]
    .forEach(([tx, x, y, a]) => { s += `<text x="${x}" y="${y}" text-anchor="${a}" class="gn-skylab">${tx}</text>`; });
  Object.values(sats).forEach((sv) => {
    if (sv.el == null || sv.az == null) return;
    const r = ring(Math.max(0, sv.el)), a = sv.az * Math.PI / 180;
    const x = cx + r * Math.sin(a), y = cy - r * Math.cos(a), c = GNSS_COL[sv.cons] || '#888';
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${c}" opacity="${sv.snr ? 1 : 0.4}"/><text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle" class="gn-svtx">${sv.prn}</text>`;
  });
  return s + '</svg>';
}
function signalBars(sats) {
  const arr = Object.values(sats).sort((a, b) => (a.cons + a.prn).localeCompare(b.cons + b.prn));
  if (!arr.length) return `<div class="gn-empty">${t('gn_waiting')}</div>`;
  let s = '<div class="gn-bars">';
  arr.forEach((sv) => {
    const w = Math.max(3, Math.min(1, sv.snr / 50) * 100), c = GNSS_COL[sv.cons] || '#888';
    s += `<div class="gn-bar" title="${sv.cons} ${sv.prn}"><span class="gn-bprn">${sv.prn}</span><div class="gn-btrack"><div class="gn-bfill" style="width:${w.toFixed(0)}%;background:${c}"></div></div><span class="gn-bnum">${sv.snr || ''}</span></div>`;
  });
  return s + '</div>';
}
// Scatter/deviation map: each fix as a point relative to the mean position (in meters), with range rings.
function deviationSVG(pts) {
  const W = 260, C = W / 2, R = C - 26;
  const placeholder = `<svg viewBox="0 0 ${W} ${W}" class="gn-dev" xmlns="http://www.w3.org/2000/svg"><circle cx="${C}" cy="${C}" r="${R}" class="gn-devring"/><text x="${C}" y="${C + 4}" text-anchor="middle" class="gn-skylab">${t('gn_waiting')}</text></svg>`;
  if (!pts.length) return { svg: placeholder, n: 0, cep: 0, drms2: 0, max: 0 };
  const k = Math.PI / 180;
  const mlat = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const mlon = pts.reduce((a, p) => a + p.lon, 0) / pts.length;
  const mppLon = 111320 * Math.cos(mlat * k);
  const off = pts.map((p) => ({ e: (p.lon - mlon) * mppLon, n: (p.lat - mlat) * 111320 }));
  let maxR = 0; off.forEach((o) => { const r = Math.hypot(o.e, o.n); if (r > maxR) maxR = r; });
  maxR = maxR || 1;
  const raw = maxR / 3, p10 = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * p10 >= raw) || 10) * p10;
  const fullR = step * Math.ceil(maxR / step), sc = R / fullR;
  let s = `<svg viewBox="0 0 ${W} ${W}" class="gn-dev" xmlns="http://www.w3.org/2000/svg">`;
  for (let r = step; r <= fullR + 1e-6; r += step) {
    s += `<circle cx="${C}" cy="${C}" r="${(r * sc).toFixed(1)}" class="gn-devring"/>`;
    s += `<text x="${C + 3}" y="${(C - r * sc - 2).toFixed(1)}" class="gn-skylab">${r < 10 ? r.toFixed(1) : r.toFixed(0)} m</text>`;
  }
  s += `<line x1="${C}" y1="${C - R}" x2="${C}" y2="${C + R}" class="gn-devaxis"/><line x1="${C - R}" y1="${C}" x2="${C + R}" y2="${C}" class="gn-devaxis"/>`;
  [['N', C, C - R - 6, 'middle'], ['S', C, C + R + 13, 'middle'], ['E', C + R + 8, C + 4, 'start'], ['W', C - R - 8, C + 4, 'end']]
    .forEach(([tx, x, y, a]) => { s += `<text x="${x}" y="${y}" text-anchor="${a}" class="gn-skylab">${tx}</text>`; });
  off.forEach((o, i) => {
    const x = C + o.e * sc, y = C - o.n * sc, last = i === off.length - 1;
    const op = last ? 1 : (0.2 + 0.75 * (i / Math.max(1, off.length - 1)));
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${last ? 4 : 2.2}" class="${last ? 'gn-devnow' : 'gn-devpt'}" style="opacity:${op.toFixed(2)}"/>`;
  });
  s += '</svg>';
  const radii = off.map((o) => Math.hypot(o.e, o.n)).sort((a, b) => a - b);
  const cep = radii[Math.floor(radii.length * 0.5)] || 0;
  const rms = Math.sqrt(radii.reduce((a, r) => a + r * r, 0) / radii.length);
  return { svg: s, n: pts.length, cep, drms2: 2 * rms, max: maxR };
}
function renderGnss(host) {
  host.innerHTML = '';
  const prof = UI.profile, g = prof.gnss;
  if (!g || !g.supported) {
    const n = document.createElement('div'); n.className = 'fs-status'; n.style.color = 'var(--ink-dim)';
    n.textContent = t('gn_unsupported').replace('{mod}', prof.name);
    host.appendChild(n); return;
  }
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const bar = document.createElement('div'); bar.className = 'fs-bar gn-toolbar';
  const auto = document.createElement('label'); auto.className = 'gn-auto';
  const autoChk = document.createElement('input'); autoChk.type = 'checkbox';
  auto.append(autoChk, document.createTextNode(' ' + t('gn_auto')));
  const trace = document.createElement('label'); trace.className = 'gn-auto';
  const traceChk = document.createElement('input'); traceChk.type = 'checkbox';
  trace.append(traceChk, document.createTextNode(' ' + t('gn_trace')));
  // grupo etiqueta + controles
  const grp = (labelText, ...controls) => { const gg = document.createElement('div'); gg.className = 'gn-grp'; const l = document.createElement('span'); l.className = 'gn-grplbl'; l.textContent = labelText; gg.append(l, ...controls); return gg; };
  // POWER: toggle On/Off
  const powerSeg = makeSeg([['1', t('gn_on')], ['0', t('gn_off')]], (v) => {
    if (v === '1') UI.sendCollect(g.power(true), { timeout: 6000 }).then(read);
    else { autoChk.checked = false; stopAuto(); satsToggle(false); UI.sendCollect(g.power(false)); }
  });
  // START: Cold / Warm / Hot
  const startBtns = document.createElement('div'); startBtns.className = 'gn-startbtns';
  startBtns.append(
    mkBtn(t('gn_cold'), () => UI.sendCollect(g.cold)),
    mkBtn(t('gn_warm'), () => UI.sendCollect(g.warm)),
    mkBtn(t('gn_hot'), () => UI.sendCollect(g.hot)),
  );
  const startGroup = grp(t('gn_start'), startBtns); startGroup.classList.add('gn-startgroup');
  bar.append(
    grp(t('gn_power'), powerSeg.el),
    grp(t('gn_info'), mkBtn(t('gn_read'), () => read()), auto, trace, mkBtn('🗺 ' + t('gn_routelog'), routeFromLog)),
    startGroup,
  );
  const grid = document.createElement('div'); grid.className = 'gn-grid';
  const cells = {};
  [['fix', t('gn_fix')], ['sats', t('gn_sats')], ['lat', 'Lat'], ['lon', 'Lon'],
   ['alt', t('gn_alt')], ['speed', t('gn_speed')], ['hdop', 'HDOP'], ['utc', 'UTC']].forEach(([id, label]) => {
    const c = document.createElement('div'); c.className = 'gn-cell';
    const lab = document.createElement('span'); lab.className = 'gn-lab'; lab.textContent = label;
    const val = document.createElement('b'); val.className = 'gn-val'; val.textContent = '—'; cells[id] = val;
    c.append(lab, val); grid.appendChild(c);
  });
  const mapWrap = document.createElement('div'); mapWrap.className = 'gn-map';
  const ph = document.createElement('div'); ph.className = 'gn-mapph'; ph.textContent = t('gn_waiting');
  const mapEl = document.createElement('div'); mapEl.className = 'gn-leaflet'; mapEl.style.display = 'none';
  mapWrap.append(ph, mapEl);
  const status = document.createElement('div'); status.className = 'fs-status';
  host.append(bar, grid, mapWrap, status);

  // satellites section (sky/signal): only if the module exposes NMEA streaming
  let satChk = null, sats = {}, sky = null, sig = null, legend = null;
  if (g.satStream) {
    const satHead = document.createElement('div'); satHead.className = 'gn-sechead';
    const satLbl = document.createElement('span'); satLbl.textContent = t('gn_sats');
    const satTog = document.createElement('label'); satTog.className = 'gn-auto';
    satChk = document.createElement('input'); satChk.type = 'checkbox';
    satTog.append(satChk, document.createTextNode(' ' + t('gn_satstream')));
    satHead.append(satLbl, satTog);
    legend = document.createElement('div');
    const skyCol = document.createElement('div'); skyCol.className = 'gn-col';
    const skyLbl = document.createElement('div'); skyLbl.className = 'gn-sublab'; skyLbl.textContent = t('gn_sky');
    sky = document.createElement('div'); sky.className = 'gn-skywrap';
    skyCol.append(skyLbl, sky);
    const sigCol = document.createElement('div'); sigCol.className = 'gn-col';
    const sigLbl = document.createElement('div'); sigLbl.className = 'gn-sublab'; sigLbl.textContent = t('gn_signal');
    sig = document.createElement('div');
    sigCol.append(sigLbl, sig);
    const satsCols = document.createElement('div'); satsCols.className = 'gn-satbox';
    satsCols.append(skyCol, sigCol);
    host.append(satHead, legend, satsCols);
    satChk.addEventListener('change', () => satsToggle(satChk.checked));
  }

  // Deviation map: fix scatter relative to the mean position (accuracy: CEP50 / 2DRMS).
  let devPts = [];
  const devHead = document.createElement('div'); devHead.className = 'gn-sechead';
  const devLbl = document.createElement('span'); devLbl.textContent = t('gn_dev');
  const devClr = document.createElement('button'); devClr.className = 'fs-btn gn-devclr'; devClr.textContent = t('gn_devclear');
  devClr.addEventListener('click', () => { devPts = []; drawDev(); });
  devHead.append(devLbl, devClr);
  const devWrap = document.createElement('div'); devWrap.className = 'gn-devwrap';
  const devStats = document.createElement('div'); devStats.className = 'gn-devstats';
  host.append(devHead, devWrap, devStats);
  function drawDev() {
    const r = deviationSVG(devPts);
    devWrap.innerHTML = r.svg;
    devStats.textContent = r.n ? `${t('gn_devn')}: ${r.n} · CEP50: ${r.cep.toFixed(2)} m · 2DRMS: ${r.drms2.toFixed(2)} m · ${t('gn_devmax')}: ${r.max.toFixed(2)} m` : '';
  }
  drawDev();

  // Leaflet map: marker that follows the position + trail polyline (route).
  let map = null, marker = null, trail = null, trailPts = [], lastPos = null, routeLine = null;
  // Route rebuilt from the focused terminal's log (dashed blue; independent from the live trail).
  function routeFromLog() {
    const pts = gnssRouteFromLog(UI.focused ? UI.focused.lines : []);
    if (!pts.length) { status.textContent = t('gn_routelog_none'); return; }
    if (typeof L === 'undefined') { ph.textContent = 'Leaflet no cargó'; return; }
    ensureMap(pts[0][0], pts[0][1]);
    if (!map) return;
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(pts, { color: '#4a90d9', weight: 4, opacity: 0.9, dashArray: '6 6' }).addTo(map);
    // fit after ensureMap's deferred invalidateSize (just created, the container still measures 0)
    setTimeout(() => {
      if (!map || !routeLine) return;
      map.invalidateSize();
      if (pts.length > 1) map.fitBounds(routeLine.getBounds(), { padding: [24, 24], animate: false });
      else map.setView(pts[0], 15, { animate: false });
    }, 300);
    status.textContent = t('gn_routelog') + ': ' + pts.length + ' pts';
  }
  function ensureMap(lat, lon) {
    if (map || typeof L === 'undefined') return;
    ph.style.display = 'none'; mapEl.style.display = '';
    map = L.map(mapEl, { zoomControl: true, attributionControl: false }).setView([lat, lon], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    trail = L.polyline([], { color: '#e2231a', weight: 4, opacity: 0.85 }).addTo(map);
    marker = L.circleMarker([lat, lon], { radius: 7, weight: 2, color: '#fff', fillColor: '#e2231a', fillOpacity: 1 }).addTo(map);
    setTimeout(() => { if (map) map.invalidateSize(); }, 250);
  }
  function showPos(lat, lon) {
    if (typeof L === 'undefined') { ph.textContent = 'Leaflet no cargó'; return; }
    ensureMap(lat, lon);
    if (!map) return;
    lastPos = [lat, lon];
    marker.setLatLng(lastPos);
    if (traceChk.checked) { trailPts.push(lastPos); trail.setLatLngs(trailPts); }   // trail: joins every position
    map.panTo(lastPos, { animate: true, duration: 0.5 });
  }
  traceChk.addEventListener('change', () => {
    trailPts = traceChk.checked && lastPos ? [lastPos] : [];   // enabling starts a new trail from the current position
    if (trail) trail.setLatLngs(trailPts);
  });

  let timer = null, satTimer = null;
  function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }
  function drawSats() { if (!g.satStream) return; legend.innerHTML = gnssLegend(sats); sky.innerHTML = skyViewSVG(sats); sig.innerHTML = signalBars(sats); }
  function satsToggle(on) {
    if (!g.satStream) return;
    satChk.checked = on;
    if (satTimer) { clearInterval(satTimer); satTimer = null; }
    if (on) {
      if (!UI.connected) { satChk.checked = false; status.textContent = t('log_notconn'); return; }
      sats = {};
      UI.tap = (line) => (line[0] === '$' ? parseGsv(line, sats) : false);
      UI.sendCollect(g.satStart);
      satTimer = setInterval(drawSats, 1000);
    } else {
      UI.tap = null;
      if (UI.connected && g.satStop) UI.sendCollect(g.satStop);
    }
    drawSats();
  }
  autoChk.addEventListener('change', () => { stopAuto(); if (autoChk.checked) { read(); timer = setInterval(read, 3000); } });
  App.wiz.cleanup = () => { stopAuto(); if (satTimer) clearInterval(satTimer); if (map) { map.remove(); map = null; } if (g.satStream && UI.tap) { UI.tap = null; if (UI.connected && g.satStop) UI.sendCollect(g.satStop); } };

  async function read() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect(g.info, { timeout: 9000 });
    const gp = g.parseInfo(r.lines.find((l) => g.infoRe.test(l)) || '');
    if (!gp || gp.lat == null) {
      cells.fix.textContent = t('gn_nofix');
      Object.keys(cells).forEach((k) => { if (k !== 'fix') cells[k].textContent = '—'; });
      if (!map) ph.style.display = ''; return;
    }
    cells.fix.textContent = gp.mode === '3' ? '3D' : (gp.mode === '2' ? '2D' : t('gn_fix'));
    cells.sats.textContent = String(gp.sats || '—');
    cells.lat.textContent = gp.lat.toFixed(6);
    cells.lon.textContent = gp.lon.toFixed(6);
    cells.alt.textContent = gp.alt != null ? gp.alt.toFixed(1) + ' m' : '—';
    cells.speed.textContent = gp.speed != null ? gp.speed.toFixed(1) + ' kn' : '—';
    cells.hdop.textContent = gp.hdop != null ? gp.hdop.toFixed(1) : '—';
    cells.utc.textContent = gp.utc || '—';
    showPos(gp.lat, gp.lon);
    devPts.push({ lat: gp.lat, lon: gp.lon }); if (devPts.length > 500) devPts.shift(); drawDev();   // feeds the deviation map
  }
  async function readPower() {
    if (!UI.connected) return;
    const r = await UI.sendCollect(g.queryPower);
    const v = g.parsePower(r.lines.find((l) => g.parsePower(l) != null) || '');
    if (v != null) powerSeg.set(String(v));
  }
  readPower();
  read();
  drawSats();
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

/* ---- SMS: redactar/enviar + bandeja (AT+CMGS / CMGL / CMGD) ---- */
function parseCmgl(lines) {
  const out = []; let cur = null;
  for (const l of lines) {
    const m = l.match(/^\+CMGL:\s*(\d+),"([^"]*)","([^"]*)"/i);
    if (m) { if (cur) out.push(cur); const ts = (l.match(/"([^"]*)"\s*$/) || [])[1] || ''; cur = { idx: m[1], stat: m[2], from: m[3], ts, text: '' }; }
    else if (cur && !/^OK$/i.test(l.trim()) && l.trim() !== '') cur.text += (cur.text ? '\n' : '') + l;
  }
  if (cur) out.push(cur);
  return out;
}
// SMS in PDU mode (CMGF=0): parse the "+CMGL: idx,stat,,len\r\n<pdu>" pairs into SMS-DELIVER records.
function parseCmglPdu(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\+CMGL:\s*(\d+),(\d+)/i);
    if (!m) continue;
    const pdu = (lines[i + 1] || '').trim();
    if (!/^[0-9A-Fa-f]+$/.test(pdu)) continue;
    const d = parseDeliverPdu(pdu); if (!d) continue;
    const STAT = { 0: 'REC UNREAD', 1: 'REC READ', 2: 'STO UNSENT', 3: 'STO SENT' };
    out.push({ idx: Number(m[1]), stat: STAT[Number(m[2])] || String(m[2]), from: d.from, text: d.text, ts: d.ts });
  }
  return out;
}

function renderSms(host) {
  host.innerHTML = '';
  const pdu = !!(UI.focused && UI.focused.profile.smsPdu);   // NB-IoT (SIM7022): no text mode → PDU
  // --- compose ---
  const compose = document.createElement('div'); compose.className = 'sms-compose';
  const toRow = document.createElement('div'); toRow.className = 'sms-row';
  const toLbl = document.createElement('span'); toLbl.className = 'sms-lbl'; toLbl.textContent = t('sms_to');
  const to = document.createElement('input'); to.type = 'tel'; to.className = 'sms-to'; to.placeholder = '+54911...';
  toRow.append(toLbl, to);
  const msg = document.createElement('textarea'); msg.className = 'sms-msg'; msg.rows = 3; msg.placeholder = t('sms_msg');
  const cc = document.createElement('div'); cc.className = 'sms-cc'; cc.textContent = '0';
  const sendBar = document.createElement('div'); sendBar.className = 'sms-sendbar';
  const sendBtn = document.createElement('button'); sendBtn.className = 'fs-btn'; sendBtn.textContent = t('sms_send');
  sendBar.append(cc, sendBtn);
  compose.append(toRow, msg, sendBar);
  msg.addEventListener('input', () => { cc.textContent = String(byteLen(msg.value)); });
  // --- bandeja ---
  const inboxHd = document.createElement('div'); inboxHd.className = 'gn-sechead';
  const inboxLbl = document.createElement('span'); inboxLbl.textContent = t('sms_inbox');
  const simBtn = document.createElement('button'); simBtn.className = 'fs-btn'; simBtn.textContent = t('sms_sim'); simBtn.title = t('sms_simhint');
  const refreshBtn = document.createElement('button'); refreshBtn.className = 'fs-btn'; refreshBtn.textContent = t('sms_refresh');
  inboxHd.append(inboxLbl, simBtn, refreshBtn);
  simBtn.addEventListener('click', () => {
    const f = UI.focused;
    if (f && f.virtual && f.connected) { f.transport.injectSms(); status.textContent = t('sms_simdone'); setTimeout(refresh, 300); }
    else status.textContent = t('sms_simonly');
  });
  const list = document.createElement('div'); list.className = 'sms-list';
  const status = document.createElement('div'); status.className = 'fs-status';
  if (pdu) { const b = document.createElement('span'); b.className = 'sms-pdubadge'; b.textContent = 'PDU'; b.title = t('sms_pdu_hint'); inboxHd.insertBefore(b, refreshBtn); }
  host.append(compose, inboxHd, list, status);

  async function refresh() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    await UI.sendCollect('AT+CMGF=' + (pdu ? '0' : '1'));
    const r = await UI.sendCollect(pdu ? 'AT+CMGL=4' : 'AT+CMGL="ALL"', { timeout: 8000 });   // PDU: stat 4 = ALL
    const msgs = pdu ? parseCmglPdu(r.lines) : parseCmgl(r.lines);
    list.innerHTML = '';
    if (!msgs.length) { const e = document.createElement('div'); e.className = 'gn-empty'; e.textContent = t('sms_empty'); list.appendChild(e); status.textContent = ''; return; }
    msgs.forEach((m) => {
      const card = document.createElement('div'); card.className = 'sms-item';
      const hd = document.createElement('div'); hd.className = 'sms-ihd';
      const from = document.createElement('span'); from.className = 'sms-ifrom'; from.textContent = m.from || '(?)';
      const badge = document.createElement('span'); badge.className = 'sms-ibadge' + (/UNREAD/i.test(m.stat) ? ' unread' : ''); badge.textContent = m.stat;
      const ts = document.createElement('span'); ts.className = 'sms-its'; ts.textContent = m.ts;
      const del = document.createElement('button'); del.className = 'fs-del'; del.textContent = '🗑'; del.title = t('sms_del');
      del.addEventListener('click', async () => { await UI.sendCollect(`AT+CMGD=${m.idx}`); refresh(); });
      hd.append(from, badge, ts, del);
      const body = document.createElement('div'); body.className = 'sms-ibody'; body.textContent = m.text;
      card.append(hd, body); list.appendChild(card);
    });
    status.textContent = `${msgs.length}`;
  }
  sendBtn.addEventListener('click', async () => {
    const num = to.value.trim(), text = msg.value;
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    if (!num || !text) { status.textContent = t('sms_need'); return; }
    sendBtn.disabled = true; status.textContent = t('sms_sending');
    try {
      if (pdu) {   // PDU: AT+CMGS=<tpduLen> → '> ' → <full PDU hex> + Ctrl-Z
        const built = buildSubmitPdu(num, text);
        await UI.sendCollect('AT+CMGF=0');
        await UI.send(`AT+CMGS=${built.tpduLen}`);
        await sleep(500);
        await UI.sendRaw(built.pdu);
        await UI.sendRaw('\x1a');
      } else {
        await UI.sendCollect('AT+CMGF=1');
        await UI.send(`AT+CMGS="${num}"`);   // the module answers with the '> ' prompt
        await sleep(500);
        await UI.sendRaw(text);
        await UI.sendRaw('\x1a');             // Ctrl-Z sends
      }
      await sleep(1200);
      status.textContent = t('sms_sent'); msg.value = ''; cc.textContent = '0';
      refresh();
    } finally { sendBtn.disabled = false; }
  });
  refreshBtn.addEventListener('click', refresh);
  refresh();
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
function wifiSigColor(sig) { return sig >= -60 ? '#16a085' : (sig >= -75 ? 'var(--amber)' : '#e2231a'); }

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

function renderWifi(host) {
  host.innerHTML = '';
  if (UI.profile.family === 'ESP') return renderWifiEsp(host);   // Espressif: its own wizard (CWMODE/CWJAP/CWLAP)
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

function renderBle(host) {
  host.innerHTML = '';
  const prof = UI.profile;
  if (!profHasCap(prof, 'ble')) {
    const n = document.createElement('div'); n.className = 'fs-status'; n.style.color = 'var(--ink-dim)';
    n.textContent = t('ble_unsupported').replace('{mod}', prof.name);
    host.appendChild(n); return;
  }
  if (prof.family === 'ESP') return renderBleEsp(host);   // ESP32-C6: Espressif BLE* commands
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
function makeSeg(items, onPick) {           // theme-toggle-style pill
  const seg = document.createElement('div'); seg.className = 'seg hw-seg'; const btns = {};
  items.forEach(([val, label]) => {
    const b = document.createElement('button'); b.textContent = label; b.dataset.val = val;
    b.addEventListener('click', () => { set(val); onPick(val); }); seg.appendChild(b); btns[val] = b;
  });
  function set(val) { Object.entries(btns).forEach(([v, b]) => b.classList.toggle('on', v === String(val))); }
  return { el: seg, set };
}
function makeDualRange(opts) {               // double knob on the same axis (high ≥ low)
  const { min, max, step = 10, gap = 50 } = opts; let low = opts.low, high = opts.high;
  const el = document.createElement('div'); el.className = 'hw-range';
  const track = document.createElement('div'); track.className = 'hw-rtrack';
  const fill = document.createElement('div'); fill.className = 'hw-rfill';
  const lowT = document.createElement('div'); lowT.className = 'hw-rthumb';
  const highT = document.createElement('div'); highT.className = 'hw-rthumb';
  const lowL = document.createElement('div'); lowL.className = 'hw-rlbl lo';
  const highL = document.createElement('div'); highL.className = 'hw-rlbl hi';
  track.append(fill, lowT, highT, lowL, highL); el.append(track);
  const toPct = (v) => (v - min) / (max - min) * 100;
  function layout() {
    const lp = toPct(low), hp = toPct(high);
    lowT.style.left = lp + '%'; highT.style.left = hp + '%';
    fill.style.left = lp + '%'; fill.style.width = (hp - lp) + '%';
    lowL.style.left = lp + '%'; lowL.textContent = low + ' mV';
    highL.style.left = hp + '%'; highL.textContent = high + ' mV';
  }
  function valAt(e) { const r = track.getBoundingClientRect(); let v = min + (e.clientX - r.left) / r.width * (max - min); v = Math.round(v / step) * step; return Math.max(min, Math.min(max, v)); }
  let drag = null;
  const move = (e) => { if (!drag) return; const v = valAt(e); if (drag === 'low') low = Math.max(min, Math.min(v, high - gap)); else high = Math.min(max, Math.max(v, low + gap)); layout(); };
  const up = () => { if (!drag) return; drag = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (opts.onChange) opts.onChange(low, high); };
  const down = (which, e) => { drag = which; e.preventDefault(); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); };
  lowT.addEventListener('pointerdown', (e) => down('low', e));
  highT.addEventListener('pointerdown', (e) => down('high', e));
  layout();
  return { el, get: () => ({ low, high }) };
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

/* ---- Signal monitor: RSSI/RSRP/SINR sparklines with history + CSV ----
   Passive sampling: live.js calls sigPush() with every incoming +CSQ/+CESQ/+CPSI/+CWJAP and this
   hook redraws if the wizard is open. Optional polling: Poll toggle with selectable interval. */
let sigMonOnSample = null;   // set while the wizard is open (consumed by sigPush in live.js)

// CSV of a session's signal history (one row per sample; empty cells if the metric didn't arrive).
function sigCsv(sess) {
  const rows = ['time,rssi_dbm,rsrp_dbm,sinr_db,rsrq_db'];
  for (const p of (sess.sigHist || [])) {
    rows.push([new Date(p.t).toISOString(), p.rssi ?? '', p.rsrp ?? '', p.sinr ?? '', p.rsrq ?? ''].join(','));
  }
  return rows.join('\n') + '\n';
}

function renderSigMon(host) {
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const isEsp = UI.focused && UI.focused.profile.family === 'ESP';
  // on ESP there is only RSSI (of the associated AP); on cellular the 3 series
  const SERIES = isEsp
    ? [{ key: 'rssi', label: 'RSSI', unit: 'dBm', color: 'var(--ok)' }]
    : [{ key: 'rssi', label: 'RSSI', unit: 'dBm', color: 'var(--ok)' },
       { key: 'rsrp', label: 'RSRP', unit: 'dBm', color: 'var(--urc)' },
       { key: 'sinr', label: 'SINR', unit: 'dB', color: 'var(--amber)' }];
  const W = 560, H = 46, VISIBLE = 180;   // window: last 180 samples

  const rows = SERIES.map((sr) => {
    const wrap = document.createElement('div'); wrap.className = 'sgm-row';
    const head = document.createElement('div'); head.className = 'sgm-head';
    const lbl = document.createElement('span'); lbl.className = 'sgm-lbl'; lbl.textContent = sr.label; lbl.style.color = sr.color;
    const cur = document.createElement('span'); cur.className = 'sgm-cur'; cur.textContent = '—';
    const rng = document.createElement('span'); rng.className = 'sgm-rng'; rng.textContent = '';
    head.append(lbl, cur, rng);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.classList.add('sgm-svg');
    wrap.append(head, svg);
    return { sr, wrap, cur, rng, svg };
  });

  // controls: Poll + interval · clear · CSV
  const bar = document.createElement('div'); bar.className = 'fs-bar';
  const pollLbl = document.createElement('label'); pollLbl.className = 'toggle';
  const pollCb = document.createElement('input'); pollCb.type = 'checkbox'; pollCb.id = 'sig-poll';
  pollLbl.append(pollCb, document.createTextNode(' ' + t('sig_poll')));
  // interval like Macros' "Pause between commands": number + unit (ms/s/min/h)
  const ivalNum = document.createElement('input'); ivalNum.type = 'number'; ivalNum.className = 'mac-delay'; ivalNum.id = 'sig-ival';
  ivalNum.min = '0'; ivalNum.step = 'any'; ivalNum.value = '5';
  const ivalUnit = document.createElement('select'); ivalUnit.className = 'mac-unit'; ivalUnit.id = 'sig-unit';
  [['ms', t('unit_ms')], ['s', t('unit_s')], ['min', t('unit_min')], ['h', t('unit_h')]].forEach(([v, l]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === 's') o.selected = true; ivalUnit.appendChild(o);
  });
  const pollMs = () => Math.max(500, (Number(ivalNum.value) || 0) * MACRO_UNIT_MS[ivalUnit.value] || 5000);   // 500 ms floor: don't drown the port
  const status = document.createElement('div'); status.className = 'fs-status';
  bar.append(pollLbl, ivalNum, ivalUnit, mkBtn(t('clear'), () => { const s = UI.focused; if (s) { s.sigHist = []; redraw(); } }),
    mkBtn('⤓ CSV', () => { const s = UI.focused; if (s) downloadFile(`signal-${(s.label || 'terminal').replace(/\W+/g, '_')}-${Date.now()}.csv`, sigCsv(s), 'text/csv'); }));
  host.append(...rows.map((r) => r.wrap), bar, status);

  function redraw() {
    const s = UI.focused;
    const hist = (s && s.sigHist) || [];
    const win = hist.slice(-VISIBLE);
    for (const r of rows) {
      const pts = win.map((p, i) => [i, p[r.sr.key]]).filter(([, v]) => typeof v === 'number');
      const last = pts.length ? pts[pts.length - 1][1] : null;
      r.cur.textContent = last != null ? last + ' ' + r.sr.unit : '—';
      if (!pts.length) { r.svg.innerHTML = ''; r.rng.textContent = ''; continue; }
      let min = Math.min(...pts.map(([, v]) => v)), max = Math.max(...pts.map(([, v]) => v));
      if (max - min < 4) { const mid = (max + min) / 2; min = mid - 2; max = mid + 2; }   // minimum scale so noise doesn't "scream"
      r.rng.textContent = `${min.toFixed(0)}…${max.toFixed(0)}`;
      const n = Math.max(win.length - 1, 1);
      const xy = pts.map(([i, v]) => `${(i / n * W).toFixed(1)},${(H - 4 - (v - min) / (max - min) * (H - 8)).toFixed(1)}`);
      r.svg.innerHTML = pts.length === 1
        ? `<circle cx="${xy[0].split(',')[0]}" cy="${xy[0].split(',')[1]}" r="2.5" fill="${r.sr.color}"/>`
        : `<polyline points="${xy.join(' ')}" fill="none" stroke="${r.sr.color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
    }
  }

  // active polling: queries signal at the chosen interval (the commands are visible in the log)
  let timer = null;
  async function poll() {
    if (!UI.connected) return;
    if (isEsp) { await UI.sendCollect('AT+CWJAP?', { timeout: 3000 }); return; }
    await UI.sendCollect('AT+CSQ', { timeout: 3000 });
    if (profHasCap(UI.profile, 'cellular')) await UI.sendCollect('AT+CPSI?', { timeout: 3000 });
  }
  function restartTimer() {
    if (timer) { clearInterval(timer); timer = null; }
    if (pollCb.checked) { poll(); timer = setInterval(poll, pollMs()); }
  }
  pollCb.addEventListener('change', restartTimer);
  ivalNum.addEventListener('input', restartTimer);
  ivalUnit.addEventListener('change', restartTimer);

  sigMonOnSample = (sess) => { if (sess === UI.focused) redraw(); };
  App.wiz.cleanup = () => { if (timer) clearInterval(timer); sigMonOnSample = null; };
  redraw();
}

