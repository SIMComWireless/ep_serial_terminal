/* wizards-services-simcom.js — service wizards built on SIMCom-proprietary AT commands:
   LwM2M (AT+LW*) and CoAP (AT+COAP*) from chapters 29/30 of the A76XX manual, TLS/certificate
   management (AT+CCERT* / AT+CSSLCFG), jamming detection (AT+SJDR / AT+SJDCFG), FTP(S)
   (AT+CFTPS*) and email over SMTP (AT+CSMTPS*).
   They are plain renderers referenced from core/data.js by wizard id; the sidebar only shows
   each one when the focused profile declares the matching cap.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* ---- LwM2M (AT+LW*, ch. 29 of the A76XX manual): service, registration, objects and resources ---- */
function renderLwm2m(host) {
  host.innerHTML = '';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const inp = (ph, val, flex) => { const i = document.createElement('input'); i.className = 'sms-to'; i.style.flex = flex || '1 1 90px'; if (ph) i.placeholder = ph; if (val != null) i.value = val; return i; };
  const selOf = (opts, def) => { const s = document.createElement('select'); s.className = 'hw-sel'; opts.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; s.appendChild(o); }); if (def != null) s.value = def; return s; };
  const status = document.createElement('div'); status.className = 'fs-status';
  const run = (macro) => { if (!UI.connected) { status.textContent = t('log_notconn'); return; } runMacro(macro, 200); };

  // --- server / registration (LWSTART · LWCNF · LWOPEN / LWCLOSE · LWSTOP) ---
  const sid = selOf(['0', '1'], '0'); sid.title = 'lwm2mId';
  const server = inp('leshan.eclipseprojects.io', 'leshan.eclipseprojects.io', '2 1 140px');
  const port = inp('5683', '5683'); port.type = 'number'; port.style.flex = '0 0 80px';
  const ep = inp('endpoint', 'SIMCOM_LWM2M', '1 1 110px');
  const life = inp('300', '300'); life.type = 'number'; life.style.flex = '0 0 80px'; life.title = 'lifetime (s)';
  const row1 = document.createElement('div'); row1.className = 'fs-bar'; row1.append(sid, server, port);
  const row2 = document.createElement('div'); row2.className = 'fs-bar'; row2.append(ep, life);
  const row3 = document.createElement('div'); row3.className = 'fs-bar';
  row3.append(
    mkBtn('▶ ' + t('svc_start'), () => run('AT+LWSTART')),
    mkBtn(t('lw_register'), () => run(
      `AT+LWCNF=${sid.value},"server","${server.value.trim()}"\nAT+LWCNF=${sid.value},"serverport","${port.value}"\n` +
      `AT+LWCNF=${sid.value},"endpointname","${ep.value.trim()}"\nAT+LWCNF=${sid.value},"lifetime","${life.value}"\n@300\nAT+LWOPEN=${sid.value}`)),
    mkBtn(t('lw_deregister'), () => run(`AT+LWCLOSE=${sid.value}`)),
    mkBtn('■ ' + t('svc_stop'), () => run('AT+LWSTOP')),
  );

  // --- objetos (LWADDOBJ / LWDELOBJ) ---
  const obj = inp('3303', '3303'); obj.type = 'number'; obj.style.flex = '0 0 80px'; obj.title = 'objectId';
  const inst = inp('0', '0'); inst.type = 'number'; inst.style.flex = '0 0 60px'; inst.title = 'instanceId';
  const resList = inp('5518,5601,5602', '5518,5601,5602', '1 1 130px'); resList.title = 'resourceIds';
  const orow = document.createElement('div'); orow.className = 'fs-bar';
  const resIds = () => resList.value.split(',').map((x) => x.trim()).filter(Boolean);
  orow.append(obj, inst, resList,
    mkBtn(t('lw_add'), () => { const r = resIds(); if (r.length) run(`AT+LWADDOBJ=${sid.value},${obj.value},${inst.value},${r.length},${r.join(',')}`); }),
    mkBtn(t('fs_del'), () => run(`AT+LWDELOBJ=${sid.value},${obj.value}`)),
  );

  // --- resource (LWSET / LWGET / LWSEND notify·send) ---
  const uri = inp('/3311/0/5850', '/3303/0/5601', '1 1 110px'); uri.title = 'URI';
  const vtype = selOf(['S', 'I', 'F', 'B', 'O'], 'F'); vtype.title = 'value type';
  const val = inp('valor', '25.5', '1 1 90px');
  const rrow = document.createElement('div'); rrow.className = 'fs-bar'; rrow.append(uri, vtype, val);
  const rout = document.createElement('pre'); rout.className = 'fs-out'; rout.hidden = true;
  const brow = document.createElement('div'); brow.className = 'fs-bar';
  brow.append(
    mkBtn(t('net_apply'), () => { const v = val.value; run(`AT+LWSET=${sid.value},,"${uri.value.trim()}","${vtype.value}",${byteLen(v)},"${v}"`); }),
    mkBtn(t('fs_read'), async () => {
      if (!UI.connected) { status.textContent = t('log_notconn'); return; }
      const r = await UI.sendCollect(`AT+LWGET=${sid.value},"${uri.value.trim()}"`, { timeout: 10000 });
      const l = r.lines.find((x) => /\+LWGET:/i.test(x));
      rout.hidden = false; rout.textContent = l || t('fs_opfail');
    }),
    mkBtn('Notify', () => run(`AT+LWSEND=${sid.value},6`)),
    mkBtn(t('send'), () => run(`AT+LWSEND=${sid.value},7`)),
  );
  host.append(sec(t('lw_reg')), row1, row2, row3, sec(t('lw_objects')), orow, sec(t('lw_res')), rrow, brow, rout, status);
}

