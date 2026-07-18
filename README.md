<h1 align="center">⏰ claude-resume-hub</h1>

<p align="center">
  <b>Stop babysitting Claude Code usage limits.</b><br>
  Hit a limit at 2am? <b>Wake up to finished work.</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/claude-resume-hub"><img src="https://img.shields.io/npm/v/claude-resume-hub?color=c96442" alt="npm"></a>
  <a href="https://github.com/IbrahimKalemci/claude-resume-hub/actions/workflows/ci.yml"><img src="https://github.com/IbrahimKalemci/claude-resume-hub/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D16-3fb950" alt="node >= 16">
  <img src="https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-8b93a7" alt="platforms">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/IbrahimKalemci/claude-resume-hub/main/docs/demo.svg" alt="countdown reaching zero, then sending continue to Claude to resume the task" width="700">
</p>

<p align="center"><b>🇬🇧 <a href="#-english">English</a> &nbsp;·&nbsp; 🇹🇷 <a href="#-türkçe">Türkçe</a></b></p>

---

## 🇬🇧 English

Claude Code hits your limit and just… **stops** — until you come back and type `continue`.
**claude-resume-hub** waits for the exact reset time and continues **for you**, then pings your desktop when it's rolling again. One command, zero setup, every OS.

### Install & run — 3 steps

**1.** Make sure Claude Code works (open a terminal, type `claude --version`). Don't have it? [Get it here](https://docs.claude.com/en/docs/claude-code).

**2.** Go to your project folder and run:

```bash
npx claude-resume-hub --web
```

**3.** A dashboard opens in your browser — click **“Enable alerts”**, then walk away. 🎉

That's it. No install, no config. It works on **Windows, macOS and Linux**.

### Why you'll love it

- ⏱️ **Exact countdown** — reads the real reset time, not a guess
- 🔔 **Desktop alerts** — close the terminal, go live your life
- 🖥️ **Beautiful live dashboard** — countdown, status, and a streaming log
- 🪶 **Zero dependencies**, 100% local — nothing leaves your machine

### Handy commands

```bash
npx claude-resume-hub              # no dashboard, just auto-resume
npx claude-resume-hub --web        # with dashboard + alerts
npx claude-resume-hub -t "run all tests and fix failures"   # start a task
npx claude-resume-hub --list       # list this project's sessions (+ their ids)
npx claude-resume-hub --web --smart # context-aware resume (picks up your last step)
npx claude-resume-hub -s <id>      # resume a specific session
npx claude-resume-hub --help       # all options
```

Prefer a permanent command? `npm i -g claude-resume-hub` gives you `crh --web`.
**Always up to date:** `npx claude-resume-hub@latest` pulls the newest version automatically.

---

## 🇹🇷 Türkçe

Claude Code limitine takılınca **durur** — sen gelip `continue` yazana kadar bekler.
**claude-resume-hub** limitin tam açılma saatini bekleyip **senin yerine** devam eder, iş yeniden başlayınca da masaüstüne bildirim atar. Tek komut, sıfır ayar, her işletim sistemi.

### Kurulum & çalıştırma — 3 adım

**1.** Claude Code çalışıyor mu bak (terminal aç, `claude --version` yaz). Yoksa [buradan kur](https://docs.claude.com/en/docs/claude-code).

**2.** Projenin klasörüne gir ve şunu çalıştır:

```bash
npx claude-resume-hub --web
```

**3.** Tarayıcıda bir panel açılır — **“Enable alerts”**e bas ve arkana yaslan. 🎉

Hepsi bu. Kurulum yok, ayar yok. **Windows, macOS ve Linux**'ta çalışır.

### Neden bayılacaksın

- ⏱️ **Net geri sayım** — tahmin değil, gerçek reset saatini okur
- 🔔 **Masaüstü bildirimi** — terminali kapat, hayatına dön
- 🖥️ **Şık canlı panel** — geri sayım, durum ve canlı log
- 🪶 **Sıfır bağımlılık**, %100 yerel — hiçbir veri makineden çıkmaz

### İşine yarayacak komutlar

```bash
npx claude-resume-hub              # panelsiz, sadece otomatik devam
npx claude-resume-hub --web        # panel + bildirim
npx claude-resume-hub -t "tüm testleri çalıştır ve hataları düzelt"   # görev başlat
npx claude-resume-hub --list       # bu projenin session'larını listele (+ id'leri)
npx claude-resume-hub --web --smart # bağlam-farkında devam (kaldığın adımdan sürer)
npx claude-resume-hub -s <id>      # belirli bir session'ı devam ettir
npx claude-resume-hub --help       # tüm seçenekler
```

Kalıcı komut ister misin? `npm i -g claude-resume-hub` sana `crh --web` verir.
**Hep güncel:** `npx claude-resume-hub@latest` otomatik en yeni sürümü çeker.

---

## 🛠️ From source · Kaynaktan

Prefer to run it straight from the repo (no npm)? / npm'siz, doğrudan repodan mı çalıştırmak istiyorsun?

```bash
git clone https://github.com/IbrahimKalemci/claude-resume-hub.git
cd claude-resume-hub
node bin/cli.js --web
```

---

<p align="center">
  Made for everyone who's tired of waiting on the reset clock.<br>
  <b>MIT</b> © Ibrahim Kalemci · <a href="CHANGELOG.md">Changelog</a>
</p>
