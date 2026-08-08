/* wizards-core.js — wizard framework: card stack, field memory,
   data-driven render (fields + actions) and per-card teardown. Each wizard's
   renderers live in wizards-radio.js / wizards-services.js.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

const wizMemory = {};        // session memory: { wizId: { fieldId: value } }
const MAX_WIZ = 8;           // max wizards open at once (same layout as the terminals)

function layoutWizStack() {
  const c = $('wiz-stack');
  c.dataset.n = String(App.wiz.open.length);   // n=1 → 1 column; ≥2 → 2-column masonry
}

function saveWizValues(w) {
  const mem = wizMemory[w.id] || (wizMemory[w.id] = {});
  w.fields.forEach((f) => { const el = $(f.id); if (el) mem[f.id] = f.type === 'checkbox' ? el.checked : el.value; });
}

function showWizPanel(v) { $('wiz-panel').hidden = !v; $('gutter-wiz').hidden = !v; if (!v) document.querySelector('main').classList.remove('wiz-max'); }

// Opens a wizard as a card on the left stack (up to MAX_WIZ; if full, closes the oldest).
function openWizard(id) {
  const w = WIZARDS.find((x) => x.id === id);
  if (!w) return;
  const ex = App.wiz.open.find((c) => c.id === id);
  if (ex) { ex.el.scrollIntoView({ block: 'nearest' }); return; }   // already open → focus it
  while (App.wiz.open.length >= MAX_WIZ) closeCard(App.wiz.open[0]);
  const card = buildWizardCard(w, id);
  $('wiz-stack').appendChild(card.el);
  App.wiz.open.push(card);
  layoutWizStack();
  showWizPanel(true);
  syncSidebarActive();
  card.el.scrollIntoView({ block: 'nearest' });
}

function buildWizardCard(w, id) {
  const famMap = { tcpudp: 'tcp', http: 'http', mqtt: 'mqtt' };
  const wt = (k) => t('wz_' + k);
  let wtitle = w.title;
  if (id === 'wifi' && UI.focused && UI.focused.profile.family === 'ESP') wtitle = 'Wi-Fi';   // ESP: the wizard is full Wi-Fi, not just scan
  if (famMap[id] && UI.focused) wtitle += ` · ${UI.focused.profile.family}`;

  const el = document.createElement('section'); el.className = 'wiz-card';
  const head = document.createElement('div'); head.className = 'wiz-head';
  const titleEl = document.createElement('b'); titleEl.textContent = wtitle;
  const sp = document.createElement('span'); sp.className = 'sp';
  const colBtn = document.createElement('button'); colBtn.className = 'iconbtn'; colBtn.textContent = '▾'; colBtn.title = t('collapse');
  const closeBtn = document.createElement('button'); closeBtn.className = 'iconbtn'; closeBtn.textContent = '✕'; closeBtn.title = t('close');
  head.append(titleEl, sp, colBtn, closeBtn);
  const body = document.createElement('div'); body.className = 'wiz-body';
  el.append(head, body);

  const card = { id, el, cleanup: null };
  colBtn.addEventListener('click', () => { const c = el.classList.toggle('collapsed'); colBtn.textContent = c ? '▸' : '▾'; });
  closeBtn.addEventListener('click', () => closeCard(card));

  App.wiz.cleanup = null;
  renderWizBody(body, w, id, wt);
  card.cleanup = App.wiz.cleanup; App.wiz.cleanup = null;   // captures whatever teardown the render set
  appendAtCommands(body, id);   // "AT Commands" combo at the end of every wizard
  return card;
}

// "AT Commands" combo at the end of the wizard: the sidebar group's commands (honors the per-profile override).
// A command with editable __VARS__ goes to the send box to be completed; the rest is sent directly.
function appendAtCommands(host, wizId) {
  const grp = QUICK.find((g) => g.wiz === wizId);
  if (!grp) return;
  const prof = currentSidebarProfile();
  const items = (prof.quick && prof.quick[wizId]) || grp.items;
  if (!items || !items.length) return;   // e.g. the Macros group has no loose commands
  const sec = document.createElement('div'); sec.className = 'gn-sechead'; sec.textContent = t('at_commands');
  const row = document.createElement('div'); row.className = 'fs-bar at-cmds';
  const sel = document.createElement('select'); sel.className = 'hw-sel at-sel'; sel.style.flex = '1 1 auto'; sel.style.minWidth = '0';
  // 2 colors: amber (✎) = the command asks for parameters (goes to the box to complete) · green (▸) = ready, sent directly.
  // The glyph reinforces the distinction where the browser ignores <option> colors in the native dropdown.
  items.forEach(([label, cmd, fill], i) => {
    const o = document.createElement('option'); o.value = String(i);
    o.className = fill ? 'needs-param' : 'no-param';
    o.textContent = (fill ? '✎ ' : '▸ ') + t(label) + ' · ' + cmd.replace(/__\w+__/g, '…');
    sel.appendChild(o);
  });
  const mark = () => { const fill = !!items[Number(sel.value)][2]; sel.classList.toggle('needs-param', fill); sel.classList.toggle('no-param', !fill); };
  sel.addEventListener('change', mark); mark();
  const btn = document.createElement('button'); btn.className = 'fs-btn'; btn.textContent = '▸ ' + t('run');
  btn.addEventListener('click', () => { const [, cmd, fill] = items[Number(sel.value)]; return fill ? UI.fillCmd(cmd) : UI.send(cmd); });
  row.append(sel, btn);
  host.append(sec, row);
}

function renderWizBody(body, w, id, wt) {
  // Capability not supported by the focused module → notice.
  if (w.cap && UI.focused && !profHasCap(UI.focused.profile, w.cap)) {
    const n = document.createElement('div'); n.className = 'fs-status'; n.style.color = 'var(--ink-dim)';
    n.textContent = t('gn_unsupported').replace('{mod}', UI.focused.profile.name);
    body.appendChild(n); return;
  }
  if (w.render) { w.render(body); return; }   // wizard with its own render
  // wizard data-driven (fields + actions)
  if (w.extraTop) { try { w.extraTop(body); } catch (e) { reportError('Wizard ' + id, e); } }   // extra sections BEFORE the form
  if (w.formTitle) { const h = document.createElement('div'); h.className = 'gn-sechead'; h.textContent = w.formTitle; body.appendChild(h); }
  const grid = document.createElement('div'); grid.className = 'wiz-grid';
  const mem = wizMemory[id] || {};
  for (const f of w.fields) {
    const cell = document.createElement('div');
    cell.className = 'wiz-f' + (f.type === 'checkbox' ? ' chk' : '') + (f.full ? ' full' : '');
    const saved = mem[f.id];
    if (f.type === 'checkbox') {
      const inp = document.createElement('input'); inp.type = 'checkbox'; inp.id = f.id;
      inp.checked = saved !== undefined ? saved : !!f.val;
      inp.addEventListener('change', () => saveWizValues(w));
      const lbl = document.createElement('span'); lbl.textContent = wt(f.key);
      cell.append(inp, lbl);
    } else {
      const lbl = document.createElement('span'); lbl.textContent = wt(f.key); cell.appendChild(lbl);
      let inp;
      if (f.type === 'select') {
        inp = document.createElement('select');
        for (const o of f.opts) { const op = document.createElement('option'); op.value = o; op.textContent = o; inp.appendChild(op); }
        inp.value = saved !== undefined ? saved : (f.val != null ? f.val : f.opts[0]);
      } else {
        inp = document.createElement('input'); inp.type = f.type;
        if (f.ph) inp.placeholder = f.ph;
        inp.value = saved !== undefined ? saved : (f.val != null ? f.val : '');
      }
      inp.id = f.id;
      inp.addEventListener('change', () => saveWizValues(w));
      cell.appendChild(inp);
    }
    grid.appendChild(cell);
  }
  body.appendChild(grid);
  const acts = document.createElement('div'); acts.className = 'wiz-actions';
  const toEditor = document.createElement('input'); toEditor.type = 'checkbox';
  for (const a of w.actions) {
    const b = document.createElement('button'); b.className = 'wiz-act' + (a.go ? ' go' : '');
    b.textContent = wt(a.key);
    b.addEventListener('click', () => {
      try {
        const v = {};
        w.fields.forEach((f) => { const el = $(f.id); v[f.id] = f.type === 'checkbox' ? el.checked : el.value; });
        saveWizValues(w);
        const macro = a.build(v);
        if (toEditor.checked) { App.macro.draft = { name: w.id + '-' + a.key, text: macro }; openMacrosGroup(); }
        else { runMacro(macro); }
      } catch (e) {
        reportError('Acción ' + a.key, e);   // a driver that throws while building the macro is visible, not swallowed
      }
    });
    acts.appendChild(b);
  }
  body.appendChild(acts);
  const lbl = document.createElement('label'); lbl.className = 'toggle'; lbl.style.cssText = 'color:var(--ink-faint);font-size:11px';
  lbl.append(toEditor, document.createTextNode(' ' + wt('load')));
  body.appendChild(lbl);
  // extra sections below the data-driven form (e.g. Ping/IP/server of the TCP/UDP wizard)
  if (w.extra) { try { w.extra(body); } catch (e) { reportError('Wizard ' + id, e); } }
}

// Closes a card (runs its teardown and collapses its group in the menu).
function closeCard(card) {
  if (!card) return;
  if (card.cleanup) { try { card.cleanup(); } catch (_) {} }
  card.el.remove();
  const i = App.wiz.open.indexOf(card); if (i >= 0) App.wiz.open.splice(i, 1);
  layoutWizStack();
  syncSidebarActive();   // the sidebar item is no longer highlighted
  if (!App.wiz.open.length) showWizPanel(false);
}
function closeWizardById(id) { const c = App.wiz.open.find((x) => x.id === id); if (c) closeCard(c); }
// Menu click: if the wizard is already open it closes it (and unmarks the item); otherwise it opens it.
function toggleWizard(id) { const c = App.wiz.open.find((x) => x.id === id); if (c) closeCard(c); else openWizard(id); }
function closeWizardPanel() { while (App.wiz.open.length) closeCard(App.wiz.open[0]); }   // closes all

// Maximize/restore the wizard panel. The buttons live in the sidebar header
// (buildSidebar creates and wires them); only the logic lives here, reusable after each rebuild.
function toggleWizMax() { document.querySelector('main').classList.toggle('wiz-max'); syncWizMaxBtn(); }
function syncWizMaxBtn() {
  const b = $('wiz-max'); if (!b) return;
  const on = document.querySelector('main').classList.contains('wiz-max');
  b.classList.toggle('on', on); b.textContent = on ? '🗗' : '⛶';
  b.title = on ? t('restore') : t('maximize');
}
