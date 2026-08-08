/* at-parser.js — AT protocol parsing, INDEPENDENT of any module vendor.
   Everything here comes from the standards (3GPP TS 27.007 / 27.005 and the V.250 result
   codes), so it applies to any AT device: line classification (ok / err / urc / echo / body),
   the base URC prefix list, and the CME/CMS error-code tables.
   Vendor-specific URC prefixes are NOT hardcoded here: each vendor file registers its own via
   registerUrcPrefixes() (see app/js/simcom/at-parser-simcom.js and the espressif one).
   No transport and no DOM: serial.js moves bytes, this file only understands them.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/* ---- URC prefixes: unsolicited result codes (a line starting with one is tagged 'urc') ----
   Base = 3GPP/ITU standard codes common to every module; vendors append theirs at load time. */
const URC_PREFIXES = [
  'RING', 'NO CARRIER', 'BUSY', 'NO ANSWER',                      // V.250 call result codes
  '+CRING', '+CLIP', '+CCWA', '+COLP',                            // TS 27.007 call URCs
  '+CMTI', '+CMT', '+CDS', '+CBM', '+CDSI',                       // TS 27.005 SMS URCs
  '+CREG', '+CGREG', '+CEREG', '+C5GREG', '+CGEV',                // network registration / packet domain
  '+CTZV', '+CTZE', '+CPIN', '+CIEV', '+CUSD',                    // time zone · SIM · indicators · USSD
];
// Called by each vendor's at-parser-*.js. Duplicates are ignored, so load order is irrelevant.
function registerUrcPrefixes(list) {
  for (const p of list) if (!URC_PREFIXES.includes(p)) URC_PREFIXES.push(p);
}

const RE = {
  ok:    /^OK$/,
  error: /^ERROR$/,
  cme:   /^\+CME ERROR:/,
  cms:   /^\+CMS ERROR:/,
};

// Classifies a received line: 'empty' | 'ok' | 'err' | 'echo' | 'urc' | 'body'.
// echoOf = the command just sent (so the module's echo isn't shown as a response).
function classify(line, echoOf) {
  if (line.length === 0) return 'empty';
  if (RE.ok.test(line)) return 'ok';
  if (RE.error.test(line) || RE.cme.test(line) || RE.cms.test(line)) return 'err';
  if (echoOf && line === echoOf) return 'echo';
  // NMEA 0183 sentences (GNSS receivers, and AT modules while streaming): the device sends them
  // on its own, so they are unsolicited by definition. See core/nmea.js.
  if (line[0] === '$' && isNmea(line)) return 'urc';
  for (const p of URC_PREFIXES) {
    // <prefix>:… / <prefix> … / <prefix>,… (ESP +IPD,<link>,<len>:data and similar comma-formatted URCs)
    if (line === p || line.startsWith(p + ':') || line.startsWith(p + ' ') || line.startsWith(p + ',')) return 'urc';
  }
  return 'body';
}

/* ---- Translation of AT error codes to human text (annotation in the terminal) ----
   +CME ERROR (3GPP TS 27.007 §9.2 + GPRS causes annex A) · +CMS ERROR (TS 27.005 §3.2.5,
   RP causes from TS 24.011 and TP causes from TS 23.040). In English on purpose: it's the spec text. */
