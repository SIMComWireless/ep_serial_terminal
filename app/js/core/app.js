/* app.js — shell: sessions/connection, input, settings, module selector, quick actions, logbar and sidebar
   (macro engine/panel in macros.js · wizard framework in wizards-core.js · helpers in util.js)
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* ---- session management / multi-port connection ---- */
function buildPane(sess) {
  const pane = document.createElement('div'); pane.className = 'cpane online';
  const head = document.createElement('div'); head.className = 'cphead';
  const dot = document.createElement('span'); dot.className = 'cpdot';
  const title = document.createElement('span'); title.className = 'cptitle'; title.textContent = sess.label; title.title = t('rename_hint');
  const ren = document.createElement('button'); ren.className = 'cpren'; ren.textContent = '✎'; ren.title = t('rename_hint');
  ren.addEventListener('click', (e) => { e.stopPropagation(); startRename(sess); });
  const close = document.createElement('button'); close.className = 'cpclose'; close.textContent = '✕'; close.title = t('cp_close');
  close.addEventListener('click', (e) => { e.stopPropagation(); removeSession(sess); });
  title.addEventListener('dblclick', (e) => { e.stopPropagation(); startRename(sess); });
  title.addEventListener('mousedown', (e) => { if (title.isContentEditable) e.stopPropagation(); });
  const mod = document.createElement('span'); mod.className = 'cpmod'; mod.textContent = sess.profile.id.toUpperCase();
  const conn = document.createElement('button'); conn.className = 'cpconn';
  conn.addEventListener('click', (e) => { e.stopPropagation(); togglePort(sess); });
  const gear = document.createElement('button'); gear.className = 'cpgear'; gear.textContent = '⚙'; gear.title = t('settings');
  gear.addEventListener('click', (e) => { e.stopPropagation(); focusSession(sess); openSetpop('edit'); });
  const kbd = document.createElement('span'); kbd.className = 'cpkbd'; kbd.textContent = '⌨'; kbd.title = t('kbd_live');
  kbd.addEventListener('click', (e) => { e.stopPropagation(); focusSession(sess); if (App.kbdCapture === sess) setKbdCapture(null); else if (sess.connected) setKbdCapture(sess); });
  if (sess.virtual) {   // simulator control: network, signal, SIM and events of the virtual modem (to the left of ⌨)
    const emuB = document.createElement('button'); emuB.className = 'cpemu'; emuB.textContent = 'Simu Ctrl'; emuB.title = t('emu_ctl');
    emuB.addEventListener('click', (e) => { e.stopPropagation(); focusSession(sess); toggleEmuPop(sess, emuB); });
    head.append(dot, title, ren, emuB, kbd, mod, conn, gear, close);
  } else head.append(dot, title, ren, kbd, mod, conn, gear, close);   // ● title ✎ … ⌨ MOD connect ⚙ ✕
  sess.modEl = mod; sess.connBtn = conn;
  const log = document.createElement('div'); log.className = 'clog';
  log.classList.toggle('no-badges', sess.settings.badges === false);   // honors this terminal's badges toggle
  log.classList.toggle('no-lat', sess.settings.lat === false);         // honors this terminal's latency-chips toggle
  pane.append(head, log);
  pane.addEventListener('mousedown', () => {   // click/tap on a terminal → target of the Send box + keyboard
    focusSession(sess);
    if (!sess.connected) return;
    if (isTouchDevice()) $('cmd').focus();     // touch: no physical keyboard → focus the box to raise the on-screen keyboard
    else setKbdCapture(sess);                  // desktop: live keyboard capture (key by key)
  });
  sess.paneEl = pane; sess.logEl = log; sess.titleEl = title; sess.dotEl = dot;
  $('consoles').appendChild(pane);
  updateConnBtn(sess);
}
// Reflects the state on the pane toggle: Disconnect · Stop retrying (retrying) · Connect.
function updateConnBtn(sess) {
  if (!sess.connBtn) return;
  const on = sess.connected, retry = !on && sess.reconnecting;
  sess.connBtn.textContent = on ? t('disconnect') : retry ? t('stop_retry') : t('connect');
  sess.connBtn.title = retry ? t('stop_retry_hint') : (on ? t('disconnect') : t('connect'));
  sess.connBtn.classList.toggle('on', on);
  sess.connBtn.classList.toggle('retry', retry);
}
// Connects/disconnects THIS terminal's port WITHOUT closing the pane (keeps the log).
async function togglePort(sess) {
  if (sess.connected) {
    sess.userClosed = true;                       // voluntary disconnect → no auto-reconnect
    if (sess.reconnTimer) { clearTimeout(sess.reconnTimer); sess.reconnTimer = null; }
    await sess.transport.disconnect();            // onClosed marca desconectado + actualiza UI
    sess.log('sys', t('log_portclosed'));
  } else if (sess.reconnecting) {                 // "Stop retrying": unticks Auto-reconnect and breaks the loop
    sess.settings.autoReconnect = false;
    stopAutoReconnect(sess);
    syncSettingsUI();                             // if the ⚙ popover is open, reflect the untick
  } else {
    sess.userClosed = false;
    try {
      const info = await sess.transport.reconnect(serialOpts(sess.settings));
      sess.connected = true;
      if (sess.paneEl) sess.paneEl.classList.add('online');
      if (info && info.usbVendorId != null && !sess.customName) { sess.inst.port = portLabel(info); if (sess.titleEl) sess.titleEl.textContent = sess.label; }
      sess.log('sys', t('log_reconnected'));
    } catch (e) {
      sess.log('sys', t('log_cantconn') + (e.message || e));
    }
  }
  updateConnBtn(sess);
  if (sess === UI.focused) setLinkUI();
}
// Inline rename of the terminal title (Enter confirms, Esc cancels).
function startRename(sess) {
  const el = sess.titleEl; if (!el) return;
  focusSession(sess);
  el.contentEditable = 'true'; el.spellcheck = false; el.classList.add('editing');
  el.focus();
  const rng = document.createRange(); rng.selectNodeContents(el);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rng);
  const commit = () => {
    el.removeEventListener('blur', commit); el.removeEventListener('keydown', onKey);
    el.contentEditable = 'false'; el.classList.remove('editing');
    const v = el.textContent.trim();
    sess.customName = v || null;
    el.textContent = sess.label; el.title = t('rename_hint');
    if (sess.isFocused) $('cmd-target').textContent = sess.label;
  };
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); el.textContent = sess.label; el.blur(); }
  };
  el.addEventListener('blur', commit); el.addEventListener('keydown', onKey);
}
const MAX_SESS = 8;   // max number of panes in the console grid (terminals + editors, 4 rows of 2)
// Panes sharing the grid: terminals (UI.sessions) + text editors (App.editors, see editor.js).
function paneCount() { return UI.sessions.length + App.editors.length; }
function layoutPanes() {
  const n = paneCount(), c = $('consoles');
  c.dataset.n = String(n);
  if (n >= 3 && n % 2 === 1) c.dataset.odd = '1'; else c.removeAttribute('data-odd');   // odd ≥3 → the last one spans the whole row
  if (n >= 5) c.dataset.scroll = '1'; else c.removeAttribute('data-scroll');             // 5th on (3rd row) → scroll, rows sized at 2-rows height
  if (n >= 3) c.dataset.mscroll = '1'; else c.removeAttribute('data-mscroll');    // in 1 column (mobile), scroll from the 3rd on
}
function focusSession(sess) {
  if (!sess) return;
  UI.focused = sess;
  UI.sessions.forEach((s) => s.paneEl && s.paneEl.classList.toggle('focused', s === sess));
  sess.refreshStrip();
  updateInstVisibility();
  setLinkUI();
  if ($('module')) $('module').value = sess.profile.id;
  syncSettingsUI();
  refreshSidebar();
  $('cmd-target').textContent = sess.label;
  setSearchTarget({ kind: 'term', s: sess });   // the shared search bar now acts on this terminal
}
// Touch device (no physical keyboard)? → on mobile, focus the box to raise the on-screen keyboard.
function isTouchDevice() { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); }
// Live keyboard focus: the captured session receives each key instantly (click on the terminal enables it; click on the input disables it).
function setKbdCapture(sess) {
  if (App.kbdCapture === sess) return;
  if (App.kbdCapture && App.kbdCapture.paneEl) App.kbdCapture.paneEl.classList.remove('kbd');
  App.kbdCapture = sess;
  if (sess && sess.paneEl) sess.paneEl.classList.add('kbd');
}
// Every key goes to the captured terminal (if no input has focus).
document.addEventListener('keydown', (e) => {
  if (!App.kbdCapture || !App.kbdCapture.connected) return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) return;
  if (e.altKey || e.metaKey) return;   // don't clobber OS shortcuts
  let raw = null, isEnter = false, isBack = false;
  if (e.ctrlKey) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : '';
    if (k >= 'a' && k <= 'z') raw = String.fromCharCode(k.charCodeAt(0) - 96);   // Ctrl+A..Z → 0x01..0x1A (incl. Ctrl+Z=0x1A, Ctrl+C=0x03)
    else if (e.key === '[') raw = '\x1b';
    else return;
  } else if (e.key === 'Enter') isEnter = true;
  else if (e.key === 'Backspace') isBack = true;
  else if (e.key === 'Tab') raw = '\t';
  else if (e.key === 'Escape') raw = '\x1b';
  else if (e.key.length === 1) raw = e.key;
  else return;   // flechas, F1.., Inicio, etc. → ignorar
  e.preventDefault();
  App.kbdCapture.typeKey(raw, isEnter, isBack);
});
// Touching any field (e.g. the "Type an AT command" box) turns capture off until the terminal is clicked again.
document.addEventListener('focusin', (e) => {
  const ae = e.target;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) setKbdCapture(null);
});
// Click outside any terminal → loses keyboard focus (the terminal is still remembered as the Send box target via UI.focused).
document.addEventListener('mousedown', (e) => {
  if (e.target && e.target.closest && e.target.closest('.cpane')) return;   // click inside a terminal: handled by the pane
  setKbdCapture(null);
});
function resetStrip() { drawSignal(null); drawReg(null); for (const id of DASH_IDS) drawSet(id, '—'); }
function setLinkUI() {
  const full = paneCount() >= MAX_SESS;   // the grid is shared with the editor panes
  $('connect').disabled = full; $('virtual').disabled = full;
  $('connect').textContent = t('open_serial'); $('connect').classList.add('primary'); $('connect').classList.remove('danger');
  $('virtual').textContent = t('open_sim'); $('virtual').classList.remove('danger');
}
function onClosed(sess) {
  sess.connected = false;
  sess.clearInst();                                   // without a connection the telemetry is no longer real → everything back to "—"
  if (sess.paneEl) sess.paneEl.classList.remove('online');
  if (App.kbdCapture === sess) setKbdCapture(null);   // no connection, no keyboard capture
  updateConnBtn(sess);
  if (sess === UI.focused) setLinkUI();
  // auto-reconnect: only if the drop was NOT voluntary and the tick is on
  if (!sess.userClosed && sess.settings.autoReconnect && !sess.virtual && UI.sessions.includes(sess)) attemptAutoReconnect(sess);
}
// Retries reopening the port (board reset / unplugged and replugged) with NO retry limit:
// keeps insisting while the Auto-reconnect tick stays on. It is stopped by the pane button
// ("Stop retrying", which unticks) or by unticking Auto-reconnect in the ⚙ popover.
function attemptAutoReconnect(sess) {
  if (sess.reconnTimer || sess.reconnecting) return;
  sess.reconnecting = true;
  sess.log('sys', t('log_autoreconn'));
  updateConnBtn(sess);
  const abort = () => { sess.reconnecting = false; updateConnBtn(sess); };
  const tryOnce = async () => {
    sess.reconnTimer = null;
    if (!UI.sessions.includes(sess) || sess.connected || sess.userClosed || !sess.settings.autoReconnect) return abort();
    try {
      const info = await sess.transport.reconnect(serialOpts(sess.settings));
      sess.reconnecting = false;
      sess.connected = true;
      if (sess.paneEl) sess.paneEl.classList.add('online');
      if (info && info.usbVendorId != null && !sess.customName) { sess.inst.port = portLabel(info); if (sess.titleEl) sess.titleEl.textContent = sess.label; }
      updateConnBtn(sess);
      if (sess === UI.focused) setLinkUI();
      sess.log('sys', t('log_reconnected'));
    } catch (e) {
      if (!sess.settings.autoReconnect || sess.userClosed || !UI.sessions.includes(sess)) return abort();
      sess.reconnTimer = setTimeout(tryOnce, 2000);
    }
  };
  sess.reconnTimer = setTimeout(tryOnce, 1500);
}
// Breaks the retry loop (if any) and reflects the state on the pane button.
function stopAutoReconnect(sess) {
  if (sess.reconnTimer) { clearTimeout(sess.reconnTimer); sess.reconnTimer = null; }
  if (sess.reconnecting) { sess.reconnecting = false; sess.log('sys', t('log_autoreconn_stop')); }
  updateConnBtn(sess);
}
async function removeSession(sess) {
  sess.userClosed = true;
  if (App.kbdCapture === sess) setKbdCapture(null);
  if (sess.reconnTimer) { clearTimeout(sess.reconnTimer); sess.reconnTimer = null; }
  sess.reconnecting = false;
  try { await sess.transport.disconnect(); } catch (_) {}
  sess.connected = false;
  if (sess.paneEl) sess.paneEl.remove();
  UI.sessions = UI.sessions.filter((s) => s !== sess);
  layoutPanes();
  if (UI.sessions.length) { focusSession(UI.focused && UI.sessions.includes(UI.focused) ? UI.focused : UI.sessions[UI.sessions.length - 1]); }
  else { UI.focused = null; resetStrip(); updateInstVisibility(); setLinkUI(); $('cmd-target').textContent = ''; syncSettingsUI(); refreshSidebar(true); }   // no terminals → the sidebar goes back to "Macros only"
}

