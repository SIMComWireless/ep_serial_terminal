/* wizards-services.js — wizards: Basics/Network, SIM, Data, Time/Diag, TLS/Cert, Jamming, FTP, Email, Phonebook, Voice
   (part of the AT console · classic script, shared global scope — concatenated in order) */

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

/* ---- Ping wizard: network/IP state (open/close the profile's data context) + configurable ping ---- */
function renderTcpExtras(host) {
  host.innerHTML = '';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const num = (el, dflt) => Math.max(1, Number(el.value) || dflt);
  const fam = UI.profile.family;

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

  async function doPing() {
    if (!UI.connected) { pout.hidden = false; pout.textContent = t('log_notconn'); return; }
    const h = phost.value.trim() || '8.8.8.8';
    const n = num(pcount, 4), sz = num(psize, 64), itv = num(pint, 1000), tmo = num(ptmo, 10000), ttl = num(pttl, 255);
    if (stopPing) stopPing();                    // a previous in-flight ping gets cut
    const lines = [];
    pout.hidden = false; pout.textContent = '…';
    const draw = () => { pout.textContent = lines.join('\n'); };
    const prevTap = UI.tap;
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(guard); if (UI.focused) UI.tap = prevTap; stopPing = null; };
    stopPing = finish;
    const guard = setTimeout(finish, n * (itv + tmo) + 5000);
    if (fam === 'SIM70x0') {                     // SIM7090/7080/7070: SNPING4 (IPv4)
      UI.tap = (line) => {
        const m = line.match(/\+SNPING4:\s*(\d+),\s*"?([^",]*)"?,\s*(-?\d+)/i);
        if (m) { lines.push(`${m[1]}. ${m[2]}  rtt ${m[3]} ms`); draw(); if (Number(m[1]) >= n) finish(); }
        return false;                            // doesn't consume: the line is also visible in the console
      };
      await UI.send(`AT+SNPING4="${h}",${n},${sz},${tmo}`);
    } else if (fam === 'ESP') {                  // Espressif: AT+PING="host" (one response per command)
      UI.tap = (line) => {
        const m = line.match(/^\+PING:(\d+)/i);
        if (m) { lines.push(`${lines.length + 1}. ${h}  rtt ${m[1]} ms`); draw(); }
        else if (/^\+PING:TIMEOUT/i.test(line)) { lines.push(`${lines.length + 1}. timeout`); draw(); }
        return false;
      };
      for (let i = 0; i < n && !done; i++) await UI.sendCollect(`AT+PING="${h}"`, { timeout: tmo + 1000 });
      finish();
    } else {                                     // A76xx / SIM7600: CPING with +CPING: 1/2/3 URCs
      UI.tap = (line) => {
        let m = line.match(/\+CPING:\s*1,\s*"?([^",]*)"?,(\d+),(\d+),(\d+)/i);
        if (m) { lines.push(`${lines.length + 1}. ${m[1]}  ${m[2]} B  rtt ${m[3]} ms  TTL ${m[4]}`); draw(); return false; }
        if (/\+CPING:\s*2\b/.test(line)) { lines.push(`${lines.length + 1}. timeout`); draw(); return false; }
        m = line.match(/\+CPING:\s*3,(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/i);
        if (m) {
          lines.push(t('png_summary').replace('{tx}', m[1]).replace('{rx}', m[2]).replace('{lost}', m[3])
            .replace('{min}', m[4]).replace('{avg}', m[6]).replace('{max}', m[5]));
          draw(); finish();
        }
        return false;
      };
      await UI.send(`AT+CPING="${h}",1,${n},${sz},${itv},${tmo},${ttl}`);
    }
  }

  ipRefresh();
}

/* ---- incoming TCP or UDP server (bottom section of the TCP/UDP/Ping wizard) ----
   TCP: AT+SERVERSTART (real server). UDP has no server: a socket is opened
   listening on the local port with CIPOPEN without a remote host.                    */
function tcpServerMacro(mode, port) {
  return mode === 'udp'
    ? `AT+NETOPEN\n@1500\nAT+CIPRXGET=1\nAT+CIPOPEN=0,"UDP",,,${port}`
    : `AT+NETOPEN\n@1500\nAT+SERVERSTART=${port},0`;
}
function tcpServerStopCmd(mode) { return mode === 'udp' ? 'AT+CIPCLOSE=0' : 'AT+SERVERSTOP=0'; }
function renderTcpServer(host) {
  const fam = UI.profile.family;
  if (fam !== 'A76XX' && fam !== 'mdm9x07' && fam !== 'ESP') return;   // other families have no incoming server
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  host.appendChild(sec(t('tcp_server')));
  const sport = document.createElement('input'); sport.type = 'number'; sport.className = 'mac-delay'; sport.value = '2020'; sport.min = '1'; sport.max = '65535';
  const srow = document.createElement('div'); srow.className = 'fs-bar';
  if (fam === 'ESP') {   // Espressif: CIPSERVER (TCP; requires multi-connection)
    srow.append(sport,
      mkBtn('▶ ' + t('srv_start'), () => { if (UI.connected) runMacro(`AT+CIPMUX=1\n@300\nAT+CIPSERVER=1,${Math.max(1, Number(sport.value) || 2020)}`, 200); }),
      mkBtn('■ ' + t('srv_stop'), () => { if (UI.connected) UI.send('AT+CIPSERVER=0'); }),
    );
  } else {
    let mode = 'tcp';
    const seg = makeSeg([['tcp', 'TCP'], ['udp', 'UDP']], (v) => { mode = v; });
    seg.set('tcp');
    srow.append(seg.el, sport,
      mkBtn('▶ ' + t('srv_start'), () => { if (UI.connected) runMacro(tcpServerMacro(mode, Math.max(1, Number(sport.value) || 2020)), 200); }),
      mkBtn('■ ' + t('srv_stop'), () => { if (UI.connected) UI.send(tcpServerStopCmd(mode)); }),
    );
  }
  host.appendChild(srow);
}

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

/* ---- UART: baud, framing, flow control, sleep ---- */
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

