/* util.js — shared generic helpers: DOM, bytes/encoding, strings and downloads
   (part of the AT console · classic script, shared global scope — loads FIRST) */

/* ---- DOM ---- */
const $ = (id) => document.getElementById(id);

/* ---- bytes / encoding ---- */
const byteLen = (s) => new TextEncoder().encode(s).length;
// Encodes text -> bytes per the output encoding (utf-8 / latin1 / ascii)
function encodeOut(text, enc) {
  if (enc === 'latin1' || enc === 'ascii') {
    const mask = enc === 'ascii' ? 0x7f : 0xff;
    const u = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) u[i] = text.charCodeAt(i) & mask;
    return u;
  }
  return new TextEncoder().encode(text);
}
// Parses a hex string ("41 54 0D" / "0x41,0x54" / "415440d0a") -> bytes
function parseHex(text) {
  const h = text.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
  const n = Math.floor(h.length / 2);
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = parseInt(h.substr(i * 2, 2), 16);
  return u;
}

/* ---- strings ---- */
// Replaces non-printable characters with their "Control Pictures" (␀..␟ and ␡)
function showNP(text) {
  return text.replace(/[\x00-\x1f\x7f]/g, (ch) => { const c = ch.charCodeAt(0); return c === 0x7f ? '␡' : String.fromCharCode(0x2400 + c); });
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (s) => (s || 'term').replace(/[^\w.-]+/g, '_');
// Interprets escape sequences of typed text ("Escapes" mode): \r \n \t \b \f \v \0 \e \xHH \uHHHH \\
const ESC_MAP = { r: '\r', n: '\n', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0', e: '\x1b', '\\': '\\' };
const unescapeInput = (s) => String(s).replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[rntbfv0e\\])/g,
  (m, g) => (g[0] === 'x' || g[0] === 'u') ? String.fromCharCode(parseInt(g.slice(1), 16)) : ESC_MAP[g]);
// Segments the text for the ECHO with terminal semantics:
//  \b deletes the previous char · \v and \f break the line · \r \n \r\n end the line · the rest stays "open".
// (The transmitted bytes do NOT change: \b and \v are sent as-is; this only affects display.)
function termSegments(s) {
  const out = []; let line = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\r') { const lf = s[i + 1] === '\n'; out.push({ text: line, term: lf ? '\r\n' : '\r' }); line = ''; if (lf) i++; }
    else if (c === '\n') { out.push({ text: line, term: '\n' }); line = ''; }
    else if (c === '\v' || c === '\f') { out.push({ text: line, term: c }); line = ''; }
    else if (c === '\b') { line = line.slice(0, -1); }   // backspace: deletes the last char of the echo
    else line += c;
  }
  if (line !== '' || out.length === 0) out.push({ text: line, term: '' });
  return out;
}