/** Re-applies the dynamic texts when the language changes. */
function refreshDynamic() {
  setLinkUI();
  UI.sessions.forEach((s) => { if (s.titleEl) { s.titleEl.textContent = s.label; s.titleEl.title = t('rename_hint'); } updateConnBtn(s); });
  if (UI.focused) {
    $('cmd-target').textContent = UI.focused.label;
  }
  if (typeof syncSettingsUI === 'function') syncSettingsUI();
}

async function addRealPort() {
  if (paneCount() >= MAX_SESS) return;
  const base = defaultSettings;  // "New Serial Terminal" template (does not inherit the focused one)
  const sess = new Session(false);
  sess.settings = { ...base };                    // own copy of the defaults template
  sess.transport = new WebSerialTransport((b) => sess.onData(b), () => onClosed(sess));
  try {
    const info = await sess.transport.connect(serialOpts(sess.settings));
    sess.info = info; sess.connected = true; sess.inst.port = portLabel(info);
    UI.sessions.push(sess); buildPane(sess); layoutPanes(); focusSession(sess);
    const par = { none: 'N', even: 'E', odd: 'O' }[sess.settings.parity] || 'N';
    sess.log('sys', t('log_connected').replace('{baud}', `${sess.settings.baud} (${sess.settings.data}${par}${sess.settings.stop})`));
    closeSetpop();                                   // close the popover when the port opens
  } catch (e) {
    if (UI.focused) UI.focused.log('sys', t('log_cantconn') + (e.message || e));
  }
  setLinkUI();
}
function addVirtualPort() {
  if (paneCount() >= MAX_SESS) return;
  const base = defaultSettings;  // "New Serial Terminal" template (does not inherit the focused one)
  const sess = new Session(true);
  sess.settings = { ...base };
  sess.transport = new VirtualPort((b) => sess.onData(b), () => onClosed(sess), sess.profile.identity);
  sess.transport.raw = !!sess.profile.raw;   // None → loopback (echo), no AT
  sess.transport.connect();
  sess.connected = true; sess.inst.port = t('vmodem');
  UI.sessions.push(sess); buildPane(sess); layoutPanes(); focusSession(sess);
  sess.log('sys', t('log_virtual'));
  setLinkUI();
  closeSetpop();                                     // close the popover when the simulator opens
}

