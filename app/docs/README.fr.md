# SIMCom Serial AT Console

> [English](README.en.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · **Français** · [Deutsch](README.de.md) · [Русский](README.ru.md) · [中文](README.zh.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

Console de commandes **AT** pour modules cellulaires **SIMCom** qui tourne entièrement dans le navigateur. Elle dialogue avec le module via le port série grâce à la **Web Serial API**, sans rien installer, et propose un **mode virtuel** (émulateur intégré) pour tout tester sans matériel.

Conçue pour la famille **A76xx / A7672SA**, avec des assistants visuels (*wizards*) pour les opérations les plus courantes — réseau, données, GNSS, SMS, e-mail, répertoire, appels vocaux, TLS, système de fichiers, matériel, brouillage et plus — ainsi qu'une console brute pour envoyer n'importe quelle commande AT à la main.

> Référence des commandes : *A76XX Series AT Command Manual* (V2.04).

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Prérequis](#prérequis)
- [Démarrage rapide](#démarrage-rapide)
- [Mode virtuel (sans matériel)](#mode-virtuel-sans-matériel)
- [Connexion à un module réel](#connexion-à-un-module-réel)
- [L'interface](#linterface)
- [Assistants (wizards)](#assistants-wizards)
- [Structure du projet](#structure-du-projet)
- [Architecture](#architecture)
- [Étendre la console](#étendre-la-console)
- [Bibliothèque companion : `simcom-at-parser`](#bibliothèque-companion-simcom-at-parser)
- [Notes sur le matériel réel](#notes-sur-le-matériel-réel)
- [Compatibilité des navigateurs](#compatibilité-des-navigateurs)
- [Limitations connues](#limitations-connues)
- [Licence](#licence)

---

## Fonctionnalités

- **100% dans le navigateur**, sans backend ni dépendances. Il suffit d'ouvrir `index.html`.
- **Web Serial API** pour dialoguer avec le module via USB/UART.
- **Mode virtuel** : un émulateur AT intégré qui répond à des dizaines de commandes (réseau, données, GNSS, SMS, e-mail, répertoire, voix, TLS, FS, matériel, brouillage…) pour développer et faire des démos sans carte.
- **Console brute** : envoyez n'importe quelle commande AT, avec historique, autoscroll, horodatage et *echo* optionnel.
- **Commandes rapides** organisées par groupe dans la barre latérale.
- **Assistants visuels** pour plus de 20 domaines fonctionnels, avec formulaires, indicateurs en direct, cartes, graphiques SVG et analyse d'URC.
- **Macros** avec étapes enchaînées, délais, envoi de données et caractères de contrôle (`Ctrl-Z`, `ESC`).
- **10 langues** (en, es, pt, it, fr, de, ru, zh, ja, ko).
- **Thème clair / sombre**.
- **Panneaux redimensionnables** à la souris (largeur et hauteur), double-clic pour réinitialiser, et mode **maximisé** de l'assistant.

---

## Prérequis

- Un navigateur basé sur **Chromium** avec la Web Serial API : **Chrome**, **Edge** ou **Opera** (bureau).
  - Firefox et Safari ne prennent **pas** en charge Web Serial actuellement.
- Pour se connecter au matériel, le module doit exposer un **port série** (USB-CDC ou adaptateur UART–USB) accessible par le système d'exploitation.
- Sous Linux, il faut généralement la permission sur le périphérique (p. ex. appartenir au groupe `dialout`).

Node.js n'est pas nécessaire pour utiliser la console. Node ne sert que pour la [bibliothèque companion](#bibliothèque-companion-simcom-at-parser) et ses tests.

---

## Démarrage rapide

1. Téléchargez/clonez le projet.
2. Ouvrez **`index.html`** dans Chrome ou Edge.
   - Fonctionne ouvert comme fichier local (`file://`) ou servi par un serveur statique.
   - Si vous préférez le servir :
     ```bash
     # option simple avec Python
     python3 -m http.server 8080
     # puis ouvrez http://localhost:8080
     ```
3. Choisissez la langue et le thème en haut à droite.
4. Pour tester sans matériel, activez **Virtual** (voir ci-dessous). Pour du matériel réel, réglez les paramètres série et cliquez sur **Connect**.

> ⚠️ L'**aperçu intégré du chat ne fonctionne pas** car il ne charge pas les `css/`, `js/` et `lang/` externes. Il faut **télécharger le ZIP et ouvrir `index.html` localement**.

---

## Mode virtuel (sans matériel)

Activez le bouton **Virtual** dans la barre du haut et cliquez sur **Connect**. La console se connecte à un **émulateur AT** qui simule un module (un *A7672SA-FASE* par défaut) et répond aux commandes comme le firmware réel, y compris les **URC** asynchrones :

- Infos module, SIM, réseau et signal.
- Ouverture/fermeture de session de données et IP.
- GNSS avec trames NMEA (`GSV`/`GGA`) pour le Sky View et la carte.
- SMS (boîte préchargée, envoi avec prompt `>`).
- Téléchargement de certificats par longueur en octets (`CCERTDOWN`).
- Lectures matérielles (batterie, température, ADC, GPIO).
- Détection de brouillage avec URC `+SJDR:` périodique.
- E-mail (SMTP) avec le flux complet de prompt pour l'objet/le corps.
- Répertoire (contacts préchargés, ajouter/chercher/supprimer) et appels vocaux (composer → actif, raccrocher).

C'est la façon recommandée d'explorer l'outil et de faire des démos.

---

## Connexion à un module réel

Dans la barre du haut, réglez les paramètres du port et cliquez sur **Connect** (le navigateur vous demandera de choisir le périphérique série) :

| Paramètre | Options |
|-----------|---------|
| **Baud**  | 9600 · 57600 · 115200 · 230400 · 460800 · 921600 |
| **Data**  | 8 · 7 |
| **Stop**  | 1 · 2 |
| **Parity**| None · Even · Odd |
| **EOL**   | CR · CRLF · LF (terminateur ajouté à chaque commande) |

La barre d'**état** affiche le lien (online/offline), le port, le signal, l'enregistrement réseau et l'opérateur.

> Changer le **baud** du module (assistant UART → `AT+IPR`) casse le lien série actuel : il faudra vous reconnecter à la nouvelle vitesse.

---

## L'interface

L'écran est divisé en trois zones, toutes **redimensionnables** :

```
┌──────────┬───────────────────┬───────────────────────────┐
│ Sidebar  │  Assistant (wiz)  │  Console AT                │
│ (groupes)│  (panneau du menu)│  (log + saisie de cmd)     │
└──────────┴───────────────────┴───────────────────────────┘
```

- **Barre du haut** : paramètres série, langue, thème, bouton Virtual et bouton Connect.
- **Sidebar** : commandes rapides groupées. Chaque groupe avec une icône ⚙ ouvre son **assistant**.
- **Assistant** : panneau central qui s'ouvre avec le menu choisi. Il a les boutons **maximiser** (⛶) et **fermer** (✕).
- **Console** : journal de la session (avec les bascules **TIME**, **SHOW ECHO**, **AUTO-SCROLL**), saisie de commandes AT et envoi de **macros**.

### Panneaux redimensionnables

- Faites glisser le **séparateur sidebar │ assistant** pour changer la largeur de la barre latérale.
- Faites glisser le **séparateur assistant │ console** pour changer la largeur de l'assistant (ou la **hauteur**, quand l'écran est étroit et que les panneaux s'empilent).
- **Double-clic** sur un séparateur réinitialise ce panneau à sa taille par défaut.
- **Maximiser** un assistant l'étend sur la largeur panneau + console (console en bas, démarre au ratio **60/40**) ; les séparateurs continuent de fonctionner.

### Macros et caractères de contrôle

Les macros enchaînent plusieurs commandes. Elles prennent en charge :

| Jeton | Action |
|-------|--------|
| `@delay` | attente (délai configurable entre les étapes) |
| `>data`  | envoie `data` après un prompt `>` |
| `^Z`     | `Ctrl-Z` (fin de SMS / payload) |
| `^[`     | `ESC` (annuler) |

Chaque assistant propose aussi une bascule **« charger dans l'éditeur au lieu d'exécuter »**, utile pour relire la commande avant l'envoi.

---

## Assistants (wizards)

Chaque groupe de la barre latérale peut ouvrir un assistant. Les quatre de protocole (TCP/UDP, HTTP, FTP, MQTT) utilisent un formulaire générique ; les autres sont des panneaux sur mesure.

| Assistant | Ce qu'il fait | Commandes AT principales |
|-----------|---------------|---------------------------|
| **Basics** | Infos module (modèle, révision, IMEI, SIM, signal), echo, niveau d'erreurs `CMEE`, et **Power/CFUN** (Full/Min/RF off/Reset). | `SIMCOMATI`, `CPIN?`, `CSQ`, `ATE`, `CMEE`, `CFUN` |
| **SIM** | ICCID/IMSI/SPN, déverrouillage PIN, verrou et changement de PIN. | `CICCID`, `CIMI`, `CSPN?`, `CPIN`, `CLCK`, `CPWD` |
| **Network / signal** | Opérateur, signal (dBm), enregistrement, technologie et attach PS. Sélecteur de **mode réseau** avec lecture et requête des modes pris en charge. | `COPS?`, `CSQ`, `CEREG?`, `CGATT?`, `CNMP` |
| **Data** | État de la session de données et IP, ouvrir/fermer la session, et APN (lire/définir). | `NETOPEN?`, `IPADDR`, `NETCLOSE`, `CGDCONT`, `CGATT?` |
| **TCP / UDP / Ping** | Formulaire pour sockets et ping. | `CIPOPEN`, `CIPSEND`, `CPING`, … |
| **HTTP** | Formulaire de requêtes HTTP(S). | `HTTPINIT`, `HTTPPARA`, `HTTPACTION`, … |
| **FTP** | Formulaire de transferts FTP(S). | `CFTPSxxx` … |
| **MQTT** | Formulaire de connexion et publication MQTT(S). | `CMQTTxxx` … |
| **File System** | Explorateur de fichiers du module (lister, entrer, supprimer). | `CFSGFRS`, `CFSWFILE`, `CFSDFILE`, … |
| **GNSS** | Alimentation/mode, démarrage Cold/Warm/Hot, fix (lat/lon/alt/HDOP/UTC), carte OSM, **Sky View** polaire SVG et barres de signal des satellites (NMEA `GSV`). | `CGNSSPWR`, `CGPSCOLD/WARM/HOT`, `CGNSSINFO`, `CGNSSTST` |
| **LBS** | Localisation par station de base + carte. | `CLBS` |
| **SMS** | Composer/envoyer (prompt `>` + `Ctrl-Z`), boîte de réception analysée et suppression. | `CMGS`, `CMGL`, `CMGD` |
| **TLS / Cert** | Lister/supprimer des certificats, **télécharger un PEM** (`CCERTDOWN` par longueur en octets) et configurer le contexte SSL (version, authmode, CA). | `CCERTLIST`, `CCERTDOWN`, `CCERTDELE`, `CSSLCFG` |
| **Time / diag** | Horloge manuelle (calendrier + fuseau horaire), fuseau automatique, NTP et résolution DNS. | `CCLK`, `CTZU`, `CNTP`, `CDNSGIP` |
| **Serial / UART** | Baud, framing (`ICF`, p. ex. 8N1=`2,2`), contrôle de flux, sleep et CMUX, avec lectures d'état. | `IPR`, `ICF`, `IFC`, `CSCLK`, `CMUX` |
| **Hardware** | Batterie, température et ADC avec graphiques SVG ; GPIO (IN/OUT, LOW/HIGH) et alarme de tension avec curseur à deux poignées. | `CBC`, `CPMUTEMP`, `CADC`, `CGDRT`, `CGSETV`, `CGGETV`, `CVALARM` |
| **Wi-Fi scan** | Scan des AP (BSSID, canal, signal). | `CWSTASCAN` |
| **Jamming** | Activer la détection, indicateur en direct via URC (`+SJDR:`), et configuration (période, min RxLev, min canaux, URC au changement). | `SJDR`, `SJDCFG` |
| **Email** | SMTP(S) : serveur, authentification, composition (De/À/Objet/Corps) et **envoi** avec URC de résultat. Envoi SMTP uniquement (pas de POP3/IMAP). | `CSMTPSSRV`, `CSMTPSAUTH`, `CSMTPSFROM`, `CSMTPSRCPT`, `CSMTPSSUB`, `CSMTPSBODY`, `CSMTPSSEND` |
| **Répertoire** | Stockage (SM/ME/DC/RC/MC/FD) avec utilisé/total, lister/ajouter/supprimer des contacts, rechercher et numéro propre. | `CPBS`, `CPBR`, `CPBW`, `CPBF`, `CNUM` |
| **Appels vocaux** | État d'appel en direct (inactif/composition/entrant/en communication), composer/répondre/raccrocher, clavier DTMF et bascule d'identification d'appelant. | `ATD`, `ATA`, `CHUP`, `CLCC`, `CLIP`, `VTS` |

---

## Structure du projet

```
.
├── index.html              # page unique (charge css/, js/ et lang/)
├── css/
│   ├── styles.css          # styles et mise en page (panneaux redimensionnables et scrollbars)
│   ├── theme-dark.css      # variables du thème sombre
│   └── theme-light.css     # variables du thème clair
├── js/
│   ├── i18n.js             # moteur d'internationalisation (registre + t())
│   ├── serial.js           # transport Web Serial, framer, classifieur,
│   │                       #   émulateur AT (mode virtuel) et parseurs en direct
│   ├── data.js             # définition des commandes rapides, macros et wizards
│   └── app.js              # UI : connexion, sidebar, console, rendu des wizards,
│                           #   panneaux redimensionnables, thème, langue
├── lang/
│   ├── en.js  es.js  pt.js  it.js  fr.js
│   └── de.js  ru.js  zh.js  ja.js  ko.js   # un fichier registerLang() par langue
└── docs/                   # ce README dans toutes les langues
```

**Ordre de chargement** (scripts classiques, portée globale, fonctionnent depuis `file://`) :

```
i18n.js → lang/*.js → serial.js → data.js → app.js
```

---

## Architecture

**Internationalisation (`i18n.js` + `lang/*.js`).** Tout texte visible est une **clé**. Chaque langue s'enregistre via `registerLang(code, name, dict)` et l'UI résout avec `t('clé')`. Les éléments avec `data-i18n` sont traduits automatiquement ; les wizards utilisent `t()` au rendu et se re-rendent au changement de langue.

**Transport série (`serial.js`).** Enveloppe la Web Serial API dans un transport avec un *framer* (construit des lignes à partir du flux) et un **classifieur** qui distingue les réponses finales (`OK`/`ERROR`), les données et les **URC** non sollicités. Un *VirtualPort* expose la même interface mais branche l'**émulateur AT** à la place du port physique.

**Émulateur AT (mode virtuel).** Conserve l'état (SIM, réseau, données, certificats, GPIO, GNSS, brouillage, SMTP, répertoire, appels…) et répond à chaque commande comme le firmware réel, y compris les prompts (`>`), l'accusé par longueur en octets (certificats, e-mail) et l'émission temporisée d'URC (NMEA, brouillage, résultat d'appel).

**Système d'assistants (`data.js` + `app.js`).** Chaque groupe de commandes rapides peut déclarer `wiz:'id'`. À son ouverture, le panneau central est monté et sa fonction `render(host)` est exécutée (ou un formulaire générique). Mécanismes clés :

- `UI.sendCollect(cmd, {timeout})` → promesse qui rassemble les lignes jusqu'à `OK`/`ERROR`.
- `UI.tap` → observateur de lignes (pour les URC en direct, p. ex. NMEA, `+SJDR:`, `RING`).
- `wizCleanup` → *teardown* de l'assistant actif (arrête les timers/taps) à la fermeture ou au changement de langue.

---

## Étendre la console

**Ajouter une commande rapide.** Dans `js/data.js`, à l'intérieur du groupe `QUICK` correspondant, ajoutez une entrée `['cléI18n', "AT+COMMANDE"]` (avec un `1` final si elle requiert des paramètres). Ajoutez la clé de texte aux 10 fichiers de `lang/`.

**Ajouter une langue.** Créez `lang/xx.js` appelant `registerLang('xx', 'Nom', { ...toutes les clés... })`. Il doit couvrir le même jeu de clés que `en.js`.

**Ajouter un assistant.** Dans `data.js` : mettez `wiz:'monId'` sur le groupe et enregistrez `{ id:'monId', title:'...', render: (host) => renderMonId(host) }`. Dans `app.js` : écrivez `renderMonId(host)` en utilisant `UI.sendCollect`, `t()` et (si besoin) `UI.tap`/`wizCleanup`. Pour le mode virtuel, ajoutez les handlers de la commande à l'émulateur dans `serial.js`.

> Recommandé à la modification : valider la syntaxe (concaténer tout le JS et `node --check`), vérifier la cohérence des clés i18n entre les 10 langues, contrôler que les accolades CSS sont équilibrées, et lancer les tests de la bibliothèque.

---

## Bibliothèque companion : `simcom-at-parser`

Le dépôt inclut également **`simcom-at-parser`** (v0.1.0), une bibliothèque **Node.js** (ESM, async) qui analyse les réponses AT des modules SIMCom A76xx/A7672SA : transport, *framer*, classifieur, *modem*, parseurs et couches de service (TCP, HTTP(S), MQTT(S), FTP(S), TLS, GNSS, SMS, FOTA…), avec un émulateur pour les tests.

```bash
npm test          # ~80 tests
npm run example   # exemple de base
```

- **Node** ≥ 18.
- L'émulateur AT de la console web partage le même esprit que celui de la bibliothèque.

---

## Notes sur le matériel réel

Certains comportements dépendent du module et de la SIM/du réseau ; gardez-les à l'esprit en passant du mode virtuel au matériel :

- **GNSS** : les trames `GSV` peuvent sortir par un port NMEA distinct du port AT, selon le firmware.
- **LBS / NETOPEN** : nécessitent une SIM enregistrée, un contexte PDP/APN valide et un réseau disponible.
- **ADC** (`CADC?`) : la valeur brute n'est pas en volts ; il faut la mettre à l'échelle.
- **Baud / CMUX / CFUN-reset** : changent ou coupent la session série ; il faudra vous reconnecter.
- **TLS** (`CCERTDOWN`) : la longueur déclarée doit correspondre **exactement** aux octets du PEM envoyés.
- **Jamming** : `mnl` (min RxLev) ne s'applique qu'au GSM ; pour des rapports périodiques via URC, mettez `period > 0` et `detecstat = 1`.
- **E-mail** : nécessite une session de données active (APN/PDP) ; pour SMTPS, chargez le bon certificat CA et configurez le contexte SSL (dans le menu **TLS/Cert**). Beaucoup de fournisseurs (Gmail) exigent un **mot de passe d'application**.
- **Appels vocaux** : nécessitent le support/codec voix activé ; plusieurs variantes A76xx sont *data-only* et rejettent `ATD;`. L'identification d'appel entrant n'apparaît que si le réseau la fournit et que `CLIP=1` est actif.

---

## Compatibilité des navigateurs

| Navigateur | Web Serial | État |
|------------|:----------:|------|
| Chrome (bureau)   | ✅ | Pris en charge |
| Edge (bureau)     | ✅ | Pris en charge |
| Opera (bureau)    | ✅ | Pris en charge |
| Firefox           | ❌ | Pas de Web Serial |
| Safari            | ❌ | Pas de Web Serial |
| Navigateurs mobiles | ❌ | Pas de Web Serial |

---

## Limitations connues

- L'aperçu dans le chat ne charge pas les ressources externes : utilisez l'`index.html` local.
- Web Serial nécessite un contexte sécurisé (`https://`, `localhost` ou `file://`).
- L'outil est destiné au **diagnostic/développement** ; plusieurs commandes modifient l'état du module (réseau, certificats, NVRAM, baud). Utilisez-le avec discernement sur du matériel de production.

---

## Licence

Définissez ici la licence du projet (p. ex. MIT) et ajoutez le fichier `LICENSE` correspondant.

---

*Réalisée pour fonctionner avec les modules SIMCom A76xx / A7672SA. « AT », les noms de commandes et les marques mentionnées appartiennent à leurs propriétaires respectifs ; ce projet n'est pas affilié à SIMCom.*

---

[⬆ Retour au README racine](../README.md)
