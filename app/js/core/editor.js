/* editor.js — text-editor panes (CodeMirror 5, vendored) that share the console grid with the
   terminals. "+ New File" in the header opens one; they are NOT sessions (no transport/framer),
   they live in App.editors and only borrow the pane layout.
   Useful for writing AT macros: the `atmacro` mode highlights the macro syntax and "▶ Run"
   executes the buffer on the focused terminal (same engine as the Macros wizard).
   CodeMirror is optional at runtime: every entry point guards on `typeof CodeMirror` so the
   app (and the test harness, which skips vendor/) still works without it.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

// Syntax highlight for the macro language (see macros.js): comments, delays, ?URC, @loop,
// ${vars}, ^Z/^[ control lines, AT commands and quoted strings.
function defineAtMacroMode() {
  if (typeof CodeMirror === 'undefined' || !CodeMirror.defineSimpleMode || CodeMirror.modes.atmacro) return;
  CodeMirror.defineSimpleMode('atmacro', {
    start: [
      { regex: /#.*/, token: 'comment' },
      { regex: /\?URC\b/i, token: 'keyword' },
      { regex: /@loop\s+\d+/i, token: 'keyword' },
      { regex: /@\d+/, token: 'number' },
      { regex: /\^[Z[]/, token: 'atom' },
      { regex: /\$\{\w+\}/, token: 'variable-2' },
      { regex: /"(?:[^\\"]|\\.)*"/, token: 'string' },
      { regex: /\bAT[A-Z+#$%&*]*[A-Z0-9]*/i, token: 'def' },
      { regex: /\b\d+\b/, token: 'number' },
    ],
  });
}

const EDITOR_MODES = ['atmacro', 'text/plain'];
const editorFileExt = (name) => (name.match(/\.(\w+)$/) || [, 'txt'])[1].toLowerCase();

// Creates an editor pane. name/text optional (defaults to an empty "untitled-N.txt").
function addEditor(name, text) {
  if (paneCount() >= MAX_SESS) return null;
  const ed = {
    id: ++App.edSeq,
    name: name || `untitled-${App.edSeq}.txt`,
    text: text || '',
    cm: null, el: null, titleEl: null, dirty: false,
  };
  App.editors.push(ed);
  buildEditorPane(ed);
  layoutPanes();
  setLinkUI();
  return ed;
}

function removeEditor(ed) {
  if (ed.dirty && !window.confirm(t('ed_discard').replace('{n}', ed.name))) return;
  editorSearchClear(ed);
  if (App.searchTarget && App.searchTarget.kind === 'editor' && App.searchTarget.ed === ed) {
    App.searchTarget = null;
    if (!$('searchbar').hidden) qClose();   // the shared bar was searching this editor → close it
  }
  if (ed.el) ed.el.remove();
  App.editors = App.editors.filter((e) => e !== ed);
  layoutPanes();
  setLinkUI();
}

// Current buffer text (CodeMirror when present, the mirrored textarea otherwise).
function editorText(ed) { return ed.cm ? ed.cm.getValue() : (ed.ta ? ed.ta.value : ed.text); }
function editorSetText(ed, txt) { ed.text = txt; if (ed.cm) ed.cm.setValue(txt); else if (ed.ta) ed.ta.value = txt; }

function markEditorDirty(ed, dirty) {
  ed.dirty = dirty;
  if (ed.titleEl) ed.titleEl.textContent = ed.name + (dirty ? ' •' : '');
}

