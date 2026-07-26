(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  // ---- i18n ----
  var STR = {
    en: {
      settings: "Settings", back: "Back", account: "Account",
      signin: "Sign in / switch account", signout: "Sign out",
      rotate: "Rotate accounts when limited · experimental", addAccount2: "+ Add account",
      rotateHint: "For new tasks across your OWN separate accounts. A specific-session resume stays on its account.",
      acctHint: "Uses Claude Code's own claude auth login — this app never sees or stores your token.",
      language: "Language", buffer: "Resume buffer (seconds after reset)",
      smartDefault: "Smart resume by default", autostart: "Start minimised to tray",
      autoApprove: "Auto-finish if a resume stalls", autoApproveHint: "If a resume hangs with no output (usually a tool-permission prompt it can't answer while you're away), auto-approve tools and retry so it actually finishes. On = hands-off.",
      alerts: "Phone / chat alerts", alertsOpt: "— optional, outgoing only",
      webhookLbl: "Webhook URL (Discord / Slack / ntfy / any)", sendTest: "Send test",
      project: "PROJECT", change: "Change", noSession: "no session found",
      runFirst: "Run Claude Code in this folder first.", allSessions: "All sessions",
      pickTitle: "Which session should I continue?", pickSub: "Your most recent sessions across every project (Claude Code, IDE, terminal). Pick one — it resumes from where that conversation left off.",
      cancel: "Cancel", loadingSessions: "Loading…", noRecent: "No recent sessions found.", untitled: "Untitled session",
      status: "STATUS", resumingIn: "RESUMING IN", idle: "Idle — pick a session and press Start.",
      working: "Claude is working…",
      actionQ: "WHAT SHOULD CLAUDE DO WITH THIS SESSION?",
      contTitle: "Continue", contWhere: " where it left off",
      contSub: "Sends “continue” the moment the limit resets.",
      taskTitle: "Give it a task", taskSub: "Send your own instruction to this same session instead.",
      smart: "Smart resume", newSession: "New session", unattended: "Unattended", watch: "Watch",
      presetWalk: "🌙 Walk away", presetReset: "reset", presetWalkLog: "Walk-away preset: continue + smart + watch + unattended. Press Start and leave.",
      watchingLbl: "Watching", watchingSub: "Watching for a usage limit — I'll resume the moment you hit one.",
      hintContinue: "Sends “continue” to the session above once the limit opens.",
      hintTaskSet: "Sends your instruction to the session above once the limit opens.",
      hintTaskEmpty: "Type the instruction to send to that session.",
      hintNew: "⚠ New session — starts a fresh conversation, it will NOT continue the one above.",
      hintUnattended: " ⚠ Unattended: auto-approves ALL tools (file edits & shell commands) so it finishes without prompts.",
      hintWatch: "👁 Watch: if you're not limited yet, it sits in the tray and auto-resumes the moment you hit a limit (reads the transcript, no quota).",
      taskPh: "e.g. finish the refactor and run the tests",
      start: "Start", stop: "Stop", startQueue: "Start queue",
      queue: "Queue", queueSub: "— run projects one after another",
      queueHint: "One account = one reset clock, so queued projects resume in order, not at once.",
      addProject: "+ Add this project",
      activity: "Activity", download: "Download",
      statResumes: "auto-resumes", statSaved: "of waiting saved for you", history: "History",
      usageLbl: "Tokens used", usageSession: "this session", usage24h: "last 24h",
      usageHint: "Local counts from your transcripts — not your plan quota (this app can't see that).",
      shield: "Zero tokens · runs locally",
    },
    tr: {
      settings: "Ayarlar", back: "Geri", account: "Hesap",
      signin: "Giriş yap / hesap değiştir", signout: "Çıkış yap",
      rotate: "Limit dolunca hesap değiştir · deneysel", addAccount2: "+ Hesap ekle",
      rotateHint: "KENDİ ayrı hesapların arasında, yeni görevler için. Belirli bir oturum devam ederken kendi hesabında kalır.",
      acctHint: "Claude Code'un kendi claude auth login'ini kullanır — bu uygulama token'ını asla görmez/saklamaz.",
      language: "Dil", buffer: "Devam tamponu (reset sonrası saniye)",
      smartDefault: "Varsayılan akıllı devam", autostart: "Tepsiye küçültülmüş başlat",
      autoApprove: "Resume asılırsa otomatik bitir", autoApproveHint: "Resume çıktısız asılırsa (genelde sen yokken cevaplanamayan bir araç-izni istemi), araçları otomatik onaylayıp tekrar dener ki iş gerçekten bitsin. Açık = elini sürme.",
      alerts: "Telefon / sohbet bildirimi", alertsOpt: "— opsiyonel, sadece giden",
      webhookLbl: "Webhook URL (Discord / Slack / ntfy / herhangi)", sendTest: "Test gönder",
      project: "PROJE", change: "Değiştir", noSession: "oturum bulunamadı",
      runFirst: "Önce bu klasörde Claude Code çalıştır.", allSessions: "Tüm oturumlar",
      pickTitle: "Hangi oturumu devam ettireyim?", pickSub: "Tüm projelerdeki en son oturumların (Claude Code, IDE, terminal). Birini seç — o konuşmanın kaldığı yerden devam eder.",
      cancel: "İptal", loadingSessions: "Yükleniyor…", noRecent: "Yakın zamanlı oturum bulunamadı.", untitled: "İsimsiz oturum",
      status: "DURUM", resumingIn: "DEVAMA KALAN", idle: "Boşta — bir oturum seç ve Başlat'a bas.",
      working: "Claude çalışıyor…",
      actionQ: "BU OTURUMDA CLAUDE NE YAPSIN?",
      contTitle: "Devam et", contWhere: " kaldığı yerden",
      contSub: "Limit açılır açılmaz “continue” gönderir.",
      taskTitle: "Bir görev ver", taskSub: "Aynı oturuma kendi talimatını gönder.",
      smart: "Akıllı devam", newSession: "Yeni oturum", unattended: "Gözetimsiz", watch: "Nöbet",
      presetWalk: "🌙 Çık git", presetReset: "sıfırla", presetWalkLog: "Çık-git preset'i: devam + akıllı + nöbet + gözetimsiz. Start'a bas ve bırak.",
      watchingLbl: "Nöbette", watchingSub: "Limit dolmasını gözlüyorum — dolar dolmaz devam ettireceğim.",
      hintContinue: "Limit açılınca yukarıdaki oturuma “continue” gönderir.",
      hintTaskSet: "Limit açılınca talimatını yukarıdaki oturuma gönderir.",
      hintTaskEmpty: "O oturuma gönderilecek talimatı yaz.",
      hintNew: "⚠ Yeni oturum — sıfırdan bir konuşma başlatır, yukarıdakini DEVAM ETTİRMEZ.",
      hintUnattended: " ⚠ Gözetimsiz: TÜM araçları (dosya düzenleme & komut) otomatik onaylar, istemsiz bitirir.",
      hintWatch: "👁 Nöbet: henüz limitin dolmadıysa tepside bekler, limiti dolar dolmaz otomatik devam ettirir (transcript'i okur, kota harcamaz).",
      taskPh: "örn. refactor'ı bitir ve testleri çalıştır",
      start: "Başlat", stop: "Durdur", startQueue: "Kuyruğu başlat",
      queue: "Kuyruk", queueSub: "— projeleri sırayla çalıştır",
      queueHint: "Tek hesap = tek reset saati; kuyruktaki projeler aynı anda değil, sırayla devam eder.",
      addProject: "+ Bu projeyi ekle",
      activity: "Etkinlik", download: "İndir",
      statResumes: "otomatik devam", statSaved: "bekleme kazandırıldı", history: "Geçmiş",
      usageLbl: "Kullanılan token", usageSession: "bu oturum", usage24h: "son 24s",
      usageHint: "Transcript'lerinden yerel sayımlar — plan kotan değil (uygulama onu göremez).",
      shield: "Token yok · yerelde çalışır",
    },
  };
  var lang = "en";
  function t(k) { return (STR[lang] && STR[lang][k]) || STR.en[k] || k; }
  function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n"));
      if (v) el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n-ph"));
      if (v) el.setAttribute("placeholder", v);
    });
    if ($("langEn")) { $("langEn").classList.toggle("sel", lang === "en"); $("langTr").classList.toggle("sel", lang === "tr"); }
  }

  // ---- demo fallback so the page can be reviewed in a plain browser ----
  var DEMO = !window.api;
  var api = window.api || {
    getState: function () { return Promise.resolve({ phase: "waiting", cycle: 1, maxCycles: 100,
      resetAt: new Date(Date.now() + 283000).toISOString(), wakeAt: new Date(Date.now() + 313000).toISOString(),
      message: "Limit hit — resuming at 15:12" }); },
    listSessions: function () { return Promise.resolve([
      { id: "384d594d-f53e-4831-bafe-c34bb9307984", mtime: new Date(Date.now() - 6e5).toISOString(), turns: 44, sizeKB: 6109,
        preview: "kanka senden istediğim bu claude için md yazıyolar ya az token yesin" },
      { id: "c51329eb-3b53-4df7-b4de-0b320f209be1", mtime: new Date(Date.now() - 9e6).toISOString(), turns: 10, sizeKB: 1393,
        preview: "dashboard'u bir de karanlık temada dene" }
    ]); },
    getRecentSessions: function () { return Promise.resolve([
      { id: "60c5426f-456e-4086-ad0f-d8d10e0aa80d", dir: "C:\\Users\\you\\Desktop\\kiralabunu", project: "kiralabunu", mtime: new Date(Date.now() - 3e5).toISOString(), turns: 105, sizeKB: 15911, title: "Explore Fable model", preview: "teklif/pazarlık özelliği ekle" },
      { id: "384d594d-f53e-4831-bafe-c34bb9307984", dir: "C:\\Users\\you\\Desktop\\devamet", project: "devamet", mtime: new Date(Date.now() - 6e5).toISOString(), turns: 170, sizeKB: 6109, title: "Otomatik devam sistemi", preview: "claude-resume-hub'ı geliştir" },
      { id: "a1b2c3d4-0000-0000-0000-000000000000", dir: "C:\\Users\\you\\Desktop\\my-api", project: "my-api", mtime: new Date(Date.now() - 9e6).toISOString(), turns: 32, sizeKB: 2200, title: "", preview: "add auth middleware" }
    ]); },
    chooseFolder: function () { return Promise.resolve(null); },
    start: function () { return Promise.resolve({ ok: true }); },
    stop: function () { return Promise.resolve(); },
    getSettings: function () { return Promise.resolve({ dir: "C:\\Users\\you\\Desktop\\my-project", smart: true, buffer: 30, autoStart: false }); },
    saveSettings: function () { return Promise.resolve(); },
    openExternal: function () { return Promise.resolve(); },
    getUsage: function () { return Promise.resolve({ session: { input: 71e6, output: 2.7e6, cached: 854e6, total: 73.8e6, turns: 2111 }, recent: { input: 7.3e6, output: 0.38e6, cached: 123e6, total: 7.7e6 } }); },
    getStats: function () { return Promise.resolve({ resumes: 7, waitMs: 3 * 3600000 + 40 * 60000, history: [], runs: [
      { t: Date.now() - 4e5, project: "devamet", outcome: "done", waitMs: 42 * 60000, summary: "Finished the refactor and ran the tests — 30/30 passing." },
      { t: Date.now() - 9e6, project: "my-api", outcome: "stuck", waitMs: 0, summary: "" },
      { t: Date.now() - 2e7, project: "devamet", outcome: "done", waitMs: 68 * 60000, summary: "Continued the docs, committed as 'update README'." }
    ] }); },
    getAccount: function () { return Promise.resolve({ loggedIn: true, email: "you@example.com", plan: "pro" }); },
    accountLogin: function () { return Promise.resolve({ ok: true }); },
    accountLogout: function () { return Promise.resolve({ ok: true }); },
    getAccounts: function () { return Promise.resolve({ activeId: "default", rotate: true, accounts: [
      { id: "default", label: "you@work.com", configDir: null },
      { id: "acct-1", label: "you@gmail.com", configDir: "…" }
    ] }); },
    refreshAccounts: function () { return this.getAccounts(); },
    setRotate: function () { return this.getAccounts(); },
    switchAccount: function () { return this.getAccounts(); },
    addAccount: function () { return Promise.resolve({ ok: true, id: "acct-2" }); },
    removeAccount: function () { return this.getAccounts(); },
    onState: function () {}, onLog: function () {}
  };

  var state = { phase: "idle", cycle: 0, maxCycles: 100, resetAt: null, wakeAt: null, message: "" };
  var settings = { dir: "", smart: false, buffer: 30, autoStart: false };
  var sessions = [];
  var selectedId = null;
  var wakeMs = null;

  // ---------- helpers ----------
  function fmtCountdown(ms) {
    ms = Math.max(0, ms);
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(x).padStart(2, "0");
  }
  function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString(); } catch (e) { return "—"; } }
  function fmtWhen(iso) { try { return new Date(iso).toLocaleString(); } catch (e) { return "—"; } }
  function short(id) { return id ? id.slice(0, 8) + "…" + id.slice(-4) : ""; }

  // Build a DOM element with textContent — NEVER innerHTML for dynamic data.
  // Anything sourced from a transcript (Claude's own output), a filename, or a
  // task string is untrusted and must not be parsed as HTML: a crafted assistant
  // message could otherwise inject markup that reaches window.api. (SEC fix.)
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null && text !== "") e.textContent = text;
    return e;
  }

  // ---------- rendering ----------
  function renderSessions() {
    var list = $("slist");
    list.innerHTML = "";
    sessions.forEach(function (s) {
      var row = el("div", "srow" + (s.id === selectedId ? " sel" : ""));
      var txt = el("div", "txt");
      txt.appendChild(el("div", "t1 ellipsis", s.title || s.preview || short(s.id)));
      txt.appendChild(el("div", "t2 ellipsis", fmtWhen(s.mtime) + " · " + s.turns + " prompts"));
      row.appendChild(el("span", "dot"));
      row.appendChild(txt);
      row.onclick = function () { selectedId = s.id; renderSessions(); renderActive(); loadUsage(); };
      list.appendChild(row);
    });
    if (!sessions.length) { var e = el("div", "faint", "No sessions in this folder yet."); e.style.fontSize = "11px"; list.appendChild(e); }
  }

  function renderActive() {
    var s = sessions.filter(function (x) { return x.id === selectedId; })[0] || sessions[0] || null;
    if (s) selectedId = s.id;
    $("actId").textContent = s ? (s.title || s.preview || short(s.id)) : t("noSession");
    $("actId").style.color = s ? "" : "var(--faint)";
    $("actMeta").textContent = s ? (fmtWhen(s.mtime) + " · " + s.turns + " prompts · " + short(s.id)) : t("runFirst");
    $("actPrev").textContent = s && s.title && s.preview ? '"' + s.preview + '"' : "";
  }

  function renderStatus() {
    var p = state.phase || "idle";
    $("pill").className = "pill " + p;
    $("pill").textContent = p;

    var big = $("statBig"), label = $("statLabel"), sub = $("statSub"), meta = $("statMeta");
    big.classList.remove("pulse");
    big.style.color = "";

    if (p === "waiting" && wakeMs) {
      label.textContent = t("resumingIn");
      big.textContent = fmtCountdown(wakeMs - Date.now());
      big.style.color = "var(--warn)";
      sub.textContent = state.message || "Limit hit";
      meta.textContent = "Resets at " + fmtTime(state.resetAt) + " · cycle " + state.cycle + " / " + state.maxCycles;
    } else if (p === "running" || p === "starting") {
      label.textContent = t("status");
      big.textContent = "▶";
      big.classList.add("pulse");
      big.style.color = "var(--accent)";
      sub.textContent = state.message || t("working");
      meta.textContent = state.cycle ? "cycle " + state.cycle + " / " + state.maxCycles : "";
    } else if (p === "watching") {
      label.textContent = t("watchingLbl");
      big.textContent = "👁";
      big.classList.add("pulse");
      big.style.color = "var(--info)";
      sub.textContent = state.message || t("watchingSub");
      meta.textContent = "";
    } else if (p === "done") {
      label.textContent = t("status");
      big.textContent = "✓"; big.style.color = "var(--ok)";
      sub.textContent = state.message || "Task complete."; meta.textContent = "";
    } else if (p === "error") {
      label.textContent = t("status");
      big.textContent = "✕"; big.style.color = "var(--err)";
      sub.textContent = state.message || "Stopped."; meta.textContent = "";
    } else {
      label.textContent = t("status");
      big.textContent = "—";
      sub.textContent = state.message || t("idle");
      meta.textContent = "";
    }

    updateButtons();
  }

  function isBusy() {
    var p = state.phase;
    return p === "running" || p === "waiting" || p === "starting";
  }

  function updateButtons() {
    var m = mode(), txt = $("task").value.trim(), isNew = $("newSession").checked;
    var queued = (typeof queue !== "undefined" && queue.length);
    // In single mode, "Give it a task" needs text; when a queue exists, just run it.
    $("start").disabled = isBusy() || (!queued && m === "task" && !isNew && !txt);
    $("stop").disabled = !isBusy();
  }

  var rawEl = null;
  function addLog(entry) {
    var box = $("log");
    rawEl = null; // a log line breaks the current raw-output block
    var d = document.createElement("div");
    var t = document.createElement("span");
    t.className = "t"; t.textContent = entry.t || new Date().toLocaleTimeString();
    d.appendChild(t);
    d.appendChild(document.createTextNode(entry.line));
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
    while (box.childNodes.length > 400) box.removeChild(box.firstChild);
  }

  // Claude's live text output — appended verbatim, coalesced between log lines.
  function appendRaw(chunk) {
    var box = $("log");
    if (!rawEl) {
      rawEl = document.createElement("div");
      rawEl.style.color = "var(--txt)";
      rawEl.style.opacity = ".92";
      box.appendChild(rawEl);
    }
    rawEl.textContent += chunk;
    box.scrollTop = box.scrollHeight;
  }

  function applyState(s) {
    state = s || state;
    wakeMs = state.wakeAt ? new Date(state.wakeAt).getTime() : null;
    renderStatus();
  }

  // ---------- data ----------
  function loadSessions() {
    return api.listSessions(settings.dir).then(function (list) {
      sessions = list || [];
      if (!sessions.some(function (x) { return x.id === selectedId; })) selectedId = sessions.length ? sessions[0].id : null;
      renderSessions(); renderActive(); loadUsage();
    });
  }

  function loadAll() {
    return api.getSettings().then(function (s) {
      settings = s || settings;
      lang = (settings.lang === "tr") ? "tr" : "en";
      applyI18n();
      $("dir").textContent = settings.dir || "—";
      $("sBuffer").value = settings.buffer;
      $("sSmart").checked = !!settings.smart;
      $("sAuto").checked = !!settings.autoStart;
      $("sAutoApprove").checked = settings.autoApproveOnStall !== false; // default on
      $("smart").checked = !!settings.smart;
      var n = settings.notify || (settings.notify = { webhook: "", telegram: { botToken: "", chatId: "" } });
      if (!n.telegram) n.telegram = { botToken: "", chatId: "" };
      $("nWebhook").value = n.webhook || "";
      $("nTgToken").value = n.telegram.botToken || "";
      $("nTgChat").value = n.telegram.chatId || "";
      return loadSessions();
    }).then(function () {
      return api.getState().then(applyState);
    });
  }

  // ---------- events ----------
  $("gear").onclick = function () { $("settings").classList.toggle("open"); refreshAccount(); };
  $("setBack").onclick = function () { $("settings").classList.remove("open"); };

  function setLang(l) {
    lang = (l === "tr") ? "tr" : "en";
    settings.lang = lang;
    if (api.saveSettings) api.saveSettings(settings);
    applyI18n();
    // refresh JS-driven text
    refreshAction();
    renderQueue();
    renderStatus();
    renderActive();
    var open = $("slist").style.display !== "none";
    $("toggleList").textContent = (open ? "▾ " : "▸ ") + t("allSessions");
  }
  $("langEn").onclick = function () { setLang("en"); };
  $("langTr").onclick = function () { setLang("tr"); };

  function renderAccount(a) {
    var info = $("acctInfo");
    if (a && a.loggedIn) {
      info.textContent = "● " + (a.email || "signed in") + (a.plan ? " · " + a.plan : "");
      info.style.color = "var(--ok)";
    } else {
      info.textContent = "○ Not signed in — sign in to let it resume.";
      info.style.color = "var(--err)";
    }
  }
  function refreshAccount() { if (api.getAccount) api.getAccount().then(renderAccount); refreshAccounts(); }

  // ---- multi-account list ----
  function renderAccounts(p) {
    if (!p) return;
    $("rotateAcct").checked = !!p.rotate;
    var list = $("acctList");
    if (!list) return;
    list.innerHTML = "";
    (p.accounts || []).forEach(function (a) {
      var active = a.id === p.activeId;
      var row = el("div", "srow" + (active ? " sel" : ""));
      row.style.cursor = "pointer";
      var dot = el("span", "dot"); dot.style.background = active ? "var(--ok)" : "var(--faint)";
      var txt = el("div", "txt");
      // a.label is an account email/label — untrusted → textContent only.
      txt.appendChild(el("div", "t1 ellipsis", (active ? "● " : "") + (a.label || a.id)));
      row.appendChild(dot); row.appendChild(txt);
      row.onclick = function () { if (!isBusy() && api.switchAccount) api.switchAccount(a.id).then(renderAccounts); };
      if (a.id !== "default" && !isBusy()) {
        var x = el("button", "linklike", "✕"); x.style.color = "var(--faint)";
        x.onclick = function (e) { e.stopPropagation(); if (api.removeAccount) api.removeAccount(a.id).then(renderAccounts); };
        row.appendChild(x);
      }
      list.appendChild(row);
    });
  }
  function refreshAccounts() {
    if (!api.getAccounts) return;
    api.getAccounts().then(renderAccounts);
    if (api.refreshAccounts) api.refreshAccounts().then(renderAccounts); // fill emails/labels
  }
  if (api.onAccounts) api.onAccounts(renderAccounts);
  if ($("rotateAcct")) $("rotateAcct").addEventListener("change", function () {
    if (api.setRotate) api.setRotate($("rotateAcct").checked).then(renderAccounts);
  });
  if ($("acctAdd")) $("acctAdd").onclick = function () {
    if (!api.addAccount) return;
    api.addAccount("Account " + new Date().toLocaleTimeString());
    $("acctInfo").textContent = "opening Claude sign-in for the new account… finish it, then come back";
    $("acctInfo").style.color = "var(--dim)";
    var n = 0, iv = setInterval(function () { n++; refreshAccounts(); if (n >= 20) clearInterval(iv); }, 3000);
  };

  $("acctLogin").onclick = function () {
    api.accountLogin();
    $("acctInfo").textContent = "opening Claude sign-in… finish it in the window/browser, then come back";
    $("acctInfo").style.color = "var(--dim)";
    var n = 0, iv = setInterval(function () { n++; refreshAccount(); if (n >= 20) clearInterval(iv); }, 3000);
  };
  $("acctLogout").onclick = function () { api.accountLogout().then(refreshAccount); };
  $("toggleList").onclick = function () {
    var l = $("slist"), open = l.style.display !== "none";
    l.style.display = open ? "none" : "flex";
    $("toggleList").textContent = (open ? "▸ " : "▾ ") + t("allSessions");
  };
  $("chooseDir").onclick = function () {
    api.chooseFolder().then(function (dir) {
      if (!dir) return;
      settings.dir = dir; $("dir").textContent = dir;
      api.saveSettings(settings); loadSessions();
    });
  };
  function mode() {
    var sel = document.querySelector('input[name="mode"]:checked');
    return sel ? sel.value : "continue";
  }

  function refreshAction() {
    var m = mode(), isNew = $("newSession").checked, txt = $("task").value.trim();
    $("task").style.display = (m === "task" || isNew) ? "block" : "none";

    var hint = $("taskHint");
    hint.style.color = "";
    if (isNew) {
      hint.textContent = t("hintNew");
      hint.style.color = "var(--warn)";
    } else if (m === "task") {
      hint.textContent = txt ? t("hintTaskSet") : t("hintTaskEmpty");
    } else {
      hint.textContent = t("hintContinue");
    }
    if ($("unattended").checked) {
      hint.innerHTML += '<b style="color:var(--warn)">' + t("hintUnattended") + '</b>';
    }
    if ($("watchMode").checked) {
      hint.innerHTML += '<b style="color:var(--info)"> ' + t("hintWatch") + '</b>';
    }
    updateButtons();
  }

  function baseName(p) { return (p || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p; }

  // The job described by the current Project + action controls.
  function currentJob() {
    var m = mode(), isNew = $("newSession").checked, txt = $("task").value.trim();
    var j = {
      dir: settings.dir, smart: $("smart").checked, unattended: $("unattended").checked,
      buffer: Number($("sBuffer").value) || 30,
      sessionId: null, task: null, prompt: "continue", label: baseName(settings.dir), status: "queued",
    };
    if (isNew) j.task = txt || "continue";
    else if (m === "task") { j.sessionId = selectedId; j.prompt = txt; }
    else { j.sessionId = selectedId; j.prompt = "continue"; }
    j.watch = $("watchMode").checked;
    return j;
  }

  var queue = [];
  function renderQueue() {
    var list = $("queueList");
    list.innerHTML = "";
    queue.forEach(function (j, i) {
      var color = j.status === "done" ? "var(--ok)" : j.status === "error" ? "var(--err)"
        : j.status === "running" ? "var(--accent)" : "var(--faint)";
      var summary = (j.task ? "new: " + j.task.slice(0, 30) : j.prompt === "continue" ? "continue" : "task: " + j.prompt.slice(0, 30)) + " · " + (j.status || "queued");
      var row = el("div", "srow");
      var dot = el("span", "dot"); dot.style.background = color;
      var txt = el("div", "txt");
      // j.label (folder name) and j.task/prompt (user input) → textContent only.
      txt.appendChild(el("div", "t1 ellipsis", j.label));
      txt.appendChild(el("div", "t2 ellipsis", summary));
      row.appendChild(dot); row.appendChild(txt);
      if (!isBusy()) {
        var x = el("button", "linklike", "✕"); x.style.color = "var(--faint)";
        x.onclick = function () { queue.splice(i, 1); renderQueue(); updateButtons(); };
        row.appendChild(x);
      }
      list.appendChild(row);
    });
    $("queueList").style.display = queue.length ? "flex" : "none";
    $("start").textContent = queue.length ? (t("startQueue") + " (" + queue.length + ")") : t("start");
  }

  $("addQueue").onclick = function () {
    if (!settings.dir) return;
    queue.push(currentJob());
    renderQueue(); updateButtons();
    addLog({ line: "Added to queue: " + baseName(settings.dir) });
  };

  function runStart() {
    var j = currentJob();
    addLog({ line: j.task ? "Starting a NEW session…" : (mode() === "task" ? "Sending your task…" : "Resuming " + short(selectedId || "") + "…") });
    api.start(j).then(function (r) {
      if (r && r.ok === false) addLog({ line: "Could not start: " + (r.error || "unknown error") });
    });
  }

  // Start session picker: on Start, show the most recent sessions across ALL
  // projects and let the user pick which one to continue — folder + session in
  // one shot, so "which conversation?" is never ambiguous.
  function openSessionPicker() {
    var list = $("pickList");
    list.innerHTML = "";
    list.appendChild(el("div", "faint", t("loadingSessions") || "Loading…"));
    $("sessionModal").classList.add("open");
    api.getRecentSessions(6).then(function (rows) {
      list.innerHTML = "";
      if (!rows || !rows.length) { list.appendChild(el("div", "faint", t("noRecent"))); return; }
      rows.forEach(function (s) {
        var name = s.title || s.preview || t("untitled");
        var row = el("div", "srow");
        var txt = el("div", "txt");
        txt.appendChild(el("div", "t1 ellipsis proj", name));                       // the session's real name (ai-title)
        txt.appendChild(el("div", "t2 ellipsis", "📁 " + s.project + " · " + fmtWhen(s.mtime) + " · " + s.turns + " prompts"));
        row.appendChild(el("span", "dot"));
        row.appendChild(txt);
        row.onclick = function () {
          settings.dir = s.dir; selectedId = s.id;
          $("dir").textContent = s.dir;
          if (api.saveSettings) api.saveSettings(settings);
          $("sessionModal").classList.remove("open");
          loadSessions(); // refresh the in-folder list + usage for the new dir
          runStart();
        };
        list.appendChild(row);
      });
    });
  }
  $("pickCancel").onclick = function () { $("sessionModal").classList.remove("open"); };
  $("sessionModal").addEventListener("click", function (e) { if (e.target === $("sessionModal")) $("sessionModal").classList.remove("open"); });

  $("start").onclick = function () {
    if (queue.length) {
      addLog({ line: "Starting queue of " + queue.length + " project(s)…" });
      api.start({ jobs: queue, watch: $("watchMode").checked }).then(function (r) {
        if (r && r.ok === false) addLog({ line: "Could not start: " + (r.error || "unknown error") });
      });
      return;
    }
    // A brand-new session has no conversation to pick; everything else resumes a
    // specific session → ask which one first.
    if ($("newSession").checked) { runStart(); return; }
    openSessionPicker();
  };

  function humanDur(ms) {
    var m = Math.round((ms || 0) / 60000);
    if (m < 60) return m + "m";
    var h = Math.floor(m / 60);
    return h + "h " + (m % 60) + "m";
  }
  function humanTokens(n) {
    n = n || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return String(n);
  }
  function renderUsage(u) {
    if (!u) return;
    var s = u.session || {}, r = u.recent || {};
    $("usageSession").textContent = humanTokens(s.total);
    $("usage24h").textContent = humanTokens(r.total);
    var tip = "Session: " + humanTokens(s.input) + " in + " + humanTokens(s.output) + " out"
      + (s.cached ? " (" + humanTokens(s.cached) + " cached-read, not counted)" : "")
      + "  ·  new tokens only, local counts — not plan quota.";
    $("usageTile").title = tip;
  }
  function loadUsage() { if (api.getUsage) api.getUsage({ dir: settings.dir, sessionId: selectedId }).then(renderUsage); }
  var OUTCOME = {
    done: { icon: "✓", color: "var(--ok)" }, error: { icon: "✕", color: "var(--err)" },
    stuck: { icon: "⚠", color: "var(--warn)" }, auth: { icon: "🔑", color: "var(--err)" },
    skipped: { icon: "⛔", color: "var(--warn)" },
  };
  function renderStats(s) {
    if (!s) return;
    $("statResumes").textContent = s.resumes || 0;
    $("statSaved").textContent = humanDur(s.waitMs);

    var runs = (s.runs || []);
    $("toggleRuns").style.display = runs.length ? "inline-block" : "none";
    var list = $("runsList");
    list.innerHTML = "";
    runs.slice(0, 20).forEach(function (r) {
      var o = OUTCOME[r.outcome] || OUTCOME.done;
      var waited = r.waitMs ? " · waited " + humanDur(r.waitMs) : "";
      var row = el("div", "srow");
      var dot = el("span", "dot"); dot.style.background = o.color; // o.color is a fixed constant, not user data
      var txt = el("div", "txt");
      txt.appendChild(el("div", "t1 ellipsis", o.icon + " " + (r.project || "—")));
      txt.appendChild(el("div", "t2 ellipsis", fmtWhen(r.t) + waited));
      // r.summary is Claude's own transcript text — untrusted → textContent only.
      if (r.summary) { var p = el("div", "prev ellipsis", '"' + r.summary + '"'); p.style.marginTop = "2px"; txt.appendChild(p); }
      row.appendChild(dot); row.appendChild(txt);
      list.appendChild(row);
    });
  }
  if ($("toggleRuns")) $("toggleRuns").onclick = function () {
    var l = $("runsList"), open = l.style.display !== "none";
    l.style.display = open ? "none" : "flex";
    $("toggleRuns").textContent = (open ? "▸ " : "▾ ") + t("history");
  };
  if (api.getStats) api.getStats().then(renderStats);
  if (api.onStats) api.onStats(renderStats);
  loadUsage();

  if (api.onQueue) api.onQueue(function (q) {
    // main-process queue carries live statuses in the same order
    q.forEach(function (mj, i) { if (queue[i]) queue[i].status = mj.status; });
    renderQueue();
  });

  Array.prototype.forEach.call(document.querySelectorAll('input[name="mode"]'), function (r) {
    r.addEventListener("change", refreshAction);
  });
  $("newSession").addEventListener("change", refreshAction);
  $("unattended").addEventListener("change", refreshAction);
  $("watchMode").addEventListener("change", refreshAction);
  $("task").addEventListener("input", refreshAction);

  // Presets. "Walk away" = the flagship set-and-forget flow: continue the pinned
  // session, smart-resume, watch for the limit, and auto-approve tools so it can
  // finish while you're gone. It configures the controls (doesn't auto-start), so
  // the Unattended warning stays visible before you commit.
  function setMode(v) {
    var r = document.querySelector('input[name="mode"][value="' + v + '"]');
    if (r) { r.checked = true; }
  }
  $("presetWalk").onclick = function () {
    setMode("continue");
    $("newSession").checked = false;
    $("smart").checked = true;
    $("unattended").checked = true;
    $("watchMode").checked = true;
    refreshAction();
    addLog({ line: t("presetWalkLog") });
  };
  $("presetReset").onclick = function () {
    setMode("continue");
    $("newSession").checked = false;
    $("smart").checked = !!settings.smart;
    $("unattended").checked = false;
    $("watchMode").checked = false;
    $("task").value = "";
    refreshAction();
  };

  $("stop").onclick = function () { api.stop(); addLog({ line: "Stopped by user." }); };
  function collectNotify() {
    return {
      webhook: $("nWebhook").value.trim(),
      telegram: { botToken: $("nTgToken").value.trim(), chatId: $("nTgChat").value.trim() },
    };
  }
  ["sBuffer", "sSmart", "sAuto", "sAutoApprove"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      settings.buffer = Number($("sBuffer").value) || 30;
      settings.smart = $("sSmart").checked;
      settings.autoStart = $("sAuto").checked;
      settings.autoApproveOnStall = $("sAutoApprove").checked;
      $("smart").checked = settings.smart;
      api.saveSettings(settings);
    });
  });
  ["nWebhook", "nTgToken", "nTgChat"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      settings.notify = collectNotify();
      api.saveSettings(settings);
    });
  });
  $("nTest").onclick = function () {
    var out = $("nTestResult");
    out.style.color = "var(--dim)"; out.textContent = "sending…";
    api.testNotify(collectNotify()).then(function (r) {
      if (r && r.ok) { out.style.color = "var(--ok)"; out.textContent = "sent ✓"; }
      else { out.style.color = "var(--err)"; out.textContent = "failed: " + ((r && r.error) || "unknown"); }
    });
  };

  api.onState(applyState);
  api.onLog(addLog);
  if (api.onOutput) api.onOutput(appendRaw);

  function showUpdate(info) {
    if (!info || !info.available) return;
    $("updateText").textContent = "Update available — v" + info.latest + " (you have v" + info.current + ")";
    var b = $("updateBanner");
    b.style.display = "flex";
    b.onclick = function () { if (info.url) (api.openExternal ? api.openExternal(info.url) : window.open(info.url)); };
  }
  if (api.onUpdate) api.onUpdate(showUpdate);
  if (api.getUpdate) api.getUpdate().then(showUpdate);
  setInterval(function () { if (state.phase === "waiting" && wakeMs) renderStatus(); }, 1000);

  applyI18n();
  refreshAction();
  renderQueue();
  refreshAccount();

  loadAll().then(function () {
    if (DEMO) {
      addLog({ line: "Resuming session 384d594d…7984" });
      addLog({ line: "Usage limit hit (epoch marker). Resets 15:12:28 — resuming at 15:12:58." });
      addLog({ line: "Waiting 4m 43s — will resume at 15:12:58" });
    }
  });
})();
