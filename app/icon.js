"use strict";

/**
 * Tiny dependency-free PNG generator, used to draw the tray icon at runtime so
 * the repo needs no binary image assets. Produces an anti-aliased filled circle
 * (the app's "dot" mark) in a given colour.
 */

const zlib = require("zlib");

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c;
  }
  return CRC_TABLE;
}

function crc32(buf) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Build an RGBA PNG of `size`x`size` using pixel(x, y) -> [r,g,b,a]. */
function makePNG(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** A filled, softly anti-aliased circle — the tray mark. */
function dotIcon(hex, size = 16) {
  const [r, g, b] = hexToRgb(hex);
  const c = (size - 1) / 2;
  const radius = size * 0.42;
  return makePNG(size, (x, y) => {
    const d = Math.hypot(x - c, y - c);
    // 1px feathered edge
    const a = Math.max(0, Math.min(1, radius - d + 0.5));
    return [r, g, b, Math.round(a * 255)];
  });
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The app / window / exe icon: a terracotta disc with a cream clock glyph
 * (ring + two hands) — matches the header logo's identity. Fully generated,
 * no binary asset.
 */
function appIcon(size = 256) {
  const [br, bg, bb] = hexToRgb("#c96442"); // terracotta disc
  const [fr, fg, fb] = hexToRgb("#f6efe8"); // cream glyph
  const c = (size - 1) / 2;
  const discR = size * 0.47;
  const ringR = size * 0.27;
  const ringT = size * 0.052;
  const handT = size * 0.05;

  // hand endpoints (12 o'clock hour hand, ~2 o'clock minute hand)
  const hx = c, hy = c - ringR * 0.60;
  const mx = c + ringR * 0.52, my = c - ringR * 0.34;

  return makePNG(size, (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    const dc = Math.hypot(px - c, py - c);
    const discA = clamp(discR - dc + 0.5, 0, 1); // disc coverage
    if (discA <= 0) return [0, 0, 0, 0];

    // glyph coverage: ring OR either hand
    const ringA = clamp(ringT / 2 - Math.abs(dc - ringR) + 0.5, 0, 1);
    const hourA = clamp(handT / 2 - segDist(px, py, c, c, hx, hy) + 0.5, 0, 1);
    const minA = clamp(handT / 2 - segDist(px, py, c, c, mx, my) + 0.5, 0, 1);
    const g = Math.max(ringA, hourA, minA);

    return [
      Math.round(br + (fr - br) * g),
      Math.round(bg + (fg - bg) * g),
      Math.round(bb + (fb - bb) * g),
      Math.round(discA * 255),
    ];
  });
}

/**
 * Tray mark: the same clock, drawn as a solid glyph in the phase colour on a
 * transparent background. A stroked ring + hands stays legible at 16px, where a
 * filled disc with a cut-out glyph turns to mush.
 */
function clockIcon(hex, size = 16) {
  const [r, g, b] = hexToRgb(hex);
  const c = (size - 1) / 2;
  const ringR = size * 0.38;
  const ringT = size * 0.13;
  const handT = size * 0.12;

  const hx = c, hy = c - ringR * 0.58;                    // hour hand -> 12
  const mx = c + ringR * 0.50, my = c - ringR * 0.32;     // minute hand -> ~2

  return makePNG(size, (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    const dc = Math.hypot(px - c, py - c);
    const ringA = clamp(ringT / 2 - Math.abs(dc - ringR) + 0.5, 0, 1);
    const hourA = clamp(handT / 2 - segDist(px, py, c, c, hx, hy) + 0.5, 0, 1);
    const minA = clamp(handT / 2 - segDist(px, py, c, c, mx, my) + 0.5, 0, 1);
    const a = Math.max(ringA, hourA, minA);
    return [r, g, b, Math.round(a * 255)];
  });
}

/** Wrap a (square) PNG in a single-image .ico container (Vista+ PNG-in-ICO). */
function makeICO(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width  (0 => 256)
  entry[1] = 0; // height (0 => 256)
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4);   // colour planes
  entry.writeUInt16LE(32, 6);  // bits per pixel
  entry.writeUInt32LE(png.length, 8); // image size
  entry.writeUInt32LE(22, 12);        // offset (6 + 16)
  return Buffer.concat([header, entry, png]);
}

module.exports = { dotIcon, appIcon, clockIcon, makePNG, makeICO };