function buildEditorPane(ed) {
  const pane = document.createElement('div'); pane.className = 'cpane epane';
  const head = document.createElement('div'); head.className = 'cphead';
  const dot = document.createElement('span'); dot.className = 'cpdot';
  const title = document.createElement('span'); title.className = 'cptitle'; title.textContent = ed.name; title.title = t('ed_rename');
  const ren = document.createElement('button'); ren.className = 'cpren'; ren.textContent = '✎'; ren.title = t('ed_rename');
  ren.addEventListener('click', (e) => { e.stopPropagation(); startEditorRename(ed); });
  title.addEventListener('dblclick', (e) => { e.stopPropagation(); startEditorRename(ed); });
  // toolbar: icon-only search/open/save, a bare ▶ for run, and the ✕ pushed to the far right.
  // Search opens the SHARED bar at the foot (same one the terminal uses), targeting this editor.
  const find = document.createElement('button'); find.className = 'edbtn edfind'; find.textContent = '🔍'; find.title = t('log_search');
  find.addEventListener('click', (e) => { e.stopPropagation(); toggleSharedSearchForEditor(ed); });
  const open = document.createElement('button'); open.className = 'edbtn'; open.innerHTML = UI_ICONS.open; open.title = t('ed_open');
  open.addEventListener('click', (e) => { e.stopPropagation(); openEditorFile(ed); });
  const save = document.createElement('button'); save.className = 'edbtn'; save.innerHTML = UI_ICONS.save; save.title = t('ed_save');
  save.addEventListener('click', (e) => { e.stopPropagation(); saveEditorFile(ed); });
  const run = document.createElement('button'); run.className = 'edbtn run'; run.textContent = '▶'; run.title = t('ed_run_hint');
  run.addEventListener('click', (e) => { e.stopPropagation(); runEditorAsMacro(ed); });
  const sp = document.createElement('span'); sp.className = 'edsp';   // spacer: keeps ✕ at the far right
  const close = document.createElement('button'); close.className = 'cpclose'; close.textContent = '✕'; close.title = t('cp_close');
  close.addEventListener('click', (e) => { e.stopPropagation(); removeEditor(ed); });
  head.append(dot, title, ren, find, open, save, run, sp, close);
  ed.findBtn = find;

  const body = document.createElement('div'); body.className = 'edbody';
  pane.append(head, body);
  $('consoles').appendChild(pane);
  ed.el = pane; ed.titleEl = title;
  ed.searchQ = null; ed.searchHits = []; ed.searchIdx = -1; ed.searchMarks = [];
  // clicking anywhere in the pane makes it the search target (the shared bar follows the focus)
  pane.addEventListener('mousedown', () => setSearchTarget({ kind: 'editor', ed }));

  if (typeof CodeMirror !== 'undefined') {
    defineAtMacroMode();
    ed.cm = CodeMirror(body, {
      value: ed.text,
      mode: editorFileExt(ed.name) === 'txt' ? 'atmacro' : 'text/plain',
      lineNumbers: true,
      styleActiveLine: true,
      matchBrackets: true,
      theme: 'atconsole',
      lineWrapping: true,
      tabSize: 2,
      // Ctrl+F opens the shared bar for this editor (also handled at document level for the browser);
      // Esc closes it while typing inside the editor.
      extraKeys: {
        'Ctrl-F': () => openSharedSearchForEditor(ed),
        'Cmd-F': () => openSharedSearchForEditor(ed),
        Esc: () => { if (!$('searchbar').hidden) qClose(); },
      },
    });
    ed.cm.on('focus', () => setSearchTarget({ kind: 'editor', ed }));
    ed.cm.on('change', () => { markEditorDirty(ed, true); editorSearchRefresh(ed); });   // keep matches fresh while typing
    setTimeout(() => ed.cm && ed.cm.refresh(), 50);   // the pane was just laid out
  } else {
    // Fallback without the vendored CodeMirror (e.g. the jsdom harness): a plain textarea,
    // so the editor keeps working and the tests can drive it.
    const ta = document.createElement('textarea'); ta.className = 'edfallback'; ta.value = ed.text;
    ta.addEventListener('focus', () => setSearchTarget({ kind: 'editor', ed }));
    ta.addEventListener('input', () => markEditorDirty(ed, true));
    body.appendChild(ta);
    ed.ta = ta;
  }
  return pane;
}

// Inline rename of the file name (Enter confirms, Esc cancels) — mirrors startRename() for terminals.
function startEditorRename(ed) {
  const el = ed.titleEl; if (!el) return;
  el.textContent = ed.name;   // drop the dirty mark while editing
  el.contentEditable = 'true'; el.spellcheck = false; el.classList.add('editing');
  el.focus();
  const rng = document.createRange(); rng.selectNodeContents(el);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rng);
  const commit = () => {
    el.removeEventListener('blur', commit); el.removeEventListener('keydown', onKey);
    el.contentEditable = 'false'; el.classList.remove('editing');
    const v = el.textContent.trim();
    if (v) ed.name = v;
    if (ed.cm) ed.cm.setOption('mode', editorFileExt(ed.name) === 'txt' ? 'atmacro' : 'text/plain');
    markEditorDirty(ed, ed.dirty);
    el.title = t('ed_rename');
  };
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); el.textContent = ed.name; el.blur(); }
  };
  el.addEventListener('blur', commit); el.addEventListener('keydown', onKey);
}

