/* nmea.js — NMEA 0183 parsing, INDEPENDENT of any chip vendor.
   Everything here comes from the public standard (NMEA 0183 v4.x talker sentences), the same
   way at-parser.js only knows 3GPP/V.250: sentence framing + checksum, the standard sentences
   a GNSS receiver outputs (GGA, RMC, GSA, GSV, VTG, GLL, ZDA, TXT) and an accumulator that
   merges them into one position fix plus a satellite table.
   Proprietary sentences ($PAIR…, $PCAS…, $PMTK…) are NOT parsed here: each chip vendor brings
   its own parser and registers it with registerNmeaProprietary() — see app/js/airoha/ and
   app/js/icoe/. No transport and no DOM.
   Written for this project (no runtime dependency): the sentence coverage follows what the
   nmea-simple / nmea0183 libraries expose, but as a classic script that works from file://.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* ---- framing ---- */

// XOR of every character between '$' (exclusive) and '*' (exclusive) — the NMEA checksum.
function nmeaChecksum(body) {
  let c = 0;
  for (let i = 0; i < body.length; i++) c ^= body.charCodeAt(i);
  return c.toString(16).toUpperCase().padStart(2, '0');
}
// Completes a sentence for sending: 'PAIR002' / '$PAIR002' → '$PAIR002*38'.
// Already-checksummed input is returned untouched, so a user can paste a full sentence.
function nmeaFrame(sentence) {
  const s = String(sentence).trim();
  if (!s) return s;
  const body = s.replace(/^[$!]/, '').split('*')[0];
  return '$' + body + '*' + nmeaChecksum(body);
}
// Is this line an NMEA sentence? ('$' or '!' + 5..N chars, optional *CS). Deliberately
// permissive on the checksum: a receiver with a wrong checksum still has to be readable.
function isNmea(line) { return /^[$!][A-Za-z0-9]{4,}[,*]/.test(line) || /^[$!][A-Za-z0-9]{5,}$/.test(line); }

/* Splits a sentence into its parts without interpreting them.
   → { talker, type, tag, fields, cs, csOk, proprietary } or null if it is not NMEA. */
function nmeaSplit(line) {
  const s = String(line).trim();
  if (!isNmea(s)) return null;
  const star = s.lastIndexOf('*');
  const body = (star > 0 ? s.slice(1, star) : s.slice(1)).replace(/[\r\n]+$/, '');
  const cs = star > 0 ? s.slice(star + 1).trim().toUpperCase() : null;
  const fields = body.split(',');
  const tag = (fields[0] || '').toUpperCase();
  const proprietary = tag[0] === 'P';
  return {
    tag, fields, cs,
    csOk: cs == null ? null : cs === nmeaChecksum(body),
    proprietary,
    talker: proprietary ? tag.slice(1, 5) : tag.slice(0, 2),
    type: proprietary ? tag.slice(1) : tag.slice(2),
  };
}

