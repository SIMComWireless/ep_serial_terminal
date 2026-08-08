/* wizards-services.js — vendor-neutral wizards: Data, Ping/IP + incoming server, Time/Diag,
   Phonebook and Voice. Everything vendor-specific comes from the profile drivers
   (PingDriver, ServerDriver, DataDriver) — see core/drivers.js.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* ---- Ping wizard: network/IP state (open/close the profile's data context) + configurable ping ---- */
function renderTcpExtras(host) {
  host.innerHTML = '';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const num = (el, dflt) => Math.max(1, Number(el.value) || dflt);

  // --- network / IP: uses the profile's data driver (NETOPEN / CNACT / CGACT) ---
  host.appendChild(sec(t('data_net') + ' / IP'));
  const drv = pdrv('data');
  const ipval = document.createElement('span'); ipval.className = 'fs-fd'; ipval.textContent = 'IP —';
  const iprow = document.createElement('div'); iprow.className = 'fs-bar';
  iprow.append(
    mkBtn(t('data_open'), async () => { if (!UI.connected) return; await UI.sendCollect(drv.openCmd, { timeout: 12000 }); setTimeout(ipRefresh, 700); }),
    mkBtn(t('data_close'), async () => { if (!UI.connected) return; await UI.sendCollect(drv.closeCmd, { timeout: 12000 }); setTimeout(ipRefresh, 400); }),
    mkBtn('⟳', ipRefresh),
    ipval,
  );
  host.appendChild(iprow);
  async function ipRefresh() {
    if (!UI.connected) return;
    const r = await drv.refresh((c) => UI.sendCollect(c, { timeout: 10000 }));
    ipval.textContent = 'IP ' + (r.open && r.ip ? r.ip : '—');
  }

  // --- configurable ping (count, size, interval, timeout, TTL) ---
  host.appendChild(sec('Ping'));
  const phost = document.createElement('input'); phost.className = 'sms-to'; phost.style.flex = '1 1 130px'; phost.value = '8.8.8.8';
  const prow = document.createElement('div'); prow.className = 'fs-bar';
  prow.append(phost, mkBtn('📶 Ping', doPing));
  const pgrid = document.createElement('div'); pgrid.className = 'wiz-grid';
  const mkNum = (label, val) => {
    const cell = document.createElement('div'); cell.className = 'wiz-f';
    const l = document.createElement('span'); l.textContent = label;
    const i = document.createElement('input'); i.type = 'number'; i.value = String(val); i.min = '1';
    cell.append(l, i); pgrid.appendChild(cell); return i;
  };
  const pcount = mkNum(t('png_count'), 4), psize = mkNum(t('png_size'), 64);
  const pint = mkNum(t('png_interval'), 1000), ptmo = mkNum(t('png_timeout'), 10000), pttl = mkNum('TTL', 255);
  const pout = document.createElement('pre'); pout.className = 'fs-out'; pout.hidden = true;
  host.append(prow, pgrid, pout);

  let stopPing = null;
  App.wiz.cleanup = () => { if (stopPing) stopPing(); };   // closing the card doesn't leave an orphan tap

  /* The ping command and its responses are vendor-specific: the profile's PingDriver
     builds the command and turns each incoming line into a row (see drivers.js). */
  async function doPing() {
    if (!UI.connected) { pout.hidden = false; pout.textContent = t('log_notconn'); return; }
    const png = pdrv('ping');
    const o = {
      host: phost.value.trim() || '8.8.8.8',
      count: num(pcount, 4), size: num(psize, 64),
      interval: num(pint, 1000), timeout: num(ptmo, 10000), ttl: num(pttl, 255),
    };
    if (stopPing) stopPing();                    // a previous in-flight ping gets cut
    const lines = [];
    pout.hidden = false; pout.textContent = '…';
    const draw = () => { pout.textContent = lines.join('\n'); };
    const prevTap = UI.tap;
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(guard); if (UI.focused) UI.tap = prevTap; stopPing = null; };
    stopPing = finish;
    const guard = setTimeout(finish, o.count * (o.interval + o.timeout) + 5000);
    UI.tap = (line) => {
      const r = png.parse(line, o);
      if (r) {
        if (r.text != null) lines.push(r.raw ? r.text : `${r.seq != null ? r.seq : lines.length + 1}. ${r.text}`);
        draw();
        if (r.done) finish();
      }
      return false;                              // doesn't consume: the line is also visible in the console
    };
    if (png.perProbe) {                          // one command per probe (the module replies once)
      for (let i = 0; i < o.count && !done; i++) await UI.sendCollect(png.start(o), { timeout: o.timeout + 1000 });
      finish();
    } else {
      await UI.send(png.start(o));               // one command, N replies as URCs
    }
  }

  ipRefresh();
}

