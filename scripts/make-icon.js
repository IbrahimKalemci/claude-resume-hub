#!/usr/bin/env node
"use strict";

/**
 * Generate build/icon.ico (and a .png) for electron-builder from the code-drawn
 * app icon, so the repo carries no binary image assets.
 */

const fs = require("fs");
const path = require("path");
const { appIcon, makeICO } = require("../app/icon");

const outDir = path.join(__dirname, "..", "build");
fs.mkdirSync(outDir, { recursive: true });

const png = appIcon(256);
fs.writeFileSync(path.join(outDir, "icon.png"), png);
fs.writeFileSync(path.join(outDir, "icon.ico"), makeICO(png));

console.log("wrote build/icon.png and build/icon.ico (256x256)");
