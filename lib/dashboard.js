"use strict";

const http = require("http");
const { spawn } = require("child_process");

/**
 * Zero-dependency live dashboard for the auto-resume engine.
 * Serves a single page on localhost that shows a live countdown, current
 * status, streaming logs, and fires a desktop notification (via the browser
 * Notification API) when the limit resets or the task finishes.
 *
 * Communicates with the browser over Server-Sent Events — no client libs.
 */
function startDashboard(engine, { port = 4177, open = true } = {}) {
  const logs = [];
  const clients = new Set();

  const push = (event, data) => {
    const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(chunk);
  };

  engine.on("state", (s) => push("state", s));
  engine.on("log", (line) => {
    const entry = { t: new Date().toLocaleTimeString(), line };
    logs.push(entry);
    if (logs.length > 300) logs.shift();
    push("log", entry);
  });

  const server = http.createServer((req, res) => {
    if (req.url === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("retry: 2000\n\n");
      // Snapshot for late joiners.
      res.write(`event: state\ndata: ${JSON.stringify(engine.state)}\n\n`);
      for (const e of logs) res.write(`event: log\ndata: ${JSON.stringify(e)}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (req.url === "/status") {
      // Lightweight JSON snapshot for pollers (e.g. the --tray shim).
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
      res.end(JSON.stringify(engine.state));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGE);
  });

  return new Promise((resolve) => {
    const tryListen = (p, attempts) => {
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE" && attempts > 0) return tryListen(p + 1, attempts - 1);
        resolve({ url: null, close: () => server.close(), error: err });
      });
      server.listen(p, "127.0.0.1", () => {
        const url = `http://127.0.0.1:${p}`;
        if (open) openBrowser(url);
        resolve({ url, close: () => server.close() });
      });
    };
    tryListen(port, 15);
  });
}

