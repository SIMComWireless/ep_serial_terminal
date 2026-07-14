# SIMCom Serial AT Console

> [English](README.en.md) · [Español](README.es.md) · **Português** · [Italiano](README.it.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [中文](README.zh.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

Console de comandos **AT** para módulos celulares **SIMCom** que roda inteiramente no navegador. Conecta-se ao módulo pela porta serial com a **Web Serial API**, sem instalar nada, e traz um **modo virtual** (emulador integrado) para testar tudo sem hardware.

Pensado para a família **A76xx / A7672SA**, com assistentes visuais (*wizards*) para as operações mais comuns — rede, dados, GNSS, SMS, e-mail, agenda, chamadas de voz, TLS, sistema de arquivos, hardware, jamming e mais — além de um console bruto para enviar qualquer comando AT manualmente.

> Referência de comandos: *A76XX Series AT Command Manual* (V2.04).

---

## Índice

- [Recursos](#recursos)
- [Requisitos](#requisitos)
- [Início rápido](#início-rápido)
- [Modo virtual (sem hardware)](#modo-virtual-sem-hardware)
- [Conexão a um módulo real](#conexão-a-um-módulo-real)
- [A interface](#a-interface)
- [Assistentes (wizards)](#assistentes-wizards)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Arquitetura](#arquitetura)
- [Estender o console](#estender-o-console)
- [Biblioteca companion: `simcom-at-parser`](#biblioteca-companion-simcom-at-parser)
- [Notas de hardware real](#notas-de-hardware-real)
- [Compatibilidade de navegadores](#compatibilidade-de-navegadores)
- [Limitações conhecidas](#limitações-conhecidas)
- [Licença](#licença)

---

## Recursos

- **100% no navegador**, sem backend nem dependências. Basta abrir o `index.html`.
- **Web Serial API** para falar com o módulo por USB/UART.
- **Modo virtual**: um emulador AT integrado que responde a dezenas de comandos (rede, dados, GNSS, SMS, e-mail, agenda, voz, TLS, FS, hardware, jamming…) para desenvolver e demonstrar sem placa.
- **Console bruto**: envie qualquer comando AT, com histórico, autoscroll, marca de tempo e *echo* opcional.
- **Comandos rápidos** organizados por grupo na barra lateral.
- **Assistentes visuais** para mais de 20 áreas funcionais, com formulários, indicadores ao vivo, mapas, gráficos SVG e parsing de URC.
- **Macros** com passos encadeados, atrasos, envio de dados e caracteres de controle (`Ctrl-Z`, `ESC`).
- **10 idiomas** (en, es, pt, it, fr, de, ru, zh, ja, ko).
- **Tema claro / escuro**.
- **Painéis redimensionáveis** com o mouse (largura e altura), duplo-clique para resetar, e modo **maximizado** do assistente.

---

## Requisitos

- Um navegador baseado em **Chromium** com Web Serial API: **Chrome**, **Edge** ou **Opera** (desktop).
  - Firefox e Safari **não** suportam Web Serial atualmente.
- Para conectar a hardware, o módulo deve expor uma **porta serial** (USB-CDC ou adaptador UART–USB) acessível pelo sistema operacional.
- No Linux, geralmente é preciso permissão sobre o dispositivo (p. ex. pertencer ao grupo `dialout`).

Não é preciso Node.js para usar o console. O Node só é usado para a [biblioteca companion](#biblioteca-companion-simcom-at-parser) e seus testes.

---

## Início rápido

1. Baixe/clone o projeto.
2. Abra **`index.html`** no Chrome ou Edge.
   - Funciona aberto como arquivo local (`file://`) ou servido por um servidor estático.
   - Se preferir servi-lo:
     ```bash
     # opção simples com Python
     python3 -m http.server 8080
     # depois abra http://localhost:8080
     ```
3. Escolha idioma e tema no canto superior direito.
4. Para testar sem hardware, ative **Virtual** (veja abaixo). Para hardware real, configure os parâmetros seriais e clique em **Connect**.

> ⚠️ A **prévia embutida do chat não funciona** porque não carrega os `css/`, `js/` e `lang/` externos. É preciso **baixar o ZIP e abrir `index.html` localmente**.

---

## Modo virtual (sem hardware)

Ative o toggle **Virtual** na barra superior e clique em **Connect**. O console conecta a um **emulador AT** que simula um módulo (um *A7672SA-FASE* por padrão) e responde aos comandos como o firmware real, incluindo **URCs** assíncronos:

- Info de módulo, SIM, rede e sinal.
- Abertura/fechamento de sessão de dados e IP.
- GNSS com tramas NMEA (`GSV`/`GGA`) para o Sky View e o mapa.
- SMS (caixa pré-carregada, envio com prompt `>`).
- Download de certificados por comprimento de bytes (`CCERTDOWN`).
- Leituras de hardware (bateria, temperatura, ADC, GPIO).
- Detecção de jamming com URC `+SJDR:` periódico.
- E-mail (SMTP) com o fluxo completo de prompt para assunto/corpo.
- Agenda (contatos pré-carregados, adicionar/buscar/excluir) e chamadas de voz (discar → ativa, desligar).

É a forma recomendada de explorar a ferramenta e fazer demos.

---

## Conexão a um módulo real

Na barra superior configure os parâmetros da porta e clique em **Connect** (o navegador pedirá para escolher o dispositivo serial):

| Parâmetro | Opções |
|-----------|--------|
| **Baud**  | 9600 · 57600 · 115200 · 230400 · 460800 · 921600 |
| **Data**  | 8 · 7 |
| **Stop**  | 1 · 2 |
| **Parity**| None · Even · Odd |
| **EOL**   | CR · CRLF · LF (terminador adicionado a cada comando) |

A barra de **status** mostra o link (online/offline), a porta, o sinal, o registro de rede e a operadora.

> Mudar o **baud** do módulo (assistente UART → `AT+IPR`) quebra o link serial atual: você terá que reconectar na nova velocidade.

---

## A interface

A tela divide-se em três zonas, todas **redimensionáveis**:

```
┌──────────┬───────────────────┬───────────────────────────┐
│ Sidebar  │  Assistente (wiz) │  Console AT                │
│ (grupos) │  (painel do menu) │  (log + entrada de cmd)    │
└──────────┴───────────────────┴───────────────────────────┘
```

- **Barra superior**: parâmetros seriais, idioma, tema, toggle Virtual e botão Connect.
- **Sidebar**: comandos rápidos agrupados. Cada grupo com ícone ⚙ abre seu **assistente**.
- **Assistente**: painel central que abre com o menu escolhido. Tem botão **maximizar** (⛶) e **fechar** (✕).
- **Console**: log da sessão (com toggles **TIME**, **SHOW ECHO**, **AUTO-SCROLL**), entrada de comandos AT e envio de **macros**.

### Painéis redimensionáveis

- Arraste o **divisor sidebar │ assistente** para mudar a largura da barra lateral.
- Arraste o **divisor assistente │ console** para mudar a largura do assistente (ou a **altura**, quando a tela é estreita e os painéis se empilham).
- **Duplo-clique** em qualquer divisor reseta aquele painel ao tamanho padrão.
- **Maximizar** um assistente o expande sobre a largura do painel + console (console embaixo, começa na proporção **60/40**); os divisores continuam funcionando.

### Macros e caracteres de controle

As macros encadeiam vários comandos. Suportam:

| Token | Ação |
|-------|------|
| `@delay` | espera (atraso configurável entre passos) |
| `>data`  | envia `data` após um prompt `>` |
| `^Z`     | `Ctrl-Z` (fim de SMS / payload) |
| `^[`     | `ESC` (cancelar) |

Cada assistente também oferece um toggle **"carregar no editor em vez de executar"**, útil para revisar o comando antes de enviar.

---

## Assistentes (wizards)

Cada grupo da barra lateral pode abrir um assistente. Os quatro de protocolo (TCP/UDP, HTTP, FTP, MQTT) usam um formulário genérico; o resto são painéis sob medida.

| Assistente | O que faz | Comandos AT principais |
|------------|-----------|-------------------------|
| **Basics** | Info de módulo (modelo, revisão, IMEI, SIM, sinal), echo, nível de erros `CMEE`, e **Power/CFUN** (Full/Min/RF off/Reset). | `SIMCOMATI`, `CPIN?`, `CSQ`, `ATE`, `CMEE`, `CFUN` |
| **SIM** | ICCID/IMSI/SPN, desbloqueio de PIN, lock e troca de PIN. | `CICCID`, `CIMI`, `CSPN?`, `CPIN`, `CLCK`, `CPWD` |
| **Network / signal** | Operadora, sinal (dBm), registro, tecnologia e attach PS. Seletor de **modo de rede** com leitura e consulta de modos suportados. | `COPS?`, `CSQ`, `CEREG?`, `CGATT?`, `CNMP` |
| **Data** | Estado da sessão de dados e IP, abrir/fechar sessão, e APN (ler/definir). | `NETOPEN?`, `IPADDR`, `NETCLOSE`, `CGDCONT`, `CGATT?` |
| **TCP / UDP / Ping** | Formulário para sockets e ping. | `CIPOPEN`, `CIPSEND`, `CPING`, … |
| **HTTP** | Formulário de requisições HTTP(S). | `HTTPINIT`, `HTTPPARA`, `HTTPACTION`, … |
| **FTP** | Formulário de transferências FTP(S). | `CFTPSxxx` … |
| **MQTT** | Formulário de conexão e publicação MQTT(S). | `CMQTTxxx` … |
| **File System** | Navegador de arquivos do módulo (listar, entrar, excluir). | `CFSGFRS`, `CFSWFILE`, `CFSDFILE`, … |
| **GNSS** | Ligar/modo, partida Cold/Warm/Hot, fix (lat/lon/alt/HDOP/UTC), mapa OSM, **Sky View** polar SVG e barras de sinal de satélites (NMEA `GSV`). | `CGNSSPWR`, `CGPSCOLD/WARM/HOT`, `CGNSSINFO`, `CGNSSTST` |
| **LBS** | Localização por estação base + mapa. | `CLBS` |
| **SMS** | Compor/enviar (prompt `>` + `Ctrl-Z`), caixa de entrada parseada e exclusão. | `CMGS`, `CMGL`, `CMGD` |
| **TLS / Cert** | Listar/excluir certificados, **baixar PEM** (`CCERTDOWN` por comprimento de bytes) e configurar o contexto SSL (versão, authmode, CA). | `CCERTLIST`, `CCERTDOWN`, `CCERTDELE`, `CSSLCFG` |
| **Time / diag** | Relógio manual (calendário + fuso horário), fuso automático, NTP e resolução DNS. | `CCLK`, `CTZU`, `CNTP`, `CDNSGIP` |
| **Serial / UART** | Baud, framing (`ICF`, p. ex. 8N1=`2,2`), controle de fluxo, sleep e CMUX, com leituras de estado. | `IPR`, `ICF`, `IFC`, `CSCLK`, `CMUX` |
| **Hardware** | Bateria, temperatura e ADC com gráficos SVG; GPIO (IN/OUT, LOW/HIGH) e alarme de tensão com slider de duplo botão. | `CBC`, `CPMUTEMP`, `CADC`, `CGDRT`, `CGSETV`, `CGGETV`, `CVALARM` |
| **Wi-Fi scan** | Varredura de APs (BSSID, canal, sinal). | `CWSTASCAN` |
| **Jamming** | Habilitar detecção, indicador ao vivo por URC (`+SJDR:`), e configuração (período, min RxLev, min canais, URC ao mudar). | `SJDR`, `SJDCFG` |
| **Email** | SMTP(S): servidor, autenticação, composição (De/Para/Assunto/Corpo) e **envio** com URC de resultado. Apenas envio SMTP (sem POP3/IMAP). | `CSMTPSSRV`, `CSMTPSAUTH`, `CSMTPSFROM`, `CSMTPSRCPT`, `CSMTPSSUB`, `CSMTPSBODY`, `CSMTPSSEND` |
| **Agenda** | Armazenamento (SM/ME/DC/RC/MC/FD) com usado/total, listar/adicionar/excluir contatos, buscar e número próprio. | `CPBS`, `CPBR`, `CPBW`, `CPBF`, `CNUM` |
| **Chamadas de voz** | Estado da chamada ao vivo (inativo/discando/recebendo/em chamada), discar/atender/desligar, teclado DTMF e toggle de ID de chamada. | `ATD`, `ATA`, `CHUP`, `CLCC`, `CLIP`, `VTS` |

---

## Estrutura do projeto

```
.
├── index.html              # página única (carrega css/, js/ e lang/)
├── css/
│   ├── styles.css          # estilos e layout (painéis redimensionáveis e scrollbars)
│   ├── theme-dark.css      # variáveis do tema escuro
│   └── theme-light.css     # variáveis do tema claro
├── js/
│   ├── i18n.js             # motor de internacionalização (registro + t())
│   ├── serial.js           # transporte Web Serial, framer, classificador,
│   │                       #   emulador AT (modo virtual) e parsers ao vivo
│   ├── data.js             # definição de comandos rápidos, macros e wizards
│   └── app.js              # UI: conexão, sidebar, console, render dos wizards,
│                           #   painéis redimensionáveis, tema, idioma
├── lang/
│   ├── en.js  es.js  pt.js  it.js  fr.js
│   └── de.js  ru.js  zh.js  ja.js  ko.js   # um arquivo registerLang() por idioma
└── docs/                   # este README em todos os idiomas
```

**Ordem de carga** (scripts clássicos, escopo global, funcionam a partir de `file://`):

```
i18n.js → lang/*.js → serial.js → data.js → app.js
```

---

## Arquitetura

**Internacionalização (`i18n.js` + `lang/*.js`).** Todo texto visível é uma **chave**. Cada idioma é registrado com `registerLang(code, name, dict)` e a UI resolve com `t('chave')`. Elementos com `data-i18n` são traduzidos automaticamente; os wizards usam `t()` ao renderizar e re-renderizam ao trocar de idioma.

**Transporte serial (`serial.js`).** Envolve a Web Serial API num transporte com *framer* (monta linhas a partir do stream) e um **classificador** que distingue respostas finais (`OK`/`ERROR`), dados e **URCs** não solicitados. Um *VirtualPort* expõe a mesma interface mas pluga o **emulador AT** no lugar da porta física.

**Emulador AT (modo virtual).** Mantém estado (SIM, rede, dados, certificados, GPIO, GNSS, jamming, SMTP, agenda, chamadas…) e responde a cada comando como o firmware real, incluindo prompts (`>`), confirmação por comprimento de bytes (certificados, e-mail) e emissão temporizada de URCs (NMEA, jamming, resultado de chamada).

**Sistema de assistentes (`data.js` + `app.js`).** Cada grupo de comandos rápidos pode declarar `wiz:'id'`. Ao abri-lo monta-se o painel central e executa-se sua função `render(host)` (ou um formulário genérico). Mecanismos-chave:

- `UI.sendCollect(cmd, {timeout})` → promessa que junta linhas até `OK`/`ERROR`.
- `UI.tap` → observador de linhas (para URCs ao vivo, p. ex. NMEA, `+SJDR:`, `RING`).
- `wizCleanup` → *teardown* do assistente ativo (para timers/taps) ao fechar ou trocar de idioma.

---

## Estender o console

**Adicionar um comando rápido.** Em `js/data.js`, dentro do grupo correspondente de `QUICK`, adicione uma entrada `['chaveI18n', "AT+COMANDO"]` (com `1` no final se exigir parâmetros). Adicione a chave de texto aos 10 arquivos de `lang/`.

**Adicionar um idioma.** Crie `lang/xx.js` chamando `registerLang('xx', 'Nome', { ...todas as chaves... })`. Deve cobrir o mesmo conjunto de chaves que `en.js`.

**Adicionar um assistente.** Em `data.js`: defina `wiz:'meuId'` no grupo e registre `{ id:'meuId', title:'...', render: (host) => renderMeuId(host) }`. Em `app.js`: escreva `renderMeuId(host)` usando `UI.sendCollect`, `t()` e (se preciso) `UI.tap`/`wizCleanup`. Para o modo virtual, adicione os handlers do comando ao emulador em `serial.js`.

> Recomendado ao modificar: validar sintaxe (concatenar todo o JS e `node --check`), verificar consistência das chaves i18n entre os 10 idiomas, conferir se as chaves do CSS estão balanceadas, e rodar os testes da biblioteca.

---

## Biblioteca companion: `simcom-at-parser`

O repo inclui também **`simcom-at-parser`** (v0.1.0), uma biblioteca **Node.js** (ESM, async) que parseia respostas AT de módulos SIMCom A76xx/A7672SA: transporte, *framer*, classificador, *modem*, parsers e camadas de serviço (TCP, HTTP(S), MQTT(S), FTP(S), TLS, GNSS, SMS, FOTA…), com um emulador para testes.

```bash
npm test          # ~80 testes
npm run example   # exemplo básico
```

- **Node** ≥ 18.
- O emulador AT do console web compartilha o mesmo espírito que o da biblioteca.

---

## Notas de hardware real

Alguns comportamentos dependem do módulo e do SIM/rede; tenha-os em mente ao passar do modo virtual ao hardware:

- **GNSS**: as tramas `GSV` podem sair por uma porta NMEA separada da porta AT, conforme o firmware.
- **LBS / NETOPEN**: requerem SIM registrado, contexto PDP/APN válido e rede disponível.
- **ADC** (`CADC?`): o valor bruto não é volts; é preciso escalá-lo.
- **Baud / CMUX / CFUN-reset**: mudam ou derrubam a sessão serial; você terá que reconectar.
- **TLS** (`CCERTDOWN`): o comprimento declarado deve corresponder **exatamente** aos bytes do PEM enviados.
- **Jamming**: `mnl` (min RxLev) aplica-se só ao GSM; para relatórios periódicos por URC defina `period > 0` e `detecstat = 1`.
- **E-mail**: requer sessão de dados ativa (APN/PDP); para SMTPS, carregue o certificado CA correto e configure o contexto SSL (no menu **TLS/Cert**). Muitos provedores (Gmail) exigem **senha de aplicativo**.
- **Chamadas de voz**: requerem suporte/codec de voz habilitado; várias variantes A76xx são *data-only* e rejeitam `ATD;`. O ID de chamada recebida só aparece se a rede o entregar e `CLIP=1` estiver ativo.

---

## Compatibilidade de navegadores

| Navegador | Web Serial | Estado |
|-----------|:----------:|--------|
| Chrome (desktop)  | ✅ | Suportado |
| Edge (desktop)    | ✅ | Suportado |
| Opera (desktop)   | ✅ | Suportado |
| Firefox           | ❌ | Sem Web Serial |
| Safari            | ❌ | Sem Web Serial |
| Navegadores móveis| ❌ | Sem Web Serial |

---

## Limitações conhecidas

- A prévia dentro do chat não carrega os recursos externos: use o `index.html` local.
- Web Serial precisa de um contexto seguro (`https://`, `localhost` ou `file://`).
- A ferramenta é de **diagnóstico/desenvolvimento**; vários comandos modificam o estado do módulo (rede, certificados, NVRAM, baud). Use com critério em hardware de produção.

---

## Licença

Defina a licença do projeto aqui (p. ex. MIT) e adicione o arquivo `LICENSE` correspondente.

---

*Feito para trabalhar com módulos SIMCom A76xx / A7672SA. "AT", os nomes de comandos e as marcas mencionadas pertencem aos seus respectivos donos; este projeto não é afiliado à SIMCom.*

---

[⬆ Voltar ao README raiz](../README.md)
