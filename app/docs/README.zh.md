# SIMCom Serial AT Console

> [English](README.en.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · **中文** · [日本語](README.ja.md) · [한국어](README.ko.md)

完全在浏览器中运行的 **SIMCom** 蜂窝模块 **AT 命令**控制台。它通过 **Web Serial API** 经串口与模块通信——无需安装——并自带**虚拟模式**（内置仿真器），无需硬件即可测试一切。

为 **A76xx / A7672SA** 系列打造，提供可视化向导（*wizards*）覆盖最常见的操作——网络、数据、GNSS、短信、电子邮件、电话簿、语音通话、TLS、文件系统、硬件、干扰检测等——还有一个原始控制台，可手动发送任意 AT 命令。

> 命令参考：*A76XX Series AT Command Manual*（V2.04）。

---

## 目录

- [特性](#特性)
- [要求](#要求)
- [快速开始](#快速开始)
- [虚拟模式（无硬件）](#虚拟模式无硬件)
- [连接真实模块](#连接真实模块)
- [界面](#界面)
- [向导（wizards）](#向导wizards)
- [项目结构](#项目结构)
- [架构](#架构)
- [扩展控制台](#扩展控制台)
- [配套库：`simcom-at-parser`](#配套库simcom-at-parser)
- [真实硬件注意事项](#真实硬件注意事项)
- [浏览器支持](#浏览器支持)
- [已知限制](#已知限制)
- [许可证](#许可证)

---

## 特性

- **100% 在浏览器中**，无后端、无依赖。直接打开 `index.html` 即可。
- **Web Serial API** 通过 USB/UART 与模块通信。
- **虚拟模式**：内置 AT 仿真器，可响应数十条命令（网络、数据、GNSS、短信、邮件、电话簿、语音、TLS、FS、硬件、干扰检测……），无需开发板即可开发与演示。
- **原始控制台**：发送任意 AT 命令，带历史记录、自动滚动、时间戳和可选回显。
- **快捷命令**在侧栏中按组组织。
- **可视化向导**覆盖 20+ 功能区，含表单、实时指示、地图、SVG 图表与 URC 解析。
- **宏**支持链式步骤、延时、数据发送和控制字符（`Ctrl-Z`、`ESC`）。
- **10 种语言**（en、es、pt、it、fr、de、ru、zh、ja、ko）。
- **浅色 / 深色主题**。
- **可用鼠标调整大小的面板**（宽与高），双击复位，以及向导**最大化**模式。

---

## 要求

- 支持 Web Serial API 的 **Chromium** 系浏览器：**Chrome**、**Edge** 或 **Opera**（桌面版）。
  - Firefox 与 Safari 目前**不**支持 Web Serial。
- 要连接硬件，模块必须向操作系统暴露一个**串口**（USB-CDC 或 UART–USB 适配器）。
- 在 Linux 上通常需要设备权限（例如加入 `dialout` 组）。

使用控制台不需要 Node.js。Node 仅用于[配套库](#配套库simcom-at-parser)及其测试。

---

## 快速开始

1. 下载/克隆项目。
2. 在 Chrome 或 Edge 中打开 **`index.html`**。
   - 作为本地文件（`file://`）打开或由静态服务器提供均可。
   - 如果你想用服务器提供：
     ```bash
     # 使用 Python 的简单方式
     python3 -m http.server 8080
     # 然后打开 http://localhost:8080
     ```
3. 在右上角选择语言与主题。
4. 无硬件测试请启用 **Virtual**（见下文）。连接真实硬件时，设置串口参数并点击 **Connect**。

> ⚠️ **聊天内嵌预览无法工作**，因为它不会加载外部 `css/`、`js/` 与 `lang/`。必须**下载 ZIP 并在本地打开 `index.html`**。

---

## 虚拟模式（无硬件）

在顶部栏切换 **Virtual** 并点击 **Connect**。控制台会连接到一个 **AT 仿真器**，它模拟一个模块（默认 *A7672SA-FASE*）并像真实固件那样响应命令，包括异步 **URC**：

- 模块、SIM、网络与信号信息。
- 数据会话的开/关与 IP。
- GNSS 的 NMEA 帧（`GSV`/`GGA`），用于 Sky View 与地图。
- 短信（预载收件箱，使用 `>` 提示发送）。
- 按字节长度下载证书（`CCERTDOWN`）。
- 硬件读数（电池、温度、ADC、GPIO）。
- 周期性 `+SJDR:` URC 的干扰检测。
- 电子邮件（SMTP），含主题/正文的完整提示流程。
- 电话簿（预载条目，添加/查找/删除）与语音通话（拨号 → 接通，挂断）。

这是探索工具与做演示的推荐方式。

---

## 连接真实模块

在顶部栏设置端口参数并点击 **Connect**（浏览器会要求你选择串口设备）：

| 参数 | 选项 |
|------|------|
| **Baud**  | 9600 · 57600 · 115200 · 230400 · 460800 · 921600 |
| **Data**  | 8 · 7 |
| **Stop**  | 1 · 2 |
| **Parity**| None · Even · Odd |
| **EOL**   | CR · CRLF · LF（附加到每条命令的终止符） |

**状态**栏显示链路（online/offline）、端口、信号、网络注册与运营商。

> 更改模块的**波特率**（UART 向导 → `AT+IPR`）会断开当前串口链路：你需要以新速率重新连接。

---

## 界面

屏幕分为三个区域，均**可调整大小**：

```
┌──────────┬───────────────────┬───────────────────────────┐
│ 侧栏     │  向导（wiz）       │  AT 控制台                 │
│ （分组） │  （菜单面板）      │  （日志 + 命令输入）       │
└──────────┴───────────────────┴───────────────────────────┘
```

- **顶部栏**：串口参数、语言、主题、Virtual 开关与 Connect 按钮。
- **侧栏**：分组的快捷命令。带 ⚙ 图标的每个组都会打开其**向导**。
- **向导**：随所选菜单打开的中央面板。带**最大化**（⛶）与**关闭**（✕）按钮。
- **控制台**：会话日志（带 **TIME**、**SHOW ECHO**、**AUTO-SCROLL** 开关）、AT 命令输入与**宏**发送。

### 可调整大小的面板

- 拖动 **侧栏 │ 向导** 分隔条以改变侧栏宽度。
- 拖动 **向导 │ 控制台** 分隔条以改变向导宽度（当屏幕较窄、面板上下堆叠时则改变**高度**）。
- **双击**任一分隔条可将该面板复位为默认大小。
- **最大化**向导会将其扩展到面板 + 控制台的宽度（控制台在下方，起始为 **60/40** 比例）；分隔条仍可使用。

### 宏与控制字符

宏可串联多条命令。支持：

| 标记 | 动作 |
|------|------|
| `@delay` | 等待（步骤间可配置延时） |
| `>data`  | 在 `>` 提示后发送 `data` |
| `^Z`     | `Ctrl-Z`（短信 / 负载结束） |
| `^[`     | `ESC`（取消） |

每个向导还提供一个**“加载到编辑器而非执行”**开关，便于在发送前检查命令。

---

## 向导（wizards）

侧栏中每个组都可打开一个向导。四个协议类（TCP/UDP、HTTP、FTP、MQTT）使用通用表单；其余为定制面板。

| 向导 | 作用 | 主要 AT 命令 |
|------|------|---------------|
| **Basics** | 模块信息（型号、版本、IMEI、SIM、信号）、回显、错误级别 `CMEE`，以及 **Power/CFUN**（Full/Min/RF off/Reset）。 | `SIMCOMATI`、`CPIN?`、`CSQ`、`ATE`、`CMEE`、`CFUN` |
| **SIM** | ICCID/IMSI/SPN、PIN 解锁、锁定与改 PIN。 | `CICCID`、`CIMI`、`CSPN?`、`CPIN`、`CLCK`、`CPWD` |
| **Network / signal** | 运营商、信号（dBm）、注册、制式与 PS attach。**网络模式**选择，带读取与支持模式查询。 | `COPS?`、`CSQ`、`CEREG?`、`CGATT?`、`CNMP` |
| **Data** | 数据会话状态与 IP、开/关会话，以及 APN（读/设）。 | `NETOPEN?`、`IPADDR`、`NETCLOSE`、`CGDCONT`、`CGATT?` |
| **TCP / UDP / Ping** | 套接字与 ping 表单。 | `CIPOPEN`、`CIPSEND`、`CPING`、… |
| **HTTP** | HTTP(S) 请求表单。 | `HTTPINIT`、`HTTPPARA`、`HTTPACTION`、… |
| **FTP** | FTP(S) 传输表单。 | `CFTPSxxx` … |
| **MQTT** | MQTT(S) 连接与发布表单。 | `CMQTTxxx` … |
| **File System** | 模块文件浏览器（列出、进入、删除）。 | `CFSGFRS`、`CFSWFILE`、`CFSDFILE`、… |
| **GNSS** | 电源/模式、Cold/Warm/Hot 启动、定位（lat/lon/alt/HDOP/UTC）、OSM 地图、极坐标 **Sky View** SVG 与卫星信号条（NMEA `GSV`）。 | `CGNSSPWR`、`CGPSCOLD/WARM/HOT`、`CGNSSINFO`、`CGNSSTST` |
| **LBS** | 基站定位 + 地图。 | `CLBS` |
| **SMS** | 撰写/发送（`>` 提示 + `Ctrl-Z`）、解析收件箱与删除。 | `CMGS`、`CMGL`、`CMGD` |
| **TLS / Cert** | 列出/删除证书、**下载 PEM**（`CCERTDOWN` 按字节长度）并配置 SSL 上下文（版本、authmode、CA）。 | `CCERTLIST`、`CCERTDOWN`、`CCERTDELE`、`CSSLCFG` |
| **Time / diag** | 手动时钟（日历 + 时区）、自动时区、NTP 与 DNS 解析。 | `CCLK`、`CTZU`、`CNTP`、`CDNSGIP` |
| **Serial / UART** | 波特率、帧格式（`ICF`，如 8N1=`2,2`）、流控、休眠与 CMUX，带状态读取。 | `IPR`、`ICF`、`IFC`、`CSCLK`、`CMUX` |
| **Hardware** | 电池、温度与 ADC 的 SVG 图表；GPIO（IN/OUT、LOW/HIGH）与双旋钮滑块的电压告警。 | `CBC`、`CPMUTEMP`、`CADC`、`CGDRT`、`CGSETV`、`CGGETV`、`CVALARM` |
| **Wi-Fi scan** | AP 扫描（BSSID、信道、信号）。 | `CWSTASCAN` |
| **Jamming** | 启用检测、URC 实时指示（`+SJDR:`）与配置（周期、min RxLev、min 信道数、变化时 URC）。 | `SJDR`、`SJDCFG` |
| **Email** | SMTP(S)：服务器、认证、撰写（发件人/收件人/主题/正文）与**发送**及结果 URC。仅 SMTP 发送（无 POP3/IMAP）。 | `CSMTPSSRV`、`CSMTPSAUTH`、`CSMTPSFROM`、`CSMTPSRCPT`、`CSMTPSSUB`、`CSMTPSBODY`、`CSMTPSSEND` |
| **电话簿** | 存储（SM/ME/DC/RC/MC/FD）含已用/总数、列出/添加/删除联系人、查找与本机号码。 | `CPBS`、`CPBR`、`CPBW`、`CPBF`、`CNUM` |
| **语音通话** | 实时通话状态（空闲/拨号/来电/通话中）、拨号/接听/挂断、DTMF 键盘与来电显示开关。 | `ATD`、`ATA`、`CHUP`、`CLCC`、`CLIP`、`VTS` |

---

## 项目结构

```
.
├── index.html              # 单一页面（加载 css/、js/ 与 lang/）
├── css/
│   ├── styles.css          # 样式与布局（可调整面板与滚动条）
│   ├── theme-dark.css      # 深色主题变量
│   └── theme-light.css     # 浅色主题变量
├── js/
│   ├── i18n.js             # 国际化引擎（注册 + t()）
│   ├── serial.js           # Web Serial 传输、framer、分类器、
│   │                       #   AT 仿真器（虚拟模式）与实时解析器
│   ├── data.js             # 快捷命令、宏与向导定义
│   └── app.js              # UI：连接、侧栏、控制台、向导渲染、
│                           #   可调整面板、主题、语言
├── lang/
│   ├── en.js  es.js  pt.js  it.js  fr.js
│   └── de.js  ru.js  zh.js  ja.js  ko.js   # 每种语言一个 registerLang() 文件
└── docs/                   # 各语言的本 README
```

**加载顺序**（经典脚本、全局作用域、可从 `file://` 运行）：

```
i18n.js → lang/*.js → serial.js → data.js → app.js
```

---

## 架构

**国际化（`i18n.js` + `lang/*.js`）。** 所有可见文本都是**键**。每种语言通过 `registerLang(code, name, dict)` 注册，UI 用 `t('键')` 解析。带 `data-i18n` 的元素自动翻译；向导在渲染时使用 `t()` 并在切换语言时重新渲染。

**串口传输（`serial.js`）。** 将 Web Serial API 封装为带 *framer*（从流构建行）的传输，以及一个**分类器**，用于区分最终响应（`OK`/`ERROR`）、数据与未请求的 **URC**。*VirtualPort* 暴露相同接口，但接入 **AT 仿真器**而非物理端口。

**AT 仿真器（虚拟模式）。** 保存状态（SIM、网络、数据、证书、GPIO、GNSS、干扰检测、SMTP、电话簿、通话……）并像真实固件那样响应每条命令，包括提示（`>`）、按字节长度的确认（证书、邮件）以及定时 URC 发送（NMEA、干扰检测、通话结果）。

**向导系统（`data.js` + `app.js`）。** 每个快捷命令组都可声明 `wiz:'id'`。打开它会装载中央面板并运行其 `render(host)` 函数（或通用表单）。关键机制：

- `UI.sendCollect(cmd, {timeout})` → 收集行直到 `OK`/`ERROR` 的 Promise。
- `UI.tap` → 行观察器（用于实时 URC，如 NMEA、`+SJDR:`、`RING`）。
- `wizCleanup` → 关闭或切换语言时活动向导的清理（停止定时器/tap）。

---

## 扩展控制台

**添加快捷命令。** 在 `js/data.js` 中对应的 `QUICK` 组里，添加一项 `['i18n键', "AT+命令"]`（若需要参数则末尾加 `1`）。把文本键添加到全部 10 个 `lang/` 文件。

**添加语言。** 创建 `lang/xx.js`，调用 `registerLang('xx', '名称', { ...全部键... })`。它必须覆盖与 `en.js` 相同的键集。

**添加向导。** 在 `data.js` 中：给组设置 `wiz:'我的Id'` 并注册 `{ id:'我的Id', title:'...', render: (host) => render我的Id(host) }`。在 `app.js` 中：用 `UI.sendCollect`、`t()` 以及（如有需要）`UI.tap`/`wizCleanup` 编写 `render我的Id(host)`。对于虚拟模式，在 `serial.js` 的仿真器中添加该命令的处理器。

> 修改时建议：校验语法（拼接所有 JS 并 `node --check`）、检查 10 种语言的 i18n 键一致性、确认 CSS 大括号平衡，并运行库的测试。

---

## 配套库：`simcom-at-parser`

仓库还包含 **`simcom-at-parser`**（v0.1.0），一个 **Node.js** 库（ESM、async），用于解析 SIMCom A76xx/A7672SA 模块的 AT 响应：传输、*framer*、分类器、*modem*、解析器与服务层（TCP、HTTP(S)、MQTT(S)、FTP(S)、TLS、GNSS、SMS、FOTA……），并带测试用仿真器。

```bash
npm test          # ~80 个测试
npm run example   # 基础示例
```

- **Node** ≥ 18。
- Web 控制台的 AT 仿真器与库中的秉持相同理念。

---

## 真实硬件注意事项

部分行为取决于模块与 SIM/网络；从虚拟模式切到硬件时请注意：

- **GNSS**：根据固件，`GSV` 帧可能从与 AT 端口分离的 NMEA 端口输出。
- **LBS / NETOPEN**：需要已注册的 SIM、有效的 PDP/APN 上下文与可用网络。
- **ADC**（`CADC?`）：原始值不是伏特；需要进行换算。
- **Baud / CMUX / CFUN-reset**：会改变或中断串口会话；需要重新连接。
- **TLS**（`CCERTDOWN`）：声明的长度必须与发送的 PEM 字节**完全一致**。
- **Jamming**：`mnl`（min RxLev）仅适用于 GSM；要周期性 URC 报告，请设 `period > 0` 且 `detecstat = 1`。
- **Email**：需要活动的数据会话（APN/PDP）；对于 SMTPS，请加载正确的 CA 证书并配置 SSL 上下文（在 **TLS/Cert** 菜单）。许多提供商（Gmail）要求**应用专用密码**。
- **语音通话**：需要启用语音支持/编解码器；部分 A76xx 变体为 *data-only*，会拒绝 `ATD;`。来电显示仅在网络提供且 `CLIP=1` 激活时出现。

---

## 浏览器支持

| 浏览器 | Web Serial | 状态 |
|--------|:----------:|------|
| Chrome（桌面）  | ✅ | 支持 |
| Edge（桌面）    | ✅ | 支持 |
| Opera（桌面）   | ✅ | 支持 |
| Firefox         | ❌ | 无 Web Serial |
| Safari          | ❌ | 无 Web Serial |
| 移动浏览器      | ❌ | 无 Web Serial |

---

## 已知限制

- 聊天内预览不会加载外部资源：请使用本地 `index.html`。
- Web Serial 需要安全上下文（`https://`、`localhost` 或 `file://`）。
- 本工具用于**诊断/开发**；多条命令会修改模块状态（网络、证书、NVRAM、波特率）。在生产硬件上请谨慎使用。

---

## 许可证

在此定义项目许可证（例如 MIT）并添加相应的 `LICENSE` 文件。

---

*为配合 SIMCom A76xx / A7672SA 模块而制作。“AT”、命令名称及所提及的品牌归各自所有者所有；本项目与 SIMCom 无隶属关系。*

---

[⬆ 返回根 README](../README.md)
