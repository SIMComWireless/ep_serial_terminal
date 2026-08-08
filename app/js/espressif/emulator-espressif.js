/* emulator-espressif.js — Espressif ESP command set of the virtual modem (factory AT firmware):
   Wi-Fi (CW*), TCP/IP (CIP*), MQTT (MQTT*), HTTP (HTTPCLIENT) and BLE (BLE*, incl. GATT client).
   Plugged into the core through registerEmuHandler(); a branch that matches performs its action
   and returns anything BUT the EMU_PASS sentinel, which means "not mine, keep walking the chain".
   The Simu Ctrl Wi-Fi controls (ctlWifi/ctlWifiRssi) are attached to the class from here too.
   (part of the AT console · classic script, shared global scope — concatenated in order) */


function espEmuHandle(emu, cmd, api) {
  const { ok, err, reply } = api;
  const s = emu.state;
  if (/^AT\+GMR/i.test(cmd)) return reply(['AT version:3.4.0.0', 'SDK version:v5.1.2', `Bin version:${emu.identity.model || 'ESP'}`]);
  if (/^AT\+CWMODE\?/i.test(cmd)) return reply([`+CWMODE:${s.cwmode || 1}`]);
  if (/^AT\+CWMODE=/i.test(cmd)) { s.cwmode = Number(cmd.split('=')[1]) || 1; return ok(); }
  if (/^AT\+CWLAP/i.test(cmd)) return reply([
    '+CWLAP:(3,"FibraHogar",-52,"a4:91:b1:11:22:33",6)',
    '+CWLAP:(4,"Oficina",-63,"c8:3a:35:44:55:66",11)',
    '+CWLAP:(0,"OpenWifi",-78,"00:11:22:aa:bb:cc",1)',
  ]);
  if (/^AT\+CWJAP=/i.test(cmd)) {   // the OK arrives AFTER associating (like the real firmware)
    const m = cmd.match(/CWJAP="([^"]*)"/i);
    s.espWifi = { ssid: m ? m[1] : 'AP', ch: 6, rssi: -55 };
    emu._later(250, () => emu.output('\r\nWIFI CONNECTED\r\n'));
    emu._later(550, () => emu.output('\r\nWIFI GOT IP\r\n'));
    return emu._later(700, () => emu._send(['OK']));
  }
  if (/^AT\+CWJAP\?/i.test(cmd)) return s.espWifi ? reply([`+CWJAP:"${s.espWifi.ssid}","a4:91:b1:11:22:33",${s.espWifi.ch},${s.espWifi.rssi}`]) : reply(['No AP']);
  if (/^AT\+CWQAP/i.test(cmd)) { s.espWifi = null; ok(); return emu._later(200, () => emu.output('\r\nWIFI DISCONNECT\r\n')); }
  if (/^AT\+CWSTATE\?/i.test(cmd)) return reply([`+CWSTATE:${s.espWifi ? 2 : 4},"${s.espWifi ? s.espWifi.ssid : ''}"`]);
  if (/^AT\+CWSAP\?/i.test(cmd)) { const a = s.espAp || { ssid: 'ESP-AP', pass: '', ch: 6, enc: 3 }; return reply([`+CWSAP:"${a.ssid}","${a.pass}",${a.ch},${a.enc},4,0`]); }
  if (/^AT\+CWSAP=/i.test(cmd)) { const m = cmd.match(/CWSAP="([^"]*)","([^"]*)",(\d+),(\d+)/i); if (m) s.espAp = { ssid: m[1], pass: m[2], ch: Number(m[3]), enc: Number(m[4]) }; return ok(); }
  if (/^AT\+CWLIF/i.test(cmd)) return reply(s.espAp ? ['+CWLIF:192.168.4.2,aa:bb:cc:dd:ee:ff', '+CWLIF:192.168.4.3,11:22:33:44:55:66'] : []);
  if (/^AT\+CWDHCP/i.test(cmd)) return ok();
  if (/^AT\+CIPSTA\?/i.test(cmd)) return reply(s.espWifi
    ? ['+CIPSTA:ip:"192.168.1.37"', '+CIPSTA:gateway:"192.168.1.1"', '+CIPSTA:netmask:"255.255.255.0"']
    : ['+CIPSTA:ip:"0.0.0.0"', '+CIPSTA:gateway:"0.0.0.0"', '+CIPSTA:netmask:"0.0.0.0"']);
  if (/^AT\+CIPSTAMAC\?/i.test(cmd)) return reply(['+CIPSTAMAC:"7c:df:a1:12:34:56"']);
  if (/^AT\+CIFSR/i.test(cmd)) return reply(['+CIFSR:STAIP,"192.168.1.37"', '+CIFSR:STAMAC,"7c:df:a1:12:34:56"']);
  if (/^AT\+PING=/i.test(cmd)) return s.espWifi ? reply([`+PING:${18 + ((s.pingSeq = (s.pingSeq || 0) + 1) % 7)}`]) : reply(['+PING:TIMEOUT']);
  if (/^AT\+CIPMUX\?/i.test(cmd)) return reply([`+CIPMUX:${s.espMux || 0}`]);
  if (/^AT\+CIPMUX=([01])/i.test(cmd)) { s.espMux = Number(cmd.match(/=([01])/)[1]); return ok(); }
  if (/^AT\+CIPSERVER=1/i.test(cmd)) {   // TCP server (needs CIPMUX=1): simulate an incoming client shortly after
    if (!s.espMux) return err();
    s.espSrv = true; ok();
    emu._later(200, () => { if (s.espSrv) emu.output('\r\n0,CONNECT\r\n'); });
    emu._later(350, () => { if (s.espSrv) emu.output('\r\n+IPD,0,5:hello\r\n'); });   // link 0 pushes 5 bytes
    return;
  }
  if (/^AT\+CIPSERVER=0/i.test(cmd)) { s.espSrv = false; ok(); return emu._later(120, () => emu.output('\r\n0,CLOSED\r\n')); }
  if (/^AT\+CIPSTART=/i.test(cmd)) { if (!s.espWifi) return err(); s.espConn = true; return reply(['CONNECT']); }
  if (/^AT\+CIPSEND=\d+$/i.test(cmd)) { if (!s.espConn) return err(); emu.expecting = { kind: 'len', len: Number(cmd.split('=')[1]) || 0 }; return emu.output('\r\n> '); }
  if (/^AT\+CIPCLOSE$/i.test(cmd)) { if (!s.espConn) return err(); s.espConn = false; ok(); return emu._later(120, () => emu.output('\r\nCLOSED\r\n')); }
  if (/^AT\+CIPSTATUS/i.test(cmd)) return reply([`STATUS:${s.espConn ? 3 : (s.espWifi ? 2 : 5)}`]);
  if (/^AT\+MQTTUSERCFG=/i.test(cmd)) return ok();
  if (/^AT\+MQTTCONN=/i.test(cmd)) { s.espMqtt = true; ok(); return emu._later(300, () => emu.output('\r\n+MQTTCONNECTED:0,1,"broker","1883","",1\r\n')); }
  if (/^AT\+MQTTSUB=/i.test(cmd) || /^AT\+MQTTPUB=/i.test(cmd)) return s.espMqtt ? ok() : err();
  if (/^AT\+MQTTCLEAN=/i.test(cmd)) { s.espMqtt = false; return ok(); }
  if (/^AT\+HTTPCLIENT=/i.test(cmd)) return s.espWifi ? reply(['+HTTPCLIENT:12,{"ok":true}']) : err();
  if (/^AT\+BLEINIT\?/i.test(cmd)) return reply([`+BLEINIT:${s.espBle || 0}`]);
  if (/^AT\+BLEINIT=/i.test(cmd)) { s.espBle = Number(cmd.split('=')[1]) || 0; if (!s.espBle) { s.espBleConns = {}; s.espBleAdv = false; } return ok(); }
  if (/^AT\+BLEADDR\?/i.test(cmd)) return reply(['+BLEADDR:"7c:df:a1:12:34:58"']);
  if (/^AT\+BLENAME\?/i.test(cmd)) return reply([`+BLENAME:"${s.espBleName || emu.identity.model || 'BLE_AT'}"`]);
  if (/^AT\+BLENAME=/i.test(cmd)) { if (!s.espBle) return err(); const m = cmd.match(/=\s*"?([^"]*)"?/); s.espBleName = m ? m[1] : ''; return ok(); }
  if (/^AT\+BLESCAN=1,(\d+)/i.test(cmd)) {   // results as +BLESCAN URCs during the window
    if (!s.espBle) return err();
    ok();
    const devs = [['5c:02:14:aa:10:01', -48], ['e8:07:bf:23:45:67', -71], ['c0:49:ef:99:88:77', -83]];
    devs.forEach(([a, r], i) => emu._later(250 * (i + 1), () => emu.output(`\r\n+BLESCAN:"${a}",${r},"0201060909455350","",0\r\n`)));
    return;
  }
  if (/^AT\+BLESCAN=0$/i.test(cmd)) return ok();
  if (/^AT\+BLECONN\?/i.test(cmd)) { const c = s.espBleConns || {}; return reply(Object.keys(c).map((i) => `+BLECONN:${i},"${c[i]}"`)); }
  if (/^AT\+BLECONN=/i.test(cmd)) {   // AT+BLECONN=<idx>,"<addr>",<type>,<timeout>
    if (!s.espBle) return err();
    const m = cmd.match(/=\s*(\d+)\s*,\s*"([0-9a-fA-F:]+)"/);
    if (!m) return err();
    (s.espBleConns || (s.espBleConns = {}))[m[1]] = m[2].toLowerCase();
    ok();
    return emu._later(400, () => emu.output(`\r\n+BLECONN:${m[1]},"${m[2].toLowerCase()}"\r\n`));
  }
  if (/^AT\+BLEDISCONN=/i.test(cmd)) { const i = cmd.match(/=(\d+)/)[1]; const c = s.espBleConns || {}; const a = c[i]; delete c[i]; ok(); return a ? emu._later(200, () => emu.output(`\r\n+BLEDISCONN:${i},"${a}"\r\n`)) : undefined; }
  if (/^AT\+BLEGATTCPRIMSRV=/i.test(cmd)) {   // primary GATT services of the remote server
    const i = (cmd.match(/=(\d+)/) || [, '0'])[1];
    return reply([`+BLEGATTCPRIMSRV:${i},1,"1800",1`, `+BLEGATTCPRIMSRV:${i},2,"1801",1`, `+BLEGATTCPRIMSRV:${i},3,"180a",1`]);
  }
  if (/^AT\+BLEGATTCCHAR=/i.test(cmd)) {   // characteristics of a service: props 0x02 read · 0x08 write · 0x10 notify
    const m = cmd.match(/=(\d+),(\d+)/); const ci = m ? m[1] : '0', si = m ? m[2] : '1';
    if (si === '3') return reply([`+BLEGATTCCHAR:"char",${ci},${si},1,"2a29",2`, `+BLEGATTCCHAR:"char",${ci},${si},2,"2a24",2`]);   // Device Info: read-only
    return reply([`+BLEGATTCCHAR:"char",${ci},${si},1,"2a00",10`, `+BLEGATTCCHAR:"char",${ci},${si},2,"2a05",16`]);   // 10=R+W, 16=notify
  }
  if (/^AT\+BLEGATTCRD=/i.test(cmd)) { const m = cmd.match(/=(\d+),(\d+),(\d+)/); const c = m ? m[1] : '0'; return reply([`+BLEGATTCRD:${c},5,"48656c6c6f"`]); }   // "Hello"
  if (/^AT\+BLEGATTCWR=/i.test(cmd)) { const n = Number((cmd.split(',').pop()) || 0); if (n > 0) { emu.expecting = { kind: 'len', len: n * 2 }; return emu.output('\r\n> '); } return ok(); }   // hex payload: 2 chars per byte
  if (/^AT\+BLEGATTCSUBSCRIBE=/i.test(cmd)) {   // notifications: emit a couple of +BLEGATTCNTFY URCs
    const m = cmd.match(/=(\d+),(\d+),(\d+)/); if (!m) return err();
    const [, ci, si, ch] = m; ok();
    emu._later(500, () => emu.output(`\r\n+BLEGATTCNTFY:${ci},${si},${ch},2,"1a2b"\r\n`));
    emu._later(1100, () => emu.output(`\r\n+BLEGATTCNTFY:${ci},${si},${ch},2,"3c4d"\r\n`));
    return;
  }
  if (/^AT\+BLEGATTCUNSUBSCRIBE=/i.test(cmd)) return ok();
  if (/^AT\+BLEADVSTART/i.test(cmd)) { if (!s.espBle) return err(); s.espBleAdv = true; return ok(); }
  if (/^AT\+BLEADVSTOP/i.test(cmd)) { if (!s.espBle) return err(); s.espBleAdv = false; return ok(); }
  if (/^AT\+BLE/i.test(cmd)) return s.espBle ? ok() : err();   // remaining ESP BLE commands (ADVDATAEX, etc.) → OK if BLE initialized
  return EMU_PASS;
}

// Only for ESP emulators (a SIMCom module must not answer Espressif commands).
registerEmuHandler((emu, cmd, api) => (emu.isEsp ? espEmuHandle(emu, cmd, api) : EMU_PASS));

/* ---- Simu Ctrl panel: ESP Wi-Fi controls, attached to the emulator class from the ESP module ---- */
// ESP: associate/disassociate the station to a simulated AP
ATEmulator.prototype.ctlWifi = function (on) {
  const s = this.state;
  if (on) { s.espWifi = s.espWifi || { ssid: 'FibraHogar', ch: 6, rssi: -55 }; this.output('\r\nWIFI CONNECTED\r\n\r\nWIFI GOT IP\r\n'); }
  else { s.espWifi = null; s.espConn = false; this.output('\r\nWIFI DISCONNECT\r\n'); }
};
ATEmulator.prototype.ctlWifiRssi = function (dbm) { if (this.state.espWifi) this.state.espWifi.rssi = dbm; };