const CME_ERRORS = {
  0: 'Phone failure', 1: 'No connection to phone', 2: 'Phone-adaptor link reserved',
  3: 'Operation not allowed', 4: 'Operation not supported',
  5: 'PH-SIM PIN required', 6: 'PH-FSIM PIN required', 7: 'PH-FSIM PUK required',
  10: 'SIM not inserted', 11: 'SIM PIN required', 12: 'SIM PUK required',
  13: 'SIM failure', 14: 'SIM busy', 15: 'SIM wrong', 16: 'Incorrect password',
  17: 'SIM PIN2 required', 18: 'SIM PUK2 required',
  20: 'Memory full', 21: 'Invalid index', 22: 'Not found', 23: 'Memory failure',
  24: 'Text string too long', 25: 'Invalid characters in text string',
  26: 'Dial string too long', 27: 'Invalid characters in dial string',
  30: 'No network service', 31: 'Network timeout', 32: 'Network not allowed - emergency calls only',
  40: 'Network personalization PIN required', 41: 'Network personalization PUK required',
  42: 'Network subset personalization PIN required', 43: 'Network subset personalization PUK required',
  44: 'Service provider personalization PIN required', 45: 'Service provider personalization PUK required',
  46: 'Corporate personalization PIN required', 47: 'Corporate personalization PUK required',
  50: 'Incorrect parameters', 100: 'Unknown error',
  103: 'Illegal MS', 106: 'Illegal ME', 107: 'GPRS services not allowed',
  111: 'PLMN not allowed', 112: 'Location area not allowed', 113: 'Roaming not allowed in this location area',
  132: 'Service option not supported', 133: 'Requested service option not subscribed',
  134: 'Service option temporarily out of order', 148: 'Unspecified GPRS error',
  149: 'PDP authentication failure', 150: 'Invalid mobile class',
};
const CMS_ERRORS = {
  1: 'Unassigned (unallocated) number', 8: 'Operator determined barring', 10: 'Call barred',
  21: 'Short message transfer rejected', 27: 'Destination out of service', 28: 'Unidentified subscriber',
  29: 'Facility rejected', 30: 'Unknown subscriber', 38: 'Network out of order',
  41: 'Temporary failure', 42: 'Congestion', 47: 'Resources unavailable, unspecified',
  50: 'Requested facility not subscribed', 69: 'Requested facility not implemented',
  81: 'Invalid short message transfer reference value', 95: 'Invalid message, unspecified',
  96: 'Invalid mandatory information', 97: 'Message type non-existent or not implemented',
  98: 'Message not compatible with short message protocol state', 99: 'Information element non-existent or not implemented',
  111: 'Protocol error, unspecified', 127: 'Interworking, unspecified',
  128: 'Telematic interworking not supported', 129: 'Short message Type 0 not supported',
  130: 'Cannot replace short message', 143: 'Unspecified TP-PID error',
  144: 'Data coding scheme (alphabet) not supported', 145: 'Message class not supported',
  159: 'Unspecified TP-DCS error', 160: 'Command cannot be actioned', 161: 'Command unsupported',
  175: 'Unspecified TP-Command error', 176: 'TPDU not supported',
  192: 'SC busy', 193: 'No SC subscription', 194: 'SC system failure', 195: 'Invalid SME address',
  196: 'Destination SME barred', 197: 'SM rejected-duplicate SM',
  198: 'TP-VPF not supported', 199: 'TP-VP not supported',
  208: 'SIM SMS storage full', 209: 'No SMS storage capability in SIM', 210: 'Error in MS',
  211: 'Memory capacity exceeded', 212: 'SIM Application Toolkit busy', 213: 'SIM data download error',
  300: 'ME failure', 301: 'SMS service of ME reserved', 302: 'Operation not allowed',
  303: 'Operation not supported', 304: 'Invalid PDU mode parameter', 305: 'Invalid text mode parameter',
  310: 'SIM not inserted', 311: 'SIM PIN required', 312: 'PH-SIM PIN required',
  313: 'SIM failure', 314: 'SIM busy', 315: 'SIM wrong',
  316: 'SIM PUK required', 317: 'SIM PIN2 required', 318: 'SIM PUK2 required',
  320: 'Memory failure', 321: 'Invalid memory index', 322: 'Memory full',
  330: 'SMSC address unknown', 331: 'No network service', 332: 'Network timeout',
  340: 'No +CNMA acknowledgement expected', 500: 'Unknown error',
};
// "+CME ERROR: 30" → "No network service" · null if the code is unknown or already came as text (CMEE=2).
function atErrorText(line) {
  const m = line.match(/^\+(CME|CMS) ERROR:\s*(\d+)\s*$/i);
  if (!m) return null;
  const txt = (m[1].toUpperCase() === 'CME' ? CME_ERRORS : CMS_ERRORS)[Number(m[2])];
  return txt || null;
}
