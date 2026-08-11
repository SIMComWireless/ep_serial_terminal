/* instruments.js — the header strip, built from a REGISTRY instead of being written in the HTML.
   A module shows the instruments of its technology, not of its brand: a cellular module shows
   SIM/registration/RSRP (3GPP), a Wi-Fi one shows SSID/channel/MAC, a GNSS receiver shows
   fix/satellites/HDOP (NMEA). None of that is proprietary, so the three standard sets live here
   next to the registry — the same way at-parser.js carries the base 3GPP URCs and nmea.js the
   standard sentences.

   Each profile says which set it wants with `instruments` (see the Profile contract). A vendor
   with a genuinely proprietary readout registers its own set from its folder:
     registerInstruments('my-set', [ { id: 'g-foo', label: 'FOO' }, … ])
   and points its profiles at it. Adding a module family no longer means editing the HTML.

   The ids are the contract with the rest of the app: Live parsers call ui.set('g-csq', …) and
   drawSet()/drawSignal()/drawReg() paint them. Rebuilding the strip does not change them.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

const INSTRUMENTS = {};
/** @param {string} id @param {InstCell[]} cells */
function registerInstruments(id, cells) { INSTRUMENTS[id] = cells; }

/* Every value id of every registered set: what refreshStrip() has to repaint when the focus
   changes (a cell that is not in the current set simply does not exist and is skipped). */
function instCellIds() {
  const ids = [];
  for (const cells of Object.values(INSTRUMENTS)) {
    for (const c of cells) {
      if (c.kind === 'signal') { (c.minis || []).forEach((m) => ids.push(m.id)); continue; }
      if (c.kind === 'reg') continue;                       // LEDs are painted by drawReg()
      if (c.id) ids.push(c.id);
    }
  }
  return [...new Set(ids)];
}

const INST_SIM_SVG =
  '<svg class="sim-ico" viewBox="0 0 22 26" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M3 1.5 h10.5 L20.5 8.5 V22.5 a2 2 0 0 1 -2 2 H3 a2 2 0 0 1 -2 -2 V3.5 a2 2 0 0 1 2 -2 z" stroke="currentColor" stroke-width="1.6"/>' +
  '<rect x="6" y="12" width="10" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>' +
  '<path d="M11 12 V21 M6 15.5 H16 M6 18 H16" stroke="currentColor" stroke-width="1"/></svg>';

/* Renders the strip of a set into #hdr-inst. Returns false if the set is unknown. */
function buildInstStrip(setId) {
  const host = $('hdr-inst');
  if (!host) return false;
  const cells = INSTRUMENTS[setId];
  host.innerHTML = '';
  host.dataset.set = setId || '';
  if (!cells) return false;

  const key = (c) => (c.labelKey ? t(c.labelKey) : (c.label || ''));
  const mkKey = (c) => { const s = document.createElement('span'); s.className = 'dk'; s.textContent = key(c); if (c.labelKey) s.dataset.i18n = c.labelKey; return s; };
  const mkVal = (id, dim) => { const s = document.createElement('span'); s.className = 'dv' + (dim ? ' dim' : ''); s.id = id; s.textContent = '—'; return s; };

  for (const c of cells) {
    if (c.kind === 'signal') {
      const wrap = document.createElement('div'); wrap.className = 'sig-cell';
      const row = document.createElement('div'); row.className = 'sig-row';
      const bars = document.createElement('span'); bars.className = 'bars'; bars.id = 'g-bars';
      for (let i = 0; i < 5; i++) bars.appendChild(document.createElement('i'));
      row.appendChild(bars);
      (c.minis || []).forEach((m) => {
        const d = document.createElement('div'); d.className = 'dcell mini';
        d.append(mkKey(m), mkVal(m.id));
        row.appendChild(d);
      });
      wrap.append(mkKey(c), row);
      host.appendChild(wrap);
      continue;
    }
    const d = document.createElement('div');
    d.className = 'dcell' + (c.kind === 'sim' ? ' sim-cell' : '') + (c.kind === 'reg' ? ' reg-cell' : '');
    d.appendChild(mkKey(c));
    if (c.kind === 'sim') { d.insertAdjacentHTML('beforeend', INST_SIM_SVG); d.appendChild(mkVal(c.id)); }
    else if (c.kind === 'reg') {
      const leds = document.createElement('span'); leds.className = 'leds';
      (c.leds || []).forEach(([id, name]) => {
        const w = document.createElement('span'); w.className = 'ledwrap';
        const i = document.createElement('i'); i.className = 'led'; i.id = id;
        const b = document.createElement('b'); b.textContent = name;
        w.append(i, b); leds.appendChild(w);
      });
      d.appendChild(leds);
    } else d.appendChild(mkVal(c.id, c.dim));
    host.appendChild(d);
  }
  // ↻ always closes the strip: it re-queries the module. Whether it is useful depends on the
  // focused profile, which this function must not read (it also runs at load time, before the
  // UI facade exists) — updateInstVisibility() shows or hides it.
  const b = document.createElement('button');
  b.className = 'iconbtn'; b.id = 'dash-refresh'; b.title = t('dash_refresh');
  b.textContent = '↻';
  b.addEventListener('click', () => refreshDashboard());
  host.appendChild(b);
  return true;
}