/* ---- incoming TCP or UDP server (bottom section of the TCP/UDP/Ping wizard) ----
   The commands are vendor-specific and come from the profile (`profile.tcpServer`,
   see the ServerDriver typedef in drivers.js): here we only build the UI —
   the mode selector appears when the driver announces more than one mode.       */
function renderTcpServer(host) {
  const srv = UI.profile.tcpServer;
  if (!srv) return;   // module without incoming server
  const modes = srv.modes || ['tcp'];
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  host.appendChild(sec(t('tcp_server')));
  const sport = document.createElement('input'); sport.type = 'number'; sport.className = 'mac-delay'; sport.value = '2020'; sport.min = '1'; sport.max = '65535';
  const srow = document.createElement('div'); srow.className = 'fs-bar';
  let mode = modes[0];
  if (modes.length > 1) {
    const seg = makeSeg(modes.map((m) => [m, m.toUpperCase()]), (v) => { mode = v; });
    seg.set(mode);
    srow.appendChild(seg.el);
  }
  srow.append(sport,
    mkBtn('▶ ' + t('srv_start'), () => { if (UI.connected) runMacro(srv.start(mode, Math.max(1, Number(sport.value) || 2020)), 200); }),
    mkBtn('■ ' + t('srv_stop'), () => { if (UI.connected) UI.send(srv.stop(mode)); }),
  );
  host.appendChild(srow);
}

/* (the SIMCom-only service wizards — LwM2M, CoAP, TLS/cert, jamming, FTP and email — live in
   simcom/wizards-services-simcom.js) */