/* ---- CoAP (AT+COAP*, ch. 30 of the A76XX manual): session and messages ---- */
function renderCoap(host) {
  host.innerHTML = '';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const inp = (ph, val, flex) => { const i = document.createElement('input'); i.className = 'sms-to'; i.style.flex = flex || '1 1 90px'; if (ph) i.placeholder = ph; if (val != null) i.value = val; return i; };
  const selOf = (opts, def) => { const s = document.createElement('select'); s.className = 'hw-sel'; opts.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; s.appendChild(o); }); if (def != null) s.value = def; return s; };
  const status = document.createElement('div'); status.className = 'fs-status';

  // --- connection (COAPSTART · COAPOPEN / COAPCLOSE · COAPSTOP) ---
  const server = inp('coap.me', 'coap.me', '2 1 140px');
  const port = inp('5683', '5683'); port.type = 'number'; port.style.flex = '0 0 80px';
  const csid = selOf(['0', '1'], '0'); csid.title = 'coap_sessionId';
  const svcRow = document.createElement('div'); svcRow.className = 'fs-bar';
  svcRow.append(
    mkBtn('▶ ' + t('svc_start'), () => { if (UI.connected) UI.send('AT+COAPSTART'); }),
    mkBtn('■ ' + t('svc_stop'), () => { if (UI.connected) UI.send('AT+COAPSTOP'); }),
  );
  const openRow = document.createElement('div'); openRow.className = 'fs-bar';
  openRow.append(server, port, csid,
    mkBtn(t('fs_fopen'), async () => {
      if (!UI.connected) { status.textContent = t('log_notconn'); return; }
      const prevTap = UI.tap;   // +COAPOPEN: <id> arrives AFTER the OK → capture it with a short tap
      const tm = setTimeout(() => { if (UI.focused) UI.tap = prevTap; }, 4000);
      UI.tap = (line) => {
        const m = line.match(/\+COAPOPEN:\s*(\d)/i);
        if (m) { csid.value = m[1]; clearTimeout(tm); if (UI.focused) UI.tap = prevTap; }
        return false;
      };
      await UI.send(`AT+COAPOPEN="${server.value.trim()}",${port.value}`);
    }),
    mkBtn(t('fs_fclose'), () => { if (UI.connected) UI.send(`AT+COAPCLOSE=${csid.value}`); }),
  );

  // --- message (COAPSEND; the reply arrives as a +COAPRECV URC in the console) ---
  const mtype = selOf(['con', 'non', 'ack', 'rst'], 'con');
  const method = selOf(['get', 'post', 'put', 'delete', 'fetch', 'patch', 'ipatch'], 'get');
  const payload = inp('payload', 'hello', '1 1 140px');
  const msgRow = document.createElement('div'); msgRow.className = 'fs-bar';
  msgRow.append(mtype, method, payload,
    mkBtn(t('send'), () => {
      if (!UI.connected) { status.textContent = t('log_notconn'); return; }
      const d = payload.value;
      UI.send(`AT+COAPSEND=${csid.value},"${mtype.value}","${method.value}",${byteLen(d)},"${d}"`);
    }),
  );
  host.append(sec(t('ftp_conn')), svcRow, openRow, sec(t('coap_msg')), msgRow, status);
}


