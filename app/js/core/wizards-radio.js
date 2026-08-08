/* wizards-radio.js — wizards: File System, GNSS, LBS, SMS, Wi-Fi, BLE, Hardware
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* (the File System wizard — SIMCom-proprietary AT+FS… / CFS… / CFTRAN… — lives in
   simcom/wizards-simcom.js) */


/* ---- GNSS: state, satellites and map (OpenStreetMap). Parsing of +CGNSSINFO/
   +CGNSINF/+CGPSINFO lives in profiles.js (each module brings its parser). ---- */
// Route from the log: tries every received line against the GNSS parsers of ALL profiles
// (so a log saved from another module can be traced too, e.g. opened with "Open log…").
// Returns [[lat, lon], …] deduplicating identical consecutive positions.
function gnssRouteFromLog(lines) {
  const parsers = [...new Set(Profiles.list().map((p) => p.gnss && p.gnss.parseInfo).filter(Boolean))];
  const nmea = new NmeaState();
  const pts = [];
  const push = (lat, lon) => {
    const last = pts[pts.length - 1];
    if (!last || last[0] !== lat || last[1] !== lon) pts.push([lat, lon]);
  };
  for (const rec of (lines || [])) {
    if (rec.cls === 'tx' || rec.cls === 'sys') continue;   // only what the module answered
    if (isNmea(rec.text)) {                                // standalone GNSS receiver (or a module streaming NMEA)
      nmea.feed(rec.text);
      if (nmea.fix.lat != null && nmea.hasFix()) push(nmea.fix.lat, nmea.fix.lon);
      continue;
    }
    for (const parse of parsers) {                         // AT modules: each brings its own parser
      let fix = null; try { fix = parse(rec.text); } catch (_) {}
      if (fix && fix.lat != null && fix.lon != null) { push(fix.lat, fix.lon); break; }
    }
  }
  return pts;
}
function osmEmbed(lat, lon) {
  const d = 0.006;
  const bbox = [lon - d, lat - d, lon + d, lat + d].map((x) => x.toFixed(6)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lon.toFixed(6)}`;
}
const GNSS_COL = { GPS: '#4a90d9', GLO: '#3a4fb0', GAL: '#16a085', BDS: '#e2231a', QZSS: '#e67e22', SBAS: '#1abc9c', NAVIC: '#8e44ad', GNSS: '#4a90d9' };
function gnssLegend(sats) {
  const counts = {}; Object.values(sats).forEach((sv) => { counts[sv.cons] = (counts[sv.cons] || 0) + 1; });
  let s = '<div class="gn-leg">';
  ['GPS', 'GLO', 'GAL', 'BDS', 'QZSS', 'SBAS', 'NAVIC', 'GNSS'].forEach((c) => { if (counts[c]) s += `<span class="gn-lg"><i style="background:${GNSS_COL[c]}"></i>${c}:${counts[c]}</span>`; });
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
  // A standalone receiver (g.stream) pushes NMEA on its own: there is nothing to poll, so the
  // wizard listens instead of asking. An AT module answers a query (g.info) and only streams
  // NMEA while the satellite view is on.
  const streaming = !!g.stream;
  const nmea = new NmeaState();
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
    if (v === '1') UI.sendCollect(g.power(true), { timeout: 6000 }).then(() => { if (!streaming) read(); });
    else { autoChk.checked = false; stopAuto(); if (!streaming) satsToggle(false); UI.sendCollect(g.power(false)); }
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
    streaming
      ? grp(t('gn_info'), trace, mkBtn('🗺 ' + t('gn_routelog'), routeFromLog))
      : grp(t('gn_info'), mkBtn(t('gn_read'), () => read()), auto, trace, mkBtn('🗺 ' + t('gn_routelog'), routeFromLog)),
    startGroup,
  );
  /* Fix/position readout. A standalone receiver already has it in the header strip, fed by the
     same stream (see live-nmea.js), so repeating it here would be duplicated data: only the AT
     modules — whose header shows the cellular cells — get this grid. */
  const grid = document.createElement('div'); grid.className = 'gn-grid';
  const cells = {};
  if (!streaming) {
    [['fix', t('gn_fix')], ['sats', t('gn_sats')], ['lat', 'Lat'], ['lon', 'Lon'],
     ['alt', t('gn_alt')], ['speed', t('gn_speed')], ['hdop', 'HDOP'], ['utc', 'UTC']].forEach(([id, label]) => {
      const c = document.createElement('div'); c.className = 'gn-cell';
      const lab = document.createElement('span'); lab.className = 'gn-lab'; lab.textContent = label;
      const val = document.createElement('b'); val.className = 'gn-val'; val.textContent = '—'; cells[id] = val;
      c.append(lab, val); grid.appendChild(c);
    });
  }
  const mapWrap = document.createElement('div'); mapWrap.className = 'gn-map';
  const ph = document.createElement('div'); ph.className = 'gn-mapph'; ph.textContent = t('gn_waiting');
  const mapEl = document.createElement('div'); mapEl.className = 'gn-leaflet'; mapEl.style.display = 'none';
  mapWrap.append(ph, mapEl);
  const status = document.createElement('div'); status.className = 'fs-status';
  /* The three views — map, satellites and deviation — go each in its own pane, in that order,
     inside a flexible grid: as many side by side as fit, the rest wraps to the next row and
     they end up in a single column when the card is narrow (see .gn-panels in styles.css). */
  const panels = document.createElement('div'); panels.className = 'gn-panels';
  const paneMap = document.createElement('div'); paneMap.className = 'gn-pane';
  const paneSats = document.createElement('div'); paneSats.className = 'gn-pane';
  const paneDev = document.createElement('div'); paneDev.className = 'gn-pane';
  paneMap.append(mapWrap, status);
  panels.appendChild(paneMap);
  host.append(bar, ...(streaming ? [] : [grid]), panels);

  // satellites section (sky/signal): only if the module exposes NMEA streaming
  let satChk = null, sky = null, sig = null, legend = null;
  const sats = nmea.sats;   // fed by NmeaState from the received GSV/GSA sentences
  if (g.satStream) {
    panels.appendChild(paneSats);   // second pane, between the map and the deviation plot
    const satHead = document.createElement('div'); satHead.className = 'gn-sechead';
    const satLbl = document.createElement('span'); satLbl.textContent = t('gn_sats');
    satHead.append(satLbl);
    if (!streaming) {       // a standalone receiver already streams: no switch to turn on
      const satTog = document.createElement('label'); satTog.className = 'gn-auto';
      satChk = document.createElement('input'); satChk.type = 'checkbox';
      satTog.append(satChk, document.createTextNode(' ' + t('gn_satstream')));
      satHead.append(satTog);
    }
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
    paneSats.append(satHead, legend, satsCols);
    if (satChk) satChk.addEventListener('change', () => satsToggle(satChk.checked));
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
  paneDev.append(devHead, devWrap, devStats);
  panels.appendChild(paneDev);
  function drawDev() {
    const r = deviationSVG(devPts);
    devWrap.innerHTML = r.svg;
    devStats.textContent = r.n ? `${t('gn_devn')}: ${r.n} · CEP50: ${r.cep.toFixed(2)} m · 2DRMS: ${r.drms2.toFixed(2)} m · ${t('gn_devmax')}: ${r.max.toFixed(2)} m` : '';
  }
  drawDev();

  // Leaflet map: marker that follows the position + trail polyline (route).
  let map = null, marker = null, trail = null, trailPts = [], lastPos = null, routeLine = null, mapRO = null;
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
    /* Leaflet caches the container size and only draws the tiles it believes are visible, so a
       container that grows (splitter dragged, the flexigrid moving the pane to a wider column,
       the panel maximized) leaves the new area grey until it is told. Watching the element
       covers every one of those cases — including the initial layout, where the container still
       measures 0 while the card is being built. */
    if (typeof ResizeObserver !== 'undefined') {
      mapRO = new ResizeObserver(() => {
        if (!map) return;
        // deferred to the next frame: invalidateSize() reads the layout the browser is writing
        requestAnimationFrame(() => { if (map) map.invalidateSize({ animate: false }); });
      });
      mapRO.observe(mapEl);
    } else {
      setTimeout(() => { if (map) map.invalidateSize(); }, 250);
    }
  }
  function destroyMap() {
    if (mapRO) { mapRO.disconnect(); mapRO = null; }
    if (map) { map.remove(); map = null; }
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
    if (!g.satStream || !satChk) return;
    satChk.checked = on;
    if (satTimer) { clearInterval(satTimer); satTimer = null; }
    if (on) {
      if (!UI.connected) { satChk.checked = false; status.textContent = t('log_notconn'); return; }
      nmea.reset();
      UI.tap = (line) => (isNmea(line) ? !!nmea.feed(line) : false);
      UI.sendCollect(g.satStart);
      satTimer = setInterval(drawSats, 1000);
    } else {
      UI.tap = null;
      if (UI.connected && g.satStop) UI.sendCollect(g.satStop);
    }
    drawSats();
  }
  autoChk.addEventListener('change', () => { stopAuto(); if (autoChk.checked) { read(); timer = setInterval(read, 3000); } });
  App.wiz.cleanup = () => {
    stopAuto();
    if (satTimer) clearInterval(satTimer);
    destroyMap();
    if (UI.tap) { UI.tap = null; if (!streaming && g.satStream && UI.connected && g.satStop) UI.sendCollect(g.satStop); }
  };

  // Paints a fix (from an AT query or from the accumulated NMEA) onto the grid, map and deviation plot.
  function applyFix(gp) {
    // `cells` is empty on a standalone receiver (the header strip shows the readout instead),
    // so every write goes through this guard rather than being duplicated in two branches.
    const put = (k, txt) => { if (cells[k]) cells[k].textContent = txt; };
    if (!gp || gp.lat == null) {
      put('fix', t('gn_nofix'));
      Object.keys(cells).forEach((k) => { if (k !== 'fix') cells[k].textContent = '—'; });
      if (!map) ph.style.display = '';
      return;
    }
    put('fix', gp.mode === '3' ? '3D' : (gp.mode === '2' ? '2D' : t('gn_fix')));
    put('sats', String(gp.sats || '—'));
    put('lat', gp.lat.toFixed(6));
    put('lon', gp.lon.toFixed(6));
    put('alt', gp.alt != null ? gp.alt.toFixed(1) + ' m' : '—');
    put('speed', gp.speed != null ? gp.speed.toFixed(1) + ' kn' : '—');
    put('hdop', gp.hdop != null ? gp.hdop.toFixed(1) : '—');
    put('utc', gp.utc || '—');
    showPos(gp.lat, gp.lon);
    devPts.push({ lat: gp.lat, lon: gp.lon }); if (devPts.length > 500) devPts.shift(); drawDev();   // feeds the deviation map
  }
  async function read() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect(g.info, { timeout: 9000 });
    applyFix(g.parseInfo(r.lines.find((l) => g.infoRe.test(l)) || ''));
  }
  async function readPower() {
    if (!UI.connected) return;
    const r = await UI.sendCollect(g.queryPower);
    const v = g.parsePower(r.lines.find((l) => g.parsePower(l) != null) || '');
    if (v != null) powerSeg.set(String(v));
  }

  if (streaming) {
    /* Standalone receiver: everything comes from the sentences it emits on its own.
       The tap never consumes the line (returns false) so the console keeps showing the raw NMEA. */
    status.textContent = t('gn_listening');
    let dirty = false;
    UI.tap = (line) => { if (isNmea(line) && nmea.feed(line)) dirty = true; return false; };
    powerSeg.set('1');
    satTimer = setInterval(() => {                 // one repaint per second, not per sentence
      if (!dirty) return;
      dirty = false;
      applyFix(nmea.fix.lat != null ? nmea.fix : null);
      drawSats();
      status.textContent = nmea.hasFix() ? t('gn_listening') : t('gn_nofix');
    }, 1000);
  } else {
    readPower();
    read();
  }
  drawSats();
}

/* (the SIMCom-only wizards — LBS, Wi-Fi scan and A76xx BLE — live in simcom/wizards-simcom.js) */
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

/* ---- Wi-Fi: dispatched by family (SIMCom scan · Espressif full Wi-Fi) ---- */
function wifiSigColor(sig) { return sig >= -60 ? '#16a085' : (sig >= -75 ? 'var(--amber)' : '#e2231a'); }

/* (the Espressif Wi-Fi and BLE renderers live in wizards-espressif.js) */
function renderWifi(host) {
  host.innerHTML = '';
  if (UI.profile.family === 'ESP') return renderWifiEsp(host);   // Espressif: its own wizard (CWMODE/CWJAP/CWLAP)
  return renderWifiSimcom(host);                                  // SIMCom: AP scan (AT+CWSTASCAN)
}

/* ---- BLE: dispatched by family (A76xx -FASE · Espressif GATT) ---- */
function renderBle(host) {
  host.innerHTML = '';
  const prof = UI.profile;
  if (!profHasCap(prof, 'ble')) {
    const n = document.createElement('div'); n.className = 'fs-status'; n.style.color = 'var(--ink-dim)';
    n.textContent = t('ble_unsupported').replace('{mod}', prof.name);
    host.appendChild(n); return;
  }
  if (prof.family === 'ESP') return renderBleEsp(host);   // ESP32-C6: Espressif BLE* commands
  return renderBleSimcom(host);                                   // A76xx -FASE: BLE* commands
}
/* (the Hardware wizard — SIMCom-proprietary CPMUTEMP / CADC / CGDRT / CVALARM — lives in
   simcom/wizards-simcom.js; the generic pill/dual-range widgets stay here) */
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
  // Which commands report signal is vendor business: the profile declares them (signalPoll).
  async function poll() {
    if (!UI.connected) return;
    for (const c of (UI.profile.signalPoll || [])) {
      if (!UI.connected) return;
      await UI.sendCollect(c, { timeout: 3000 });
    }
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


/* ---- GNSS receiver: configuration through the proprietary sentences of its chip ----
   Vendor-agnostic: every sentence comes from the profile's GnssChipDriver (see drivers.js),
   which lives in the chip maker's folder (app/js/airoha, app/js/icoe). This renderer only
   builds the form and frames what the driver returns with nmeaFrame() so the checksum is right. */
function renderGnssChip(host) {
  host.innerHTML = '';
  const g = UI.profile.gnss || {};
  const chip = g.chip;
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const note = (txt) => { const d = document.createElement('div'); d.className = 'fs-status'; d.style.color = 'var(--ink-dim)'; d.textContent = txt; return d; };
  const send = (sentence) => { if (sentence && UI.connected) UI.send(nmeaFrame(sentence)); };

  if (!chip) { host.appendChild(note(t('gc_nochip').replace('{mod}', UI.profile.name))); return; }

  // Chip identification: this is the layer that decides which sentences the module understands.
  host.appendChild(sec(t('gc_chip')));
  const idRow = document.createElement('div'); idRow.className = 'fs-bar';
  const idTxt = document.createElement('span'); idTxt.className = 'fs-fd';
  idTxt.textContent = `${chip.name}${chip.proto ? '  ·  $' + chip.proto : ''}`;
  idRow.append(idTxt);
  if (chip.version) idRow.appendChild(mkBtn(t('gc_version'), () => send(chip.version)));
  if (chip.save) idRow.appendChild(mkBtn(t('gc_save'), () => send(chip.save)));
  host.append(idRow);

  // A chip whose proprietary set is not mapped yet: the NMEA reading works, configuring does not.
  if (!chip.commands) {
    host.appendChild(note(t('gc_unmapped').replace('{chip}', chip.name)));
    if (chip.doc) host.appendChild(note(chip.doc));
    return;
  }

  // Restarts: how much of the previous state the receiver keeps (TTFF grows downwards).
  host.appendChild(sec(t('gn_start')));
  const startRow = document.createElement('div'); startRow.className = 'fs-bar';
  if (chip.hot) startRow.appendChild(mkBtn(t('gn_hot'), () => send(chip.hot)));
  if (chip.warm) startRow.appendChild(mkBtn(t('gn_warm'), () => send(chip.warm)));
  if (chip.cold) startRow.appendChild(mkBtn(t('gn_cold'), () => send(chip.cold)));
  if (chip.coldFull) startRow.appendChild(mkBtn(t('gc_fullcold'), () => send(chip.coldFull)));
  host.appendChild(startRow);

  // Fix rate: how often the receiver computes and emits a position.
  if (chip.fixRate) {
    host.appendChild(sec(t('gc_rate')));
    const rateRow = document.createElement('div'); rateRow.className = 'fs-bar';
    const rateSel = document.createElement('select'); rateSel.className = 'hw-sel';
    (chip.rates || [['1000', '1 Hz']]).forEach(([v, label]) => { const o = document.createElement('option'); o.value = v; o.textContent = label; rateSel.appendChild(o); });
    rateRow.append(rateSel, mkBtn(t('gc_apply'), () => send(chip.fixRate(Number(rateSel.value)))));
    host.appendChild(rateRow);
  }

  // Per-sentence output rate: 0 disables it, N emits it once every N fixes.
  if (chip.sentenceRate && chip.sentences) {
    host.appendChild(sec(t('gc_sentences')));
    const sRow = document.createElement('div'); sRow.className = 'fs-bar';
    const sSel = document.createElement('select'); sSel.className = 'hw-sel';
    chip.sentences.forEach(([v, label]) => { const o = document.createElement('option'); o.value = v; o.textContent = label; sSel.appendChild(o); });
    const sNum = document.createElement('input'); sNum.type = 'number'; sNum.className = 'mac-delay'; sNum.value = '1'; sNum.min = '0'; sNum.max = '20';
    sRow.append(sSel, sNum,
      mkBtn(t('gc_apply'), () => send(chip.sentenceRate(sSel.value, Number(sNum.value)))),
      mkBtn(t('gc_off'), () => send(chip.sentenceRate(sSel.value, 0))));
    host.append(sRow, note(t('gc_sentences_help')));
  }

  // Constellations the receiver searches for — which ones it offers is the chip's business.
  if (chip.constellations) {
    host.appendChild(sec(t('gc_cons')));
    const cRow = document.createElement('div'); cRow.className = 'fs-bar';
    const boxes = {};
    (chip.sysList || [['gps', 'GPS'], ['glo', 'GLONASS'], ['gal', 'Galileo'], ['bds', 'BeiDou'], ['qzss', 'QZSS']]).forEach(([k, label]) => {
      const l = document.createElement('label'); l.className = 'gn-auto';
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = true; boxes[k] = c;
      l.append(c, document.createTextNode(' ' + label));
      cRow.appendChild(l);
    });
    cRow.appendChild(mkBtn(t('gc_apply'), () => {
      const sys = {}; Object.keys(boxes).forEach((k) => { sys[k] = boxes[k].checked; });
      send(chip.constellations(sys));
    }));
    host.appendChild(cRow);
  }

  // Serial port speed: it takes effect on the module, so the terminal has to follow.
  if (chip.baud) {
    host.appendChild(sec(t('gc_baud')));
    const bRow = document.createElement('div'); bRow.className = 'fs-bar';
    const bSel = document.createElement('select'); bSel.className = 'hw-sel';
    (chip.bauds || [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]).forEach((b) => { const o = document.createElement('option'); o.value = String(b); o.textContent = String(b); if (b === 115200) o.selected = true; bSel.appendChild(o); });
    bRow.append(bSel, mkBtn(t('gc_apply'), () => send(chip.baud(Number(bSel.value)))));
    host.append(bRow, note(t('gc_baud_help')));
  }
}