const TZLIST = [['-12:00', -48], ['-11:00', -44], ['-10:00', -40], ['-09:30', -38], ['-09:00', -36], ['-08:00', -32], ['-07:00', -28], ['-06:00', -24], ['-05:00', -20], ['-04:00', -16], ['-03:30', -14], ['-03:00', -12], ['-02:00', -8], ['-01:00', -4], ['+00:00', 0], ['+01:00', 4], ['+02:00', 8], ['+03:00', 12], ['+03:30', 14], ['+04:00', 16], ['+04:30', 18], ['+05:00', 20], ['+05:30', 22], ['+05:45', 23], ['+06:00', 24], ['+06:30', 26], ['+07:00', 28], ['+08:00', 32], ['+08:45', 35], ['+09:00', 36], ['+09:30', 38], ['+10:00', 40], ['+10:30', 42], ['+11:00', 44], ['+12:00', 48], ['+12:45', 51], ['+13:00', 52], ['+14:00', 56]];
function renderTime(host) {
  host.innerHTML = '';
  const p2 = (n) => String(n).padStart(2, '0');
  const mkBtn = (txt, fn, cls) => { const b = document.createElement('button'); b.className = 'fs-btn' + (cls ? ' ' + cls : ''); b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const field = (cap, el) => { const r = document.createElement('div'); r.className = 'hw-ctlrow'; const l = document.createElement('span'); l.className = 'hw-ctllab'; l.textContent = cap; r.append(l, el); return r; };
  const date = document.createElement('input'); date.type = 'date'; date.className = 'hw-sel time-in';
  const time = document.createElement('input'); time.type = 'time'; time.step = '1'; time.className = 'hw-sel time-in';
  const tz = document.createElement('select'); tz.className = 'hw-sel';
  TZLIST.forEach(([lab, q]) => { const o = document.createElement('option'); o.value = q; o.textContent = 'UTC' + lab; tz.appendChild(o); });
  tz.value = '-12';
  const btns = document.createElement('div'); btns.className = 'fs-bar';
  btns.append(mkBtn(t('time_now'), () => fillNow()), mkBtn(t('time_read'), () => readClock()), mkBtn(t('time_set'), () => setClock(), 'primary'));
  // auto-TZ
  const autoRow = document.createElement('div'); autoRow.className = 'hw-ctlrow';
  const autoLbl = document.createElement('span'); autoLbl.className = 'hw-ctllab'; autoLbl.textContent = t('time_autotz');
  const tzuSeg = makeSeg([['1', t('hw_enable')], ['0', t('hw_disable')]], (v) => UI.sendCollect(`AT+CTZU=${v}`));
  autoRow.append(autoLbl, tzuSeg.el, mkBtn(t('time_read'), () => readCtzu()));
  // NTP + DNS
  const ntpRow = document.createElement('div'); ntpRow.className = 'fs-bar';
  ntpRow.append(mkBtn(t('time_ntp'), () => syncNtp()));
  const dnsRow = document.createElement('div'); dnsRow.className = 'fs-bar';
  const dnsIn = document.createElement('input'); dnsIn.className = 'sms-to'; dnsIn.style.flex = '1'; dnsIn.placeholder = 'example.com';
  dnsRow.append(dnsIn, mkBtn(t('time_lookup'), () => { if (dnsIn.value.trim()) UI.send(`AT+CDNSGIP="${dnsIn.value.trim()}"`); }));
  const status = document.createElement('div'); status.className = 'fs-status';
  host.append(sec(t('time_clock')), field(t('time_date'), date), field(t('time_time'), time), field(t('time_tz'), tz), btns, autoRow, sec('NTP'), ntpRow, field(t('time_dns'), dnsRow), status);

  function fillNow() {
    const d = new Date();
    date.value = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    time.value = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
    const q = -d.getTimezoneOffset() / 15; if (TZLIST.some(([, v]) => v === q)) tz.value = String(q);
  }
  function setClock() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    if (!date.value || !time.value) { status.textContent = t('time_need'); return; }
    const [Y, M, D] = date.value.split('-'); const tp = time.value.split(':');
    const hh = tp[0], mm = tp[1], ss = tp[2] || '00';
    const q = parseInt(tz.value, 10); const tzStr = (q < 0 ? '-' : '+') + p2(Math.abs(q));
    UI.sendCollect(`AT+CCLK="${Y.slice(2)}/${M}/${D},${hh}:${mm}:${ss}${tzStr}"`).then(() => { status.textContent = 'OK'; });
  }
  async function readClock() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect('AT+CCLK?');
    const m = (r.lines.find((l) => /\+CCLK:/i.test(l)) || '').match(/"(\d\d)\/(\d\d)\/(\d\d),(\d\d):(\d\d):(\d\d)([+-]\d\d)"/);
    if (!m) { status.textContent = '—'; return; }
    date.value = `20${m[1]}-${m[2]}-${m[3]}`; time.value = `${m[4]}:${m[5]}:${m[6]}`;
    const q = parseInt(m[7], 10); if (TZLIST.some(([, v]) => v === q)) tz.value = String(q);
    status.textContent = '';
  }
  function syncNtp() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const q = parseInt(tz.value, 10);
    UI.sendCollect(`AT+CNTP="pool.ntp.org",${q},1,2`).then(() => UI.send('AT+CNTP'));
  }
  async function readCtzu() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect('AT+CTZU?');
    const m = (r.lines.find((l) => /\+CTZU:/i.test(l)) || '').match(/\+CTZU:\s*([01])/i);
    if (m) tzuSeg.set(m[1]);
  }
  fillNow();
}

