/* icons.js — SVG icon set for the sidebar menu (one per option/category).
   Monochrome: they use stroke/fill=currentColor, so they inherit the item color (ink/amber).
   (part of the AT console · classic script, shared global scope — concatenated in order) */

const SIDEBAR_ICONS = (() => {
  const svg = (inner, vb, sw) =>
    `<svg viewBox="${vb || '0 0 16 16'}" fill="none" stroke="currentColor" stroke-width="${sw || 1.4}" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const wifi = svg('<path d="M2.5 6 A8 8 0 0 1 13.5 6"/><path d="M4.8 8.4 A5 5 0 0 1 11.2 8.4"/><path d="M6.8 10.6 A2.3 2.3 0 0 1 9.2 10.6"/><circle cx="8" cy="12.3" r="0.7" fill="currentColor" stroke="none"/>');
  const globe = svg('<circle cx="8" cy="8" r="6"/><path d="M2 8 h12"/><path d="M8 2 a9 9 0 0 1 0 12 a9 9 0 0 1 0 -12"/>');
  return {
    // ---- main options (top level) ----
    macros: svg('<path d="M9 1.5 L3.5 9 H7.5 L6.5 14.5 L12.5 7 H8.5 Z"/>'),
    ble: svg('<path d="M4.7 5.3 L11.3 10.7 L8 13.3 V2.7 L11.3 5.3 L4.7 10.7"/>'),   // logo Bluetooth
    fs: svg('<path d="M2 5 V12 a1 1 0 0 0 1 1 h10 a1 1 0 0 0 1 -1 V6 a1 1 0 0 0 -1 -1 H8 L6.5 3.5 H3 A1 1 0 0 0 2 4.5 Z"/>'),   // folder (same as FTP, without the arrow)
    time: svg('<circle cx="8" cy="8" r="6"/><path d="M8 4.5 V8 L10.4 9.4"/>'),
    hw: svg('<rect x="4.5" y="4.5" width="7" height="7" rx="1"/><path d="M6.5 2.5 V4.5 M9.5 2.5 V4.5 M6.5 11.5 V13.5 M9.5 11.5 V13.5 M2.5 6.5 H4.5 M2.5 9.5 H4.5 M11.5 6.5 H13.5 M11.5 9.5 H13.5"/>'),
    jam: svg('<rect x="5" y="7.5" width="6" height="6.5" rx="0.6"/><path d="M6.3 7.5 V2.8 M8 7.5 V2.8 M9.7 7.5 V2.8"/>'),   // jammer: body + 3 antennas
    sig: svg('<path d="M1.5 9.5 L4.5 9.5 L6 4.5 L8.5 12 L10.5 7 L11.5 9.5 L14.5 9.5"/>'),   // pulse/sparkline (signal monitor)
    // ---- categories ----
    cat_cellular: svg('<rect x="4.5" y="2" width="7" height="12" rx="1.5"/><path d="M7 12.3 h2"/>'),
    cat_protocols: svg('<path d="M6.6 9.4 L9.4 6.6"/><path d="M6 7 L5 8 a2.1 2.1 0 0 0 3 3 l1 -1"/><path d="M10 9 L11 8 a2.1 2.1 0 0 0 -3 -3 l-1 1"/>'),   // link/chain
    cat_security: svg('<path d="M8 2 L13 4 V8 C13 11 10.5 13 8 14 C5.5 13 3 11 3 8 V4 Z"/>'),   // shield
    cat_wifi: wifi,
    cat_location: globe,
    // ---- sub-options ----
    sim: svg('<path d="M3 1.5 h10.5 L20.5 8.5 V22.5 a2 2 0 0 1 -2 2 H3 a2 2 0 0 1 -2 -2 V3.5 a2 2 0 0 1 2 -2 z"/><rect x="6" y="12" width="10" height="9" rx="1.5"/><path d="M11 12 V21 M6 15.5 H16 M6 18 H16"/>', '0 0 22 26', 1.7),   // same SIM symbol as the header
    basics: svg('<path d="M2.5 13.5 V11 M6 13.5 V8.5 M9.5 13.5 V6 M13 13.5 V3"/>', '0 0 16 16', 1.7),   // cellular signal bars
    sms: svg('<path d="M3 3.5 h10 a1.5 1.5 0 0 1 1.5 1.5 v4 a1.5 1.5 0 0 1 -1.5 1.5 H7 l-3 2.3 V11 H3 a1.5 1.5 0 0 1 -1.5 -1.5 V5 A1.5 1.5 0 0 1 3 3.5 Z"/>'),
    voice: svg('<path d="M4.5 2.5 h2.3 l1 2.5 -1.4 1 a7 7 0 0 0 3.6 3.6 l1 -1.4 2.5 1 v2.3 a1 1 0 0 1 -1.1 1 A10 10 0 0 1 3.5 3.6 a1 1 0 0 1 1 -1.1 Z"/>'),
    pb: svg('<path d="M4 2.5 h8 v11 h-8 Z"/><path d="M4 5.5 H2.5 M4 8 H2.5 M4 10.5 H2.5"/><circle cx="8" cy="6.4" r="1.5"/><path d="M5.6 10.8 a2.5 2.5 0 0 1 4.8 0"/>'),
    ping: svg('<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2.5"/><circle cx="8" cy="8" r="0.6" fill="currentColor" stroke="none"/>'),
    tcpudp: svg('<path d="M3 6 H12 M9.5 3.5 L12 6 L9.5 8.5"/><path d="M13 10 H4 M6.5 7.5 L4 10 L6.5 12.5"/>'),
    http: globe,
    mail: svg('<rect x="2" y="4" width="12" height="8" rx="1.2"/><path d="M2.5 5 L8 9 L13.5 5"/>'),
    ftp: svg('<path d="M2 5 V12 a1 1 0 0 0 1 1 h10 a1 1 0 0 0 1 -1 V6 a1 1 0 0 0 -1 -1 H8 L6.5 3.5 H3 A1 1 0 0 0 2 4.5 Z"/><path d="M8 11.5 V7.5 M6.5 9 L8 7.5 9.5 9"/>'),
    mqtt: svg('<circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/><path d="M5.5 5.5 a3.5 3.5 0 0 0 0 5 M10.5 5.5 a3.5 3.5 0 0 1 0 5 M3.5 3.5 a6.5 6.5 0 0 0 0 9 M12.5 3.5 a6.5 6.5 0 0 1 0 9"/>'),
    lwm2m: svg('<path d="M8 2 L14 5 L8 8 L2 5 Z"/><path d="M2 8 L8 11 L14 8"/><path d="M2 11 L8 14 L14 11"/>'),
    coap: svg('<path d="M8 2 L13.5 5 V11 L8 14 L2.5 11 V5 Z"/><path d="M2.5 5 L8 8 L13.5 5 M8 8 V14"/>'),
    tls: svg('<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7 V5 a2.5 2.5 0 0 1 5 0 V7"/><path d="M8 9.6 V11.5"/>'),   // padlock (SSL)
    wifi: wifi,
    lbs: svg('<path d="M8 14 C5 10 3 8 3 5.5 a5 5 0 0 1 10 0 C13 8 11 10 8 14 Z"/><circle cx="8" cy="5.5" r="1.8"/>'),   // map pin
    gnss: svg(   // satellite: 2 diagonal solar panels + body + signal waves (SW)
      '<path d="M3.35 1.65 L5.85 4.15 L4.15 5.85 L1.65 3.35 Z"/>' +      // NW panel
      '<path d="M4.18 2.48 L2.48 4.18"/><path d="M5.02 3.32 L3.32 5.02"/>' +   // NW panel grid
      '<path d="M5 5 L6.9 6.9"/>' +                                     // NW arm
      '<path d="M11.85 10.15 L14.35 12.65 L12.65 14.35 L10.15 11.85 Z"/>' +   // SE panel
      '<path d="M12.68 10.98 L10.98 12.68"/><path d="M13.52 11.82 L11.82 13.52"/>' +   // SE panel grid
      '<path d="M11 11 L9.1 9.1"/>' +                                   // SE arm
      '<rect x="6.4" y="6.4" width="3.2" height="3.2" transform="rotate(45 8 8)" fill="currentColor" stroke="none"/>' +   // body
      '<path d="M4.3 9 A2.7 2.7 0 0 0 7 11.7"/><path d="M5.4 9 A1.6 1.6 0 0 0 7 10.6"/>' +   // signal waves
      '<circle cx="6.5" cy="9.5" r="0.5" fill="currentColor" stroke="none"/>'),
  };
})();
