/* init.js — theme, language, resizable panels and init (runs last)
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* ---- theme (light / dark) ---- */
function setTheme(name) {
  $('theme-css').href = `app/css/theme-${name}.css`;
  document.documentElement.setAttribute('data-theme', name);
  document.querySelectorAll('#theme-toggle button').forEach((b) => b.classList.toggle('on', b.dataset.theme === name));
  if (typeof syncBrand === 'function') syncBrand();   // the Espressif logo depends on the theme (light/dark)
  try { localStorage.setItem('atc_theme', name); } catch (_) {}
}
document.querySelectorAll('#theme-toggle button').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.theme)));
let savedTheme = null; try { savedTheme = localStorage.getItem('atc_theme'); } catch (_) {}
setTheme(savedTheme || 'dark');   // dark default

/* ---- idioma ---- */
$('lang').addEventListener('change', () => {
  lang = $('lang').value; saveLang(lang);
  closeWizardPanel();
  applyI18n(); buildSidebar(); refreshDynamic();
});

/* ---- resizable panels (mouse drag) ---- */
function setupResizers() {
  const main = document.querySelector('main');
  const aside = $('sidebar');
  const wiz = $('wiz-panel');
  const gSide = $('gutter-side');
  const gWiz = $('gutter-wiz');
  const isColumn = () => getComputedStyle(main).flexDirection === 'column';
  const maximized = () => main.classList.contains('wiz-max');

  function startDrag(e, gutter, onMove) {
    e.preventDefault();
    gutter.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = getComputedStyle(gutter).cursor;
    const move = (ev) => onMove(ev);
    const up = () => {
      gutter.classList.remove('dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // sidebar | wizard  → sidebar width (desktop and maximized; the grid's "auto" track follows the width)
  gSide.addEventListener('pointerdown', (e) => {
    if (isColumn()) return;
    const x0 = e.clientX, w0 = aside.offsetWidth;
    startDrag(e, gSide, (ev) => {
      const w = Math.max(150, Math.min(440, w0 + (ev.clientX - x0)));
      aside.style.width = w + 'px';
    });
  });

  // wizard | console  → width (desktop), height (stacked), or height via grid rows (maximized)
  gWiz.addEventListener('pointerdown', (e) => {
    if (maximized()) {
      const y0 = e.clientY, h0 = wiz.offsetHeight;
      startDrag(e, gWiz, (ev) => {
        const topH = Math.max(120, Math.min(main.offsetHeight - 160, h0 + (ev.clientY - y0)));
        main.style.gridTemplateRows = `${topH}px 11px minmax(0, 1fr)`;
      });
      return;
    }
    if (isColumn()) {
      const y0 = e.clientY, h0 = wiz.offsetHeight;
      startDrag(e, gWiz, (ev) => {
        const h = Math.max(120, Math.min(window.innerHeight - 220, h0 + (ev.clientY - y0)));
        wiz.style.flexBasis = h + 'px'; wiz.style.maxHeight = 'none';
      });
    } else {
      const x0 = e.clientX, w0 = wiz.offsetWidth;
      const maxW = main.offsetWidth - aside.offsetWidth - 280;
      startDrag(e, gWiz, (ev) => {
        const w = Math.max(300, Math.min(maxW, w0 + (ev.clientX - x0)));
        wiz.style.flexBasis = w + 'px'; wiz.style.maxWidth = 'none';
      });
    }
  });

  // double-click on a divider → resets that panel to its default size
  gSide.addEventListener('dblclick', () => { aside.style.width = ''; });
  gWiz.addEventListener('dblclick', () => {
    if (maximized()) main.style.gridTemplateRows = '';
    else { wiz.style.flexBasis = ''; wiz.style.maxWidth = ''; wiz.style.maxHeight = ''; }
  });

  // when crossing the breakpoint, clear inline sizes so each orientation goes back to its default
  const mq = window.matchMedia('(max-width: 720px)');
  const reset = () => { aside.style.width = ''; wiz.style.flexBasis = ''; wiz.style.maxWidth = ''; wiz.style.maxHeight = ''; main.style.gridTemplateRows = ''; };
  if (mq.addEventListener) mq.addEventListener('change', reset); else mq.addListener(reset);
}

/* ---- init ---- */
lang = loadLang() || 'en'; if (!I18N[lang]) lang = 'en';   // English default
populateLangSelect();
$('lang').value = lang;
applyI18n();
buildSidebar();
refreshDynamic();
setupResizers();
// version + build stamp in the ⚙ popover: "v1.0.0 · build 2026-07-12 15:04" (standalone) or "v1.0.0 · dev"
if ($('setpop-ver')) $('setpop-ver').textContent = 'AT Console v' + APP_BUILD.version + (APP_BUILD.stamp ? ' · build ' + APP_BUILD.stamp : ' · dev');

/* ---- soporte ---- */
if (!('serial' in navigator)) {
  $('unsupported').classList.add('show');
  $('connect').disabled = true;
  $('u-virtual').addEventListener('click', () => { $('unsupported').classList.remove('show'); $('virtual').click(); });
}
