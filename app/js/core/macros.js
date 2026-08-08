/* macros.js — macro engine (runMacro) + macros panel of the wizard stack
   Macro syntax (one per line).
     AT+...             AT command (interprets \r \n \t \xHH \e \\ escapes; the terminal's line ending is appended)
     #text              comment
     @NNN               waits NNN ms
     @loop N            the lines AFTER this one repeat N times (first occurrence only, max 9999)
     ?URC <regex> [ms]  pauses until a received line matches <regex> (case-insensitive); the LAST
                        numeric token is the timeout in ms (default 10000). On timeout the macro
                        ABORTS with a visible error. If your regex ends in a number, always give
                        the timeout explicitly. E.g.:  ?URC WIFI GOT IP 15000
     ^Z                 sends Ctrl+Z (0x1A) — closes e.g. an AT+CMGS SMS
     ^[                 sends ESC (0x1B) — cancels a send
   ${var} placeholders anywhere in the macro prompt for their values when run (remembered
   for the next run). Data after a module's "> " prompt: the ">" is sent by the module (not
   written). While the module shows the prompt, the macro sends the next line AS-IS, no line ending.
   E.g. SMS:  AT+CMGF=1 / AT+CMGS="${number}" / @500 / Hello world / ^Z
   The ■ Stop button (or App.macro.abort) breaks the macro before the next line.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

const MACRO_UNIT_MS = { ms: 1, s: 1000, min: 60000, h: 3600000 };

// Distinct ${var} names of a macro, in order of appearance.
function macroVarNames(text) {
  const out = [];
  for (const m of text.matchAll(/\$\{(\w+)\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
function macroSubst(text, values) { return text.replace(/\$\{(\w+)\}/g, (_, n) => (values[n] ?? '')); }

// ${var} dialog: asks the variable values before running. Resolves null on cancel.
// Values are prefilled with (and remembered in) App.macro.vars.
function macroVarsDialog(names) {
  return new Promise((resolve) => {
    const old = document.getElementById('macvar-pop'); if (old) old.remove();
    const pop = document.createElement('div'); pop.id = 'macvar-pop';
    const ttl = document.createElement('b'); ttl.textContent = t('mac_vars'); pop.appendChild(ttl);
    const inputs = {};
    for (const n of names) {
      const row = document.createElement('label'); row.className = 'macvar-row';
      const sp = document.createElement('span'); sp.textContent = n;
      const inp = document.createElement('input'); inp.className = 'sms-to'; inp.value = App.macro.vars[n] ?? '';
      row.append(sp, inp); pop.appendChild(row); inputs[n] = inp;
    }
    const done = (ok) => { pop.remove(); resolve(ok ? Object.fromEntries(names.map((n) => [n, inputs[n].value])) : null); };
    const bar = document.createElement('div'); bar.className = 'fs-bar';
    const run = document.createElement('button'); run.className = 'fs-btn'; run.textContent = '▶ ' + t('run');
    run.addEventListener('click', () => done(true));
    const cancel = document.createElement('button'); cancel.className = 'fs-btn'; cancel.textContent = t('mac_cancel');
    cancel.addEventListener('click', () => done(false));
    bar.append(run, cancel); pop.appendChild(bar);
    pop.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') done(false); });
    document.body.appendChild(pop);
    const first = inputs[names[0]]; if (first) first.focus();
  });
}

async function runMacro(text, delay) {
  delay = delay ?? App.macro.delay;
  // ${vars}: ask for the values before running (driver macros never carry placeholders)
  const names = macroVarNames(text);
  if (names.length) {
    const values = await macroVarsDialog(names);
    if (!values) return;                                   // cancelled
    Object.assign(App.macro.vars, values);                 // remembered for the next run
    text = macroSubst(text, values);
  }
  // @loop N: expand — the lines after the (first) directive repeat N times
  let lines = text.split('\n');
  const li = lines.findIndex((l) => /^@loop\s+\d+\s*$/i.test(l.trim()));
  if (li >= 0) {
    const n = Math.min(9999, Math.max(1, parseInt(lines[li].trim().slice(5), 10) || 1));
    const body = lines.slice(li + 1);
    lines = [...lines.slice(0, li), ...Array.from({ length: n }, () => body).flat()];
  }
  App.macro.running = true; App.macro.abort = false;
  try {
    for (const raw of lines) {
      if (App.macro.abort) break;                          // ■ Stop pressed
      const l = raw.trim();
      if (!l || l.startsWith('#')) continue;
      if (/^\?urc\s+/i.test(l)) {                          // ?URC <regex> [timeout ms]
        const rest = l.replace(/^\?urc\s+/i, '').trim();
        const m = rest.match(/^(.*?)(?:\s+(\d+))?$/);
        const src = (m[1] || '').trim(), tmo = m[2] ? Number(m[2]) : 10000;
        let re;
        try { re = new RegExp(src, 'i'); } catch (_) { throw new Error('?URC — bad regex: ' + src); }
        const hit = await UI.waitLine(re, tmo);
        if (App.macro.abort) break;
        if (!hit) throw new Error(`?URC — timeout (${tmo} ms) waiting for: ${src}`);
        continue;
      }
      if (/^@loop\b/i.test(l)) continue;                   // already expanded (only the first applies)
      if (l.startsWith('@')) { await sleep(Number(l.slice(1)) || delay); continue; }
      if (l === '^Z') { await UI.sendRaw('\x1a'); await sleep(delay); continue; }
      if (l === '^[') { await UI.sendRaw('\x1b'); await sleep(delay); continue; }
      // With the "> " prompt active the line is DATA → as-is, no line ending; otherwise it's an AT command
      // → the terminal's line ending is appended. Escapes are interpreted in both cases (\r \n \t \xHH …).
      if (UI.focused && UI.focused.atPrompt) await UI.sendRaw(unescapeInput(l));
      else await UI.send(unescapeInput(l));
      await sleep(delay);
    }
  } catch (e) {
    reportError('Macro', e);   // a send failure doesn't leave the macro silently hung
  } finally {
    App.macro.running = false; App.macro.abort = false;
  }
}

function downloadMacroTxt(name, text) {
  const fn = (name || 'macro').replace(/[^\w.-]+/g, '_') + '.txt';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = fn; a.click();
}

// Macros panel (wizard render). Editor + library (presets + .txt loaded per folder).
function renderMacros(host) {
  host.innerHTML = '';
  const sec = (txt) => { const d = document.createElement('div'); d.className = 'gn-sechead'; d.textContent = txt; return d; };
  const mkBtn = (txt, fn, title) => { const b = document.createElement('button'); b.className = 'fs-btn'; b.textContent = txt; if (title) b.title = title; b.addEventListener('click', fn); return b; };

  // Editor
  host.appendChild(sec(t('mac_editor')));
  const name = document.createElement('input'); name.className = 'sms-to'; name.placeholder = t('mac_name'); name.value = App.macro.draft.name;
  name.addEventListener('input', () => { App.macro.draft.name = name.value; });
  host.appendChild(name);
  const ta = document.createElement('textarea'); ta.className = 'macro-ta'; ta.spellcheck = false; ta.value = App.macro.draft.text;
  ta.addEventListener('input', () => { App.macro.draft.text = ta.value; });
  host.appendChild(ta);
  const erow = document.createElement('div'); erow.className = 'fs-bar';
  const num = document.createElement('input'); num.type = 'number'; num.className = 'mac-delay'; num.min = '0'; num.step = 'any'; num.value = String(App.macro.delayVal);
  const unitSel = document.createElement('select'); unitSel.className = 'mac-unit';
  [['ms', t('unit_ms')], ['s', t('unit_s')], ['min', t('unit_min')], ['h', t('unit_h')]].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === App.macro.unit) o.selected = true; unitSel.appendChild(o); });
  const applyDelay = () => { App.macro.delayVal = Math.max(0, Number(num.value) || 0); App.macro.delay = App.macro.delayVal * MACRO_UNIT_MS[App.macro.unit]; };
  num.addEventListener('input', applyDelay);
  unitSel.addEventListener('change', () => { App.macro.unit = unitSel.value; applyDelay(); });
  const pause = document.createElement('label'); pause.className = 'gn-auto'; pause.append(document.createTextNode(t('macro_pause') + ' '), num, unitSel);
  erow.append(pause,
    mkBtn('▶ ' + t('run'), () => runMacro(App.macro.draft.text)),
    mkBtn('■ ' + t('mac_stop'), () => { App.macro.abort = true; }, t('mac_stop_hint')),
    mkBtn('★ ' + t('mac_addpreset'), () => {
      if (!App.macro.draft.text.trim()) return;
      MACROS.push({ name: App.macro.draft.name.trim() || t('mac_untitled'), text: App.macro.draft.text });
      renderMacros(host);
    }),
    mkBtn('⤓ ' + t('mac_save'), () => downloadMacroTxt(App.macro.draft.name, App.macro.draft.text)));
  host.append(erow);

  // Biblioteca
  host.appendChild(sec(t('mac_library')));
  const loadInput = document.createElement('input'); loadInput.type = 'file'; loadInput.webkitdirectory = true; loadInput.style.display = 'none';
  loadInput.addEventListener('change', async () => {
    const files = [...loadInput.files].filter((f) => /\.txt$/i.test(f.name));
    App.macro.loaded = {};
    for (const f of files) {
      const parts = f.webkitRelativePath.split('/');
      const mod = parts.length >= 2 ? parts[parts.length - 2] : '(root)';
      const text = await f.text();
      (App.macro.loaded[mod] = App.macro.loaded[mod] || []).push({ name: f.name.replace(/\.txt$/i, ''), text });
    }
    renderMacros(host);
  });
  const loadRow = document.createElement('div'); loadRow.className = 'fs-bar';
  loadRow.append(mkBtn('📁 ' + t('mac_loadfolder'), () => loadInput.click()), loadInput);
  host.append(loadRow);
  const note = document.createElement('div'); note.className = 'fs-status'; note.style.color = 'var(--ink-dim)'; note.textContent = t('mac_note');
  host.append(note);

  const listItem = (m, onDel) => {
    const row = document.createElement('div'); row.className = 'mac-row';
    const nm = document.createElement('span'); nm.className = 'mac-name'; nm.textContent = m.name;
    row.append(nm, mkBtn('▶', () => runMacro(m.text), t('run')), mkBtn('✎', () => { App.macro.draft = { name: m.name, text: m.text }; renderMacros(host); }, t('mac_edit')));
    if (onDel) { const d = mkBtn('🗑', onDel, t('mac_delete')); d.classList.add('mac-del'); row.appendChild(d); }
    return row;
  };

  host.appendChild(sec(t('mac_presets')));
  if (!currentSidebarProfile().raw) {   // None: no AT command presets (raw console)
    MACROS.forEach((m, i) => host.appendChild(listItem({ name: m.name || t(m.labelKey), text: m.text }, () => {
      MACROS.splice(i, 1);   // removes the preset from the session (comes back on reload)
      renderMacros(host);
    })));
  } else {
    const none = document.createElement('div'); none.className = 'fs-status'; none.style.color = 'var(--ink-faint)'; none.textContent = t('mac_noatraw');
    host.append(none);
  }

  const mods = Object.keys(App.macro.loaded);
  if (mods.length) {
    const fmod = currentSidebarProfile().id;
    mods.sort((a, b) => (a === fmod ? -1 : b === fmod ? 1 : a.localeCompare(b)));
    for (const mod of mods) {
      const h = sec(mod); if (mod === fmod) h.classList.add('mac-active'); host.appendChild(h);
      App.macro.loaded[mod].forEach((m, i) => host.appendChild(listItem(m, () => {
        App.macro.loaded[mod].splice(i, 1);
        if (!App.macro.loaded[mod].length) delete App.macro.loaded[mod];
        renderMacros(host);
      })));
    }
  } else {
    const none = document.createElement('div'); none.className = 'fs-status'; none.style.color = 'var(--ink-faint)'; none.textContent = t('mac_loaded_none');
    host.append(none);
  }
}

// Opens the Macros wizard and brings it into view (from other wizards' "load into editor" action).
function openMacrosGroup() {
  openWizard('macros');
  const c = App.wiz.open.find((x) => x.id === 'macros');
  if (c) c.el.scrollIntoView({ block: 'nearest' });
}
