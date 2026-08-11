// @ts-check
/* drivers.js — DRIVER CONTRACTS (JSDoc @typedef), vendor-agnostic.
   Documents the shape a module profile and its drivers must have so a new module "plugs"
   into the wizards: Profile, GnssDriver, TcpDriver, HttpDriver, MqttDriver, DataDriver,
   FsDriver, QuickTable, Macro, FormValues. They are comments only: they give autocompletion
   and checking in the editor (VS Code) with no build and no TypeScript.
   The implementations live per vendor: simcom/drivers-simcom.js (and the ESP drivers are
   inside espressif/profiles-espressif.js, since they are few).
   Manual check:  npx -y -p typescript tsc -p jsconfig.json
   (part of the AT console · classic script, shared global scope — concatenated in order) */

/**
 * Wizard form values: field-id → value (string).
 * E.g. v['wz-host'], v['wz-port'], v['wz-mode'] ('TCP'|'UDP'), v['wz-ssl'] (bool-ish).
 * @typedef {Object<string, string>} FormValues
 */
/**
 * AT command macro returned by a driver. Commands separated by '\n';
 * `@NNN` = wait NNN ms; with the module's '> ' prompt active, the line goes raw (no EOL).
 * @typedef {string} Macro
 */
/**
 * @typedef {{ ok: boolean, lines: string[] }} SendResult
 * @typedef {(cmd: string) => Promise<SendResult>} SendFn
 */
/**
 * Parsed GNSS position/state (shape shared by all modules).
 * @typedef {Object} GnssFix
 * @property {string} mode              Fix type ('2'|'3'…)
 * @property {number} sats              Satellites in use
 * @property {number} [svSum]           Sum of satellites in view per constellation
 * @property {number|null} lat
 * @property {number|null} lon
 * @property {string} [date]            Date (ddmmyy or YYYYMMDD depending on module)
 * @property {string} utc               Hora UTC (hhmmss)
 * @property {number|null} [alt]
 * @property {number|null} [speed]
 * @property {number|null} [course]
 * @property {number|null} [pdop]
 * @property {number|null} [hdop]
 * @property {number|null} [vdop]
 */
/**
 * GNSS driver of a family. If `supported` is false, the rest is optional.
 * @typedef {Object} GnssDriver
 * @property {boolean} supported
 * @property {boolean} [stream]     Standalone receiver: it pushes NMEA on its own, nothing to poll
 * @property {GnssChipDriver} [chip]  Receiver chip whose proprietary protocol configures it
 * @property {boolean} [satStream]                        Is there an NMEA sky-view?
 * @property {string} [queryPower]
 * @property {(line: string) => (number|null)} [parsePower]
 * @property {(on: boolean) => Macro} [power]
 * @property {string} [info]
 * @property {RegExp} [infoRe]
 * @property {(line: string) => (GnssFix|null)} [parseInfo]
 * @property {string} [cold]
 * @property {string} [warm]
 * @property {string} [hot]
 * @property {string|null} [satStart]
 * @property {string|null} [satStop]
 */
/**
 * @typedef {Object} TcpDriver
 * @property {(v: FormValues) => Macro} open
 * @property {(v: FormValues) => Macro} send
 * @property {(v: FormValues) => Macro} read
 * @property {(v: FormValues) => Macro} close
 */
/**
 * @typedef {Object} HttpDriver
 * @property {(v: FormValues) => Macro} get
 * @property {(v: FormValues) => Macro} post
 */
/**
 * @typedef {Object} MqttDriver
 * @property {(v: FormValues) => Macro} connect
 * @property {(v: FormValues) => Macro} subscribe
 * @property {(v: FormValues) => Macro} publish
 * @property {() => Macro} disconnect
 */
/**
 * Data/PDP driver (status panel): commands + refresh that queries the module.
 * @typedef {Object} DataDriver
 * @property {string} openCmd
 * @property {string} closeCmd
 * @property {(send: SendFn) => Promise<{ open: (boolean|null), ip: (string|null) }>} refresh
 */
