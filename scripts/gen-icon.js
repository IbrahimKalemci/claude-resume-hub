#!/usr/bin/env node
"use strict";

/**
 * Generate the app icon (build/icon.ico + build/icon.png) from the same
 * dependency-free PNG generator the tray uses — so the repo keeps no binary
 * image assets. Run before electron-builder (see the "app:build" script).
 */

const fs = require("fs");
const path = require("path");
const { appIcon, makeICO } = require("../app/icon");

const dir = path.join(__dirname, "..", "build");
fs.mkdirSync(dir, { recursive: true });

const png = appIcon(256);
fs.writeFileSync(path.join(dir, "icon.png"), png);
fs.writeFileSync(path.join(dir, "icon.ico"), makeICO(png));

console.log("wrote build/icon.png + build/icon.ico");
