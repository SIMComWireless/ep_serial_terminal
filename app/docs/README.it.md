# SIMCom Serial AT Console

> [English](README.en.md) · [Español](README.es.md) · [Português](README.pt.md) · **Italiano** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [中文](README.zh.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

Console di comandi **AT** per moduli cellulari **SIMCom** che gira interamente nel browser. Si collega al modulo via porta seriale con la **Web Serial API**, senza installare nulla, e include una **modalità virtuale** (emulatore integrato) per provare tutto senza hardware.

Pensata per la famiglia **A76xx / A7672SA**, con assistenti visivi (*wizard*) per le operazioni più comuni — rete, dati, GNSS, SMS, email, rubrica, chiamate vocali, TLS, file system, hardware, jamming e altro — oltre a una console grezza per inviare qualsiasi comando AT a mano.

> Riferimento comandi: *A76XX Series AT Command Manual* (V2.04).

---

## Indice

- [Caratteristiche](#caratteristiche)
- [Requisiti](#requisiti)
- [Avvio rapido](#avvio-rapido)
- [Modalità virtuale (senza hardware)](#modalità-virtuale-senza-hardware)
- [Connessione a un modulo reale](#connessione-a-un-modulo-reale)
- [L'interfaccia](#linterfaccia)
- [Assistenti (wizard)](#assistenti-wizard)
- [Struttura del progetto](#struttura-del-progetto)
- [Architettura](#architettura)
- [Estendere la console](#estendere-la-console)
- [Libreria companion: `simcom-at-parser`](#libreria-companion-simcom-at-parser)
- [Note su hardware reale](#note-su-hardware-reale)
- [Compatibilità browser](#compatibilità-browser)
- [Limitazioni note](#limitazioni-note)
- [Licenza](#licenza)

---

## Caratteristiche

- **100% nel browser**, senza backend né dipendenze. Basta aprire `index.html`.
- **Web Serial API** per dialogare con il modulo via USB/UART.
- **Modalità virtuale**: un emulatore AT integrato che risponde a decine di comandi (rete, dati, GNSS, SMS, email, rubrica, voce, TLS, FS, hardware, jamming…) per sviluppare e fare demo senza scheda.
- **Console grezza**: invia qualsiasi comando AT, con cronologia, autoscroll, timestamp ed *echo* opzionale.
- **Comandi rapidi** organizzati per gruppo nella barra laterale.
- **Assistenti visivi** per oltre 20 aree funzionali, con form, indicatori live, mappe, grafici SVG e parsing di URC.
- **Macro** con passi concatenati, ritardi, invio dati e caratteri di controllo (`Ctrl-Z`, `ESC`).
- **10 lingue** (en, es, pt, it, fr, de, ru, zh, ja, ko).
- **Tema chiaro / scuro**.
- **Pannelli ridimensionabili** col mouse (larghezza e altezza), doppio clic per reset, e modalità **massimizzata** dell'assistente.

---

## Requisiti

- Un browser basato su **Chromium** con Web Serial API: **Chrome**, **Edge** o **Opera** (desktop).
  - Firefox e Safari **non** supportano attualmente Web Serial.
- Per collegarsi all'hardware, il modulo deve esporre una **porta seriale** (USB-CDC o adattatore UART–USB) accessibile al sistema operativo.
- Su Linux di solito serve il permesso sul dispositivo (es. far parte del gruppo `dialout`).

Non serve Node.js per usare la console. Node si usa solo per la [libreria companion](#libreria-companion-simcom-at-parser) e i suoi test.

---

## Avvio rapido

1. Scarica/clona il progetto.
2. Apri **`index.html`** in Chrome o Edge.
   - Funziona aperto come file locale (`file://`) o servito da un server statico.
   - Se preferisci servirlo:
     ```bash
     # opzione semplice con Python
     python3 -m http.server 8080
     # poi apri http://localhost:8080
     ```
3. Scegli lingua e tema in alto a destra.
4. Per provare senza hardware, attiva **Virtual** (vedi sotto). Per hardware reale, imposta i parametri seriali e clicca **Connect**.

> ⚠️ L'**anteprima incorporata della chat non funziona** perché non carica i `css/`, `js/` e `lang/` esterni. Bisogna **scaricare lo ZIP e aprire `index.html` localmente**.

---

## Modalità virtuale (senza hardware)

Attiva il toggle **Virtual** nella barra in alto e clicca **Connect**. La console si collega a un **emulatore AT** che simula un modulo (un *A7672SA-FASE* di default) e risponde ai comandi come il firmware reale, inclusi gli **URC** asincroni:

- Info modulo, SIM, rete e segnale.
- Apertura/chiusura sessione dati e IP.
- GNSS con trame NMEA (`GSV`/`GGA`) per lo Sky View e la mappa.
- SMS (inbox precaricata, invio con prompt `>`).
- Download certificati per lunghezza in byte (`CCERTDOWN`).
- Letture hardware (batteria, temperatura, ADC, GPIO).
- Rilevamento jamming con URC `+SJDR:` periodico.
- Email (SMTP) con il flusso completo di prompt per oggetto/corpo.
- Rubrica (contatti precaricati, aggiungi/cerca/elimina) e chiamate vocali (componi → attiva, riaggancia).

È il modo consigliato per esplorare lo strumento e fare demo.

---

## Connessione a un modulo reale

Nella barra in alto imposta i parametri della porta e clicca **Connect** (il browser ti chiederà di scegliere il dispositivo seriale):

| Parametro | Opzioni |
|-----------|---------|
| **Baud**  | 9600 · 57600 · 115200 · 230400 · 460800 · 921600 |
| **Data**  | 8 · 7 |
| **Stop**  | 1 · 2 |
| **Parity**| None · Even · Odd |
| **EOL**   | CR · CRLF · LF (terminatore aggiunto a ogni comando) |

La barra di **stato** mostra il link (online/offline), la porta, il segnale, la registrazione di rete e l'operatore.

> Cambiare il **baud** del modulo (assistente UART → `AT+IPR`) rompe il link seriale attuale: dovrai riconnetterti alla nuova velocità.

---

## L'interfaccia

Lo schermo è diviso in tre zone, tutte **ridimensionabili**:

```
┌──────────┬───────────────────┬───────────────────────────┐
│ Sidebar  │  Assistente (wiz) │  Console AT                │
│ (gruppi) │  (pannello menu)  │  (log + input comando)     │
└──────────┴───────────────────┴───────────────────────────┘
```

- **Barra superiore**: parametri seriali, lingua, tema, toggle Virtual e pulsante Connect.
- **Sidebar**: comandi rapidi raggruppati. Ogni gruppo con icona ⚙ apre il suo **assistente**.
- **Assistente**: pannello centrale che si apre col menu scelto. Ha i pulsanti **massimizza** (⛶) e **chiudi** (✕).
- **Console**: log della sessione (con toggle **TIME**, **SHOW ECHO**, **AUTO-SCROLL**), input comandi AT e invio di **macro**.

### Pannelli ridimensionabili

- Trascina il **divisore sidebar │ assistente** per cambiare la larghezza della barra laterale.
- Trascina il **divisore assistente │ console** per cambiare la larghezza dell'assistente (o l'**altezza**, quando lo schermo è stretto e i pannelli si impilano).
- **Doppio clic** su un divisore riporta quel pannello alla dimensione predefinita.
- **Massimizzare** un assistente lo espande sulla larghezza pannello + console (console sotto, parte a proporzione **60/40**); i divisori continuano a funzionare.

### Macro e caratteri di controllo

Le macro concatenano più comandi. Supportano:

| Token | Azione |
|-------|--------|
| `@delay` | attesa (ritardo configurabile tra i passi) |
| `>data`  | invia `data` dopo un prompt `>` |
| `^Z`     | `Ctrl-Z` (fine SMS / payload) |
| `^[`     | `ESC` (annulla) |

Ogni assistente offre anche un toggle **"carica nell'editor invece di eseguire"**, utile per rivedere il comando prima di inviarlo.

---

## Assistenti (wizard)

Ogni gruppo della barra laterale può aprire un assistente. I quattro di protocollo (TCP/UDP, HTTP, FTP, MQTT) usano un form generico; il resto sono pannelli su misura.

| Assistente | Cosa fa | Comandi AT principali |
|------------|---------|------------------------|
| **Basics** | Info modulo (modello, revisione, IMEI, SIM, segnale), echo, livello errori `CMEE`, e **Power/CFUN** (Full/Min/RF off/Reset). | `SIMCOMATI`, `CPIN?`, `CSQ`, `ATE`, `CMEE`, `CFUN` |
| **SIM** | ICCID/IMSI/SPN, sblocco PIN, lock e cambio PIN. | `CICCID`, `CIMI`, `CSPN?`, `CPIN`, `CLCK`, `CPWD` |
| **Network / signal** | Operatore, segnale (dBm), registrazione, tecnologia e attach PS. Selettore **modalità di rete** con lettura e query dei modi supportati. | `COPS?`, `CSQ`, `CEREG?`, `CGATT?`, `CNMP` |
| **Data** | Stato sessione dati e IP, apri/chiudi sessione, e APN (leggi/imposta). | `NETOPEN?`, `IPADDR`, `NETCLOSE`, `CGDCONT`, `CGATT?` |
| **TCP / UDP / Ping** | Form per socket e ping. | `CIPOPEN`, `CIPSEND`, `CPING`, … |
| **HTTP** | Form per richieste HTTP(S). | `HTTPINIT`, `HTTPPARA`, `HTTPACTION`, … |
| **FTP** | Form per trasferimenti FTP(S). | `CFTPSxxx` … |
| **MQTT** | Form di connessione e pubblicazione MQTT(S). | `CMQTTxxx` … |
| **File System** | Browser dei file del modulo (elenca, entra, elimina). | `CFSGFRS`, `CFSWFILE`, `CFSDFILE`, … |
| **GNSS** | Accensione/modo, avvio Cold/Warm/Hot, fix (lat/lon/alt/HDOP/UTC), mappa OSM, **Sky View** polare SVG e barre di segnale dei satelliti (NMEA `GSV`). | `CGNSSPWR`, `CGPSCOLD/WARM/HOT`, `CGNSSINFO`, `CGNSSTST` |
| **LBS** | Localizzazione da stazione base + mappa. | `CLBS` |
| **SMS** | Componi/invia (prompt `>` + `Ctrl-Z`), inbox parsata ed eliminazione. | `CMGS`, `CMGL`, `CMGD` |
| **TLS / Cert** | Elenca/elimina certificati, **scarica PEM** (`CCERTDOWN` per lunghezza in byte) e configura il contesto SSL (versione, authmode, CA). | `CCERTLIST`, `CCERTDOWN`, `CCERTDELE`, `CSSLCFG` |
| **Time / diag** | Orologio manuale (calendario + fuso orario), fuso automatico, NTP e risoluzione DNS. | `CCLK`, `CTZU`, `CNTP`, `CDNSGIP` |
| **Serial / UART** | Baud, framing (`ICF`, es. 8N1=`2,2`), controllo di flusso, sleep e CMUX, con letture di stato. | `IPR`, `ICF`, `IFC`, `CSCLK`, `CMUX` |
| **Hardware** | Batteria, temperatura e ADC con grafici SVG; GPIO (IN/OUT, LOW/HIGH) e allarme tensione con slider a doppia manopola. | `CBC`, `CPMUTEMP`, `CADC`, `CGDRT`, `CGSETV`, `CGGETV`, `CVALARM` |
| **Wi-Fi scan** | Scansione AP (BSSID, canale, segnale). | `CWSTASCAN` |
| **Jamming** | Abilita rilevamento, indicatore live via URC (`+SJDR:`), e configurazione (periodo, min RxLev, min canali, URC al cambio). | `SJDR`, `SJDCFG` |
| **Email** | SMTP(S): server, autenticazione, composizione (Da/A/Oggetto/Corpo) e **invio** con URC di esito. Solo invio SMTP (niente POP3/IMAP). | `CSMTPSSRV`, `CSMTPSAUTH`, `CSMTPSFROM`, `CSMTPSRCPT`, `CSMTPSSUB`, `CSMTPSBODY`, `CSMTPSSEND` |
| **Rubrica** | Memoria (SM/ME/DC/RC/MC/FD) con usato/totale, elenca/aggiungi/elimina contatti, cerca e numero proprio. | `CPBS`, `CPBR`, `CPBW`, `CPBF`, `CNUM` |
| **Chiamate vocali** | Stato chiamata live (inattivo/composizione/in arrivo/in chiamata), componi/rispondi/riaggancia, tastiera DTMF e toggle ID chiamante. | `ATD`, `ATA`, `CHUP`, `CLCC`, `CLIP`, `VTS` |

---

## Struttura del progetto

```
.
├── index.html              # pagina unica (carica css/, js/ e lang/)
├── css/
│   ├── styles.css          # stili e layout (pannelli ridimensionabili e scrollbar)
│   ├── theme-dark.css      # variabili tema scuro
│   └── theme-light.css     # variabili tema chiaro
├── js/
│   ├── i18n.js             # motore di internazionalizzazione (registro + t())
│   ├── serial.js           # trasporto Web Serial, framer, classificatore,
│   │                       #   emulatore AT (modalità virtuale) e parser live
│   ├── data.js             # definizione di comandi rapidi, macro e wizard
│   └── app.js              # UI: connessione, sidebar, console, render dei wizard,
│                           #   pannelli ridimensionabili, tema, lingua
├── lang/
│   ├── en.js  es.js  pt.js  it.js  fr.js
│   └── de.js  ru.js  zh.js  ja.js  ko.js   # un file registerLang() per lingua
└── docs/                   # questo README in tutte le lingue
```

**Ordine di caricamento** (script classici, ambito globale, funzionano da `file://`):

```
i18n.js → lang/*.js → serial.js → data.js → app.js
```

---

## Architettura

**Internazionalizzazione (`i18n.js` + `lang/*.js`).** Ogni testo visibile è una **chiave**. Ogni lingua si registra con `registerLang(code, name, dict)` e la UI risolve con `t('chiave')`. Gli elementi con `data-i18n` sono tradotti automaticamente; i wizard usano `t()` al rendering e si ri-renderizzano al cambio lingua.

**Trasporto seriale (`serial.js`).** Avvolge la Web Serial API in un trasporto con *framer* (costruisce righe dallo stream) e un **classificatore** che distingue risposte finali (`OK`/`ERROR`), dati e **URC** non sollecitati. Un *VirtualPort* espone la stessa interfaccia ma collega l'**emulatore AT** al posto della porta fisica.

**Emulatore AT (modalità virtuale).** Mantiene lo stato (SIM, rete, dati, certificati, GPIO, GNSS, jamming, SMTP, rubrica, chiamate…) e risponde a ogni comando come il firmware reale, inclusi prompt (`>`), conferma per lunghezza in byte (certificati, email) ed emissione temporizzata di URC (NMEA, jamming, esito chiamata).

**Sistema di assistenti (`data.js` + `app.js`).** Ogni gruppo di comandi rapidi può dichiarare `wiz:'id'`. Aprendolo si monta il pannello centrale e si esegue la sua funzione `render(host)` (o un form generico). Meccanismi chiave:

- `UI.sendCollect(cmd, {timeout})` → promise che raccoglie righe fino a `OK`/`ERROR`.
- `UI.tap` → osservatore di righe (per URC live, es. NMEA, `+SJDR:`, `RING`).
- `wizCleanup` → *teardown* dell'assistente attivo (ferma timer/tap) alla chiusura o al cambio lingua.

---

## Estendere la console

**Aggiungere un comando rapido.** In `js/data.js`, nel gruppo corrispondente di `QUICK`, aggiungi una voce `['chiaveI18n', "AT+COMANDO"]` (con `1` finale se richiede parametri). Aggiungi la chiave di testo a tutti i 10 file di `lang/`.

**Aggiungere una lingua.** Crea `lang/xx.js` che chiama `registerLang('xx', 'Nome', { ...tutte le chiavi... })`. Deve coprire lo stesso set di chiavi di `en.js`.

**Aggiungere un assistente.** In `data.js`: imposta `wiz:'mioId'` sul gruppo e registra `{ id:'mioId', title:'...', render: (host) => renderMioId(host) }`. In `app.js`: scrivi `renderMioId(host)` usando `UI.sendCollect`, `t()` e (se serve) `UI.tap`/`wizCleanup`. Per la modalità virtuale, aggiungi gli handler del comando all'emulatore in `serial.js`.

> Consigliato alla modifica: validare la sintassi (concatenare tutto il JS e `node --check`), verificare la coerenza delle chiavi i18n tra le 10 lingue, controllare che le graffe del CSS siano bilanciate, ed eseguire i test della libreria.

---

## Libreria companion: `simcom-at-parser`

Il repo include anche **`simcom-at-parser`** (v0.1.0), una libreria **Node.js** (ESM, async) che effettua il parsing delle risposte AT dei moduli SIMCom A76xx/A7672SA: trasporto, *framer*, classificatore, *modem*, parser e livelli di servizio (TCP, HTTP(S), MQTT(S), FTP(S), TLS, GNSS, SMS, FOTA…), con un emulatore per i test.

```bash
npm test          # ~80 test
npm run example   # esempio base
```

- **Node** ≥ 18.
- L'emulatore AT della console web condivide lo stesso spirito di quello della libreria.

---

## Note su hardware reale

Alcuni comportamenti dipendono dal modulo e dalla SIM/rete; tienine conto passando dalla modalità virtuale all'hardware:

- **GNSS**: le trame `GSV` possono uscire da una porta NMEA separata dalla porta AT, a seconda del firmware.
- **LBS / NETOPEN**: richiedono SIM registrata, contesto PDP/APN valido e rete disponibile.
- **ADC** (`CADC?`): il valore grezzo non è volt; va scalato.
- **Baud / CMUX / CFUN-reset**: cambiano o interrompono la sessione seriale; dovrai riconnetterti.
- **TLS** (`CCERTDOWN`): la lunghezza dichiarata deve corrispondere **esattamente** ai byte del PEM inviati.
- **Jamming**: `mnl` (min RxLev) vale solo per GSM; per report periodici via URC imposta `period > 0` e `detecstat = 1`.
- **Email**: richiede sessione dati attiva (APN/PDP); per SMTPS carica il certificato CA corretto e configura il contesto SSL (nel menu **TLS/Cert**). Molti provider (Gmail) richiedono una **password per app**.
- **Chiamate vocali**: richiedono supporto/codec voce abilitato; diverse varianti A76xx sono *data-only* e rifiutano `ATD;`. L'ID del chiamante in arrivo appare solo se la rete lo fornisce e `CLIP=1` è attivo.

---

## Compatibilità browser

| Browser | Web Serial | Stato |
|---------|:----------:|-------|
| Chrome (desktop)  | ✅ | Supportato |
| Edge (desktop)    | ✅ | Supportato |
| Opera (desktop)   | ✅ | Supportato |
| Firefox           | ❌ | Niente Web Serial |
| Safari            | ❌ | Niente Web Serial |
| Browser mobili    | ❌ | Niente Web Serial |

---

## Limitazioni note

- L'anteprima in chat non carica le risorse esterne: usa l'`index.html` locale.
- Web Serial richiede un contesto sicuro (`https://`, `localhost` o `file://`).
- Lo strumento è di **diagnostica/sviluppo**; vari comandi modificano lo stato del modulo (rete, certificati, NVRAM, baud). Usalo con criterio su hardware di produzione.

---

## Licenza

Definisci qui la licenza del progetto (es. MIT) e aggiungi il file `LICENSE` corrispondente.

---

*Realizzata per lavorare con moduli SIMCom A76xx / A7672SA. "AT", i nomi dei comandi e i marchi citati appartengono ai rispettivi proprietari; questo progetto non è affiliato a SIMCom.*

---

[⬆ Torna al README radice](../README.md)