$('connect').addEventListener('click', () => addRealPort());
$('virtual').addEventListener('click', () => addVirtualPort());


/* ---- input + historial ---- */
// Reports an error VISIBLY: red line on the focused terminal + console.
// Previously, an exception on the send path was swallowed silently (that's how the
// deleted-sendInput bug went unnoticed). Now it "screams" where the user can see it.
function reportError(where, e) {
  const msg = (e && e.message) ? e.message : String(e);
  if (UI.focused) UI.log('err', '⚠ ' + where + ': ' + msg);
  console.error('[' + where + ']', e);
}
// Enter/Send: with text it always sends; empty sends only the terminator (except "No end" or Hex mode).
function submitCmd() {
  const v = $('cmd').value, f = UI.focused;
  const canEmpty = !!(f && f.settings.eol !== '' && !f.settings.hex);
  if (v === '' && !canEmpty) return;
  try {
    const r = UI.sendInput(v);
    $('cmd').value = '';                                  // clear only if the dispatch didn't throw (the command isn't lost on error)
    if (r && typeof r.catch === 'function') r.catch((e) => reportError('Envío', e));   // rechazo async
  } catch (e) {
    reportError('Envío', e);                             // synchronous failure (e.g. missing method)
  }
}
$('send').addEventListener('click', submitCmd);
// Touching the command box or Send releases keyboard capture instantly (so Enter/Send always work).
$('cmd').addEventListener('mousedown', () => setKbdCapture(null));
$('cmd').addEventListener('focus', () => setKbdCapture(null));
$('send').addEventListener('mousedown', () => setKbdCapture(null));
$('cmd').addEventListener('keydown', (e) => {
  if (!acPop.hidden) {   // autocomplete dropdown open: navigate/accept/close before history/send
    if (e.key === 'ArrowDown') { acMove(1); e.preventDefault(); return; }
    if (e.key === 'ArrowUp') { acMove(-1); e.preventDefault(); return; }
    if (e.key === 'Tab') { acAccept(acSel < 0 ? 0 : acSel); e.preventDefault(); return; }
    if (e.key === 'Escape') { acHide(); return; }
    if (e.key === 'Enter' && acSel >= 0) { acAccept(acSel); e.preventDefault(); return; }
    if (e.key === 'Enter') acHide();   // Enter with no selection: send what was typed as-is
  }
  if (e.key === 'Enter') submitCmd();
  else if (e.key === 'ArrowUp') { if (UI.histIdx > 0) { UI.histIdx--; $('cmd').value = UI.history[UI.histIdx]; e.preventDefault(); } }
  else if (e.key === 'ArrowDown') { if (UI.histIdx < UI.history.length - 1) { UI.histIdx++; $('cmd').value = UI.history[UI.histIdx]; } else { UI.histIdx = UI.history.length; $('cmd').value = ''; } }
});

/* ---- command-box autocomplete: QUICK catalog of the focused module ----
   Suggests after typing ≥2 chars (prefix first, then substring). ↑/↓ navigates, Tab/Enter
   accepts (the __PARAM__ stays selected via UI.fillCmd), Esc closes (and ↑/↓ goes back to history). */
const acPop = document.createElement('div'); acPop.id = 'ac-pop'; acPop.hidden = true;
document.body.appendChild(acPop);
let acList = [];   // matches vigentes [{cmd, desc, fill}]
let acSel = -1;    // highlighted item (-1: none → Enter sends what was typed)
// Catalog of the focused module: every QUICK group visible per caps, with the per-profile override.
function acCandidates() {
  const prof = currentSidebarProfile();
  if (!prof || prof.raw) return [];
  const seen = new Set(), out = [];
  for (const g of QUICK) {
    if (g.cap && !profHasCap(prof, g.cap)) continue;
    const items = (prof.quick && prof.quick[g.wiz]) || g.items;
    if (!items) continue;
    for (const [label, cmd, fill] of items) {
      const key = cmd.toUpperCase();
      if (seen.has(key)) continue; seen.add(key);
      out.push({ cmd, desc: t(label), fill: !!fill });
    }
  }
  return out;
}
function acHide() { acPop.hidden = true; acPop.innerHTML = ''; acList = []; acSel = -1; }
function acAccept(i) { const c = acList[i]; if (!c) return; acHide(); UI.fillCmd(c.cmd); }
function acMove(d) {
  if (!acList.length) return;
  acSel = acSel < 0 ? (d > 0 ? 0 : acList.length - 1) : (acSel + d + acList.length) % acList.length;
  [...acPop.children].forEach((el, i) => el.classList.toggle('sel', i === acSel));
  if (acPop.children[acSel]) acPop.children[acSel].scrollIntoView({ block: 'nearest' });
}
function acUpdate() {
  const typed = $('cmd').value.trim();
  if (typed.length < 2 || (UI.focused && UI.focused.settings.hex)) { acHide(); return; }   // in hex you type bytes, not commands
  const q = typed.toUpperCase();
  const pre = [], sub = [];
  for (const c of acCandidates()) {
    const u = c.cmd.toUpperCase();
    if (u.startsWith(q)) pre.push(c); else if (u.includes(q)) sub.push(c);
  }
  const list = pre.concat(sub).slice(0, 8);
  if (!list.length || (list.length === 1 && list[0].cmd.toUpperCase() === q)) { acHide(); return; }   // nothing, or already complete
  acList = list; acSel = -1;
  acPop.innerHTML = '';
  list.forEach((c, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ac-item';
    const cm = document.createElement('span'); cm.className = 'ac-cmd'; cm.textContent = (c.fill ? '✎ ' : '') + c.cmd.replace(/__\w+__/g, '…');
    const d = document.createElement('span'); d.className = 'ac-desc'; d.textContent = c.desc;
    b.append(cm, d);
    b.addEventListener('mousedown', (e) => { e.preventDefault(); acAccept(i); });   // mousedown: fires before the input's blur
    acPop.appendChild(b);
  });
  const r = $('cmd').getBoundingClientRect();   // the cmdbar lives at the bottom → the dropdown grows upward
  acPop.style.left = r.left + 'px'; acPop.style.width = r.width + 'px';
  acPop.style.bottom = (window.innerHeight - r.top + 4) + 'px';
  acPop.hidden = false;
}
$('cmd').addEventListener('input', acUpdate);
$('cmd').addEventListener('blur', acHide);
window.addEventListener('resize', acHide);

/* ---- log search and filters (on the focused terminal; per-session state) ----
   🔍 or Ctrl+F opens the bar. Text is marked with <mark> as each row is built (Session._buildRow),
   so incoming lines get highlighted too. TX/RX/URC hide by direction via
   flt-no-* classes on the log (they survive re-renders). Closing restores the neutral view. */