/* ---- standard sets ---- */

// 3GPP cellular: SIM, registration per domain, signal quality, network and PDP context.
registerInstruments('cellular', [
  { kind: 'sim', id: 'g-sim', labelKey: 'g_sim' },
  { kind: 'reg', labelKey: 'g_reg', leds: [['led-creg', 'CREG'], ['led-cgreg', 'CGREG'], ['led-cereg', 'CEREG']] },
  { kind: 'signal', labelKey: 'g_signal', minis: [
    { id: 'g-csq', label: 'CSQ' }, { id: 'g-rssi', label: 'RSSI' },
    { id: 'g-rssnr', label: 'RS-SNR' }, { id: 'g-rsrp', label: 'RSRP' },
  ] },
  { id: 'g-mode', labelKey: 'g_mode' },
  { id: 'g-band', labelKey: 'g_band' },
  { id: 'g-oper', labelKey: 'g_oper', dim: true },
  { id: 'g-apn', label: 'APN' },
  { id: 'g-iptype', labelKey: 'g_iptype' },
  { id: 'g-ip', label: 'IP' },
]);

// Wi-Fi station: mode, association state and the addressing of the link.
registerInstruments('wifi', [
  { id: 'g-wmode', labelKey: 'g_wmode' },
  { id: 'g-wstate', labelKey: 'g_wstate' },
  { id: 'g-ssid', label: 'SSID' },
  { kind: 'signal', labelKey: 'g_signal', minis: [{ id: 'g-rssi', label: 'RSSI' }, { id: 'g-chan', label: 'CH' }] },
  { id: 'g-ip', label: 'IP' },
  { id: 'g-gw', labelKey: 'g_gw' },
  { id: 'g-mac', label: 'MAC' },
]);

// GNSS receiver: quality of the solution and the position itself (fed by live-nmea.js).
registerInstruments('gnss', [
  { id: 'g-fix', labelKey: 'gn_fix' },
  { id: 'g-gsats', labelKey: 'gn_sats' },
  { kind: 'signal', labelKey: 'g_signal', minis: [{ id: 'g-cn0', label: 'C/N0' }] },
  { id: 'g-lat', label: 'Lat' },
  { id: 'g-lon', label: 'Lon' },
  { id: 'g-galt', labelKey: 'gn_alt' },
  { id: 'g-gspd', labelKey: 'gn_speed' },
  { id: 'g-hdop', label: 'HDOP' },
  { id: 'g-gutc', label: 'UTC' },
]);

/* Built once at load time so the cells exist from the first paint, exactly like when they were
   written in the HTML; updateInstVisibility() swaps the set as soon as a terminal is focused.
   The labels carry data-i18n, so the language applier translates them like any other text. */
buildInstStrip('cellular');