/* ---- TLS / Cert: certificate management and SSL context ---- */
function parseCertList(lines) { const out = []; for (const l of lines) { const m = l.match(/\+CCERTLIST:\s*"([^"]*)"/i); if (m) out.push(m[1]); } return out; }
function renderTls(host) {
  host.innerHTML = '';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const field = (cap, el) => { const r = document.createElement('div'); r.className = 'hw-ctlrow'; const l = document.createElement('span'); l.className = 'hw-ctllab'; l.textContent = cap; r.append(l, el); return r; };
  // certificados
  const listBar = document.createElement('div'); listBar.className = 'fs-bar';
  listBar.append(mkBtn(t('tls_list'), () => refresh()));
  const list = document.createElement('div'); list.className = 'sms-list';
  // descarga
  const name = document.createElement('input'); name.className = 'sms-to'; name.style.flex = '1'; name.placeholder = t('tls_name');
  const pem = document.createElement('textarea'); pem.className = 'sms-msg'; pem.rows = 5; pem.placeholder = t('tls_pem');
  const dlBar = document.createElement('div'); dlBar.className = 'sms-sendbar';
  const cc = document.createElement('div'); cc.className = 'sms-cc'; cc.textContent = '0 B';
  pem.addEventListener('input', () => { cc.textContent = byteLen(pem.value) + ' B'; });
  dlBar.append(cc, mkBtn(t('tls_download'), () => download()));
  // contexto SSL
  const ctx = document.createElement('input'); ctx.type = 'number'; ctx.value = '0'; ctx.min = '0'; ctx.max = '9'; ctx.className = 'lbs-cid';
  const ver = document.createElement('select'); ver.className = 'hw-sel';
  [['4', 'All'], ['3', 'TLS 1.2'], ['2', 'TLS 1.1'], ['1', 'TLS 1.0'], ['0', 'SSL 3.0']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; ver.appendChild(o); });
  ver.value = '4';
  const auth = document.createElement('select'); auth.className = 'hw-sel';
  [['0', t('tls_am0')], ['1', t('tls_am1')], ['2', t('tls_am2')]].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; auth.appendChild(o); });
  const ca = document.createElement('select'); ca.className = 'hw-sel';
  const status = document.createElement('div'); status.className = 'fs-status';
  host.append(sec(t('tls_certs')), listBar, list, field(t('tls_name'), name), pem, dlBar,
    sec(t('tls_sslctx')), field(t('tls_ctx'), ctx), field('TLS', ver), field(t('tls_authmode'), auth), field(t('tls_cacert'), ca),
    mkBtn(t('tls_apply'), () => applyCfg()), status);

  function fillCa(certs) { ca.innerHTML = ''; const none = document.createElement('option'); none.value = ''; none.textContent = t('tls_none'); ca.appendChild(none); certs.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; ca.appendChild(o); }); }
  async function refresh() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect('AT+CCERTLIST', { timeout: 6000 });
    const certs = parseCertList(r.lines);
    fillCa(certs);
    list.innerHTML = '';
    if (!certs.length) { const e = document.createElement('div'); e.className = 'gn-empty'; e.textContent = t('tls_nocerts'); list.appendChild(e); return; }
    certs.forEach((c) => {
      const row = document.createElement('div'); row.className = 'wifi-item';
      const nm = document.createElement('span'); nm.className = 'wifi-mac'; nm.style.flex = '1'; nm.textContent = c;
      const del = document.createElement('button'); del.className = 'fs-del'; del.textContent = '🗑'; del.title = t('sms_del');
      del.addEventListener('click', async () => { await UI.sendCollect(`AT+CCERTDELE="${c}"`); refresh(); });
      row.append(nm, del); list.appendChild(row);
    });
  }
  async function download() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const nm = name.value.trim(), data = pem.value;
    if (!nm || !data) { status.textContent = t('tls_needname'); return; }
    status.textContent = t('tls_downloading');
    await UI.send(`AT+CCERTDOWN="${nm}",${byteLen(data)}`);
    await sleep(500);
    await UI.sendRaw(data);
    await sleep(900);
    status.textContent = ''; name.value = ''; pem.value = ''; cc.textContent = '0 B'; refresh();
  }
  async function applyCfg() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const c = ctx.value || 0;
    await UI.sendCollect(`AT+CSSLCFG="sslversion",${c},${ver.value}`);
    await UI.sendCollect(`AT+CSSLCFG="authmode",${c},${auth.value}`);
    if (ca.value) await UI.sendCollect(`AT+CSSLCFG="cacert",${c},"${ca.value}"`);
    status.textContent = 'OK';
  }
  refresh();
}


