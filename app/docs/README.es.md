# SIMCom Serial AT Console

> [English](README.en.md) · **Español** · [Português](README.pt.md) · [Italiano](README.it.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [中文](README.zh.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

Consola de comandos **AT** para módulos celulares **SIMCom** que corre enteramente en el navegador. Se conecta al módulo por puerto serie con la **Web Serial API**, sin instalar nada, y trae un **modo virtual** (emulador integrado) para probar todo sin hardware.

Pensada para la familia **A76xx / A7672SA**, con asistentes visuales (*wizards*) para las operaciones más comunes — red, datos, GNSS, SMS, email, agenda, llamadas de voz, TLS, sistema de archivos, hardware, jamming, y más — además de una consola cruda para mandar cualquier comando AT a mano.

> Referencia de comandos: *A76XX Series AT Command Manual* (V2.04).

---

## Tabla de contenidos

- [Características](#características)
- [Requisitos](#requisitos)
- [Inicio rápido](#inicio-rápido)
- [Modo virtual (sin hardware)](#modo-virtual-sin-hardware)
- [Conexión a un módulo real](#conexión-a-un-módulo-real)
- [La interfaz](#la-interfaz)
- [Asistentes (wizards)](#asistentes-wizards)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Arquitectura](#arquitectura)
- [Extender la consola](#extender-la-consola)
- [Librería companion: `simcom-at-parser`](#librería-companion-simcom-at-parser)
- [Notas de hardware real](#notas-de-hardware-real)
- [Compatibilidad de navegadores](#compatibilidad-de-navegadores)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Licencia](#licencia)

---

## Características

- **100% en el navegador**, sin backend ni dependencias. Se abre directamente el `index.html`.
- **Web Serial API** para hablar con el módulo por USB/UART.
- **Modo virtual**: un emulador AT integrado que responde a decenas de comandos (red, datos, GNSS, SMS, email, agenda, voz, TLS, FS, hardware, jamming…) para desarrollar y demostrar sin placa.
- **Consola cruda**: enviá cualquier comando AT, con historial, autoscroll, marca de tiempo y *echo* opcional.
- **Comandos rápidos** organizados por grupo en la barra lateral.
- **Asistentes visuales** para 20+ áreas funcionales, con formularios, indicadores en vivo, mapas, gráficos SVG y parseo de URC.
- **Macros** con pasos encadenados, retardos, envío de datos y caracteres de control (`Ctrl-Z`, `ESC`).
- **10 idiomas** (en, es, pt, it, fr, de, ru, zh, ja, ko).
- **Tema claro / oscuro**.
- **Paneles redimensionables** con el mouse (ancho y alto), doble-click para resetear, y modo **maximizado** del asistente.

---

## Requisitos

- Un navegador basado en **Chromium** con Web Serial API: **Chrome**, **Edge** u **Opera** (escritorio).
  - Firefox y Safari **no** soportan Web Serial actualmente.
- Para conectarse a hardware, el módulo debe exponer un **puerto serie** (USB-CDC o adaptador UART–USB) accesible por el sistema operativo.
- En Linux, el usuario suele necesitar permiso sobre el dispositivo (p. ej. pertenecer al grupo `dialout`).

No hace falta Node.js para usar la consola. Node solo se usa para la [librería companion](#librería-companion-simcom-at-parser) y sus tests.

---

## Inicio rápido

1. Descargá/cloná el proyecto.
2. Abrí **`index.html`** en Chrome o Edge.
   - Funciona abriéndolo como archivo local (`file://`) o servido desde un servidor estático.
   - Si preferís servirlo:
     ```bash
     # opción simple con Python
     python3 -m http.server 8080
     # luego abrí http://localhost:8080
     ```
3. Elegí idioma y tema arriba a la derecha.
4. Para probar sin hardware, activá **Virtual** (ver abajo). Para hardware real, configurá los parámetros serie y tocá **Connect**.

> ⚠️ La **vista previa embebida del chat no funciona** porque no carga los `css/`, `js/` y `lang/` externos. Hay que **descargar el ZIP y abrir `index.html` localmente**.

---

## Modo virtual (sin hardware)

Activá el toggle **Virtual** en la barra superior y tocá **Connect**. La consola conecta a un **emulador AT** que simula un módulo (por defecto un *A7672SA-FASE*) y responde a los comandos como lo haría el firmware real, incluyendo **URCs** asíncronos:

- Info de módulo, SIM, red y señal.
- Apertura/cierre de sesión de datos e IP.
- GNSS con tramas NMEA (`GSV`/`GGA`) para el Sky View y el mapa.
- SMS (bandeja precargada, envío con prompt `>`).
- Descarga de certificados por longitud de bytes (`CCERTDOWN`).
- Lecturas de hardware (batería, temperatura, ADC, GPIO).
- Detección de jamming con URC `+SJDR:` periódico.
- Email (SMTP) con el flujo completo de prompt para asunto/cuerpo.
- Agenda (contactos precargados, agregar/buscar/borrar) y llamadas de voz (marcar → activa, colgar).

Es la forma recomendada de explorar la herramienta y de hacer demos.

---

## Conexión a un módulo real

En la barra superior configurá los parámetros del puerto y tocá **Connect** (el navegador te pedirá elegir el dispositivo serie):

| Parámetro | Opciones |
|-----------|----------|
| **Baud**  | 9600 · 57600 · 115200 · 230400 · 460800 · 921600 |
| **Data**  | 8 · 7 |
| **Stop**  | 1 · 2 |
| **Parity**| None · Even · Odd |
| **EOL**   | CR · CRLF · LF (terminador que se agrega a cada comando) |

La barra de **estado** muestra el enlace (online/offline), el puerto, la señal, el registro de red y el operador.

> Cambiar el **baud** del módulo (asistente UART → `AT+IPR`) rompe el enlace serie actual: vas a tener que reconectar a la nueva velocidad.

---

## La interfaz

La pantalla se divide en tres zonas, todas **redimensionables**:

```
┌──────────┬───────────────────┬───────────────────────────┐
│ Sidebar  │  Asistente (wiz)  │  Consola AT                │
│ (grupos) │  (panel del menú) │  (log + entrada de cmd)    │
└──────────┴───────────────────┴───────────────────────────┘
```

- **Barra superior**: parámetros serie, idioma, tema, toggle Virtual y botón Connect.
- **Sidebar**: comandos rápidos agrupados. Cada grupo con ícono ⚙ abre su **asistente**.
- **Asistente**: panel central que se abre con el menú elegido. Tiene botón **maximizar** (⛶) y **cerrar** (✕).
- **Consola**: log de la sesión (con toggles **TIME**, **SHOW ECHO**, **AUTO-SCROLL**), entrada de comandos AT y envío de **macros**.

### Paneles redimensionables

- Arrastrá el **divisor sidebar │ asistente** para cambiar el ancho de la barra lateral.
- Arrastrá el **divisor asistente │ consola** para cambiar el ancho del asistente (o el **alto**, cuando la pantalla es angosta y los paneles se apilan).
- **Doble-click** en cualquier divisor resetea ese panel a su tamaño por defecto.
- **Maximizar** un asistente lo expande sobre el ancho del panel + consola (consola abajo, arranca en proporción **60/40**); los divisores siguen funcionando.

### Macros y caracteres de control

Las macros encadenan varios comandos. Soportan:

| Token | Acción |
|-------|--------|
| `@delay` | espera (retardo configurable entre pasos) |
| `>data`  | envía `data` tras un prompt `>` |
| `^Z`     | `Ctrl-Z` (fin de SMS / payload) |
| `^[`     | `ESC` (cancelar) |

Cada asistente también ofrece un toggle **"cargar al editor en vez de ejecutar"**, útil para revisar el comando antes de mandarlo.

---

## Asistentes (wizards)

Cada grupo de la barra lateral puede abrir un asistente. Los cuatro de protocolo (TCP/UDP, HTTP, FTP, MQTT) usan un formulario genérico; el resto son paneles a medida.

| Asistente | Qué hace | Comandos AT principales |
|-----------|----------|--------------------------|
| **Basics** | Info de módulo (modelo, revisión, IMEI, SIM, señal), echo, nivel de errores `CMEE`, y **Power/CFUN** (Full/Min/RF off/Reset). | `SIMCOMATI`, `CPIN?`, `CSQ`, `ATE`, `CMEE`, `CFUN` |
| **SIM** | ICCID/IMSI/SPN, desbloqueo de PIN, lock y cambio de PIN. | `CICCID`, `CIMI`, `CSPN?`, `CPIN`, `CLCK`, `CPWD` |
| **Network / signal** | Operador, señal (dBm), registro, tecnología y attach PS. Selector de **modo de red** con lectura y consulta de modos soportados. | `COPS?`, `CSQ`, `CEREG?`, `CGATT?`, `CNMP` |
| **Data** | Estado de la sesión de datos e IP, abrir/cerrar sesión, y APN (leer/fijar). | `NETOPEN?`, `IPADDR`, `NETCLOSE`, `CGDCONT`, `CGATT?` |
| **TCP / UDP / Ping** | Formulario para sockets y ping. | `CIPOPEN`, `CIPSEND`, `CPING`, … |
| **HTTP** | Formulario de peticiones HTTP(S). | `HTTPINIT`, `HTTPPARA`, `HTTPACTION`, … |
| **FTP** | Formulario de transferencias FTP(S). | `CFTPSxxx` … |
| **MQTT** | Formulario de conexión y publicación MQTT(S). | `CMQTTxxx` … |
| **File System** | Navegador de archivos del módulo (listar, entrar, borrar). | `CFSGFRS`, `CFSWFILE`, `CFSDFILE`, … |
| **GNSS** | Encendido/modo, arranque Cold/Warm/Hot, fix (lat/lon/alt/HDOP/UTC), mapa OSM, **Sky View** polar SVG y barras de señal de satélites (NMEA `GSV`). | `CGNSSPWR`, `CGPSCOLD/WARM/HOT`, `CGNSSINFO`, `CGNSSTST` |
| **LBS** | Localización por estación base + mapa. | `CLBS` |
| **SMS** | Redactar/enviar (prompt `>` + `Ctrl-Z`), bandeja parseada y borrado. | `CMGS`, `CMGL`, `CMGD` |
| **TLS / Cert** | Listar/borrar certificados, **descargar PEM** (`CCERTDOWN` por longitud de bytes) y configurar el contexto SSL (versión, authmode, CA). | `CCERTLIST`, `CCERTDOWN`, `CCERTDELE`, `CSSLCFG` |
| **Time / diag** | Reloj manual (calendario + zona horaria), zona horaria automática, NTP y resolución DNS. | `CCLK`, `CTZU`, `CNTP`, `CDNSGIP` |
| **Serial / UART** | Baud, framing (`ICF`, p. ej. 8N1=`2,2`), control de flujo, sleep y CMUX, con lecturas de estado. | `IPR`, `ICF`, `IFC`, `CSCLK`, `CMUX` |
| **Hardware** | Batería, temperatura y ADC con gráficos SVG; GPIO (IN/OUT, LOW/HIGH) y alarma de tensión con slider de doble perilla. | `CBC`, `CPMUTEMP`, `CADC`, `CGDRT`, `CGSETV`, `CGGETV`, `CVALARM` |
| **Wi-Fi scan** | Escaneo de APs (BSSID, canal, señal). | `CWSTASCAN` |
| **Jamming** | Habilitar detección, indicador en vivo por URC (`+SJDR:`), y configuración (período, min RxLev, min canales, URC al cambiar). | `SJDR`, `SJDCFG` |
| **Email** | SMTP(S): servidor, autenticación, redacción (De/Para/Asunto/Cuerpo) y **envío** con URC de resultado. Solo envío SMTP (sin POP3/IMAP). | `CSMTPSSRV`, `CSMTPSAUTH`, `CSMTPSFROM`, `CSMTPSRCPT`, `CSMTPSSUB`, `CSMTPSBODY`, `CSMTPSSEND` |
| **Agenda** | Almacenamiento (SM/ME/DC/RC/MC/FD) con usado/total, listar/agregar/borrar contactos, buscar y número propio. | `CPBS`, `CPBR`, `CPBW`, `CPBF`, `CNUM` |
| **Llamadas de voz** | Estado de llamada en vivo (inactivo/marcando/entrante/en llamada), marcar/atender/colgar, teclado DTMF y toggle de ID de llamada. | `ATD`, `ATA`, `CHUP`, `CLCC`, `CLIP`, `VTS` |

---

## Estructura del proyecto

```
.
├── index.html              # única página (carga css/, js/ y lang/)
├── css/
│   ├── styles.css          # estilos y layout (paneles redimensionables y scrollbars)
│   ├── theme-dark.css      # variables del tema oscuro
│   └── theme-light.css     # variables del tema claro
├── js/
│   ├── i18n.js             # motor de internacionalización (registro + t())
│   ├── serial.js           # transporte Web Serial, framer, clasificador,
│   │                       #   emulador AT (modo virtual) y parsers en vivo
│   ├── data.js             # definición de comandos rápidos, macros y wizards
│   └── app.js              # UI: conexión, sidebar, consola, render de los wizards,
│                           #   paneles redimensionables, tema, idioma
├── lang/
│   ├── en.js  es.js  pt.js  it.js  fr.js
│   └── de.js  ru.js  zh.js  ja.js  ko.js   # un archivo registerLang() por idioma
└── docs/                   # este README en todos los idiomas
```

**Orden de carga** (scripts clásicos, ámbito global, funcionan desde `file://`):

```
i18n.js → lang/*.js → serial.js → data.js → app.js
```

---

## Arquitectura

**Internacionalización (`i18n.js` + `lang/*.js`).** Todo texto visible es una **clave**. Cada idioma se registra con `registerLang(code, name, dict)` y la UI resuelve con `t('clave')`. Los elementos con `data-i18n` se traducen automáticamente; los wizards usan `t()` al renderizar y se re-renderizan al cambiar de idioma.

**Transporte serie (`serial.js`).** Envuelve la Web Serial API en un transporte con *framer* (arma líneas a partir del stream) y un **clasificador** que distingue respuestas finales (`OK`/`ERROR`), datos y **URCs** no solicitados. Un *VirtualPort* expone la misma interfaz pero enchufa el **emulador AT** en lugar del puerto físico.

**Emulador AT (modo virtual).** Mantiene estado (SIM, red, datos, certificados, GPIO, GNSS, jamming, SMTP, agenda, llamadas…) y responde a cada comando como el firmware real, incluyendo prompts (`>`), acuse por longitud de bytes (certificados, email) y emisión temporizada de URCs (NMEA, jamming, resultado de llamada).

**Sistema de asistentes (`data.js` + `app.js`).** Cada grupo de comandos rápidos puede declarar `wiz:'id'`. Al abrirlo se monta el panel central y se ejecuta su función `render(host)` (o un formulario genérico). Mecanismos clave:

- `UI.sendCollect(cmd, {timeout})` → promesa que junta líneas hasta `OK`/`ERROR`.
- `UI.tap` → observador de líneas (para URCs en vivo, p. ej. NMEA, `+SJDR:`, `RING`).
- `wizCleanup` → *teardown* del asistente activo (frena timers/taps) al cerrar o cambiar de idioma.

---

## Extender la consola

**Agregar un comando rápido.** En `js/data.js`, dentro del grupo correspondiente de `QUICK`, sumá una entrada `['claveI18n', "AT+COMANDO"]` (con `1` al final si requiere parámetros). Agregá la clave de texto a los 10 archivos de `lang/`.

**Agregar un idioma.** Creá `lang/xx.js` que llame a `registerLang('xx', 'Nombre', { ...todas las claves... })`. Tiene que cubrir el mismo conjunto de claves que `en.js`.

**Agregar un asistente.** En `data.js`: poné `wiz:'miId'` en el grupo y registrá `{ id:'miId', title:'...', render: (host) => renderMiId(host) }`. En `app.js`: escribí `renderMiId(host)` usando `UI.sendCollect`, `t()` y (si hace falta) `UI.tap`/`wizCleanup`. Para el modo virtual, agregá los handlers del comando en el emulador de `serial.js`.

> Recomendado al modificar: validar sintaxis (concatenar todos los JS y `node --check`), verificar consistencia de claves i18n entre los 10 idiomas, comprobar que el CSS tenga llaves balanceadas, y correr los tests de la librería.

---

## Librería companion: `simcom-at-parser`

El repo incluye además **`simcom-at-parser`** (v0.1.0), una librería **Node.js** (ESM, async) que parsea respuestas AT de módulos SIMCom A76xx/A7672SA: transporte, *framer*, clasificador, *modem*, parsers y capas de servicio (TCP, HTTP(S), MQTT(S), FTP(S), TLS, GNSS, SMS, FOTA…), con un emulador para tests.

```bash
npm test          # ~80 tests
npm run example   # ejemplo básico
```

- **Node** ≥ 18.
- El emulador AT de la consola web comparte el mismo espíritu que el de la librería.

---

## Notas de hardware real

Algunos comportamientos dependen del módulo y de la SIM/red; tenelos en cuenta al pasar del modo virtual al hardware:

- **GNSS**: las tramas `GSV` pueden salir por un puerto NMEA separado del puerto AT, según el firmware.
- **LBS / NETOPEN**: requieren SIM registrada, contexto PDP/APN válido y red disponible.
- **ADC** (`CADC?`): el valor crudo no es voltios; hay que escalarlo.
- **Baud / CMUX / CFUN-reset**: cambian o cortan la sesión serie; vas a tener que reconectar.
- **TLS** (`CCERTDOWN`): la longitud declarada debe coincidir **exactamente** con los bytes del PEM enviados.
- **Jamming**: `mnl` (min RxLev) aplica solo a GSM; para reportes periódicos por URC poné `period > 0` y `detecstat = 1`.
- **Email**: requiere sesión de datos activa (APN/PDP); para SMTPS, cargá el certificado CA correcto y configurá el contexto SSL (en el menú **TLS/Cert**). Muchos proveedores (Gmail) exigen **contraseña de aplicación**.
- **Llamadas de voz**: requieren soporte/codec de voz habilitado; varias variantes A76xx son *data-only* y rechazan `ATD;`. El ID de llamada entrante solo aparece si la red lo entrega y `CLIP=1` está activo.

---

## Compatibilidad de navegadores

| Navegador | Web Serial | Estado |
|-----------|:----------:|--------|
| Chrome (escritorio)  | ✅ | Soportado |
| Edge (escritorio)    | ✅ | Soportado |
| Opera (escritorio)   | ✅ | Soportado |
| Firefox              | ❌ | Sin Web Serial |
| Safari               | ❌ | Sin Web Serial |
| Navegadores móviles  | ❌ | Sin Web Serial |

---

## Limitaciones conocidas

- La vista previa dentro del chat no carga los recursos externos: usá el `index.html` local.
- Web Serial necesita un contexto seguro (`https://`, `localhost` o `file://`).
- La herramienta es de **diagnóstico/desarrollo**; varios comandos modifican el estado del módulo (red, certificados, NVRAM, baud). Usala con criterio sobre hardware en producción.

---

## Licencia

Definí la licencia del proyecto aquí (p. ej. MIT) y agregá el archivo `LICENSE` correspondiente.

---

*Hecho para trabajar con módulos SIMCom A76xx / A7672SA. "AT", los nombres de comandos y las marcas mencionadas pertenecen a sus respectivos dueños; este proyecto no está afiliado a SIMCom.*

---

[⬆ Volver al README raíz](../README.md)
