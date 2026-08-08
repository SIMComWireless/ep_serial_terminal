/* live.js — "live" telemetry registry for the instrument strip: `Live` maps a response/URC
   prefix to the handler that updates the header cells (Session.onLine dispatches by prefix).
   This file holds only the registry, the shared parsing helpers and the signal-history hook;
   the actual prefixes are registered per vendor:
     simcom/live-simcom.js       3GPP/SIMCom (+CSQ, +CPSI, +CREG, +CGDCONT…)
     espressif/live-espressif.js Wi-Fi (+CWJAP, +CWSTATE, WIFI *…)
   (part of the AT console · classic script, shared global scope — concatenated in order) */

// prefix → (line, ui, prefix) => void ; vendors fill it in with Object.assign(Live, {…})
const Live = {};

// Splits the fields of a "+PREF: a,b,c" response (shared by the vendor parsers).
function liveSplitFields(line, prefix) {
  let s = line.startsWith(prefix) ? line.slice(prefix.length).replace(/^:\s*/, '') : line;
  return s.split(',').map(x => x.trim());
}
// CREG / CGREG / CEREG share the format (shared by the vendor parsers).
function liveRegParser(line, ui, prefix) {
  const f = liveSplitFields(line, prefix);
  // a query carries <n>,<stat> (e.g. +CEREG: 2,1,...) → stat = f[1]; a URC carries <stat> directly
  const stat = Number(f.length >= 2 && f[0].length <= 1 && Number(f[0]) <= 4 ? f[1] : f[0]);
  const which = prefix === '+CREG' ? 'creg' : prefix === '+CGREG' ? 'cgreg' : 'cereg';
  ui.setReg(which, stat);
}

// Signal sample for the "Signal monitor" wizard: appends {t, rssi, rsrp, sinr, rsrq} to the
// session history (merges when it arrives along another metric, e.g. CSQ + CPSI of the same refresh) and notifies the
// wizard if it is open (global hook sigMonOnSample, defined in wizards-radio.js).
function sigPush(sess, patch) {
  const h = sess.sigHist || (sess.sigHist = []);
  const now = Date.now();
  const last = h[h.length - 1];
  // 400 ms: groups the metrics of one round (CSQ→CPSI) without eating samples from fast
  // polling (the wizard poll has a 500 ms floor, so each round becomes its own point)
  if (last && now - last.t < 400) Object.assign(last, patch);
  else h.push({ t: now, ...patch });
  if (h.length > 900) h.splice(0, h.length - 900);   // ~30 min polling every 2 s
  if (typeof sigMonOnSample === 'function') { try { sigMonOnSample(sess); } catch (_) {} }
}