let qHits = [], qIdx = -1;
// The single bar acts on the last-focused pane: a terminal (log rows + direction filters) or an
// editor (CodeMirror matches, filters hidden). setSearchTarget() is called on every pane focus.
function qTarget() {
  const t = App.searchTarget;
  if (t && t.kind === 'editor' && App.editors.includes(t.ed)) return t;
  if (UI.focused) return { kind: 'term', s: UI.focused };
  return null;
}
function setSearchTarget(t) { App.searchTarget = t; if (!$('searchbar').hidden) qSyncBar(); }
function qRecount() {
  const t = qTarget();
  if (t && t.kind === 'term') { qHits = t.s.logEl ? [...t.s.logEl.querySelectorAll('.ln.q-hit')] : []; qIdx = -1; $('q-count').textContent = t.s.searchQ ? String(qHits.length) : ''; }
  else { qHits = []; qIdx = -1; }
}
function qApply() {
  const t = qTarget(); if (!t) return;
  const q = $('log-q').value.trim() || null;
  if (t.kind === 'editor') { const n = editorSearchApply(t.ed, q); $('q-count').textContent = q ? String(n) : ''; if (n) editorSearchNav(t.ed, 1, $('q-count')); return; }
  t.s.searchQ = q;
  rerenderLog(t.s);
  qRecount();
  if (qHits.length) qNav(1);   // jump to the first match
}
function qNav(d) {
  const t = qTarget(); if (!t) return;
  if (t.kind === 'editor') { editorSearchNav(t.ed, d, $('q-count')); return; }
  if (!qHits.length) return;
  qIdx = qIdx < 0 ? (d > 0 ? 0 : qHits.length - 1) : (qIdx + d + qHits.length) % qHits.length;
  qHits.forEach((r, i) => r.classList.toggle('q-cur', i === qIdx));
  qHits[qIdx].scrollIntoView({ block: 'center' });
  $('q-count').textContent = (qIdx + 1) + '/' + qHits.length;
}
// Pours the focused pane's state into the bar (on pane focus / target change).
function qSyncBar() {
  const t = qTarget();
  const isEd = !!(t && t.kind === 'editor');
  const open = !$('searchbar').hidden;
  $('searchbar').classList.toggle('for-editor', isEd);   // hides the TX/RX/URC/ERROR filters
  App.editors.forEach((ed) => ed.findBtn && ed.findBtn.classList.toggle('active', open && isEd && t.ed === ed));   // latch the searched editor's 🔍
  if (isEd) { $('log-q').value = t.ed.searchQ || ''; $('q-count').textContent = ''; }
  else {
    const s = t && t.s;
    $('log-q').value = (s && s.searchQ) || '';
    for (const k of ['tx', 'rx', 'urc', 'err']) $('f-' + k).classList.toggle('active', !s || s.logFilters[k]);
    qRecount();
  }
}
function qOpen() { $('searchbar').hidden = false; $('b-search').classList.add('active'); qSyncBar(); $('log-q').focus(); $('log-q').select(); }
function qClose() {
  const t = qTarget();
  if (t && t.kind === 'term') {   // neutral view: no highlighting and all types visible
    const s = t.s;
    s.searchQ = null;
    s.logFilters = { tx: true, rx: true, urc: true, err: true };
    if (s.logEl) { s.logEl.classList.remove('flt-no-tx', 'flt-no-rx', 'flt-no-urc', 'flt-no-err'); rerenderLog(s); }
  } else if (t && t.kind === 'editor') { editorSearchClear(t.ed); }
  $('log-q').value = ''; $('q-count').textContent = '';
  qHits = []; qIdx = -1;
  $('searchbar').hidden = true;
  $('searchbar').classList.remove('for-editor');
  $('b-search').classList.remove('active');
  App.editors.forEach((ed) => ed.findBtn && ed.findBtn.classList.remove('active'));
  $('cmd').focus();
}
function qToggleFlt(k) {
  const t = qTarget(); if (!t || t.kind !== 'term' || !t.s.logEl) return;
  const s = t.s;
  s.logFilters[k] = !s.logFilters[k];
  s.logEl.classList.toggle('flt-no-' + k, !s.logFilters[k]);
  $('f-' + k).classList.toggle('active', s.logFilters[k]);
}
$('b-search').addEventListener('click', () => { if ($('searchbar').hidden) qOpen(); else qClose(); });
$('q-close').addEventListener('click', qClose);
$('q-prev').addEventListener('click', () => qNav(-1));
$('q-next').addEventListener('click', () => qNav(1));
['tx', 'rx', 'urc', 'err'].forEach((k) => $('f-' + k).addEventListener('click', () => qToggleFlt(k)));
$('log-q').addEventListener('input', qApply);
$('log-q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { qNav(e.shiftKey ? -1 : 1); e.preventDefault(); }
  else if (e.key === 'Escape') qClose();
});
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || (e.key !== 'f' && e.key !== 'F')) return;
  const ae = document.activeElement;
  const epane = ae && ae.closest && ae.closest('.epane');
  if (epane) {   // inside an editor: the shared bar searches THAT editor (CodeMirror also binds Ctrl-F)
    const ed = App.editors.find((x) => x.el === epane);
    if (ed) { e.preventDefault(); openSharedSearchForEditor(ed); }
    return;
  }
  const inField = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  if (App.kbdCapture && App.kbdCapture.connected && !inField) return;   // live capture: Ctrl+F goes to the terminal (0x06)
  e.preventDefault();
  qOpen();
});

