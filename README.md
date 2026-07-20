<div align="center">

<img src="https://raw.githubusercontent.com/IbrahimKalemci/claude-resume-hub/main/docs/icon.png" width="84" alt="claude-resume-hub logo">

# claude-resume-hub

### Hit a Claude Code limit at 2am? **Wake up to finished work.**

Auto-continues your Claude Code session the moment a usage/session limit resets — as a **tray desktop app** or a one-line **CLI**. Cross-platform, zero-dependency, and it **never touches your tokens**.

<p>
  <a href="https://www.npmjs.com/package/claude-resume-hub"><img src="https://img.shields.io/npm/v/claude-resume-hub?color=c96442&label=npm" alt="npm"></a>
  <a href="https://github.com/IbrahimKalemci/claude-resume-hub/actions/workflows/ci.yml"><img src="https://github.com/IbrahimKalemci/claude-resume-hub/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/IbrahimKalemci/claude-resume-hub/releases/latest"><img src="https://img.shields.io/badge/download-.exe-3fb950" alt="download"></a>
  <img src="https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-8b93a7" alt="platforms">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a>
</p>

<img src="https://raw.githubusercontent.com/IbrahimKalemci/claude-resume-hub/main/docs/app-demo.svg" width="380" alt="claude-resume-hub desktop app: finds your session, waits out the limit, counts down, resumes automatically">

**🇬🇧 [English](#-english) · 🇹🇷 [Türkçe](#-türkçe)**

</div>

---

## 🇬🇧 English

When Claude Code hits your limit it prints `Claude AI usage limit reached|…` and **stops** — you have to come back and type `continue`. **claude-resume-hub** finds your session, waits for the exact reset time, and continues for you. Then it pings you.

### 🖥️ Desktop app — download & run

The tray app finds your last session automatically, shows a live countdown, and resumes on its own. No terminal.

**[⬇ Download claude-resume-hub.exe](https://github.com/IbrahimKalemci/claude-resume-hub/releases/latest)** (Windows · macOS · Linux)

1. Download and run it — it lives in your **system tray**.
2. It **auto-finds** the session you were last working in.
3. Pick **Continue** (or type a task), press **Start**, and walk away.
4. Limit hit → it counts down → resumes the moment the window reopens → you get a notification. 🎉

> It wraps Claude Code, so the `claude` CLI must be on your PATH.

### ⌨️ Prefer the terminal? One line, no install

```bash
npx claude-resume-hub --web      # auto-resume + a live dashboard
npx claude-resume-hub            # ...or headless, no dashboard
```

Handy flags: `--list` (see your sessions) · `--session <id>` (resume a specific one) · `--smart` (context-aware resume) · `--tray` (Windows tray) · `--help`.

### ✨ Features

- ⏱️ **Exact countdown** — reads the real reset timestamp, not a guess
- 🎯 **Finds the right session** and pins it (no more resuming the wrong one)
- 📚 **Multi-project queue** — several projects resume in order on one reset clock
- 🔔 **Phone/chat alerts** — optional webhook or Telegram ping on reset / done / error
- 📺 **Live output** — watch what Claude did, even while you were away
- ⬆️ **Update banner** — tells you when a newer version ships
- 🪶 **Zero dependencies**, ~one small package · 🔒 **never reads your tokens**

### 🔒 Security & privacy

It **never** reads or stores your Claude credentials (`~/.claude/.credentials.json` / keychain). It only reads your own conversation transcripts under `~/.claude/projects`, locally. No telemetry; the dashboard is localhost-only; release binaries are built by CI from source on clean machines, so a downloaded `.exe` carries no one's data.

---

## 🇹🇷 Türkçe

Claude Code limitine takılınca `Claude AI usage limit reached|…` yazıp **durur** — gelip `continue` yazman gerekir. **claude-resume-hub** oturumunu bulur, tam açılma saatini bekler ve senin yerine devam eder. Sonra da sana haber verir.

### 🖥️ Masaüstü uygulaması — indir çalıştır

Tepside duran uygulama son oturumunu otomatik bulur, canlı geri sayım gösterir, kendi devam eder. Terminal yok.

**[⬇ claude-resume-hub.exe indir](https://github.com/IbrahimKalemci/claude-resume-hub/releases/latest)** (Windows · macOS · Linux)

1. İndir ve çalıştır — **sistem tepsisinde** yaşar.
2. Son çalıştığın oturumu **kendi bulur**.
3. **Continue** seç (ya da task yaz), **Start**'a bas, işine bak.
4. Limit dolunca → geri sayar → açılır açılmaz devam eder → bildirim alırsın. 🎉

> Claude Code'u sarmalar; `claude` CLI'ın PATH'te olması gerekir.

### ⌨️ Terminal mi? Tek satır, kurulum yok

```bash
npx claude-resume-hub --web      # otomatik devam + canlı panel
npx claude-resume-hub            # ...ya da panelsiz
```

İşe yarayan bayraklar: `--list` (oturumları gör) · `--session <id>` (belirli oturum) · `--smart` (bağlam-farkında devam) · `--tray` (Windows tepsi) · `--help`.

### ✨ Özellikler

- ⏱️ **Net geri sayım** — tahmin değil, gerçek reset zamanını okur
- 🎯 **Doğru oturumu bulur** ve sabitler (yanlış oturumu devam ettirme derdi yok)
- 📚 **Çoklu proje kuyruğu** — birden fazla proje tek reset saatinde sırayla devam eder
- 🔔 **Telefon/sohbet bildirimi** — webhook ya da Telegram ile reset/bitiş/hata bildirimi
- 📺 **Canlı çıktı** — Claude ne yaptı, sen yokken bile gör
- ⬆️ **Güncelleme banner'ı** — yeni sürüm çıkınca söyler
- 🪶 **Sıfır bağımlılık** · 🔒 **token'ına asla dokunmaz**

### 🔒 Güvenlik & gizlilik

Claude kimlik bilgilerini (`~/.claude/.credentials.json` / keychain) **asla** okumaz/saklamaz. Sadece kendi makinendeki `~/.claude/projects` konuşma metinlerini okur. Telemetri yok; panel yalnızca localhost; release binary'leri CI'da temiz sunucularda kaynaktan derlenir — indirilen `.exe` kimsenin verisini taşımaz.

---

## 🛠️ From source · Kaynaktan

```bash
git clone https://github.com/IbrahimKalemci/claude-resume-hub.git
cd claude-resume-hub
npm start          # CLI
npm run app:start  # desktop app (needs: npm install)
```

<div align="center">
<sub>Made for everyone tired of waiting on the reset clock · <b>MIT</b> © Ibrahim Kalemci · <a href="CHANGELOG.md">Changelog</a></sub>
</div>