function openBrowser(url) {
  try {
    const cmd =
      process.platform === "win32" ? "cmd" :
      process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {}
}

const PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>claude-auto-resume</title>
<style>
  :root { --bg:#0b0e14; --panel:#131826; --line:#232a3d; --txt:#e6e9f0; --dim:#8b93a7;
          --accent:#c96442; --ok:#3fb950; --warn:#d29922; --err:#f85149; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
         background:radial-gradient(1200px 600px at 50% -10%, #16203a 0%, var(--bg) 60%); color:var(--txt); min-height:100vh; }
  .wrap { max-width:760px; margin:0 auto; padding:28px 20px 40px; }
  header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:22px; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:.2px; }
  .dot { width:10px; height:10px; border-radius:50%; background:var(--accent); box-shadow:0 0 12px var(--accent); }
  .pill { font-size:12px; font-weight:600; padding:5px 11px; border-radius:999px; border:1px solid var(--line); color:var(--dim); }
  .pill.running { color:var(--accent); border-color:var(--accent); }
  .pill.waiting { color:var(--warn); border-color:var(--warn); }
  .pill.done { color:var(--ok); border-color:var(--ok); }
  .pill.error { color:var(--err); border-color:var(--err); }
  .card { background:linear-gradient(180deg, var(--panel), #0f1420); border:1px solid var(--line);
          border-radius:18px; padding:34px 26px; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,.35); }
  .label { font-size:13px; text-transform:uppercase; letter-spacing:1.5px; color:var(--dim); margin-bottom:10px; }
  .timer { font-variant-numeric:tabular-nums; font-weight:800; font-size:clamp(48px,12vw,88px); line-height:1;
           font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .msg { margin-top:14px; color:var(--dim); min-height:20px; }
  .meta { display:flex; gap:22px; justify-content:center; flex-wrap:wrap; margin-top:22px; color:var(--dim); font-size:13px; }
  .meta b { color:var(--txt); font-weight:600; }
  .pulse { animation:pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
  .row { display:flex; align-items:center; justify-content:space-between; margin:22px 2px 8px; }
  .row h2 { font-size:13px; text-transform:uppercase; letter-spacing:1.2px; color:var(--dim); margin:0; }
  button { background:var(--accent); color:#fff; border:0; border-radius:9px; padding:8px 14px; font-weight:600;
           font-size:13px; cursor:pointer; }
  button.ghost { background:transparent; color:var(--dim); border:1px solid var(--line); }
  #log { background:#0a0d15; border:1px solid var(--line); border-radius:12px; padding:14px; height:230px; overflow:auto;
         font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; line-height:1.6; }
  #log div { white-space:pre-wrap; word-break:break-word; }
  #log .t { color:var(--dim); margin-right:8px; }
  footer { text-align:center; color:var(--dim); font-size:12px; margin-top:20px; }
  a { color:var(--accent); }
</style></head>
<body><div class="wrap">
  <header>
    <div class="brand"><span class="dot" id="dot"></span> claude-auto-resume</div>
    <div style="display:flex; gap:8px; align-items:center;">
      <span class="pill" id="pill">connecting…</span>
      <button class="ghost" id="notifyBtn">🔔 Enable alerts</button>
    </div>
  </header>

  <div class="card">
    <div class="label" id="cardLabel">Status</div>
    <div class="timer" id="timer">—</div>
    <div class="msg" id="msg">Waiting for engine…</div>
    <div class="meta">
      <div>Cycle <b id="cycle">–</b></div>
      <div>Resets at <b id="resetAt">–</b></div>
    </div>
  </div>

  <div class="row"><h2>Live log</h2><button class="ghost" id="clearBtn">clear</button></div>
  <div id="log"></div>

  <footer>Running locally · leave this tab open so alerts can fire · <a href="https://github.com/IbrahimKalemci/claude-resume-hub" target="_blank">github</a></footer>
</div>
<script>
  const $ = (id) => document.getElementById(id);
  let state = { phase: "starting" }, wakeAt = null, lastPhase = null;

  function fmt(ms){ ms=Math.max(0,ms); const s=Math.floor(ms/1000);
    const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;
    return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(x).padStart(2,'0'); }

  function render(){
    const p = state.phase || "starting";
    $("pill").className = "pill " + p;
    $("pill").textContent = p;
    $("dot").style.background = getComputedStyle(document.documentElement)
      .getPropertyValue(p==="done"?"--ok":p==="error"?"--err":p==="waiting"?"--warn":"--accent");
    $("cycle").textContent = state.cycle ? (state.cycle + " / " + state.maxCycles) : "–";
    $("resetAt").textContent = state.resetAt ? new Date(state.resetAt).toLocaleTimeString() : "–";
    $("msg").textContent = state.message || "";
    const t = $("timer"); t.classList.remove("pulse");
    if (p === "waiting" && wakeAt) { $("cardLabel").textContent = "Resuming in"; t.textContent = fmt(wakeAt - Date.now()); }
    else if (p === "running") { $("cardLabel").textContent = "Status"; t.textContent = "▶"; t.classList.add("pulse"); }
    else if (p === "done") { $("cardLabel").textContent = "Status"; t.textContent = "✓"; }
    else if (p === "error") { $("cardLabel").textContent = "Status"; t.textContent = "✕"; }
    else { $("cardLabel").textContent = "Status"; t.textContent = "…"; }
  }

  function notify(title, body){
    try { if (window.Notification && Notification.permission === "granted") new Notification(title, { body }); } catch {}
  }
  function beep(){ try { const a=new (window.AudioContext||window.webkitAudioContext)();
    const o=a.createOscillator(), g=a.createGain(); o.connect(g); g.connect(a.destination);
    o.frequency.value=660; g.gain.value=.05; o.start(); setTimeout(()=>{o.stop();a.close();},180);} catch {} }

  function onPhaseChange(prev, cur){
    if (cur === "waiting") notify("⏳ Usage limit hit", state.message || "Waiting for reset");
    if (cur === "running" && prev === "waiting") { notify("▶ Limit reset — resumed!", "Claude is continuing your task."); beep(); }
    if (cur === "done") { notify("✅ Task complete", state.message || "All done."); beep(); }
    if (cur === "error") notify("⚠ Stopped", state.message || "An error occurred.");
  }

  const es = new EventSource("/events");
  es.addEventListener("state", (e) => {
    const prev = lastPhase; state = JSON.parse(e.data);
    wakeAt = state.wakeAt ? new Date(state.wakeAt).getTime() : null;
    if (state.phase !== prev) { onPhaseChange(prev, state.phase); lastPhase = state.phase; }
    render();
  });
  es.addEventListener("log", (e) => {
    const { t, line } = JSON.parse(e.data);
    const d = document.createElement("div");
    d.innerHTML = '<span class="t">' + t + '</span>';
    d.appendChild(document.createTextNode(line));
    const box = $("log"); box.appendChild(d); box.scrollTop = box.scrollHeight;
  });

  $("notifyBtn").onclick = () => { if (window.Notification) Notification.requestPermission().then(p => {
    $("notifyBtn").textContent = p === "granted" ? "🔔 Alerts on" : "🔕 Alerts blocked"; }); };
  $("clearBtn").onclick = () => { $("log").innerHTML = ""; };

  setInterval(() => { if (state.phase === "waiting" && wakeAt) $("timer").textContent = fmt(wakeAt - Date.now()); }, 1000);
  render();
  // Notifications are enabled explicitly via the "Enable alerts" button
  // (browsers discourage auto-prompting on load).
  if (window.Notification && Notification.permission === "granted") $("notifyBtn").textContent = "🔔 Alerts on";
</script>
</body></html>`;

module.exports = { startDashboard };