/* ---- Jamming Detection (AT+SJDR / AT+SJDCFG) ---- */
function renderJam(host) {
  host.innerHTML = '';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const field = (cap, ...els) => { const r = document.createElement('div'); r.className = 'hw-ctlrow'; const l = document.createElement('span'); l.className = 'hw-ctllab'; l.textContent = cap; r.append(l, ...els); return r; };
  const fieldT = (cap, tip, ...els) => { const r = document.createElement('div'); r.className = 'hw-ctlrow'; const l = document.createElement('span'); l.className = 'hw-ctllab jtip'; l.textContent = cap; l.tabIndex = 0; l.setAttribute('data-tip', tip); r.append(l, ...els); return r; };
  const numIn = (val, mn, mx) => { const i = document.createElement('input'); i.type = 'number'; i.value = String(val); i.min = String(mn); i.max = String(mx); i.className = 'lbs-cid'; i.style.width = '64px'; return i; };
  const enSeg = makeSeg([['1', t('hw_enable')], ['0', t('hw_disable')]], (v) => UI.sendCollect(`AT+SJDR=${v}`));
  const badge = document.createElement('div'); badge.className = 'jam-badge'; badge.textContent = '—';
  const period = numIn(0, 0, 120), mnl = numIn(17, 0, 31), minch = numIn(5, 0, 254);
  const sinr = numIn(0, -50, 30), rsrp = numIn(-110, -140, -44), rsrq = numIn(-10, -19, -1);
  const detSeg = makeSeg([['1', t('hw_enable')], ['0', t('hw_disable')]], (v) => UI.sendCollect(`AT+SJDCFG="detecstat",${v}`));
  const status = document.createElement('div'); status.className = 'fs-status';
  host.append(
    sec(t('jam_detect')),
    (() => { const r = document.createElement('div'); r.className = 'fs-bar jam-detrow'; r.append(field(t('hw_enable'), enSeg.el), field(t('jam_status'), badge), mkBtn(t('hw_read'), () => readEnable())); return r; })(),
    sec(t('jam_config')),
    fieldT(t('jam_period'), t('jam_tip_period'), period),
    fieldT(t('jam_mnl'), t('jam_tip_mnl'), mnl),
    fieldT(t('jam_minch'), t('jam_tip_minch'), minch),
    fieldT(t('jam_detecstat'), t('jam_tip_detecstat'), detSeg.el),
    fieldT(t('jam_sinr'), t('jam_tip_sinr'), sinr),
    fieldT(t('jam_rsrp'), t('jam_tip_rsrp'), rsrp),
    fieldT(t('jam_rsrq'), t('jam_tip_rsrq'), rsrq),
    (() => { const r = document.createElement('div'); r.className = 'fs-bar'; r.append(mkBtn(t('hw_read'), () => readCfg()), mkBtn(t('jam_supported'), () => readSupported()), mkBtn(t('tls_apply'), () => apply())); return r; })(),
    sec(t('jam_diag')),
    (() => { const d = document.createElement('div'); d.className = 'fs-status'; d.style.color = 'var(--ink-faint)'; d.textContent = t('jam_diag_hint'); return d; })(),
    (() => { const r = document.createElement('div'); r.className = 'fs-bar'; r.append(mkBtn('📶 ' + t('jam_readsig'), () => readSignals())); return r; })(),
    status,
  );

  let reading = false;
  function setBadge(st) {
    if (st === 1) { badge.textContent = t('jam_detected'); badge.className = 'jam-badge jammed'; }
    else if (st === 0) { badge.textContent = t('jam_none'); badge.className = 'jam-badge ok'; }
    else { badge.textContent = '—'; badge.className = 'jam-badge'; }
  }
  UI.tap = (line) => { const m = line.match(/\+SJDR:\s*([01])\s*$/i); if (m && !reading) setBadge(Number(m[1])); return false; };
  App.wiz.cleanup = () => { if (UI.tap) UI.tap = null; };

  async function readEnable() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    reading = true; const r = await UI.sendCollect('AT+SJDR?'); reading = false;
    const m = (r.lines.find((l) => /\+SJDR:/i.test(l)) || '').match(/\+SJDR:\s*([01])/i); if (m) enSeg.set(m[1]);
  }
  async function readSupported() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    reading = true; const r = await UI.sendCollect('AT+SJDCFG=?'); reading = false;
    const lines = r.lines.filter((l) => /\+SJDCFG:/i.test(l));
    const rng = (type) => { const l = lines.find((x) => new RegExp('"' + type + '"').test(x)); const m = l && l.match(/\(([^)]*)\)/); return m ? m[1] : null; };
    const setRange = (inp, type) => { const g = rng(type); if (!g) return; const mm = g.match(/(-?\d+)\s*[-~]\s*(-?\d+)/); if (mm) { inp.min = mm[1]; inp.max = mm[2]; inp.title = type + ': ' + g; } };
    setRange(period, 'period'); setRange(mnl, 'mnl'); setRange(minch, 'minch'); setRange(sinr, 'sinr'); setRange(rsrp, 'rsrp'); setRange(rsrq, 'rsrq');
    status.textContent = lines.map((l) => l.replace(/.*\+SJDCFG:\s*/i, '')).join('   ');
  }
  async function readCfg() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    reading = true; const r = await UI.sendCollect('AT+SJDCFG?'); reading = false;
    const val = (type) => { const l = r.lines.find((x) => new RegExp('"' + type + '"').test(x)); const m = l && l.match(/,(-?\d+)\s*$/); return m ? m[1] : null; };
    const pv = val('period'); if (pv != null) period.value = pv;
    const mv = val('mnl'); if (mv != null) mnl.value = mv;
    const cv = val('minch'); if (cv != null) minch.value = cv;
    const dv = val('detecstat'); if (dv != null) detSeg.set(dv);
    const sv = val('sinr'); if (sv != null) sinr.value = sv;
    const rv = val('rsrp'); if (rv != null) rsrp.value = rv;
    const qv = val('rsrq'); if (qv != null) rsrq.value = qv;
    status.textContent = '';
  }
  async function readAll() { if (!UI.connected) { status.textContent = t('log_notconn'); return; } await readEnable(); await readCfg(); }
  // Diagnostics: sends the signal/cell commands and the thresholds jamming compares, to see what values it uses.
  function readSignals() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    runMacro([
      'AT+SJDCFG?',   // configured thresholds (sinr/rsrp/rsrq) used by the detection
      'AT+SJDR?',     // current jamming state
      'AT+CESQ',      // RSRP / RSRQ actuales
      'AT+CPSI?',     // celda acampada: modo, banda, RSRP, RSRQ, RSSI, SINR (RSSNR)
      'AT+CEREG?',    // registration + camped cell (TAC / Cell ID with CEREG=2)
      'AT+CSQ',       // RSSI / BER
    ].join('\n'), 200);
  }
  async function apply() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    await UI.sendCollect(`AT+SJDCFG="period",${period.value || 0}`);
    await UI.sendCollect(`AT+SJDCFG="mnl",${mnl.value || 17}`);
    await UI.sendCollect(`AT+SJDCFG="minch",${minch.value || 5}`);
    await UI.sendCollect(`AT+SJDCFG="sinr",${sinr.value || 0}`);
    await UI.sendCollect(`AT+SJDCFG="rsrp",${rsrp.value || -110}`);
    await UI.sendCollect(`AT+SJDCFG="rsrq",${rsrq.value || -10}`);
    status.textContent = 'OK';
  }
  readAll();
}


