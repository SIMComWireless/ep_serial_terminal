# SIMCom Serial AT Console

> [English](README.en.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [中文](README.zh.md) · [日本語](README.ja.md) · **한국어**

브라우저만으로 동작하는 **SIMCom** 셀룰러 모듈용 **AT 명령** 콘솔입니다. **Web Serial API**로 시리얼 포트를 통해 모듈과 통신하며(설치 불필요), 하드웨어 없이 전부 시험할 수 있는 **가상 모드**(내장 에뮬레이터)를 제공합니다.

**A76xx / A7672SA** 제품군을 위해 만들어졌으며, 가장 일반적인 작업——네트워크, 데이터, GNSS, SMS, 이메일, 전화번호부, 음성 통화, TLS, 파일 시스템, 하드웨어, 재밍 감지 등——을 위한 시각적 마법사(*wizards*)와, 임의의 AT 명령을 직접 보낼 수 있는 원시 콘솔을 갖추고 있습니다.

> 명령 참조: *A76XX Series AT Command Manual*(V2.04).

---

## 목차

- [기능](#기능)
- [요구 사항](#요구-사항)
- [빠른 시작](#빠른-시작)
- [가상 모드(하드웨어 없이)](#가상-모드하드웨어-없이)
- [실제 모듈에 연결](#실제-모듈에-연결)
- [인터페이스](#인터페이스)
- [마법사(wizards)](#마법사wizards)
- [프로젝트 구조](#프로젝트-구조)
- [아키텍처](#아키텍처)
- [콘솔 확장](#콘솔-확장)
- [컴패니언 라이브러리: `simcom-at-parser`](#컴패니언-라이브러리-simcom-at-parser)
- [실제 하드웨어 참고 사항](#실제-하드웨어-참고-사항)
- [브라우저 지원](#브라우저-지원)
- [알려진 제한](#알려진-제한)
- [라이선스](#라이선스)

---

## 기능

- **100% 브라우저 내**, 백엔드나 의존성 없음. `index.html`만 열면 됩니다.
- USB/UART로 모듈과 통신하는 **Web Serial API**.
- **가상 모드**: 수십 개 명령(네트워크, 데이터, GNSS, SMS, 이메일, 전화번호부, 음성, TLS, FS, 하드웨어, 재밍…)에 응답하는 내장 AT 에뮬레이터. 보드 없이 개발·시연 가능.
- **원시 콘솔**: 기록, 자동 스크롤, 타임스탬프, 선택적 에코와 함께 임의의 AT 명령 전송.
- 사이드바에 그룹별로 정리된 **빠른 명령**.
- 폼, 실시간 표시, 지도, SVG 차트, URC 파싱을 갖춘 20개 이상 기능 영역의 **시각적 마법사**.
- 연쇄 단계, 지연, 데이터 전송, 제어 문자(`Ctrl-Z`, `ESC`)를 지원하는 **매크로**.
- **10개 언어**(en, es, pt, it, fr, de, ru, zh, ja, ko).
- **라이트 / 다크 테마**.
- 마우스로 **크기 조절 가능한 패널**(너비와 높이), 더블 클릭 초기화, 마법사 **최대화** 모드.

---

## 요구 사항

- Web Serial API를 지원하는 **Chromium** 계열 브라우저: **Chrome**, **Edge**, **Opera**(데스크톱).
  - Firefox와 Safari는 현재 Web Serial을 **지원하지 않습니다**.
- 하드웨어에 연결하려면 모듈이 OS에서 보이는 **시리얼 포트**(USB-CDC 또는 UART–USB 어댑터)를 노출해야 합니다.
- Linux에서는 보통 장치 권한이 필요합니다(예: `dialout` 그룹 소속).

콘솔 사용에 Node.js는 필요 없습니다. Node는 [컴패니언 라이브러리](#컴패니언-라이브러리-simcom-at-parser)와 그 테스트에만 사용됩니다.

---

## 빠른 시작

1. 프로젝트를 다운로드/클론합니다.
2. Chrome 또는 Edge에서 **`index.html`**을 엽니다.
   - 로컬 파일(`file://`)로 열거나 정적 서버로 제공해도 동작합니다.
   - 서버로 제공하려면:
     ```bash
     # Python을 이용한 간단한 방법
     python3 -m http.server 8080
     # 그 다음 http://localhost:8080 열기
     ```
3. 오른쪽 위에서 언어와 테마를 선택합니다.
4. 하드웨어 없이 시험하려면 **Virtual**을 켭니다(아래 참조). 실제 하드웨어는 시리얼 파라미터를 설정하고 **Connect**를 클릭합니다.

> ⚠️ **채팅 내장 미리보기는 동작하지 않습니다**. 외부 `css/`, `js/`, `lang/`을 로드하지 않기 때문입니다. **ZIP을 받아 `index.html`을 로컬에서 열어야** 합니다.

---

## 가상 모드(하드웨어 없이)

상단 바의 **Virtual** 토글을 켜고 **Connect**를 클릭합니다. 콘솔이 모듈(기본 *A7672SA-FASE*)을 시뮬레이션하는 **AT 에뮬레이터**에 연결되어, 비동기 **URC**를 포함해 실제 펌웨어처럼 명령에 응답합니다:

- 모듈, SIM, 네트워크, 신호 정보.
- 데이터 세션 열기/닫기와 IP.
- Sky View와 지도를 위한 NMEA 프레임(`GSV`/`GGA`)이 포함된 GNSS.
- SMS(미리 로드된 수신함, `>` 프롬프트로 전송).
- 바이트 길이 기반 인증서 다운로드(`CCERTDOWN`).
- 하드웨어 판독(배터리, 온도, ADC, GPIO).
- 주기적 `+SJDR:` URC를 통한 재밍 감지.
- 이메일(SMTP), 제목/본문의 완전한 프롬프트 흐름 포함.
- 전화번호부(미리 로드된 항목, 추가/검색/삭제)와 음성 통화(발신 → 통화 중, 끊기).

도구를 둘러보고 시연하기에 권장되는 방법입니다.

---

## 실제 모듈에 연결

상단 바에서 포트 파라미터를 설정하고 **Connect**를 클릭합니다(브라우저가 시리얼 장치 선택을 요청합니다):

| 파라미터 | 옵션 |
|---------|------|
| **Baud**  | 9600 · 57600 · 115200 · 230400 · 460800 · 921600 |
| **Data**  | 8 · 7 |
| **Stop**  | 1 · 2 |
| **Parity**| None · Even · Odd |
| **EOL**   | CR · CRLF · LF(각 명령에 붙는 종단 문자) |

**상태** 바에는 링크(online/offline), 포트, 신호, 네트워크 등록, 사업자가 표시됩니다.

> 모듈의 **보드레이트**를 변경하면(UART 마법사 → `AT+IPR`) 현재 시리얼 링크가 끊깁니다: 새 속도로 다시 연결해야 합니다.

---

## 인터페이스

화면은 세 영역으로 나뉘며 모두 **크기 조절 가능**합니다:

```
┌──────────┬───────────────────┬───────────────────────────┐
│ 사이드바  │  마법사(wiz)       │  AT 콘솔                   │
│ （그룹）  │  （메뉴 패널）     │  （로그 + 명령 입력）      │
└──────────┴───────────────────┴───────────────────────────┘
```

- **상단 바**: 시리얼 파라미터, 언어, 테마, Virtual 토글, Connect 버튼.
- **사이드바**: 그룹화된 빠른 명령. ⚙ 아이콘이 있는 각 그룹은 해당 **마법사**를 엽니다.
- **마법사**: 선택한 메뉴로 열리는 중앙 패널. **최대화**(⛶)와 **닫기**(✕) 버튼이 있습니다.
- **콘솔**: 세션 로그(**TIME**, **SHOW ECHO**, **AUTO-SCROLL** 토글 포함), AT 명령 입력, **매크로** 전송.

### 크기 조절 가능한 패널

- **사이드바 │ 마법사** 구분선을 드래그하여 사이드바 너비를 바꿉니다.
- **마법사 │ 콘솔** 구분선을 드래그하여 마법사 너비를 바꿉니다(화면이 좁아 패널이 세로로 쌓일 때는 **높이**).
- 구분선을 **더블 클릭**하면 해당 패널이 기본 크기로 초기화됩니다.
- 마법사를 **최대화**하면 패널 + 콘솔 너비로 확장됩니다(콘솔은 아래, **60/40** 비율로 시작). 구분선은 계속 동작합니다.

### 매크로와 제어 문자

매크로는 여러 명령을 연결합니다. 지원:

| 토큰 | 동작 |
|------|------|
| `@delay` | 대기(단계 간 설정 가능한 지연) |
| `>data`  | `>` 프롬프트 후 `data` 전송 |
| `^Z`     | `Ctrl-Z`(SMS / 페이로드 종료) |
| `^[`     | `ESC`(취소) |

각 마법사에는 **"실행 대신 에디터로 불러오기"** 토글도 있어 전송 전에 명령을 검토할 수 있습니다.

---

## 마법사(wizards)

사이드바의 각 그룹은 마법사를 열 수 있습니다. 프로토콜 4종(TCP/UDP, HTTP, FTP, MQTT)은 범용 폼을 사용하고, 나머지는 맞춤 패널입니다.

| 마법사 | 기능 | 주요 AT 명령 |
|--------|------|---------------|
| **Basics** | 모듈 정보(모델, 리비전, IMEI, SIM, 신호), 에코, 오류 수준 `CMEE`, **Power/CFUN**(Full/Min/RF off/Reset). | `SIMCOMATI`, `CPIN?`, `CSQ`, `ATE`, `CMEE`, `CFUN` |
| **SIM** | ICCID/IMSI/SPN, PIN 잠금 해제, 잠금 및 PIN 변경. | `CICCID`, `CIMI`, `CSPN?`, `CPIN`, `CLCK`, `CPWD` |
| **Network / signal** | 사업자, 신호(dBm), 등록, 기술, PS attach. **네트워크 모드** 선택(읽기 및 지원 모드 조회 포함). | `COPS?`, `CSQ`, `CEREG?`, `CGATT?`, `CNMP` |
| **Data** | 데이터 세션 상태와 IP, 세션 열기/닫기, APN(읽기/설정). | `NETOPEN?`, `IPADDR`, `NETCLOSE`, `CGDCONT`, `CGATT?` |
| **TCP / UDP / Ping** | 소켓과 ping 폼. | `CIPOPEN`, `CIPSEND`, `CPING`, … |
| **HTTP** | HTTP(S) 요청 폼. | `HTTPINIT`, `HTTPPARA`, `HTTPACTION`, … |
| **FTP** | FTP(S) 전송 폼. | `CFTPSxxx` … |
| **MQTT** | MQTT(S) 연결·게시 폼. | `CMQTTxxx` … |
| **File System** | 모듈 파일 브라우저(목록, 진입, 삭제). | `CFSGFRS`, `CFSWFILE`, `CFSDFILE`, … |
| **GNSS** | 전원/모드, Cold/Warm/Hot 시작, 픽스(lat/lon/alt/HDOP/UTC), OSM 지도, 극좌표 **Sky View** SVG, 위성 신호 막대(NMEA `GSV`). | `CGNSSPWR`, `CGPSCOLD/WARM/HOT`, `CGNSSINFO`, `CGNSSTST` |
| **LBS** | 기지국 기반 위치 + 지도. | `CLBS` |
| **SMS** | 작성/전송(`>` 프롬프트 + `Ctrl-Z`), 파싱된 수신함과 삭제. | `CMGS`, `CMGL`, `CMGD` |
| **TLS / Cert** | 인증서 목록/삭제, **PEM 다운로드**(`CCERTDOWN` 바이트 길이 기반), SSL 컨텍스트 구성(버전, authmode, CA). | `CCERTLIST`, `CCERTDOWN`, `CCERTDELE`, `CSSLCFG` |
| **Time / diag** | 수동 시계(달력 + 시간대), 자동 시간대, NTP, DNS 조회. | `CCLK`, `CTZU`, `CNTP`, `CDNSGIP` |
| **Serial / UART** | 보드레이트, 프레이밍(`ICF`, 예: 8N1=`2,2`), 흐름 제어, 슬립, CMUX(상태 읽기 포함). | `IPR`, `ICF`, `IFC`, `CSCLK`, `CMUX` |
| **Hardware** | 배터리, 온도, ADC의 SVG 차트; GPIO(IN/OUT, LOW/HIGH), 듀얼 노브 슬라이더 전압 알람. | `CBC`, `CPMUTEMP`, `CADC`, `CGDRT`, `CGSETV`, `CGGETV`, `CVALARM` |
| **Wi-Fi scan** | AP 스캔(BSSID, 채널, 신호). | `CWSTASCAN` |
| **Jamming** | 감지 활성화, URC(`+SJDR:`) 실시간 표시, 구성(주기, min RxLev, min 채널, 변경 시 URC). | `SJDR`, `SJDCFG` |
| **Email** | SMTP(S): 서버, 인증, 작성(보낸이/받는이/제목/본문), 결과 URC와 함께 **전송**. SMTP 전송만(POP3/IMAP 없음). | `CSMTPSSRV`, `CSMTPSAUTH`, `CSMTPSFROM`, `CSMTPSRCPT`, `CSMTPSSUB`, `CSMTPSBODY`, `CSMTPSSEND` |
| **전화번호부** | 저장소(SM/ME/DC/RC/MC/FD)와 사용/전체, 연락처 목록/추가/삭제, 검색, 내 번호. | `CPBS`, `CPBR`, `CPBW`, `CPBF`, `CNUM` |
| **음성 통화** | 실시간 통화 상태(대기/발신/수신/통화 중), 발신/응답/끊기, DTMF 키패드, 발신자 표시 토글. | `ATD`, `ATA`, `CHUP`, `CLCC`, `CLIP`, `VTS` |

---

## 프로젝트 구조

```
.
├── index.html              # 단일 페이지(css/, js/, lang/ 로드)
├── css/
│   ├── styles.css          # 스타일과 레이아웃(크기 조절 패널과 스크롤바)
│   ├── theme-dark.css      # 다크 테마 변수
│   └── theme-light.css     # 라이트 테마 변수
├── js/
│   ├── i18n.js             # 국제화 엔진(등록 + t())
│   ├── serial.js           # Web Serial 전송, framer, 분류기,
│   │                       #   AT 에뮬레이터(가상 모드)와 실시간 파서
│   ├── data.js             # 빠른 명령, 매크로, 마법사 정의
│   └── app.js              # UI: 연결, 사이드바, 콘솔, 마법사 렌더링,
│                           #   크기 조절 패널, 테마, 언어
├── lang/
│   ├── en.js  es.js  pt.js  it.js  fr.js
│   └── de.js  ru.js  zh.js  ja.js  ko.js   # 언어별 registerLang() 파일 하나
└── docs/                   # 모든 언어의 이 README
```

**로드 순서**(클래식 스크립트, 전역 스코프, `file://`에서 동작):

```
i18n.js → lang/*.js → serial.js → data.js → app.js
```

---

## 아키텍처

**국제화(`i18n.js` + `lang/*.js`).** 모든 표시 텍스트는 **키**입니다. 각 언어는 `registerLang(code, name, dict)`로 등록되고 UI는 `t('키')`로 해석합니다. `data-i18n`이 있는 요소는 자동 번역되며, 마법사는 렌더링 시 `t()`를 사용하고 언어 변경 시 다시 렌더링됩니다.

**시리얼 전송(`serial.js`).** Web Serial API를 *framer*(스트림에서 줄 구성)가 있는 전송으로 감싸고, **분류기**가 최종 응답(`OK`/`ERROR`), 데이터, 비요청 **URC**를 구분합니다. *VirtualPort*는 동일한 인터페이스를 제공하되 물리 포트 대신 **AT 에뮬레이터**를 연결합니다.

**AT 에뮬레이터(가상 모드).** 상태(SIM, 네트워크, 데이터, 인증서, GPIO, GNSS, 재밍, SMTP, 전화번호부, 통화…)를 유지하며, 프롬프트(`>`), 바이트 길이 기반 확인(인증서, 이메일), 타이밍 제어 URC 발행(NMEA, 재밍, 통화 결과)을 포함해 실제 펌웨어처럼 각 명령에 응답합니다.

**마법사 시스템(`data.js` + `app.js`).** 각 빠른 명령 그룹은 `wiz:'id'`를 선언할 수 있습니다. 열면 중앙 패널이 마운트되고 해당 `render(host)` 함수(또는 범용 폼)가 실행됩니다. 핵심 메커니즘:

- `UI.sendCollect(cmd, {timeout})` → `OK`/`ERROR`까지 줄을 모으는 Promise.
- `UI.tap` → 줄 관찰자(실시간 URC용, 예: NMEA, `+SJDR:`, `RING`).
- `wizCleanup` → 닫기나 언어 변경 시 활성 마법사 정리(타이머/tap 중지).

---

## 콘솔 확장

**빠른 명령 추가.** `js/data.js`의 해당 `QUICK` 그룹 안에 항목 `['i18n키', "AT+명령"]`을 추가합니다(파라미터가 필요하면 끝에 `1`). 텍스트 키를 10개 `lang/` 파일 모두에 추가합니다.

**언어 추가.** `registerLang('xx', '이름', { ...모든 키... })`를 호출하는 `lang/xx.js`를 만듭니다. `en.js`와 동일한 키 집합을 포함해야 합니다.

**마법사 추가.** `data.js`에서: 그룹에 `wiz:'myId'`를 설정하고 `{ id:'myId', title:'...', render: (host) => renderMyId(host) }`를 등록합니다. `app.js`에서: `UI.sendCollect`, `t()`, (필요 시) `UI.tap`/`wizCleanup`을 사용해 `renderMyId(host)`를 작성합니다. 가상 모드의 경우 `serial.js`의 에뮬레이터에 해당 명령 핸들러를 추가합니다.

> 수정 시 권장: 구문 검증(모든 JS 연결 후 `node --check`), 10개 언어 간 i18n 키 일관성 확인, CSS 중괄호 균형 확인, 라이브러리 테스트 실행.

---

## 컴패니언 라이브러리: `simcom-at-parser`

리포지토리에는 **`simcom-at-parser`**(v0.1.0)도 포함됩니다. SIMCom A76xx/A7672SA 모듈의 AT 응답을 파싱하는 **Node.js** 라이브러리(ESM, async)로, 전송, *framer*, 분류기, *modem*, 파서, 서비스 계층(TCP, HTTP(S), MQTT(S), FTP(S), TLS, GNSS, SMS, FOTA…)과 테스트용 에뮬레이터를 갖추고 있습니다.

```bash
npm test          # 약 80개 테스트
npm run example   # 기본 예제
```

- **Node** ≥ 18.
- 웹 콘솔의 AT 에뮬레이터는 라이브러리의 것과 같은 철학을 공유합니다.

---

## 실제 하드웨어 참고 사항

일부 동작은 모듈과 SIM/네트워크에 따라 다릅니다. 가상 모드에서 하드웨어로 옮길 때 유의하세요:

- **GNSS**: 펌웨어에 따라 `GSV` 프레임이 AT 포트와 별도의 NMEA 포트로 나올 수 있습니다.
- **LBS / NETOPEN**: 등록된 SIM, 유효한 PDP/APN 컨텍스트, 사용 가능한 네트워크가 필요합니다.
- **ADC**(`CADC?`): 원시 값은 볼트가 아닙니다. 스케일링이 필요합니다.
- **Baud / CMUX / CFUN-reset**: 시리얼 세션을 변경하거나 끊습니다. 다시 연결해야 합니다.
- **TLS**(`CCERTDOWN`): 선언한 길이는 전송한 PEM 바이트와 **정확히** 일치해야 합니다.
- **Jamming**: `mnl`(min RxLev)은 GSM에만 적용됩니다. 주기적 URC 보고에는 `period > 0`과 `detecstat = 1`을 설정합니다.
- **Email**: 활성 데이터 세션(APN/PDP)이 필요합니다. SMTPS의 경우 올바른 CA 인증서를 로드하고 SSL 컨텍스트를 구성하세요(**TLS/Cert** 메뉴). 많은 제공자(Gmail)는 **앱 비밀번호**를 요구합니다.
- **음성 통화**: 음성 지원/코덱 활성화가 필요합니다. 일부 A76xx 변형은 *data-only*이며 `ATD;`를 거부합니다. 수신 발신자 표시는 네트워크가 제공하고 `CLIP=1`이 활성일 때만 나타납니다.

---

## 브라우저 지원

| 브라우저 | Web Serial | 상태 |
|---------|:----------:|------|
| Chrome(데스크톱)  | ✅ | 지원 |
| Edge(데스크톱)    | ✅ | 지원 |
| Opera(데스크톱)   | ✅ | 지원 |
| Firefox           | ❌ | Web Serial 없음 |
| Safari            | ❌ | Web Serial 없음 |
| 모바일 브라우저   | ❌ | Web Serial 없음 |

---

## 알려진 제한

- 채팅 내 미리보기는 외부 리소스를 로드하지 않습니다: 로컬 `index.html`을 사용하세요.
- Web Serial에는 보안 컨텍스트(`https://`, `localhost`, `file://`)가 필요합니다.
- 이 도구는 **진단/개발**용입니다. 여러 명령이 모듈 상태(네트워크, 인증서, NVRAM, 보드레이트)를 변경합니다. 운영 하드웨어에서는 신중히 사용하세요.

---

## 라이선스

여기에 프로젝트 라이선스(예: MIT)를 정의하고 해당 `LICENSE` 파일을 추가하세요.

---

*SIMCom A76xx / A7672SA 모듈용으로 제작되었습니다. "AT", 명령 이름 및 언급된 상표는 각 소유자에게 귀속됩니다. 이 프로젝트는 SIMCom과 제휴되어 있지 않습니다.*

---

[⬆ 루트 README로 돌아가기](../README.md)
