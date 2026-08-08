/* i18n engine: language registry + helpers. Texts live in app/lang/<code>.js */
const I18N = {};
const LANGS = [];
let lang = 'en';
function registerLang(code, name, dict) {
  I18N[code] = dict;
  if (!LANGS.find((l) => l.code === code)) LANGS.push({ code, name });
}
const t = (k) => (I18N[lang] && I18N[lang][k]) || (I18N.en && I18N.en[k]) || k;
function saveLang(l) { try { localStorage.setItem('atc_lang', l); } catch (_) {} }
function loadLang() { try { return localStorage.getItem('atc_lang'); } catch (_) { return null; } }
function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = t(el.getAttribute('data-i18n'));
    if (v.indexOf('<') !== -1) el.innerHTML = v; else el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
  // icon-only buttons keep a translated tooltip (no visible label to translate)
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.getAttribute('data-i18n-title')); });
}
function populateLangSelect() {
  const sel = document.getElementById('lang'); if (!sel) return;
  sel.innerHTML = '';
  LANGS.forEach((l) => { const o = document.createElement('option'); o.value = l.code; o.textContent = l.name; sel.appendChild(o); });
  sel.value = lang;
}