/* ---- Agenda (phonebook: CPBS/CPBR/CPBW/CPBF/CNUM) ---- */
function renderPhonebook(host) {
  host.innerHTML = '';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const field = (cap, ...els) => { const r = document.createElement('div'); r.className = 'hw-ctlrow'; const l = document.createElement('span'); l.className = 'hw-ctllab'; l.textContent = cap; r.append(l, ...els); return r; };
  const inp = (ph) => { const i = document.createElement('input'); i.className = 'sms-to'; i.style.flex = '1'; i.placeholder = ph || ''; return i; };
  // storage
  const sto = document.createElement('select'); sto.className = 'hw-sel';
  ['SM', 'ME', 'DC', 'RC', 'MC', 'FD'].forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; sto.appendChild(o); });
  sto.addEventListener('change', () => UI.sendCollect(`AT+CPBS="${sto.value}"`).then(() => refresh()));
  const used = document.createElement('b'); used.className = 'gn-val'; used.textContent = '—';
  // lista
  const listBar = document.createElement('div'); listBar.className = 'fs-bar';
  listBar.append(mkBtn(t('hw_read'), () => refresh()), mkBtn(t('pb_own'), () => readOwn()));
  const list = document.createElement('div'); list.className = 'sms-list';
  // alta
  const num = inp('+54911...'), name = inp(t('tls_name'));
  const addBar = document.createElement('div'); addBar.className = 'fs-bar';
  addBar.append(num, name, mkBtn(t('pb_add'), () => addEntry()));
  // buscar
  const find = inp(t('pb_find'));
  const findBar = document.createElement('div'); findBar.className = 'fs-bar';
  findBar.append(find, mkBtn(t('pb_find'), () => doFind()));
  const status = document.createElement('div'); status.className = 'fs-status';
  host.append(sec(t('pb_storage')), field(t('pb_storage'), sto, used), sec(t('pb_entries')), listBar, list, addBar, sec(t('pb_find')), findBar, status);

  function parse(lines, re) { const out = []; for (const l of lines) { const m = l.match(re); if (m) out.push({ index: m[1], number: m[2], type: m[3], text: m[4] }); } return out; }
  function renderRows(entries) {
    list.innerHTML = '';
    if (!entries.length) { const e = document.createElement('div'); e.className = 'gn-empty'; e.textContent = t('pb_empty'); list.appendChild(e); return; }
    entries.forEach((e) => {
      const row = document.createElement('div'); row.className = 'wifi-item';
      const txt = document.createElement('span'); txt.className = 'wifi-mac'; txt.style.flex = '1';
      txt.innerHTML = `<b>${e.index}.</b> ${e.text || '—'} <span style="color:var(--ink-dim)">${e.number}</span>`;
      const del = document.createElement('button'); del.className = 'fs-del'; del.textContent = '🗑'; del.title = t('sms_del');
      del.addEventListener('click', async () => { await UI.sendCollect(`AT+CPBW=${e.index}`); refresh(); });
      row.append(txt, del); list.appendChild(row);
    });
  }
  async function refresh() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const s = await UI.sendCollect('AT+CPBS?');
    const sm = (s.lines.find((l) => /\+CPBS:/i.test(l)) || '').match(/\+CPBS:\s*"(\w+)",(\d+),(\d+)/i);
    if (sm) { sto.value = sm[1]; used.textContent = `${sm[2]}/${sm[3]}`; }
    const r = await UI.sendCollect('AT+CPBR=1,250', { timeout: 8000 });
    renderRows(parse(r.lines, /\+CPBR:\s*(\d+),"([^"]*)",(\d+),"([^"]*)"/i));
    status.textContent = '';
  }
  async function doFind() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect(`AT+CPBF="${find.value.trim()}"`);
    renderRows(parse(r.lines, /\+CPBF:\s*(\d+),"([^"]*)",(\d+),"([^"]*)"/i));
  }
  async function addEntry() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    if (!num.value.trim()) { status.textContent = t('pb_number'); return; }
    const ty = num.value.trim().startsWith('+') ? 145 : 129;
    await UI.sendCollect(`AT+CPBW=,"${num.value.trim()}",${ty},"${name.value.trim()}"`);
    num.value = ''; name.value = ''; refresh();
  }
  async function readOwn() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    const r = await UI.sendCollect('AT+CNUM');
    const m = (r.lines.find((l) => /\+CNUM:/i.test(l)) || '').match(/\+CNUM:\s*"([^"]*)","([^"]*)"/i);
    status.textContent = m ? `${m[1] || ''} ${m[2]}`.trim() : '—';
  }
  refresh();
}