// Load a local file into this editor (text only; the name drives the highlight mode).
function openEditorFile(ed) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.txt,.json,.js,.csv,.log,.md,text/*';
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const txt = await f.text();
      ed.name = f.name;
      editorSetText(ed, txt);
      if (ed.cm) ed.cm.setOption('mode', editorFileExt(ed.name) === 'txt' ? 'atmacro' : 'text/plain');
      markEditorDirty(ed, false);
    } catch (e) { reportError('Editor', e); }
  });
  inp.click();
}

function saveEditorFile(ed) {
  downloadFile(ed.name, editorText(ed), 'text/plain');
  markEditorDirty(ed, false);
}

// Run the buffer as an AT macro on the focused terminal (same engine as the Macros wizard:
// ${vars} prompt, ?URC waits, @loop, @NNN delays).
function runEditorAsMacro(ed) {
  if (!UI.focused) { reportError('Editor', new Error(t('log_notconn'))); return Promise.resolve(); }
  const txt = editorText(ed).trim();
  return txt ? runMacro(txt) : Promise.resolve();   // returns the promise so callers can await the run
}

/* ---- editor search primitives, driven by the SHARED search bar (app.js). One box searches
   whichever pane is focused; for an editor these highlight CodeMirror matches (searchcursor
   addon), the current one with a stronger mark. Text-mode fallback (jsdom): a no-op highlight
   but the count/nav still work off substring positions so the harness can drive it. ---- */
function clearEditorMarks(ed) {
  (ed.searchMarks || []).forEach((m) => { try { m.clear(); } catch (_) {} });
  ed.searchMarks = [];
  if (ed.curMark) { try { ed.curMark.clear(); } catch (_) {} ed.curMark = null; }
}
// Highlight every match of q (case-insensitive); returns the hit count. Stores hits on `ed`.
function editorSearchApply(ed, q) {
  clearEditorMarks(ed);
  ed.searchHits = []; ed.searchIdx = -1; ed.searchQ = q || null;
  if (!q) return 0;
  if (ed.cm) {
    const cur = ed.cm.getSearchCursor(q, CodeMirror.Pos(0, 0), { caseFold: true });
    while (cur.findNext()) {
      ed.searchHits.push({ from: cur.from(), to: cur.to() });
      ed.searchMarks.push(ed.cm.markText(cur.from(), cur.to(), { className: 'cm-searching' }));
      if (ed.searchHits.length > 5000) break;   // guard: absurdly large files
    }
  } else {   // textarea fallback: count substring positions (no visual mark)
    const hay = editorText(ed).toLowerCase(), needle = q.toLowerCase();
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) { ed.searchHits.push({ i, len: q.length }); if (ed.searchHits.length > 5000) break; }
  }
  return ed.searchHits.length;
}
// Move to the next/previous match, mark it current, scroll into view; updates countEl "n/total".
function editorSearchNav(ed, dir, countEl) {
  const hits = ed.searchHits || [];
  if (!hits.length) { if (countEl) countEl.textContent = '0'; return; }
  ed.searchIdx = ed.searchIdx < 0 ? (dir > 0 ? 0 : hits.length - 1) : (ed.searchIdx + dir + hits.length) % hits.length;
  const h = hits[ed.searchIdx];
  if (ed.cm) {
    if (ed.curMark) { try { ed.curMark.clear(); } catch (_) {} }
    ed.curMark = ed.cm.markText(h.from, h.to, { className: 'cm-searching-cur' });
    ed.cm.setSelection(h.from, h.to);
    ed.cm.scrollIntoView({ from: h.from, to: h.to }, 60);
  } else if (ed.ta) { ed.ta.focus(); ed.ta.setSelectionRange(h.i, h.i + h.len); }
  if (countEl) countEl.textContent = (ed.searchIdx + 1) + '/' + hits.length;
}
function editorSearchClear(ed) { clearEditorMarks(ed); ed.searchQ = null; ed.searchHits = []; ed.searchIdx = -1; }
// Re-run the active search (e.g. after an edit) and keep the shared counter in sync if we're the target.
function editorSearchRefresh(ed) {
  if (!ed.searchQ) return;
  const n = editorSearchApply(ed, ed.searchQ);
  if (App.searchTarget && App.searchTarget.kind === 'editor' && App.searchTarget.ed === ed && !$('searchbar').hidden) $('q-count').textContent = String(n);
}
// Open the shared search bar targeting this editor (prefills with the current selection).
function openSharedSearchForEditor(ed) {
  setSearchTarget({ kind: 'editor', ed });
  const sel = ed.cm && ed.cm.getSelection();
  if (sel && !sel.includes('\n')) ed.searchQ = sel;
  qOpen();
  if (ed.searchQ) { $('log-q').value = ed.searchQ; qApply(); }
}
function toggleSharedSearchForEditor(ed) {
  if (!$('searchbar').hidden && App.searchTarget && App.searchTarget.kind === 'editor' && App.searchTarget.ed === ed) qClose();
  else openSharedSearchForEditor(ed);
}

if ($('new-file')) $('new-file').addEventListener('click', () => addEditor());