/**
 * File System driver. 'fscd' = tree navigation (FSCD/FSLS).
 * 'cfs' = by directory index + name (SIM7080/7070).
 * @typedef {Object} FsDriver
 * @property {'fscd'|'cfs'} model
 * @property {Array<[string, string]>} [dirs]                 (cfs) [index, path]
 * @property {(dir: string, name: string) => Macro} [size]    (cfs)
 * @property {(dir: string, name: string) => Macro} [read]    (cfs)
 * @property {(dir: string, name: string) => Macro} [del]     (cfs)
 */
/**
 * GNSS chip driver — the PROPRIETARY NMEA protocol of the receiver chip, not of the module
 * maker. Several modules from different brands share one chip, so this lives in its own vendor
 * folder (app/js/airoha, app/js/icoe) and the module profile just points at it.
 * Every command builder returns a bare sentence WITHOUT checksum: nmeaFrame() adds it.
 * `sentences` lists the standard NMEA outputs the chip can enable/disable, as [id, name].
 * When `commands` is false the chip's proprietary set is not mapped yet: the UI keeps working
 * (NMEA is standard) and the config wizard says so instead of sending made-up sentences.
 * @typedef {Object} GnssChipDriver
 * @property {string} id                                       e.g. 'AG3352Q'
 * @property {string} name                                     e.g. 'Airoha AG3352Q'
 * @property {string} vendor                                   e.g. 'Airoha'
 * @property {string} [proto]                                  proprietary prefix, e.g. 'PAIR'
 * @property {boolean} commands                                is the proprietary set mapped?
 * @property {string} [doc]                                    where the command list comes from
 * @property {Array<[string, string]>} [sentences]             [id, name] of the outputs
 * @property {Array<[string, string]>} [rates]                 [value, label] fix intervals
 * @property {Array<[string, string]>} [sysList]               [key, label] constellations it can search
 * @property {number[]} [bauds]                                port speeds it accepts
 * @property {(on: boolean) => string} [power]
 * @property {string} [coldFull]
 * @property {string} [cold]
 * @property {string} [warm]
 * @property {string} [hot]
 * @property {(ms: number) => string} [fixRate]
 * @property {(id: string, rate: number) => string} [sentenceRate]
 * @property {(sys: Object<string, boolean>) => string} [constellations]
 * @property {(baud: number) => string} [baud]
 * @property {string} [version]
 * @property {string} [save]
 * @property {RegExp} [ackRe]                                  matches the chip's ack sentence
 * @property {(line: string) => ({cmd: string, ok: boolean, text: string}|null)} [parseAck]
 * @property {QuickItem[]} [quick]                             sentences for the "AT Commands" combo
 */
/**
 * Sidebar entry: a loose launcher { wiz } or a category { cat, items } whose children indent.
 * @typedef {{wiz?: string, cat?: string, items?: string[]}} SidebarEntry
 */
/**
 * One cell of the header strip (see core/instruments.js). Default kind = a labelled value;
 * 'sim' adds the SIM-card icon, 'reg' draws the registration LEDs and 'signal' groups the
 * bars with its mini cells. `id` is what ui.set(id, …) writes to.
 * @typedef {Object} InstCell
 * @property {'sim'|'reg'|'signal'} [kind]
 * @property {string} [id]
 * @property {string} [label]                          literal (technical: SSID, HDOP, IP…)
 * @property {string} [labelKey]                       i18n key when the label is translatable
 * @property {boolean} [dim]
 * @property {Array<[string, string]>} [leds]          (reg) [element id, name]
 * @property {Array<{id: string, label?: string, labelKey?: string}>} [minis]   (signal)
 */