/* ---- FTP(S) with real file upload (host → EFS → server) ---- */
// Parses the FTP listing (unix LIST format: "drwxr-xr-x 2 user group 4096 Jun 01 12:00 pub").
// Ignores the +CFTPSLIST: headers; returns { dirs: [name], files: [{ name, size }] }.
function parseFtpList(lines) {
  const dirs = [], files = [];
  for (const l of lines) {
    const m = l.match(/^([\-dl])[rwxsStT\-]{9}\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$/);
    if (!m) continue;
    if (m[1] === 'd') dirs.push(m[3].trim());
    else files.push({ name: m[3].trim(), size: +m[2] });
  }
  return { dirs, files };
}

function renderFtp(host) {
  host.innerHTML = '';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const field = (cap, ...els) => { const r = document.createElement('div'); r.className = 'hw-ctlrow'; const l = document.createElement('span'); l.className = 'hw-ctllab'; l.textContent = cap; r.append(l, ...els); return r; };
  const inp = (ph, val, type) => { const i = document.createElement('input'); i.className = 'sms-to'; i.style.flex = '1'; if (ph) i.placeholder = ph; if (val != null) i.value = val; if (type) i.type = type; return i; };

  const server = inp('ftp.example.com'); const port = inp('21', '21', 'number'); port.style.flex = '0 0 90px';
  const user = inp('anonymous'); const pass = inp('', '', 'password');
  const ssl = document.createElement('input'); ssl.type = 'checkbox';

  const typeSel = document.createElement('select'); typeSel.className = 'mac-unit';
  [['A', t('ftp_text')], ['I', t('ftp_binary')]].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; typeSel.appendChild(o); });
  typeSel.value = 'I';

  const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.className = 'ftp-file'; fileInput.style.flex = '1';
  const remoteName = inp(t('ftp_remotename'));
  fileInput.addEventListener('change', () => { const f = fileInput.files && fileInput.files[0]; if (f) { remoteName.value = f.name; status.textContent = f.name + ' · ' + f.size + ' B'; if (/\.(txt|csv|json|xml|html?|md|log|ini|cfg|c|h|js|py)$/i.test(f.name)) typeSel.value = 'A'; } });

  const status = document.createElement('div'); status.className = 'fs-status';
  const dlName = inp(t('ftp_remotename'));   // name of the server file to download

  // remote browser (PWD + parsed LIST; CWD by click, create/delete folders and files)
  const rbar = document.createElement('div'); rbar.className = 'fs-bar';
  rbar.append(mkBtn('⬆', () => ftpCwd('..')), mkBtn('📁＋', ftpMkdir), mkBtn('⟳', ftpRefresh));
  const rpath = document.createElement('div'); rpath.className = 'fs-path'; rpath.textContent = '—';
  const rlist = document.createElement('div'); rlist.className = 'fs-list';

  host.append(
    sec(t('ftp_conn')),
    field(t('wz_server'), server), field(t('wz_port'), port), field(t('wz_user'), user), field(t('wz_pass'), pass), field(t('wz_ssl'), ssl),
    (() => { const r = document.createElement('div'); r.className = 'fs-bar'; r.append(mkBtn(t('wz_login'), login), mkBtn(t('ftp_logout'), logout), mkBtn(t('wz_list'), ftpRefresh)); return r; })(),
    sec(t('ftp_browser')),
    rbar, rpath, rlist,
    sec(t('ftp_upload')),
    field(t('ftp_type'), typeSel), field(t('ftp_file'), fileInput), field(t('ftp_remote'), remoteName),
    (() => { const r = document.createElement('div'); r.className = 'fs-bar'; r.append(mkBtn('⤴ ' + t('ftp_doupload'), uploadFile)); return r; })(),
    sec(t('ftp_download')),
    field(t('ftp_remote'), dlName),
    (() => { const r = document.createElement('div'); r.className = 'fs-bar'; r.append(mkBtn('⤵ ' + t('ftp_dodownload'), downloadFile)); return r; })(),
    status,
  );

  async function login() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const srv = server.value || '', p = port.value || '21', u = user.value || 'anonymous', pw = pass.value || '', type = ssl.checked ? 1 : 0;
    await runMacro(`AT+CFTPSSTART\n@1000\nAT+CFTPSLOGIN="${srv}",${p},"${u}","${pw}",${type}`, 200);
    ftpRefresh();   // logged in → populate the remote browser
  }
  function logout() { if (!UI.connected) { status.textContent = t('log_notconn'); return; } runMacro('AT+CFTPSLOGOUT\n@300\nAT+CFTPSSTOP', 200); rpath.textContent = '—'; rlist.innerHTML = ''; }

  async function ftpRefresh() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    status.textContent = '…';
    const pw = await UI.sendCollect('AT+CFTPSPWD', { timeout: 8000 });
    const pm = (pw.lines.find((l) => /\+CFTPSPWD:/i.test(l)) || '').match(/\+CFTPSPWD:\s*"([^"]*)"/i);
    const path = pm ? pm[1] : '/';
    rpath.textContent = path;
    const r = await UI.sendCollect(`AT+CFTPSLIST="${path}"`, { timeout: 10000 });
    const { dirs, files } = parseFtpList(r.lines);
    renderRemote(dirs, files);
    status.textContent = r.ok ? `${dirs.length} ${t('fs_dirs')} · ${files.length} ${t('fs_files')}` : t('ftp_listfail');
  }
  async function ftpCwd(d) { if (!UI.connected) { status.textContent = t('log_notconn'); return; } await UI.sendCollect(`AT+CFTPSCWD="${d}"`, { timeout: 8000 }); ftpRefresh(); }
  async function ftpMkdir() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const name = (window.prompt(t('fs_newdir_name')) || '').trim(); if (!name) return;
    await UI.sendCollect(`AT+CFTPSMKD="${name}"`, { timeout: 8000 });
    ftpRefresh();
  }
  async function ftpRmdir(d) { if (!window.confirm(d + ' ?')) return; await UI.sendCollect(`AT+CFTPSRMD="${d}"`, { timeout: 8000 }); ftpRefresh(); }
  async function ftpDele(f) { if (!window.confirm(f + ' ?')) return; await UI.sendCollect(`AT+CFTPSDELE="${f}"`, { timeout: 8000 }); ftpRefresh(); }

  function renderRemote(dirs, files) {
    rlist.innerHTML = '';
    if (!dirs.length && !files.length) { const e = document.createElement('div'); e.className = 'fs-empty'; e.textContent = t('fs_empty'); rlist.appendChild(e); return; }
    dirs.forEach((d) => {
      const row = document.createElement('div'); row.className = 'fs-item fs-dir'; row.title = t('fs_open');
      const ic = document.createElement('span'); ic.className = 'fs-ic'; ic.textContent = '📁';
      const nm = document.createElement('span'); nm.className = 'fs-nm'; nm.textContent = d;
      const del = document.createElement('button'); del.className = 'fs-del'; del.textContent = '🗑'; del.title = t('fs_deldir');
      del.addEventListener('click', (e) => { e.stopPropagation(); ftpRmdir(d); });
      row.append(ic, nm, del);
      row.addEventListener('click', () => ftpCwd(d));
      rlist.appendChild(row);
    });
    files.forEach((f) => {
      const row = document.createElement('div'); row.className = 'fs-item fs-file';
      const ic = document.createElement('span'); ic.className = 'fs-ic'; ic.textContent = '📄';
      const nm = document.createElement('span'); nm.className = 'fs-nm'; nm.textContent = f.name;
      const sz = document.createElement('span'); sz.className = 'fs-memtxt'; sz.textContent = fmtBytes(f.size);
      const dl = document.createElement('button'); dl.className = 'fs-dl'; dl.textContent = '⬇'; dl.title = t('fs_download');
      dl.addEventListener('click', (e) => { e.stopPropagation(); dlName.value = f.name; downloadFile(); });
      const del = document.createElement('button'); del.className = 'fs-del'; del.textContent = '🗑'; del.title = t('fs_del');
      del.addEventListener('click', (e) => { e.stopPropagation(); ftpDele(f.name); });
      row.append(ic, nm, sz, dl, del);
      row.addEventListener('click', () => { dlName.value = f.name; });   // click → loads the name to download
      rlist.appendChild(row);
    });
  }

  // Real upload: reads the chosen file, writes it to the EFS (CFTRANRX) and uploads it to the server (CFTPSPUTFILE).
  async function uploadFile() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const f = fileInput.files && fileInput.files[0];
    if (!f) { status.textContent = t('ftp_nofile'); return; }
    const name = (remoteName.value || f.name).trim();
    const bytes = new Uint8Array(await f.arrayBuffer());
    const binary = typeSel.value === 'I';
    status.textContent = t('ftp_uploading').replace('{n}', name).replace('{b}', bytes.length);
    await UI.sendCollect('AT+CFTPSTYPE=' + (binary ? 'I' : 'A'));        // I = binario (Image), A = texto (ASCII)
    const r1 = await UI.sendFile(`AT+CFTRANRX="c:/${name}",${bytes.length}`, bytes, { timeout: 30000 });   // host → EFS
    if (!r1.ok) { status.textContent = t('ftp_failwrite'); return; }
    const r2 = await UI.sendCollect(`AT+CFTPSPUTFILE="${name}",0`, { timeout: 30000 });                     // EFS → servidor
    status.textContent = r2.ok ? t('ftp_uploaded').replace('{n}', name) : t('ftp_failput');
    if (r2.ok) ftpRefresh();   // the uploaded file shows up in the remote browser
  }

  // Real download: fetches the file from the server to the EFS (CFTPSGETFILE) and from the EFS to the PC (CFTRANTX).
  async function downloadFile() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const name = (dlName.value || '').trim();
    if (!name) { status.textContent = t('ftp_noname'); return; }
    status.textContent = t('ftp_downloading').replace('{n}', name);
    const g = await UI.sendCollect(`AT+CFTPSGETFILE="${name}",0`, { timeout: 30000 });   // servidor → EFS
    if (!g.ok) { status.textContent = t('ftp_failget'); return; }
    const r = await UI.recvFile(`AT+CFTRANTX="c:/${name}"`, { timeout: 30000 });          // EFS → host
    if (r.ok && r.bytes) { downloadBytes(r.bytes, name); status.textContent = t('ftp_downloaded').replace('{n}', name).replace('{b}', r.bytes.length); }
    else status.textContent = t('ftp_failget');
  }
}