/* ---- Voice calls (ATD/ATA/CHUP/CLCC/CLIP/VTS) ---- */
function renderVoice(host) {
  host.innerHTML = '';
  const mkBtn = (txt, fn, cls) => { const b = document.createElement('button'); b.className = cls || 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const field = (cap, ...els) => { const r = document.createElement('div'); r.className = 'hw-ctlrow'; const l = document.createElement('span'); l.className = 'hw-ctllab'; l.textContent = cap; r.append(l, ...els); return r; };
  const badge = document.createElement('div'); badge.className = 'jam-badge';
  const num = document.createElement('input'); num.className = 'sms-to'; num.style.flex = '1'; num.placeholder = '+54911...';
  const dialBar = document.createElement('div'); dialBar.className = 'fs-bar';
  dialBar.append(num, mkBtn('📞 ' + t('call_call'), () => dial()));
  const ctlBar = document.createElement('div'); ctlBar.className = 'fs-bar';
  ctlBar.append(mkBtn(t('call_answer'), () => UI.sendCollect('ATA')), mkBtn(t('call_hangup'), () => UI.sendCollect('AT+CHUP')));
  // DTMF
  const pad = document.createElement('div'); pad.className = 'dtmf-pad';
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].forEach((k) => { const b = document.createElement('button'); b.className = 'dtmf-key'; b.textContent = k; b.addEventListener('click', () => UI.sendCollect(`AT+VTS=${k}`)); pad.appendChild(b); });
  // CLIP
  let clipFlag = '0';
  const clipSeg = makeSeg([['1', t('hw_enable')], ['0', t('hw_disable')]], (v) => { clipFlag = v; UI.sendCollect(`AT+CLIP=${v}`); });
  const status = document.createElement('div'); status.className = 'fs-status';
  host.append(sec(t('call_state')), field(t('call_state'), badge), sec(t('call_dial')), dialBar, ctlBar, sec(t('call_dtmf')), pad, sec(t('call_clip')), field(t('call_clip'), clipSeg.el), status);

  const STAT = { 0: 'call_active', 1: 'call_active', 2: 'call_dialing', 3: 'call_dialing', 4: 'call_ringing', 5: 'call_ringing' };
  function setBadge(state) {
    if (state === 'idle' || state == null) { badge.textContent = t('call_idle'); badge.className = 'jam-badge'; }
    else if (state === 'active') { badge.textContent = t('call_active'); badge.className = 'jam-badge ok'; }
    else if (state === 'ringing') { badge.textContent = t('call_ringing'); badge.className = 'jam-badge jammed'; }
    else { badge.textContent = t('call_dialing'); badge.className = 'jam-badge'; }
  }
  let timer = null;
  function stopPoll() { if (timer) { clearInterval(timer); timer = null; } }
  App.wiz.cleanup = () => { stopPoll(); if (UI.tap) UI.tap = null; };
  UI.tap = (line) => {
    if (/^RING\b/i.test(line) || /\+CLIP:/i.test(line)) setBadge('ringing');
    else if (/NO CARRIER|VOICE CALL: END|BUSY|^OK$/i.test(line) && /NO CARRIER|VOICE CALL: END|BUSY/i.test(line)) setBadge('idle');
    return false;
  };
  async function refresh() {
    if (!UI.connected) { setBadge('idle'); return; }
    const r = await UI.sendCollect('AT+CLCC');
    const m = (r.lines.find((l) => /\+CLCC:/i.test(l)) || '').match(/\+CLCC:\s*\d+,(\d+),(\d+)/i);
    if (!m) { setBadge('idle'); return; }
    const stat = m[2]; const key = STAT[stat] || 'call_idle';
    setBadge(key === 'call_active' ? 'active' : key === 'call_ringing' ? 'ringing' : key === 'call_dialing' ? 'dialing' : 'idle');
  }
  async function dial() {
    if (!UI.connected) { status.textContent = t('log_notconn'); return; }
    if (!num.value.trim()) { status.textContent = t('call_number'); return; }
    setBadge('dialing');
    await UI.sendCollect(`ATD${num.value.trim()};`);
    setTimeout(refresh, 600);
  }
  stopPoll(); timer = setInterval(refresh, 2500); refresh();
}