/* ---- field helpers ---- */
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const int = (v) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
// ddmm.mmmm + hemisphere → signed decimal degrees.
function nmeaCoord(value, hemi) {
  const v = parseFloat(value);
  if (isNaN(v) || !value) return null;
  const deg = Math.floor(Math.abs(v) / 100), min = Math.abs(v) - deg * 100;
  const d = deg + min / 60;
  return /^[SW]$/i.test(hemi || '') ? -d : d;
}
// hhmmss.sss → 'hh:mm:ss'
function nmeaTime(v) {
  const m = String(v || '').match(/^(\d{2})(\d{2})(\d{2})/);
  return m ? `${m[1]}:${m[2]}:${m[3]}` : '';
}
// ddmmyy → 'dd/mm/20yy'
function nmeaDate(v) {
  const m = String(v || '').match(/^(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}/${m[2]}/20${m[3]}` : '';
}

// Talker ID → constellation, for the satellite table and the sky view.
const NMEA_TALKER = { GP: 'GPS', GL: 'GLO', GA: 'GAL', GB: 'BDS', BD: 'BDS', GQ: 'QZSS', GI: 'NAVIC', GN: 'GNSS' };
// GGA quality indicator → readable label.
const NMEA_QUALITY = { 0: 'no fix', 1: 'GPS', 2: 'DGPS', 3: 'PPS', 4: 'RTK fix', 5: 'RTK float', 6: 'estimated', 7: 'manual', 8: 'simulation' };

/* ---- standard sentences ----
   Each parser gets the split sentence and returns a plain object with its fields.
   Angles in degrees, speeds in knots (sog) and km/h (sogKmh), altitude in metres. */
const NMEA_SENTENCES = {
  // Global positioning system fix data.
  GGA(p) {
    const f = p.fields;
    return { utc: nmeaTime(f[1]), lat: nmeaCoord(f[2], f[3]), lon: nmeaCoord(f[4], f[5]),
      quality: int(f[6]), qualityText: NMEA_QUALITY[int(f[6])] || null, sats: int(f[7]),
      hdop: num(f[8]), alt: num(f[9]), geoid: num(f[11]), dgpsAge: num(f[13]), dgpsId: f[14] || null };
  },
  // Recommended minimum specific GNSS data.
  RMC(p) {
    const f = p.fields;
    return { utc: nmeaTime(f[1]), valid: (f[2] || '').toUpperCase() === 'A',
      lat: nmeaCoord(f[3], f[4]), lon: nmeaCoord(f[5], f[6]),
      speed: num(f[7]), course: num(f[8]), date: nmeaDate(f[9]),
      magVar: num(f[10]), posMode: f[12] || null, navStatus: f[13] || null };
  },
  // GNSS DOP and active satellites.
  GSA(p) {
    const f = p.fields;
    const prns = f.slice(3, 15).filter((x) => x !== '' && x != null);
    return { selection: f[1] || null, mode: f[2] || null, prns,
      pdop: num(f[15]), hdop: num(f[16]), vdop: num(f[17]), systemId: int(f[18]) };
  },
  // Satellites in view (repeated: msgNum of numMsg, up to 4 satellites each).
  GSV(p) {
    const f = p.fields;
    const svs = [];
    for (let i = 4; i + 3 < f.length + 1 && i + 3 <= f.length; i += 4) {
      const prn = (f[i] || '').trim();
      if (!prn) continue;
      svs.push({ prn, elevation: int(f[i + 1]), azimuth: int(f[i + 2]), snr: int(f[i + 3]) });
    }
    return { numMsg: int(f[1]), msgNum: int(f[2]), inView: int(f[3]), svs, signalId: int(f[f.length - 1]) };
  },
  // Course over ground and ground speed.
  VTG(p) {
    const f = p.fields;
    return { courseTrue: num(f[1]), courseMag: num(f[3]), speed: num(f[5]), speedKmh: num(f[7]), posMode: f[9] || null };
  },
  // Geographic position — latitude/longitude.
  GLL(p) {
    const f = p.fields;
    return { lat: nmeaCoord(f[1], f[2]), lon: nmeaCoord(f[3], f[4]), utc: nmeaTime(f[5]),
      valid: (f[6] || '').toUpperCase() === 'A', posMode: f[7] || null };
  },
  // Time and date.
  ZDA(p) {
    const f = p.fields;
    return { utc: nmeaTime(f[1]), day: int(f[2]), month: int(f[3]), year: int(f[4]),
      tzHour: int(f[5]), tzMinute: int(f[6]) };
  },
  // Free text / firmware notices.
  TXT(p) {
    const f = p.fields;
    return { numMsg: int(f[1]), msgNum: int(f[2]), severity: int(f[3]), text: f.slice(4).join(',') };
  },
};

/* ---- proprietary sentences (registered by each chip vendor) ----
   registerNmeaProprietary('PAIR', fn) → fn(split) returns the parsed object.
   Matching is by TAG prefix, so 'PAIR' covers $PAIR001, $PAIR002…
   The '$P' convention is not universal: ICOE names its sentences $CFGNAV, $RESET, $CPDTINFO…
   so matching happens on the whole tag and does not depend on the leading P. */
const NMEA_PROPRIETARY = [];
function registerNmeaProprietary(prefix, parse) { NMEA_PROPRIETARY.push({ prefix: prefix.toUpperCase(), parse }); }

// A well-formed standard sentence: <2-letter talker><3-letter type> with a type we know.
function nmeaIsStandard(p) { return !p.proprietary && p.tag.length === 5 && !!NMEA_SENTENCES[p.type]; }

/* Parses one sentence → { talker, type, tag, csOk, data } or null when it is not NMEA.
   `data` is null for a sentence nobody knows how to interpret (still framed and checksummed). */
function parseNmea(line) {
  const p = nmeaSplit(line);
  if (!p) return null;
  let data = null;
  const std = nmeaIsStandard(p);
  if (std) {
    try { data = NMEA_SENTENCES[p.type](p); } catch (_) { data = null; }
  } else {
    const h = NMEA_PROPRIETARY.find((x) => p.tag.startsWith(x.prefix));
    if (h) { try { data = h.parse(p); } catch (_) { data = null; } }
  }
  return { talker: p.talker, type: p.type, tag: p.tag, proprietary: !std, csOk: p.csOk, fields: p.fields, data };
}

/* ---- accumulator: many sentences → one fix + one satellite table ----
   A receiver spreads its state across sentences (position in GGA, speed in RMC/VTG, DOPs in
   GSA, satellites in GSV), so the wizard consumes this instead of individual sentences.
   `fix` uses the same shape as the AT modules' GnssFix, so the GNSS wizard renders both. */
class NmeaState {
  constructor() { this.reset(); }
  reset() {
    /** @type {GnssFix} */
    this.fix = { mode: '0', sats: 0, lat: null, lon: null, alt: null, speed: null, course: null,
      pdop: null, hdop: null, vdop: null, utc: '', date: '', quality: null };
    this.sats = {};             // key 'GPS-12' → { cons, prn, el, az, snr, used }
    this.used = new Set();      // PRNs reported as in use by GSA
    this._gsv = {};             // per-constellation GSV assembly buffer
    this.lastTalker = null;
  }
  /* Feeds one received line. Returns the parsed sentence (or null if it was not NMEA), so the
     caller can also tell whether the line was consumed. */
  feed(line) {
    const r = parseNmea(line);
    if (!r || !r.data) return r;
    const cons = NMEA_TALKER[r.talker] || r.talker;
    const d = r.data;
    this.lastTalker = r.talker;
    switch (r.type) {
      case 'GGA':
        if (d.lat != null) { this.fix.lat = d.lat; this.fix.lon = d.lon; }
        if (d.alt != null) this.fix.alt = d.alt;
        if (d.sats != null) this.fix.sats = d.sats;
        if (d.hdop != null) this.fix.hdop = d.hdop;
        if (d.utc) this.fix.utc = d.utc;
        this.fix.quality = d.quality;
        if (d.quality === 0) this.fix.mode = '0';
        break;
      case 'RMC':
        if (d.valid && d.lat != null) { this.fix.lat = d.lat; this.fix.lon = d.lon; }
        if (d.speed != null) this.fix.speed = d.speed;
        if (d.course != null) this.fix.course = d.course;
        if (d.utc) this.fix.utc = d.utc;
        if (d.date) this.fix.date = d.date;
        if (!d.valid) this.fix.mode = '0';
        break;
      case 'GSA':
        if (d.mode) this.fix.mode = d.mode;                 // 1 = no fix · 2 = 2D · 3 = 3D
        if (d.pdop != null) this.fix.pdop = d.pdop;
        if (d.hdop != null) this.fix.hdop = d.hdop;
        if (d.vdop != null) this.fix.vdop = d.vdop;
        d.prns.forEach((prn) => this.used.add(String(prn)));
        break;
      case 'GSV': {
        // The first message of a burst replaces that constellation's satellites.
        if (d.msgNum === 1) { this._gsv[cons] = []; }
        const acc = (this._gsv[cons] = this._gsv[cons] || []);
        acc.push(...d.svs);
        if (d.msgNum === d.numMsg) {                        // burst complete: publish it
          Object.keys(this.sats).forEach((k) => { if (this.sats[k].cons === cons) delete this.sats[k]; });
          acc.forEach((sv) => {
            this.sats[cons + '-' + sv.prn] = { cons, prn: sv.prn, el: sv.elevation, az: sv.azimuth,
              snr: sv.snr == null ? 0 : sv.snr, used: this.used.has(String(sv.prn)) };
          });
          this._gsv[cons] = [];
        }
        break;
      }
      case 'VTG':
        if (d.speed != null) this.fix.speed = d.speed;
        if (d.courseTrue != null) this.fix.course = d.courseTrue;
        break;
      case 'GLL':
        if (d.valid && d.lat != null) { this.fix.lat = d.lat; this.fix.lon = d.lon; }
        if (d.utc) this.fix.utc = d.utc;
        break;
      case 'ZDA':
        if (d.utc) this.fix.utc = d.utc;
        if (d.year) this.fix.date = `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;
        break;
      default: break;
    }
    return r;
  }
  hasFix() { return this.fix.lat != null && this.fix.mode !== '0' && this.fix.mode !== '1'; }
}

/* Reads a whole log and returns the route [[lat, lon], …] that its NMEA sentences describe,
   deduplicating identical consecutive positions (used by "route from log"). */
function nmeaRoute(lines) {
  const st = new NmeaState(), pts = [];
  for (const line of lines || []) {
    if (!isNmea(line)) continue;
    st.feed(line);
    if (st.fix.lat == null || !st.hasFix()) continue;
    const last = pts[pts.length - 1];
    if (!last || last[0] !== st.fix.lat || last[1] !== st.fix.lon) pts.push([st.fix.lat, st.fix.lon]);
  }
  return pts;
}
