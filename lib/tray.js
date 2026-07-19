"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * A genuine Windows system-tray icon with ZERO bundled dependencies: a tiny
 * PowerShell + System.Windows.Forms.NotifyIcon shim that rides the .NET already
 * present on every Windows 10/11 machine. It polls the dashboard's /status
 * endpoint, colours the tray icon by phase, and pops a balloon on phase changes.
 * On macOS/Linux there is no zero-dep native tray in pure Node — callers should
 * fall back to the browser dashboard.
 */

// NOTE: written as a plain string (no backticks / no ${...}) so it survives the
// JS template and PowerShell parsing cleanly.
const PS_SCRIPT = [
  'param([string]$Url)',
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Drawing',
  '',
  'function New-DotIcon([System.Drawing.Color]$color) {',
  '  $bmp = New-Object System.Drawing.Bitmap 16,16',
  '  $g = [System.Drawing.Graphics]::FromImage($bmp)',
  "  $g.SmoothingMode = 'AntiAlias'",
  '  $g.Clear([System.Drawing.Color]::Transparent)',
  '  $brush = New-Object System.Drawing.SolidBrush $color',
  '  $g.FillEllipse($brush, 2, 2, 12, 12)',
  '  $g.Dispose()',
  '  return [System.Drawing.Icon]::FromHandle($bmp.GetHicon())',
  '}',
  '',
  '$colors = @{',
  '  starting = [System.Drawing.Color]::FromArgb(201,100,66)',
  '  running  = [System.Drawing.Color]::FromArgb(201,100,66)',
  '  waiting  = [System.Drawing.Color]::FromArgb(210,153,34)',
  '  done     = [System.Drawing.Color]::FromArgb(63,185,80)',
  '  error    = [System.Drawing.Color]::FromArgb(248,81,73)',
  '}',
  '',
  '$ni = New-Object System.Windows.Forms.NotifyIcon',
  '$ni.Icon = New-DotIcon $colors.starting',
  '$ni.Text = "claude-resume-hub"',
  '$ni.Visible = $true',
  '',
  '$menu = New-Object System.Windows.Forms.ContextMenuStrip',
  '$open = $menu.Items.Add("Open dashboard")',
  '$open.add_Click({ Start-Process $Url })',
  '$quit = $menu.Items.Add("Quit tray")',
  '$quit.add_Click({ $ni.Visible = $false; $ni.Dispose(); [System.Windows.Forms.Application]::Exit() })',
  '$ni.ContextMenuStrip = $menu',
  '$ni.add_MouseClick({ param($s,$e) if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Start-Process $Url } })',
  '',
  '$script:last = ""',
  '$script:fails = 0',
  '$timer = New-Object System.Windows.Forms.Timer',
  '$timer.Interval = 2000',
  '$timer.add_Tick({',
  '  try {',
  '    $s = Invoke-RestMethod -Uri ($Url + "/status") -TimeoutSec 3',
  '    $script:fails = 0',
  '    $phase = [string]$s.phase',
  '    $msg = [string]$s.message',
  '    if ($phase -ne $script:last) {',
  '      if ($colors.ContainsKey($phase)) { $ni.Icon = New-DotIcon $colors[$phase] }',
  '      $t = "claude-resume-hub - " + $phase',
  '      if ($t.Length -gt 63) { $t = $t.Substring(0,63) }',
  '      $ni.Text = $t',
  '      if ($script:last -ne "") { $ni.ShowBalloonTip(4000, "claude-resume-hub", $msg, [System.Windows.Forms.ToolTipIcon]::Info) }',
  '      $script:last = $phase',
  '    }',
  '  } catch {',
  '    $script:fails = $script:fails + 1',
  '    if ($script:fails -ge 6) { $ni.Visible = $false; $ni.Dispose(); [System.Windows.Forms.Application]::Exit() }',
  '  }',
  '})',
  '$timer.Start()',
  '',
  '[System.Windows.Forms.Application]::Run((New-Object System.Windows.Forms.ApplicationContext))',
  '',
].join("\n");

function startTray(url) {
  if (process.platform !== "win32") {
    return { ok: false, reason: "native tray is Windows-only — use the --web dashboard on macOS/Linux" };
  }
  try {
    const file = path.join(os.tmpdir(), `crh-tray-${process.pid}.ps1`);
    fs.writeFileSync(file, PS_SCRIPT, "utf8");
    // -STA is REQUIRED: WinForms' message loop / Timer won't pump in MTA.
    // Do NOT use detached:true — a detached process's message pump doesn't run,
    // so the tray never updates. windowsHide hides the console window instead.
    const child = spawn(
      "powershell",
      ["-NoProfile", "-STA", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", file, url],
      { stdio: "ignore", windowsHide: true }
    );
    return { ok: true, file, pid: child.pid, child };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = { startTray, PS_SCRIPT };