/* ---- Email (SMTP / CSMTPS*) ---- */
function renderMail(host) {
  host.innerHTML = '';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const field = (cap, ...els) => { const r = document.createElement('div'); r.className = 'hw-ctlrow'; const l = document.createElement('span'); l.className = 'hw-ctllab'; l.textContent = cap; r.append(l, ...els); return r; };
  const inp = (ph, type) => { const i = document.createElement('input'); i.className = 'sms-to'; i.style.flex = '1'; i.placeholder = ph || ''; if (type) i.type = type; return i; };

  // servidor
  const srv = inp('smtp.gmail.com');
  const port = document.createElement('input'); port.type = 'number'; port.value = '465'; port.min = '1'; port.max = '65535'; port.className = 'lbs-cid'; port.style.width = '76px';
  let stype = '2';
  const typeSeg = makeSeg([['1', 'SMTP'], ['2', 'SMTPS'], ['3', 'STARTTLS']], (v) => { stype = v; }); typeSeg.set('2');
  const srvBar = document.createElement('div'); srvBar.className = 'fs-bar';
  srvBar.append(mkBtn(t('hw_read'), () => readSrv()), mkBtn(t('tls_apply'), () => applySrv()));

  // auth
  let authFlag = '1';
  const authSeg = makeSeg([['1', t('hw_enable')], ['0', t('hw_disable')]], (v) => { authFlag = v; }); authSeg.set('1');
  const user = inp('user@gmail.com');
  const pwd = inp('', 'password');
  const authBar = document.createElement('div'); authBar.className = 'fs-bar';
  authBar.append(mkBtn(t('hw_read'), () => readAuth()), mkBtn(t('tls_apply'), () => applyAuth()));

  // compose
  const fromAddr = inp('from@domain.com'), fromName = inp(t('tls_name'));
  const toAddr = inp('to@domain.com'), toName = inp(t('tls_name'));
  const subject = inp(t('mail_subject'));
  const body = document.createElement('textarea'); body.className = 'sms-msg'; body.rows = 5; body.placeholder = t('mail_body');
  const sendBar = document.createElement('div'); sendBar.className = 'sms-sendbar';
  const cc = document.createElement('div'); cc.className = 'sms-cc'; cc.textContent = '0 B';
  body.addEventListener('input', () => { cc.textContent = byteLen(body.value) + ' B'; });
  sendBar.append(cc, mkBtn(t('mail_clean'), () => UI.sendCollect('AT+CSMTPSCLEAN')), mkBtn(t('mail_send'), () => send()));
  const status = document.createElement('div'); status.className = 'fs-status';

  host.append(
    sec(t('mail_server')), field(t('mail_server'), srv), field(t('mail_port'), port), field('TLS', typeSeg.el), srvBar,
    sec(t('mail_auth')), field(t('hw_enable'), authSeg.el), field(t('mail_user'), user), field(t('mail_pass'), pwd), authBar,
    sec(t('mail_compose')),
    field(t('mail_from'), fromAddr, fromName), field(t('mail_to'), toAddr, toName), field(t('mail_subject'), subject),
    body, sendBar, status,
  );

  App.wiz.cleanup = () => { if (UI.tap) UI.tap = null; };

  function waitUrc(re, timeout) {
    return new Promise((resolve) => {
      const prev = UI.tap;
      const to = setTimeout(() => { UI.tap = prev; resolve(null); }, timeout);
      UI.tap = (line) => { const m = line.match(re); if (m) { clearTimeout(to); UI.tap = prev; resolve(m); return false; } return prev ? prev(line) : false; };
    });
  }
  async function promptSend(cmd, data) { await UI.send(cmd); await sleep(450); await UI.sendRaw(data); await sleep(550); }

  async function readSrv() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect('AT+CSMTPSSRV?');
    const m = (r.lines.find((l) => /\+CSMTPSSRV:/i.test(l)) || '').match(/\+CSMTPSSRV:\s*"([^"]*)",(\d+),(\d+)/i);
    if (m) { srv.value = m[1]; port.value = m[2]; stype = m[3]; typeSeg.set(m[3]); }
  }
  function applySrv() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    if (srv.value.trim()) UI.sendCollect(`AT+CSMTPSSRV="${srv.value.trim()}",${port.value || 465},${stype}`);
  }
  async function readAuth() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect('AT+CSMTPSAUTH?');
    const m = (r.lines.find((l) => /\+CSMTPSAUTH:/i.test(l)) || '').match(/\+CSMTPSAUTH:\s*(\d)(?:,"([^"]*)","([^"]*)")?/i);
    if (m) { authFlag = m[1]; authSeg.set(m[1]); user.value = m[2] || ''; pwd.value = m[3] || ''; }
  }
  function applyAuth() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    if (authFlag === '1') UI.sendCollect(`AT+CSMTPSAUTH=1,"${user.value.trim()}","${pwd.value}"`);
    else UI.sendCollect('AT+CSMTPSAUTH=0');
  }
  async function send() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    if (!toAddr.value.trim()) { status.textContent = t('mail_needfields'); return; }
    status.textContent = t('mail_sending');
    if (fromAddr.value.trim()) await UI.sendCollect(`AT+CSMTPSFROM="${fromAddr.value.trim()}","${fromName.value.trim()}"`);
    await UI.sendCollect(`AT+CSMTPSRCPT=0,0,"${toAddr.value.trim()}","${toName.value.trim()}"`);
    if (subject.value) await promptSend(`AT+CSMTPSSUB=${byteLen(subject.value)}`, subject.value);
    await promptSend(`AT+CSMTPSBODY=${byteLen(body.value)}`, body.value);
    await UI.sendCollect('AT+CSMTPSSEND', { timeout: 8000 });
    const m = await waitUrc(/\+CSMTPSSEND:\s*(\d+)/i, 25000);
    if (m && m[1] === '0') status.textContent = t('mail_sent');
    else status.textContent = t('mail_failed') + (m ? ' (' + m[1] + ')' : '');
  }
  readSrv();
}