/* ---- per-terminal settings (⚙ popover): they edit the focused session (or the defaults) ---- */
// Pours the focused terminal's settings (or defaults) into the popover and cmdbar controls.
function syncSettingsUI() {
  const s = settingsTarget(), f = UI.focused;
  $('baud').value = s.baud; $('databits').value = s.data; $('stopbits').value = s.stop; $('parity').value = s.parity;
  $('enc').value = s.enc;
  $('t-ts').checked = s.ts; $('t-echo').checked = s.echo; $('t-scroll').checked = s.scroll;
  $('t-dir').checked = s.dir;
  $('t-ansi').checked = s.ansi; $('t-np').checked = s.np;
  $('t-badges').checked = s.badges !== false;
  $('t-lat').checked = s.lat !== false;
  $('t-eolshow').checked = s.eolShow; $('t-eolshow').disabled = !s.np;
  $('t-autoreconn').checked = s.autoReconnect;
  if ($('module')) $('module').value = (App.setpopMode === 'edit' && f) ? f.profile.id : App.defaultModule;
  // eol and Hex live in the cmdbar → they ALWAYS reflect the focused terminal
  $('eol').value = f ? f.settings.eol : defaultSettings.eol;
  $('t-hex').checked = f ? !!f.settings.hex : false;
  $('t-esc').checked = f ? !!f.settings.esc : false;
  $('cmd').placeholder = (f && f.settings.hex) ? t('cmd_hex_ph') : t('cmd_ph');
  $('setpop-target').textContent = (App.setpopMode === 'edit' && f) ? f.label : '';
}
const bindSel = (id, key) => $(id).addEventListener('change', () => { settingsTarget()[key] = $(id).value; });
bindSel('baud', 'baud'); bindSel('databits', 'data'); bindSel('stopbits', 'stop'); bindSel('parity', 'parity');
$('eol').addEventListener('change', () => { if (UI.focused) UI.focused.settings.eol = $('eol').value; });
$('enc').addEventListener('change', () => { const s = settingsTarget(); s.enc = $('enc').value; if (App.setpopMode === 'edit' && UI.focused) UI.focused.framer.setEnc(decLabel(s.enc)); });
const bindTog = (id, key) => $(id).addEventListener('change', () => { settingsTarget()[key] = $(id).checked; });
bindTog('t-echo', 'echo'); bindTog('t-scroll', 'scroll');
// Auto-reconnect: besides saving the setting, unticking STOPS an ongoing retry and
// re-ticking RESUMES it if the edited terminal is down (not if the user disconnected it).
$('t-autoreconn').addEventListener('change', () => {
  const s = settingsTarget(); s.autoReconnect = $('t-autoreconn').checked;
  const f = UI.focused;
  if (App.setpopMode !== 'edit' || !f || s !== f.settings) return;
  if (!s.autoReconnect) stopAutoReconnect(f);
  else if (!f.connected && !f.virtual && !f.userClosed) attemptAutoReconnect(f);
});
$('t-ts').addEventListener('change', () => { settingsTarget().ts = $('t-ts').checked; if (App.setpopMode === 'edit' && UI.focused) rerenderLog(UI.focused); });
$('t-dir').addEventListener('change', () => { settingsTarget().dir = $('t-dir').checked; if (App.setpopMode === 'edit' && UI.focused) rerenderLog(UI.focused); });
$('t-ansi').addEventListener('change', () => { settingsTarget().ansi = $('t-ansi').checked; if (App.setpopMode === 'edit' && UI.focused) rerenderLog(UI.focused); });
$('t-np').addEventListener('change', () => { settingsTarget().np = $('t-np').checked; $('t-eolshow').disabled = !$('t-np').checked; if (App.setpopMode === 'edit' && UI.focused) rerenderLog(UI.focused); });
$('t-eolshow').addEventListener('change', () => { settingsTarget().eolShow = $('t-eolshow').checked; if (App.setpopMode === 'edit' && UI.focused) rerenderLog(UI.focused); });
// Show/hide the badges (URC / PROMPT / ERROR): pure CSS (::before), a class on the log is enough.
$('t-badges').addEventListener('change', () => { settingsTarget().badges = $('t-badges').checked; if (App.setpopMode === 'edit' && UI.focused && UI.focused.logEl) UI.focused.logEl.classList.toggle('no-badges', !$('t-badges').checked); });
// Latency chips (ms on the closing OK/ERROR): pure CSS via a class on the log, like the badges toggle.
$('t-lat').addEventListener('change', () => { settingsTarget().lat = $('t-lat').checked; if (App.setpopMode === 'edit' && UI.focused && UI.focused.logEl) UI.focused.logEl.classList.toggle('no-lat', !$('t-lat').checked); });
$('t-hex').addEventListener('change', () => { if (UI.focused) UI.focused.settings.hex = $('t-hex').checked; $('cmd').placeholder = $('t-hex').checked ? t('cmd_hex_ph') : t('cmd_ph'); });
$('t-esc').addEventListener('change', () => { if (UI.focused) UI.focused.settings.esc = $('t-esc').checked; });

// popover: 'new' (create new, from the header) or 'edit' (reconfigure the focused one, from the pane gear)
function openSetpop(mode) {
  App.setpopMode = mode;
  const isNew = mode === 'new';
  $('settings-pop').hidden = false;
  $('settings-btn').classList.toggle('active', isNew);
  $('setpop-title').textContent = isNew ? t('new_terminal') : t('configure_term');
  $('setpop-conn').style.display = isNew ? '' : 'none';   // "Open…" buttons only when creating
  // Baud/Data/Stop/Parity are physical-port properties: hide them when editing a simulator
  const hidePhys = !isNew && UI.focused && UI.focused.virtual;
  document.querySelectorAll('#settings-pop .phys').forEach((el) => { el.style.display = hidePhys ? 'none' : ''; });
  document.querySelector('#settings-pop .setpop-foot').style.display = hidePhys ? 'none' : '';   // foot only has auto-reconnect
  syncSettingsUI();
}
function closeSetpop() { $('settings-pop').hidden = true; $('settings-btn').classList.remove('active'); }
$('settings-btn').addEventListener('click', (e) => { e.stopPropagation(); const pop = $('settings-pop'); if (!pop.hidden && App.setpopMode === 'new') closeSetpop(); else openSetpop('new'); });
$('setpop-close').addEventListener('click', () => closeSetpop());
document.addEventListener('mousedown', (e) => { const pop = $('settings-pop'); if (!pop.hidden && !pop.contains(e.target) && e.target !== $('settings-btn') && !e.target.closest('.cpgear')) closeSetpop(); });

syncSettingsUI();

/* ---- module selector (command/parser profile per session) ---- */
/* Grouped by module maker and, inside it, by family: the profile brings `vendor` (SIMCom,
   Espressif…) and `category` (Cellular, GNSS, Wi-Fi, Wi-Fi + BLE). A profile without a vendor
   (the "None - raw serial" one) stays loose at the top, outside any group. */
function buildModuleSelect() {
  const sel = $('module'); sel.innerHTML = '';
  const mkOpt = (p) => {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name;
    if (p.chip) o.title = p.chip + (p.bands ? ' · ' + p.bands : '');
    return o;
  };
  const groups = new Map();   // 'SIMCom › Cellular' → option[], in registration order
  Profiles.list().forEach((p) => {
    if (!p.vendor) { sel.appendChild(mkOpt(p)); return; }
    const key = p.vendor + ' · ' + (p.category || p.family);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mkOpt(p));
  });
  groups.forEach((opts, label) => {
    const g = document.createElement('optgroup'); g.label = label;
    opts.forEach((o) => g.appendChild(o));
    sel.appendChild(g);
  });
  sel.value = App.defaultModule;
}
$('module').addEventListener('change', () => {
  const id = $('module').value;
  if (App.setpopMode === 'edit' && UI.focused) {     // reconfigures the focused terminal
    UI.focused.profile = Profiles.get(id);
    UI.focused.framer.raw = !!UI.focused.profile.raw;
    if (UI.focused.virtual && UI.focused.transport) { UI.focused.transport.raw = !!UI.focused.profile.raw; UI.focused.transport.setIdentity(UI.focused.profile.identity); }
    if (UI.focused.modEl) UI.focused.modEl.textContent = id.toUpperCase();
    refreshSidebar();
    updateInstVisibility();
  } else {                                         // 'new': only sets the module for the next terminal
    App.defaultModule = id;
  }
});
buildModuleSelect();

