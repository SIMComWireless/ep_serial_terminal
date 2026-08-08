/* live-simcom.js — 3GPP / SIMCom telemetry parsers for the instrument strip: signal (+CSQ,
   +CESQ), serving cell (+CPSI), operator (+COPS), registration (+CREG/+CGREG/+CEREG), SIM
   (+CPIN, +SIMCARD) and the data context (+CGDCONT, +CGPADDR, +CNACT, +IPADDR).
   They join the shared `Live` map of core/live.js.
   (part of the AT console · classic script, shared global scope — concatenated in order) */

Object.assign(Live, {
    '+CSQ': (line, ui) => {
      const [r] = liveSplitFields(line, '+CSQ');
      const rssi = Number(r);
      if (rssi === 99 || isNaN(rssi)) { ui.set('g-csq', '99'); ui.set('g-rssi', '—'); return ui.signal(null); }   // 99 = no measurement: stale RSSI out
      ui.set('g-csq', String(rssi));
      ui.set('g-rssi', (-113 + 2 * rssi) + ' dBm');
      ui.signal({ dbm: -113 + 2 * rssi, bars: Math.min(5, Math.round(rssi / 31 * 5)) });
      sigPush(ui, { rssi: -113 + 2 * rssi });
    },
    '+CESQ': (line, ui) => {
      const f = liveSplitFields(line, '+CESQ').map(Number);
      const rsrp = f[5];
      if (rsrp == null || rsrp > 97) return;
      const dbm = -141 + rsrp;
      ui.set('g-rsrp', dbm + ' dBm');
      ui.signal({ dbm, bars: Math.max(1, Math.min(5, Math.round((dbm + 120) / 70 * 5))) });
      sigPush(ui, { rsrp: dbm });
    },
    '+COPS': (line, ui) => {
      const f = liveSplitFields(line, '+COPS');
      const op = f[2] ? f[2].replace(/"/g, '') : null;
      if (op) ui.set('g-oper', op);
    },
    // +CPSI: <mode>,<status>,<mcc-mnc>,<tac>,<scell>,<pcell>,<band>,<earfcn>,<dlbw>,<ulbw>,<rsrq>,<rsrp>,<rssi>,<rssnr>
    '+CPSI': (line, ui) => {
      const f = liveSplitFields(line, '+CPSI');
      if (!f.length || /^no service/i.test(f[0] || '')) {
        ui.set('g-mode', f[0] || '—');
        // with no service there is no cell: stale band and signal metrics out
        ui.set('g-band', '—'); ui.set('g-rsrp', '—'); ui.set('g-rssi', '—'); ui.set('g-rssnr', '—');
        return;
      }
      ui.set('g-mode', f[0] || '—');
      const band = f.find((x) => /BAND|GSM|WCDMA|TDD|FDD|NR/i.test(x)) || f[6] || '';
      if (band) ui.set('g-band', band.replace(/^EUTRAN-/i, ''));
      if (f.length >= 14) {
        ui.set('g-rsrp', f[11] + ' dBm'); ui.set('g-rssi', f[12] + ' dBm'); ui.set('g-rssnr', f[13] + ' dB');
        sigPush(ui, { rsrq: Number(f[10]), rsrp: Number(f[11]), rssi: Number(f[12]), sinr: Number(f[13]) });
      }
    },
    '+CPIN': (line, ui) => {
      const v = line.replace(/^\+CPIN:\s*/i, '').trim();
      if (!v) return;
      // READY green · asks for PIN/PUK amber · NOT READY / NOT INSERTED / locks red
      const st = /^READY$/i.test(v) ? 'ok' : /PIN|PUK/i.test(v) ? 'warn' : 'err';
      ui.set('g-sim', v, st);
    },
    '+CME ERROR': (line, ui) => {   // AT+CPIN? without a SIM answers CME, not +CPIN
      if (/SIM not inserted|SIM failure/i.test(line)) ui.set('g-sim', 'NOT INSERTED', 'err');
    },
    '+SIMCARD': (line, ui) => {     // URC when hot-removing the SIM: +SIMCARD: NOT AVAILABLE
      if (/NOT AVAILABLE/i.test(line)) ui.set('g-sim', 'NOT AVAILABLE', 'err');
    },
    '+CGDCONT': (line, ui) => {
      const f = liveSplitFields(line, '+CGDCONT');
      const type = (f[1] || '').replace(/"/g, ''), apn = (f[2] || '').replace(/"/g, '');
      if (type) ui.set('g-iptype', type);
      if (apn) ui.set('g-apn', apn);
    },
    '+CGPADDR': (line, ui) => {
      const ip = (liveSplitFields(line, '+CGPADDR')[1] || '').replace(/"/g, '');
      if (ip && ip !== '0.0.0.0') ui.set('g-ip', ip);
    },
    '+CNACT': (line, ui) => {
      const ip = (liveSplitFields(line, '+CNACT')[2] || '').replace(/"/g, '');
      if (ip && ip !== '0.0.0.0') ui.set('g-ip', ip);
    },
    '+IPADDR': (line, ui) => {
      const ip = line.replace(/^\+IPADDR:\s*/i, '').trim();
      if (/\d+\.\d+\.\d+\.\d+/.test(ip)) ui.set('g-ip', ip);
    },
    '+CREG': liveRegParser, '+CGREG': liveRegParser, '+CEREG': liveRegParser,
    // (the Espressif ESP parsers — CWMODE/CWJAP/CWSTATE/CIPSTA/WIFI * — join Live from live-espressif.js)
});