/**
 * Ping driver. `start` builds the command from the form values; `parse` is called for every
 * incoming line and returns a row to print (or null if the line isn't part of the ping).
 * `seq` overrides the row number, `raw:true` prints the text as-is (summary), `done:true`
 * closes the ping. With `perProbe` the wizard sends `start` once per probe instead of once.
 * @typedef {{host: string, count: number, size: number, interval: number, timeout: number, ttl: number}} PingOpts
 * @typedef {Object} PingDriver
 * @property {boolean} [perProbe]
 * @property {(o: PingOpts) => string} start
 * @property {(line: string, o: PingOpts) => ({text?: string, seq?: number, raw?: boolean, done?: boolean}|null)} parse
 */
/**
 * Incoming-server driver (bottom section of the TCP/UDP/Ping wizard).
 * `modes` lists the transports the module can listen on: the wizard only shows the
 * selector when there is more than one, and passes the chosen one to start()/stop().
 * @typedef {Object} ServerDriver
 * @property {Array<'tcp'|'udp'>} [modes]                   default ['tcp']
 * @property {(mode: string, port: number) => Macro} start
 * @property {(mode: string) => string} stop
 */
/**
 * Quick command item: [label, command, editable?]. The __VARS__ are edited if the flag is 1.
 * @typedef {[string, string, (0|1)?]} QuickItem
 * Quick-command overrides per sidebar group: key = wizard id (tcpudp, http, wifi, ble, ping…).
 * @typedef {Object<string, QuickItem[]>} QuickTable
 */
/**
 * @typedef {Object} Identity
 * @property {string} manufacturer
 * @property {string} model
 * @property {string} revision
 * @property {string} imei
 * @property {string} band
 * @property {string[]} ati
 */
/**
 * Driver bundle of a family (what several profiles share).
 * @typedef {Object} ProfileStack
 * @property {GnssDriver} [gnss]
 * @property {TcpDriver} [tcp]
 * @property {HttpDriver} [http]
 * @property {MqttDriver} [mqtt]
 * @property {DataDriver} [data]
 * @property {FsDriver} [fs]
 * @property {PingDriver} [ping]
 * @property {ServerDriver} [tcpServer]
 * @property {QuickTable} [quick]
 * @property {string[]} [dashboard]
 * @property {string[]} [signalPoll]
 */
/**
 * Module profile. Drivers are OPTIONAL: when missing, the wizard uses the
 * default A76XX driver (see data.js / pdrv()).
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} name
 * @property {string} family
 * @property {string} [vendor]        Module maker shown as the <optgroup> of the selector (SIMCom, Espressif…)
 * @property {string} [category]      Family inside that maker (Cellular, GNSS, Wi-Fi, Wi-Fi + BLE)
 * @property {SidebarEntry[]} [sidebar]  Menu layout of this device (see core/data.js SIDEBAR);
 *                                   without one, the full layout is used and caps do the filtering
 * @property {string} [instruments]   Header strip set the module shows: 'cellular' | 'wifi' | 'gnss'
 *                                   (or one registered with registerInstruments) — see core/instruments.js
 * @property {string} [chip]
 * @property {boolean} [raw]           None = raw serial, no AT list
 * @property {boolean} [smsPdu]        SMS in PDU mode (CMGF=0) — module without text mode (e.g. SIM7022)
 * @property {string[]} [dashboard]    Commands the header dashboard (↻) queries — vendor-specific,
 *                                     so core/session.js never hardcodes any AT command
 * @property {string[]} [signalPoll]   Commands the Signal monitor polls when "Poll" is on
 * @property {string[]} caps           Capabilities ('gnss','tcpip','mqtt','voice',…)
 * @property {string} [bands]
 * @property {Identity} identity
 * @property {GnssDriver} [gnss]
 * @property {TcpDriver} [tcp]
 * @property {HttpDriver} [http]
 * @property {MqttDriver} [mqtt]
 * @property {DataDriver} [data]
 * @property {FsDriver} [fs]
 * @property {PingDriver} [ping]
 * @property {ServerDriver} [tcpServer]
 * @property {QuickTable} [quick]
 */