/* ---- quick actions (they reflect the focused terminal's module) ---- */
const aside = $('sidebar');
function currentSidebarProfile() { return UI.focused ? UI.focused.profile : Profiles.get(App.defaultModule); }
function buildSidebar() {
  const prof = currentSidebarProfile();
  aside.innerHTML = '';
  const sh = document.createElement('div'); sh.className = 'side-head';   // header: title + wizard panel controls
  const st = document.createElement('span'); st.className = 'side-title'; st.textContent = t('side_title');
  const cb = document.createElement('button'); cb.className = 'iconbtn side-collapse'; cb.textContent = '‹'; cb.title = t('collapse');
  cb.addEventListener('click', () => collapseSidebar(true));
  // maximize and close-all used to live in the old "WIZARDS" bar; now here, next to collapse
  const mx = document.createElement('button'); mx.className = 'iconbtn'; mx.id = 'wiz-max'; mx.textContent = '⛶'; mx.title = t('maximize');
  mx.addEventListener('click', toggleWizMax);
  const ca = document.createElement('button'); ca.className = 'iconbtn'; ca.id = 'wiz-closeall'; ca.textContent = '✕'; ca.title = t('close_all');
  ca.addEventListener('click', closeWizardPanel);
  sh.append(st, cb, mx, ca); aside.appendChild(sh);
  const onlyMacros = prof.raw || !UI.focused;   // None module, or no open terminal → Macros menu only
  const autoOpen = [];
  // each item is a launcher: it opens ONLY its wizard (the AT command list lives INSIDE the wizard, as a combo)
  const addItem = (id, sub, parent) => {
    const grp = QUICK.find((g) => g.wiz === id); if (!grp) return false;
    if (grp.cap && !profHasCap(prof, grp.cap)) return false;   // the focused module doesn't support this area
    const override = prof.quick && prof.quick[id];   // module-specific commands for this family
    const row = document.createElement('button'); row.className = 'grp-item' + (sub ? ' sub' : ''); row.dataset.wiz = id;
    const ico = document.createElement('span'); ico.className = 'grp-ico'; ico.innerHTML = SIDEBAR_ICONS[id] || '';
    const name = document.createElement('span'); name.className = 'grp-name';
    name.textContent = (id === 'wifi' && prof.family === 'ESP') ? 'Wi-Fi' : t(grp.nameKey);   // on ESP the Wi-Fi group does more than scanning → simple name
    row.append(ico, name);
    if (override) { const tag = document.createElement('span'); tag.className = 'grp-mod'; tag.textContent = prof.family; row.appendChild(tag); }
    row.addEventListener('click', () => toggleWizard(id));
    (parent || aside).appendChild(row);
    if (grp.open && !prof.raw) autoOpen.push(id);
    return true;
  };
  const visibleInCat = (entry) => entry.items.filter((id) => { const g = QUICK.find((x) => x.wiz === id); return g && (!g.cap || profHasCap(prof, g.cap)); });
  // ESP: Macros · Signal monitor · Wi-Fi · Protocols · Bluetooth · GNSS receiver: NMEA + chip config
  const layout = prof.family === 'ESP' ? SIDEBAR_ESP : (prof.family === 'GNSS' ? SIDEBAR_GNSS : SIDEBAR);
  for (const entry of layout) {
    if (onlyMacros) { if (entry.wiz === 'macros') addItem('macros', false); continue; }   // Macros only
    if (entry.cat) {
      const vis = visibleInCat(entry);
      if (!vis.length) continue;   // category with no visible children (per caps) → not shown
      // On ESP a single-child category (e.g. Wi-Fi) is flattened into a top-level launcher (no submenu).
      if (prof.family === 'ESP' && vis.length === 1) { addItem(vis[0], false); continue; }
      const det = document.createElement('details'); det.className = 'grp-catgroup';   // collapsible category (starts closed)
      const sum = document.createElement('summary'); sum.className = 'grp-cat';
      const cico = document.createElement('span'); cico.className = 'grp-ico'; cico.innerHTML = SIDEBAR_ICONS[entry.cat] || '';
      const cname = document.createElement('span'); cname.className = 'grp-name'; cname.textContent = t(entry.cat);
      sum.append(cico, cname);
      det.appendChild(sum);
      entry.items.forEach((id) => addItem(id, true, det));
      aside.appendChild(det);
    } else {
      addItem(entry.wiz, false);
    }
  }
  App.sidebarProfileId = onlyMacros ? '__macros_only__' : prof.id;   // the key includes the "Macros only" state (raw/no focus)
  syncSidebarActive();
  autoOpen.forEach((wid) => openWizard(wid));   // groups marked open:true (e.g. Macros) open on build
}
// Highlights the sidebar item whose wizard is open (replaces the old <details> `open` state)
// and shows the maximize/close-all controls only when there are open wizards.
function syncSidebarActive() {
  const open = new Set(App.wiz.open.map((c) => c.id));
  aside.querySelectorAll('.grp-item').forEach((r) => r.classList.toggle('active', open.has(r.dataset.wiz)));
  const has = App.wiz.open.length > 0;
  const mx = $('wiz-max'), ca = $('wiz-closeall');
  if (mx) { mx.hidden = !has; syncWizMaxBtn(); }
  if (ca) ca.hidden = !has;
}
// Shows/hides the sidebar (AT list) and its gutter; in "None" mode the console stands alone.
function setSidebarVisible(v) {
  $('sidebar').style.display = v ? '' : 'none';
  $('gutter-side').hidden = !v;
  if (!v) { closeWizardPanel(); }
}
// Rebuilds the sidebar only if the focused module changed; re-opens the open wizards with the new profile.
function refreshSidebar(force) {
  const prof = currentSidebarProfile();
  const pid = (prof.raw || !UI.focused) ? '__macros_only__' : prof.id;   // same key as buildSidebar: reflects the real content
  if (!force && pid === App.sidebarProfileId) return;
  const reopen = App.wiz.open.map((c) => c.id);
  closeWizardPanel();
  setSidebarVisible(true);
  buildSidebar();   // on None it only builds the Macros group (and re-opens the open:true groups)
  reopen.forEach((wid) => {   // re-opens the same wizards with the new profile (they are profile-aware)…
    if (aside.querySelector('.grp-item[data-wiz="' + wid + '"]')) openWizard(wid);   // …only if the new profile supports them
  });
}