// Bytes → texto legible (B / KB / MB / GB, base 1024)
function fmtBytes(n) {
  if (n == null || isNaN(n)) return '—';
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return (n >= 100 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
}

/* ---- app build info (shown in the ⚙ Settings popover) ----
   build-standalone.cjs replaces `stamp: ''` with the build date/time (and syncs the version
   from package.json), so any standalone in the field can be identified at a glance.
   An empty stamp means "running from the source tree" (dev). */
const APP_BUILD = { version: '1.0.0', stamp: '' };

/* ---- tiempo ---- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- downloads to the PC (no server) ---- */
function downloadFile(name, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name; a.click();
}
// Downloads bytes to the PC as a file.
function downloadBytes(bytes, filename) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  a.href = url; a.download = (filename || 'archivo').replace(/[\\/:*?"<>|]+/g, '_'); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---- SMS PDU (GSM 03.40 / 03.38): encoder+decoder for modules without text mode (e.g. SIM7022 NB-IoT) ----
   Supports GSM 7-bit default alphabet (with the common extended chars) and UCS2 for the rest. */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
// Extended table (prefixed with ESC 0x1b): char → code in the extension page.
const GSM7_EXT = { '\f': 0x0a, '^': 0x14, '{': 0x28, '}': 0x29, '\\': 0x2f, '[': 0x3c, '~': 0x3d, ']': 0x3e, '|': 0x40, '€': 0x65 };
const GSM7_EXT_REV = Object.fromEntries(Object.entries(GSM7_EXT).map(([c, v]) => [v, c]));

// Can `text` be represented in GSM 7-bit (basic + supported extended)? Otherwise UCS2 is needed.
function smsIsGsm7(text) { return [...text].every((c) => GSM7_BASIC.indexOf(c) >= 0 || c in GSM7_EXT); }
// text → array of 7-bit septet codes (ESC + code for extended chars).
function gsm7ToSeptets(text) {
  const out = [];
  for (const c of text) {
    const i = GSM7_BASIC.indexOf(c);
    if (i >= 0) out.push(i);
    else if (c in GSM7_EXT) { out.push(0x1b); out.push(GSM7_EXT[c]); }
  }
  return out;
}
const _h2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
// Pack septets into octets → { hex, udl } (udl = number of septets).
function gsm7Pack(text) {
  const sep = gsm7ToSeptets(text);
  let hex = '', bits = 0, acc = 0;
  for (const s of sep) { acc |= (s & 0x7f) << bits; bits += 7; if (bits >= 8) { hex += _h2(acc & 0xff); acc >>= 8; bits -= 8; } }
  if (bits > 0) hex += _h2(acc & 0xff);
  return { hex, udl: sep.length };
}
// Unpack `udl` septets from packed-octet hex → text.
function gsm7Unpack(hex, udl) {
  const bytes = []; for (let i = 0; i + 1 < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  const sep = []; let bits = 0, acc = 0, bi = 0;
  while (sep.length < udl) { if (bits < 7) { acc |= (bytes[bi++] || 0) << bits; bits += 8; } sep.push(acc & 0x7f); acc >>= 7; bits -= 7; }
  let out = '';
  for (let i = 0; i < sep.length; i++) {
    if (sep[i] === 0x1b) { const nx = sep[++i]; out += GSM7_EXT_REV[nx] != null ? GSM7_EXT_REV[nx] : ''; }
    else out += GSM7_BASIC[sep[i]] || '';
  }
  return out;
}
// UCS2 (UTF-16BE) helpers → hex / from hex.
function ucs2ToHex(text) { let h = ''; for (const c of text) { const cp = c.codePointAt(0); if (cp > 0xffff) { const v = cp - 0x10000; h += _h2((0xd800 + (v >> 10)) >> 8) + _h2((0xd800 + (v >> 10)) & 0xff) + _h2((0xdc00 + (v & 0x3ff)) >> 8) + _h2((0xdc00 + (v & 0x3ff)) & 0xff); } else h += _h2(cp >> 8) + _h2(cp & 0xff); } return h; }
function ucs2FromHex(hex) { let s = ''; for (let i = 0; i + 3 < hex.length; i += 4) s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16)); return s; }
// Phone number → semi-octet (swapped nibbles, F-padded if odd length).
function pduSwapDigits(digits) { const d = digits.length % 2 ? digits + 'F' : digits; let o = ''; for (let i = 0; i < d.length; i += 2) o += d[i + 1] + d[i]; return o; }
function pduUnswapDigits(hex) { let o = ''; for (let i = 0; i < hex.length; i += 2) o += (hex[i + 1] || '') + hex[i]; return o.replace(/F+$/i, ''); }

// Build an SMS-SUBMIT PDU. Returns { pdu, tpduLen } — tpduLen (octets) is the AT+CMGS=<len> argument.
function buildSubmitPdu(number, text) {
  const intl = number.trim().startsWith('+');
  const digits = number.replace(/[^0-9]/g, '');
  const da = _h2(digits.length) + (intl ? '91' : '81') + pduSwapDigits(digits);
  let dcs, ud, udl;
  if (smsIsGsm7(text)) { const p = gsm7Pack(text); dcs = '00'; ud = p.hex; udl = p.udl; }
  else { dcs = '08'; ud = ucs2ToHex(text); udl = ud.length / 2; }
  const tpdu = '11' + '00' + da + '00' + dcs + 'AA' + _h2(udl) + ud;   // SUBMIT, MR=0, PID=0, VP=relative(AA)
  return { pdu: '00' + tpdu, tpduLen: tpdu.length / 2 };
}
// Build an SMS-DELIVER PDU (used by the virtual modem to serve the inbox in PDU mode).
// ts: "YY/MM/DD,HH:MM:SS[±zz]" → SCTS semi-octets; falls back to zeros if unparseable.
function buildDeliverPdu(from, text, ts) {
  const intl = from.trim().startsWith('+');
  const digits = from.replace(/[^0-9]/g, '');
  const oa = _h2(digits.length) + (intl ? '91' : '81') + pduSwapDigits(digits);
  let dcs, ud, udl;
  if (smsIsGsm7(text)) { const p = gsm7Pack(text); dcs = '00'; ud = p.hex; udl = p.udl; }
  else { dcs = '08'; ud = ucs2ToHex(text); udl = ud.length / 2; }
  const dt = (ts || '').match(/(\d{2})\/(\d{2})\/(\d{2}),(\d{2}):(\d{2}):(\d{2})/);
  const scts = dt ? pduSwapDigits(dt[1] + dt[2] + dt[3] + dt[4] + dt[5] + dt[6]) + '00' : '00000000000000';
  return '00' + '04' + oa + '00' + dcs + scts + _h2(udl) + ud;
}
// Parse an SMS-DELIVER PDU → { from, text, ts } (best-effort; ts as "YY/MM/DD HH:MM:SS").
function parseDeliverPdu(pdu) {
  try {
    let p = 0; const take = (n) => { const s = pdu.slice(p, p + n); p += n; return s; };
    const smscLen = parseInt(take(2), 16); take(smscLen * 2);
    const fo = parseInt(take(2), 16);
    const oaLen = parseInt(take(2), 16); const oaType = take(2);
    const oaDigits = pduUnswapDigits(take(Math.ceil(oaLen / 2) * 2));
    const from = (oaType === '91' ? '+' : '') + oaDigits;
    take(2);                                   // PID
    const dcs = parseInt(take(2), 16);
    const sc = take(14);                       // SCTS (7 semi-octet octets)
    const ts = /^[0-9A-Fa-f]{14}$/.test(sc)
      ? (() => { const d = pduUnswapDigits(sc); return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 6)} ${d.slice(6, 8)}:${d.slice(8, 10)}:${d.slice(10, 12)}`; })()
      : '';
    const udl = parseInt(take(2), 16);
    const ud = pdu.slice(p);
    const text = (dcs & 0x08) ? ucs2FromHex(ud) : gsm7Unpack(ud, udl);
    return { from, text, ts, fo };
  } catch (_) { return null; }
}
