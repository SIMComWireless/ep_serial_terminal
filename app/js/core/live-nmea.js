/* live-nmea.js — telemetry of the header strip fed by the NMEA stream, chip-independent.
   The Live registry (live.js) dispatches by "+PREFIX:" and cannot match an NMEA sentence, which
   is comma-separated: Session.onLine calls liveNmea() directly when the line is NMEA.
   Everything here comes from the standard, the same way live-simcom.js covers 3GPP and
   live-espressif.js covers Wi-Fi — a receiver of any chip fills the same cells.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

// C/N0 (dB-Hz) of the satellites in use → 0..5 bars, the same scale the wizard's bars use.
function nmeaBars(cn0) {
  if (cn0 == null) return 0;
  if (cn0 >= 45) return 5;
  if (cn0 >= 40) return 4;
  if (cn0 >= 33) return 3;
  if (cn0 >= 27) return 2;
  return cn0 > 0 ? 1 : 0;
}

/* Feeds one received sentence into the session's accumulator and refreshes the header.
   Returns true when the line was NMEA (so the caller can skip the AT prefix dispatch). */
function liveNmea(line, sess) {
  if (!isNmea(line)) return false;
  const st = sess.nmea || (sess.nmea = new NmeaState());
  const r = st.feed(line);
  if (!r || !r.data) return true;                 // framed but not a sentence we interpret
  const f = st.fix;
  const fix = st.hasFix();

  sess.set('g-fix', fix ? (f.mode === '3' ? '3D' : '2D') : t('gn_nofix'), fix);
  const inView = Object.keys(st.sats).length;
  sess.set('g-gsats', inView ? `${f.sats || 0}/${inView}` : (f.sats ? String(f.sats) : '—'), (f.sats || 0) >= 4);
  sess.set('g-lat', f.lat != null ? f.lat.toFixed(6) : '—');
  sess.set('g-lon', f.lon != null ? f.lon.toFixed(6) : '—');
  sess.set('g-galt', f.alt != null ? f.alt.toFixed(1) + ' m' : '—');
  sess.set('g-gspd', f.speed != null ? f.speed.toFixed(1) + ' kn' : '—');
  sess.set('g-hdop', f.hdop != null ? f.hdop.toFixed(1) : '—');
  sess.set('g-gutc', f.utc || '—');

  // Signal = average C/N0 of the satellites actually in use (0 dB ones are not tracked).
  const used = Object.values(st.sats).filter((sv) => sv.used && sv.snr > 0);
  const cn0 = used.length ? Math.round(used.reduce((a, sv) => a + sv.snr, 0) / used.length) : null;
  sess.set('g-cn0', cn0 != null ? cn0 + ' dB' : '—', cn0 != null && cn0 >= 33);
  sess.signal(cn0 != null ? { bars: nmeaBars(cn0), dbm: cn0 } : null);
  return true;
}