/* ---- logbar ---- */
// Clear empties the focused terminal's content (log, open TX line and DOM) but KEEPS the
// ↑/↓ history; it only moves the mark from which "Export Input Only" exports (post-clear).
$('b-clear').addEventListener('click', () => { const s = UI.focused; if (!s) return; s.lines = []; s._openTx = null; s.histExportFrom = s.history.length; if (s.logEl) s.logEl.innerHTML = ''; });
// ---- export: choose format (plain .txt or .html with colors and styles) ----
// Self-contained HTML document that reproduces the console look (current theme variables + log rules).
function exportHtmlDoc(title, bodyHtml) {
  const rs = getComputedStyle(document.documentElement);
  const vars = ['--bg', '--surface', '--ink', '--ink-dim', '--ink-faint', '--tx', '--ok', '--err', '--urc', '--body', '--amber', '--amber-dim', '--mono', '--line', '--line-soft'];
  const root = vars.map((v) => `${v}:${rs.getPropertyValue(v).trim()}`).join(';');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
:root{${root}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--mono),monospace;font-size:13px;line-height:1.55;padding:18px}
h1{font-size:13px;color:var(--amber);font-weight:600;margin:0 0 14px;letter-spacing:.5px}
.ln{display:flex;gap:10px;align-items:baseline}
.ln .ts{color:var(--ink-faint);flex-shrink:0;font-size:11px;opacity:.7}
.ln .dir-arrow{flex-shrink:0}.ln .dir-arrow.tx{color:var(--amber-dim)}.ln .dir-arrow.rx{color:var(--ink-faint)}
.ln .msg{flex:1;white-space:pre-wrap;word-break:break-word}
.ln.tx .msg{color:var(--tx)}.ln.ok .msg{color:var(--ok)}.ln.err .msg{color:var(--err)}
.ln.urc .msg{color:var(--urc)}.ln.body .msg{color:var(--body)}
.ln.sys .msg{color:var(--ink-faint);font-style:italic}
.ln.urc::before{content:'URC';align-self:flex-start;flex-shrink:0;font-size:9px;letter-spacing:1px;color:var(--bg);background:var(--urc);padding:1px 4px;border-radius:3px;margin-top:3px}
.ln.prompt .msg{color:var(--amber);font-weight:600}
.ln.prompt::before{content:'PROMPT >';align-self:flex-start;flex-shrink:0;font-size:9px;letter-spacing:1px;color:var(--bg);background:var(--amber);padding:1px 4px;border-radius:3px;margin-top:3px}
.ln.err::before{content:'ERROR';align-self:flex-start;flex-shrink:0;font-size:9px;letter-spacing:1px;color:var(--bg);background:var(--err);padding:1px 4px;border-radius:3px;margin-top:3px}
.eolmark{color:var(--ink-faint);opacity:.6}
</style></head><body><h1>${escapeHtml(title)}</h1><div class="log">${bodyHtml}</div></body></html>`;
}
// Floating menu to choose the format, anchored above the button (the cmdbar is at the bottom).
function chooseExportFormat(btn, onTxt, onHtml) {
  document.querySelectorAll('.export-menu').forEach((m) => m.remove());
  const menu = document.createElement('div'); menu.className = 'export-menu';
  const opt = (label, fn) => { const b = document.createElement('button'); b.className = 'export-opt'; b.textContent = label; b.addEventListener('click', () => { close(); fn(); }); return b; };
  menu.append(opt(t('exp_txt'), onTxt), opt(t('exp_html'), onHtml));
  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(8, r.top - menu.offsetHeight - 6) + 'px';
  function close() { menu.remove(); document.removeEventListener('mousedown', outside); }
  function outside(e) { if (!menu.contains(e.target) && e.target !== btn) close(); }
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
}
const expTitle = (s, kind) => `AT Console${kind}  ·  ${s.label || 'terminal'}  ·  ${new Date().toLocaleString('es')}`;

// Export All: full log (what you see, honoring ts/direction/ANSI)
$('b-export').addEventListener('click', () => {
  const s = UI.focused; if (!s || !s.logEl) return;
  chooseExportFormat($('b-export'),
    () => downloadFile(`at-log-${slug(s.label)}-${Date.now()}.txt`, [...s.logEl.querySelectorAll('.ln')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()).join('\n'), 'text/plain'),
    () => downloadFile(`at-log-${slug(s.label)}-${Date.now()}.html`, exportHtmlDoc(expTitle(s, ''), s.logEl.innerHTML), 'text/html'));
});
// Export Input Only: commands entered since the last Clear (the full ↑/↓ history stays alive)
$('b-exphist').addEventListener('click', () => {
  const s = UI.focused; if (!s) return;
  const cmds = s.history.slice(s.histExportFrom || 0);
  if (!cmds.length) return;
  chooseExportFormat($('b-exphist'),
    () => downloadFile(`at-input-${slug(s.label)}-${Date.now()}.txt`, cmds.join('\n') + '\n', 'text/plain'),
    () => downloadFile(`at-input-${slug(s.label)}-${Date.now()}.html`, exportHtmlDoc(expTitle(s, ' input'), cmds.map((c) => `<div class="ln tx"><span class="dir-arrow tx">›</span><span class="msg">${escapeHtml(c)}</span></div>`).join('')), 'text/html'));
});

/* ---- open a saved log (.txt/.html from the exports): loaded into a disconnected "viewer"
   terminal, so search/filters (and the GNSS route from the log) work on it. ---- */
// HTML export: each row is a div.ln with the real classes → faithful reconstruction.
function parseLogHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const KNOWN = ['tx', 'ok', 'err', 'urc', 'body', 'sys', 'prompt', 'rx'];
  return [...doc.querySelectorAll('.ln')].map((row) => {
    const cls = KNOWN.find((k) => row.classList.contains(k)) || 'body';
    let text = '';
    const m = row.querySelector('.msg');
    if (m) {   // without the CME annotation or the end-of-line mark: they are regenerated on render
      const c = m.cloneNode(true);
      c.querySelectorAll('.err-note, .eolmark').forEach((n) => n.remove());
      c.querySelectorAll('mark').forEach((n) => n.replaceWith(n.textContent));   // desenvuelve resaltados guardados
      text = c.textContent;
    }
    const ts = row.querySelector('.ts');
    return { cls, text, arrow: cls === 'tx', term: '', ts: ts ? ts.textContent : '' };
  });
}
// TXT export: "HH:MM:SS › command" / "HH:MM:SS ‹ response" / sys lines with no arrow.
// The class is reconstructed: › = tx · ‹ = classify(text) · no arrow = sys.
function parseLogTxt(txt) {
  return txt.split(/\r?\n/).filter((l) => l.trim() !== '').map((raw) => {
    let line = raw.trim();
    const mts = line.match(/^(\d{1,2}:\d{2}:\d{2})\s+/); const ts = mts ? mts[1] : '';
    if (mts) line = line.slice(mts[0].length);
    const md = line.match(/^([›‹])\s?/); const dir = md ? md[1] : null;
    if (md) line = line.slice(md[0].length);
    let cls = dir === '›' ? 'tx' : dir === '‹' ? classify(line) : 'sys';
    if (cls === 'echo' || cls === 'empty') cls = 'sys';
    return { cls, text: line, arrow: dir === '›', term: '', ts };
  });
}
// Creates the viewer terminal (virtual, disconnected) with the log content.
async function loadLogViewer(name, recs) {
  addVirtualPort();                        // creates and focuses a new terminal
  const sess = UI.focused;
  await sess.transport.disconnect();       // inert viewer: nothing connected behind it
  sess.customName = name;
  if (sess.titleEl) sess.titleEl.textContent = sess.label;
  $('cmd-target').textContent = sess.label;
  sess.lines = recs.slice(); sess._openTx = null;
  rerenderLog(sess);
  return sess;
}
async function openLogFile(file) {
  const text = await file.text();
  const isHtml = /\.html?$/i.test(file.name) || /<div class="ln/.test(text);
  const recs = isHtml ? parseLogHtml(text) : parseLogTxt(text);
  return loadLogViewer(file.name.replace(/\.(txt|html?)$/i, ''), recs);
}
const importInput = document.createElement('input');
importInput.type = 'file'; importInput.accept = '.txt,.html,.htm,text/plain,text/html'; importInput.hidden = true;
document.body.appendChild(importInput);
importInput.addEventListener('change', async () => {
  const f = importInput.files[0]; importInput.value = '';
  if (!f) return;
  try { await openLogFile(f); } catch (e) { reportError('Open log', e); }
});
$('b-import').addEventListener('click', () => importInput.click());

// (the ↻ button is created — and wired — by buildInstStrip in core/instruments.js, because the
//  strip is rebuilt whenever the focused module changes its instrument set)

// Collapse/expand the sidebar (AT command menu) to the left.
function collapseSidebar(v) {
  document.querySelector('main').classList.toggle('side-collapsed', v);
  $('side-reopen').hidden = !v;
}
$('side-reopen').addEventListener('click', () => collapseSidebar(false));

/* ---- simulator control panel (🎛 on virtual terminals) ----
   Manipulates the virtual modem from outside: registration state, signal levels (sliders),
   inserting/removing the SIM and incoming events (SMS/call). On ESP it controls the Wi-Fi link. */
const emuPop = document.createElement('div'); emuPop.id = 'emu-pop'; emuPop.hidden = true;
document.body.appendChild(emuPop);
let emuPopSess = null;
function toggleEmuPop(sess, anchor) {
  if (!emuPop.hidden && emuPopSess === sess) { closeEmuPop(); return; }
  buildEmuPop(sess);
  emuPop.hidden = false; emuPopSess = sess;
  const r = anchor.getBoundingClientRect();
  emuPop.style.top = (r.bottom + 6) + 'px';
  emuPop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - emuPop.offsetWidth - 8)) + 'px';
}
function closeEmuPop() { emuPop.hidden = true; emuPop.innerHTML = ''; emuPopSess = null; }
document.addEventListener('mousedown', (e) => {
  if (!emuPop.hidden && !emuPop.contains(e.target) && !(e.target.classList && e.target.classList.contains('cpemu'))) closeEmuPop();
});
function buildEmuPop(sess) {
  const emu = sess.transport && sess.transport.emu; if (!emu) return;
  const s = emu.state;
  emuPop.innerHTML = '';
  const head = document.createElement('div'); head.className = 'emu-head';
  const ttl = document.createElement('b'); ttl.textContent = t('emu_ctl');
  const x = document.createElement('button'); x.className = 'iconbtn'; x.textContent = '✕'; x.addEventListener('click', closeEmuPop);
  head.append(ttl, x); emuPop.appendChild(head);
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'emu-sec'; d.textContent = txt; emuPop.appendChild(d); };
  const row = (label) => { const d = document.createElement('div'); d.className = 'emu-row'; if (label) { const l = document.createElement('span'); l.className = 'emu-lbl'; l.textContent = label; d.appendChild(l); } emuPop.appendChild(d); return d; };
  // slider with live value label: fmt(v) → displayed text
  const slider = (label, min, max, val, fmt, oninput) => {
    const d = row(label);
    const sl = document.createElement('input'); sl.type = 'range'; sl.min = String(min); sl.max = String(max); sl.value = String(val);
    const out = document.createElement('span'); out.className = 'emu-val'; out.textContent = fmt(val);
    sl.addEventListener('input', () => { const v = Number(sl.value); out.textContent = fmt(v); oninput(v); });
    d.append(sl, out);
    return sl;
  };
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; b.addEventListener('click', fn); return b; };

  // ---- standalone GNSS receiver: nothing to register or dial, what matters is what the
  //      antenna sees and where the module thinks it is ----
  if (sess.profile.family === 'GNSS') {
    const chk = (label, val, onchange) => {
      const d = row('');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!val;
      const lb = document.createElement('label'); lb.className = 'toggle'; lb.append(cb, document.createTextNode(' ' + label));
      cb.addEventListener('change', () => onchange(cb.checked));
      d.appendChild(lb);
      return cb;
    };
    const numField = (label, val, step, onchange) => {
      const d = row(label);
      const i = document.createElement('input'); i.type = 'number'; i.className = 'mac-delay'; i.step = String(step); i.value = String(val); i.style.flex = '1';
      i.addEventListener('change', () => onchange(Number(i.value)));
      d.appendChild(i);
      return i;
    };

    sec(t('emu_gnss_rx'));
    chk(t('emu_gnss_tx'), s.gnssOn, (v) => emu.ctlGnssPower(v));
    chk(t('emu_gnss_fix'), s.gnssFix !== false, (v) => emu.ctlGnssFix(v));

    sec(t('emu_gnss_pos'));
    // A few reference points so testing a route doesn't start by typing coordinates.
    const places = [
      ['Buenos Aires', -34.60373, -58.38159, 25],
      ['São Paulo', -23.55052, -46.63331, 760],
      ['Ciudad de México', 19.43261, -99.13321, 2240],
      ['Madrid', 40.41678, -3.70379, 667],
      ['Shanghai', 31.23042, 121.47370, 4],
    ];
    const pr = row(t('emu_gnss_place'));
    const psel = document.createElement('select'); psel.className = 'hw-sel'; psel.style.flex = '1';
    places.forEach(([n], i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = n; psel.appendChild(o); });
    pr.appendChild(psel);
    const latI = numField('Lat', s.gnssLat.toFixed(5), 0.0001, (v) => emu.ctlGnssPos(v, NaN));
    const lonI = numField('Lon', s.gnssLon.toFixed(5), 0.0001, (v) => emu.ctlGnssPos(NaN, v));
    const altI = numField(t('emu_gnss_alt'), s.gnssAlt, 1, (v) => emu.ctlGnssAlt(v));
    psel.addEventListener('change', () => {
      const [, lat, lon, alt] = places[Number(psel.value)];
      emu.ctlGnssPos(lat, lon); emu.ctlGnssAlt(alt);
      latI.value = lat.toFixed(5); lonI.value = lon.toFixed(5); altI.value = String(alt);
    });

    sec(t('emu_gnss_motion'));
    slider(t('emu_gnss_speed'), 0, 60, Math.round(s.gnssSpeed), (v) => (v === 0 ? t('emu_gnss_static') : v + ' kn'), (v) => emu.ctlGnssSpeed(v));

    sec(t('emu_gnss_sky'));
    // Shifting every C/N0: below four usable satellites the receiver loses the fix on its own.
    slider(t('emu_gnss_quality'), -30, 10, s.gnssSnrAdj || 0, (v) => (v > 0 ? '+' : '') + v + ' dB', (v) => emu.ctlGnssQuality(v));
    const cr = row(t('emu_gnss_cons'));
    cr.classList.add('emu-stack');   // long label: it takes its own line and the four fit below
    [['GP', 'GPS'], ['GL', 'GLONASS'], ['GA', 'Galileo'], ['GB', 'BeiDou']].forEach(([talker, name]) => {
      const lb = document.createElement('label'); lb.className = 'toggle';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = s.gnssCons[talker] !== false;
      cb.addEventListener('change', () => emu.ctlGnssCons(talker, cb.checked));
      lb.append(cb, document.createTextNode(' ' + name));
      cr.appendChild(lb);
    });
    return;
  }
  if (sess.profile.family === 'ESP') {   // ---- ESP: Wi-Fi link + AP RSSI ----
    sec(t('emu_wifi'));
    const d = row('');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'emu-wifi'; cb.checked = !!s.espWifi;
    const lb = document.createElement('label'); lb.className = 'toggle'; lb.append(cb, document.createTextNode(' ' + (s.espWifi ? s.espWifi.ssid : 'FibraHogar')));
    cb.addEventListener('change', () => emu.ctlWifi(cb.checked));
    d.appendChild(lb);
    slider('RSSI', -90, -30, s.espWifi ? s.espWifi.rssi : -55, (v) => v + ' dBm', (v) => emu.ctlWifiRssi(v));
    return;
  }
  // ---- cellular: network (per-type stat), signal, SIM and events ----
  sec(t('emu_network'));
  const regSels = {};
  for (const which of ['creg', 'cgreg', 'cereg']) {
    const d = row(which.toUpperCase());
    const sel = document.createElement('select'); sel.className = 'hw-sel'; sel.id = 'emu-' + which; sel.style.flex = '1';
    [1, 5, 2, 3, 0].forEach((v) => {   // "<stat> - <text>", e.g. "1 - Registered (home)"
      const o = document.createElement('option'); o.value = String(v); o.textContent = v + ' - ' + t('emu_reg' + v); sel.appendChild(o);
    });
    sel.value = String(s.reg[which]);
    sel.addEventListener('change', () => emu.ctlReg(which, Number(sel.value)));
    d.appendChild(sel);
    regSels[which] = sel;
  }
  sec(t('emu_signal'));
  slider('RSSI', 0, 31, s.rssi, (v) => (-113 + 2 * v) + ' dBm', (v) => emu.ctlSignal({ rssi: v }));
  slider('RSRP', -140, -44, s.rsrp, (v) => v + ' dBm', (v) => emu.ctlSignal({ rsrp: v }));
  slider('SINR', -20, 30, s.sinr, (v) => v + ' dB', (v) => emu.ctlSignal({ sinr: v }));
  slider('RSRQ', -19, -3, s.rsrq, (v) => v + ' dB', (v) => emu.ctlSignal({ rsrq: v }));
  sec(t('emu_sim'));
  const sr = row('');
  const simCb = document.createElement('input'); simCb.type = 'checkbox'; simCb.id = 'emu-sim'; simCb.checked = !!s.simReady;
  const simLb = document.createElement('label'); simLb.className = 'toggle'; simLb.append(simCb, document.createTextNode(' ' + t('emu_sim_in')));
  simCb.addEventListener('change', () => {   // inserting/removing the SIM drags all three registrations → reflect it in the selects
    emu.ctlSim(simCb.checked);
    for (const w of ['creg', 'cgreg', 'cereg']) regSels[w].value = String(emu.state.reg[w]);
  });
  sr.appendChild(simLb);
  sec(t('emu_events'));
  const er = row('');
  const ringB = mkBtn('☎ ' + t('emu_ring'), () => { emu.ctlRing(!emu.ringing); ringB.classList.toggle('on', emu.ringing); });
  ringB.id = 'emu-ring';
  ringB.classList.toggle('on', emu.ringing);   // reopening the panel reflects whether it is still ringing
  er.append(mkBtn('✉ ' + t('emu_sms'), () => sess.transport.injectSms('+5491155553333', 'Mensaje del simulador')), ringB);
}

